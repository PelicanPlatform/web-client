"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FederationStore,
  ObjectList,
  ObjectPrefixStore,
  UnauthenticatedError,
  downloadResponse,
  fetchFederation,
  fetchNamespace,
  fetchOpenIDConfiguration,
  download,
  list,
  parseObjectUrl,
  put,
  startAuthorizationCodeFlow,
  silentLogin,
  SilentLoginError,
  exchangeAuthCode,
  verifyToken,
  Federation,
  getTokenCollections,
  Collection,
  Namespace,
  Token,
  UrlType,
  queryAuthStatus,
  namespaceKey,
  parseNamespaceKey
} from "@pelicanplatform/web-client";
import { PelicanClientContext, PelicanClientContextValue } from "./PelicanClientContext";
import { useSessionStorage } from "../helpers/useSessionStorage";
import { useCodeVerifier } from "../helpers/useCodeVerifier";
import { useAuthExchange } from "../helpers/useAuthExchange";
import {DownloadProgress} from "../types";

/** A namespace served by an Origin, supplied directly in Origin-local mode. */
export interface OriginNamespaceConfig {
  /** Namespace prefix, e.g. `/ospool/ap40`. */
  prefix: string;
  /** Token issuer base URL; its OIDC config is discovered lazily for login. */
  issuer: string;
  /** Whether reads require a token (public namespaces can be browsed anonymously). */
  requireToken?: boolean;
}

export interface PelicanClientProviderProps {
  /** Initial object URL */
  initialObjectUrl?: string;
  /** Whether to enable authentication features */
  enableAuth?: boolean;
  /**
   * Origin-local mode: keep every call local to a single Origin instead of discovering a
   * federation. When set, `originBaseUrl`, `originHost`, and `namespaces` are required and
   * federation/director discovery is skipped entirely.
   */
  localOnly?: boolean;
  /** Base URL of the Origin's data (XRootD) endpoint, e.g. `https://origin.example.org:8443`. */
  originBaseUrl?: string;
  /** Stable host key used in object URLs and service-worker token routing, e.g. `origin.example.org`. */
  originHost?: string;
  /** Namespaces served by the Origin, with their issuers. */
  namespaces?: OriginNamespaceConfig[];
  /** OAuth client id to use for every issuer (a public, PKCE-only client). */
  publicClientId?: string;
  /** Child components that will have access to the context */
  children: React.ReactNode;
}

/**
 * Provider component that manages Pelican client state and provides it to child components.
 * Wrap your app or component tree with this provider to enable usePelicanClient hook.
 */
function PelicanClientProvider({
                                        initialObjectUrl = "",
                                        enableAuth = true,
                                        localOnly = false,
                                        originBaseUrl,
                                        originHost,
                                        namespaces: originNamespaces,
                                        publicClientId = "pelican-public-client",
                                        children
                                      }: PelicanClientProviderProps) {

  const [objectUrl, setObjectUrl] = useState<string>(initialObjectUrl);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [federations, setFederations] = useSessionStorage<FederationStore>(
    "pelican-wc-federations",
    {}
  );

  const [prefixToNamespace, setPrefixToNamespace] = useSessionStorage<ObjectPrefixStore>(
    "pelican-wc-p2n",
    {}
  );

  const [authorizationRequired, setAuthorizationRequired] = useState(!enableAuth);

  // True once we've reconciled page auth-state against the service worker at least once. Until
  // then, cached claims (from sessionStorage) can't be trusted — a consumer gating UI on auth
  // should wait for this so a stale "authorized" doesn't flash before the SW confirms it.
  const [authReconciled, setAuthReconciled] = useState(false);

  // Store in-flight metadata fetch promises to prevent duplicate concurrent requests
  const metadataPromises = useRef<Map<string, Promise<{
    federation: Federation;
    namespace: Namespace | null
  }>>>(new Map());

  // Cache for object list responses to avoid redundant requests
  const objectListCache = useRef<Map<string, {
    data: ObjectList[];
    timestamp: number;
  }>>(new Map());

  // Cache TTL in milliseconds (5 minutes)
  const OBJECT_LIST_CACHE_TTL = 5 * 60 * 1000;

  // ─── Origin-local mode ───────────────────────────────────────────────────────
  // In local mode we never reach out to a federation/director. Namespaces (and their
  // issuers) are supplied via props; we seed them into the same FederationStore the rest
  // of the client already understands, modeling the Origin as a single "federation" whose
  // director_endpoint points straight at the Origin's data endpoint.
  const originNamespacesKey = JSON.stringify(originNamespaces ?? []);
  const originConfigByPrefix = useMemo(() => {
    const m = new Map<string, OriginNamespaceConfig>();
    for (const ns of originNamespaces ?? []) m.set(ns.prefix, ns);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originNamespacesKey]);

  useEffect(() => {
    if (!localOnly || !originHost || !originBaseUrl || !originNamespaces?.length) return;

    // Merge, never clobber: preserve any namespace we already hold so SW-restored token
    // claims and previously discovered OIDC config survive a re-seed.
    setFederations((prev) => {
      const existing = prev[originHost];
      const nextNamespaces: Record<string, Namespace> = { ...(existing?.namespaces ?? {}) };
      for (const ns of originNamespaces) {
        if (!nextNamespaces[ns.prefix]) {
          nextNamespaces[ns.prefix] = { prefix: ns.prefix, clientId: publicClientId, requireToken: ns.requireToken };
        }
      }
      return {
        ...prev,
        [originHost]: {
          hostname: originHost,
          configuration: { ...(existing?.configuration ?? {}), director_endpoint: originBaseUrl },
          namespaces: nextNamespaces,
        },
      };
    });

    setPrefixToNamespace((prev) => {
      const next = { ...prev };
      for (const ns of originNamespaces) next[ns.prefix] = { federation: originHost, namespace: ns.prefix };
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localOnly, originHost, originBaseUrl, publicClientId, originNamespacesKey]);

  // Handle OAuth authorization code exchange
  const [codeVerifier, ensureCodeVerifier] = useCodeVerifier();
  const { loading: authLoading } = useAuthExchange({
    enabled: enableAuth,
    codeVerifier: codeVerifier,
    getNamespace: (federationHostname, namespacePrefix) => {
      return federations[federationHostname]?.namespaces[namespacePrefix];
    },
    onTokenReceived: (result) => {
      const newNamespace = {
        ...federations[result.federationHostname]?.namespaces[result.namespacePrefix],
        token: result.token
      };
      setActiveNamespace(newNamespace)
      setFederations((f) => ({
        ...f,
        [result.federationHostname]: {
          ...f[result.federationHostname],
          namespaces: {
            ...f[result.federationHostname]?.namespaces,
            [result.namespacePrefix]: newNamespace,
          },
        },
      }));
    }
  });

  const { federationHostname, objectPath, collectionPath } = useMemo(() => {
    try {
      return parseObjectUrl(objectUrl, "collection");
    } catch {
      return { federationHostname: null, objectPath: null, collectionPath: null };
    }
  }, [objectUrl]);

  const federation = federationHostname && federations
    ? federations[federationHostname] || null
    : null;

  /**
   * There is a brief blip when the derived namespace is null before metadata is loaded.
   * To avoid losing the namespace in that case we keep track of the last active namespace.
   */
  const [activeNamespace, setActiveNamespace] = useState<Namespace | null>(null);
  const derivedNamespace = useMemo(() => {
    if (!collectionPath || !federation) return null;
    const namespaceKey = prefixToNamespace?.[collectionPath]?.namespace;
    if (!namespaceKey) return null;
    return federation.namespaces?.[namespaceKey] || null;
  }, [prefixToNamespace, collectionPath, federation]);

  // On mount, attempt to set activeNamespace from stored federations if possible
  useEffect(() => {
    if (derivedNamespace) {
      setActiveNamespace(derivedNamespace);
    }
  }, [])


  const namespace = derivedNamespace || activeNamespace;

  const prevCollectionsRef = useRef<Collection[]>([]);
  const collections = useMemo<Collection[]>(() => {
    if ((!verifyToken(namespace?.token) && prevCollectionsRef.current.length > 0) || !namespace) {
        prevCollectionsRef.current = [];
    } else {
      const newCollections = getTokenCollections(namespace);
      if (JSON.stringify(prevCollectionsRef.current) !== JSON.stringify(newCollections)) {
        prevCollectionsRef.current = newCollections;
      }
    }
    return prevCollectionsRef.current;
  }, [namespace]);

  const authorized = collections.length > 0;

  // Debug: surface what the page believes about auth and where that belief comes from.
  useEffect(() => {
    console.log("[Pelican AuthState]", {
      authorized,
      namespacePrefix: namespace?.prefix,
      hasCachedToken: !!namespace?.token,
      tokenScope: namespace?.token?.scope,
      namespaceSource: derivedNamespace ? "derived(federations)" : activeNamespace ? "activeNamespace(stale-safe)" : "none",
      swController: typeof navigator !== "undefined" && !!navigator.serviceWorker?.controller,
    });
  }, [authorized, namespace, derivedNamespace, activeNamespace]);

  /**
   * Helper function to remove expired tokens from state.
   */
  const cleanExpiredTokens = useCallback(() => {
    setFederations((prevFederations) => {
      const updatedFederations: FederationStore = {};

      for (const [fedKey, federation] of Object.entries(prevFederations)) {
        const updatedNamespaces: { [key: string]: Namespace } = {};

        for (const [nsKey, namespace] of Object.entries(federation.namespaces)) {
          const updatedNamespace = { ...namespace };

          if (namespace.token && !verifyToken(namespace.token)) {
            setError("Cleaned expired authentication token. Please log in again.");
            delete updatedNamespace.token;
          }

          updatedNamespaces[nsKey] = updatedNamespace;
        }

        updatedFederations[fedKey] = {
          ...federation,
          namespaces: updatedNamespaces
        };
      }

      return updatedFederations;
    });
  }, []);

  /**
   * Helper function to ensure federation and namespace metadata is available.
   * Fetches on-demand if not in cache. Deduplicates concurrent requests for the same URL.
   */
  const ensureMetadata = useCallback(async (targetObjectUrl: string, type: UrlType) => {
    const { federationHostname, objectPath, collectionPath } = parseObjectUrl(targetObjectUrl, type);

    if (!federationHostname || !collectionPath) {
      throw new Error(`Invalid object URL: ${targetObjectUrl}`);
    }

    const cacheKey = `${federationHostname}:${collectionPath}`;

    // Check if there's already an in-flight request for this URL
    const existingPromise = metadataPromises.current.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }

    // Origin-local mode: resolve everything from supplied config — no federation/director.
    if (localOnly) {
      if (!originHost || !originBaseUrl) {
        throw new Error("Origin-local mode requires originHost and originBaseUrl");
      }
      // The Origin is modeled as a single federation; build it from props so we don't race
      // the seeding effect on first render. Reuse seeded state when present (keeps tokens).
      const federation: Federation = federations[federationHostname] ?? {
        hostname: originHost,
        configuration: { director_endpoint: originBaseUrl },
        namespaces: {},
      };

      // Match the supplied namespace whose prefix is the longest prefix of the object path.
      const config = Array.from(originConfigByPrefix.values())
        .filter((ns) => objectPath === ns.prefix || objectPath.startsWith(ns.prefix + "/") || objectPath.startsWith(ns.prefix))
        .sort((a, b) => b.prefix.length - a.prefix.length)[0];
      if (!config) {
        throw new Error(`No configured Origin namespace matches ${targetObjectUrl}`);
      }

      const cached = federation.namespaces[config.prefix];
      // OIDC config is only needed for login; once discovered we can serve from cache.
      if (cached?.oidcConfiguration) {
        return { federation, namespace: cached };
      }

      const fetchPromise = (async () => {
        try {
          let oidcConfiguration;
          try {
            console.log("[Pelican Origin] discovering OIDC config for", config.prefix, "issuer:", config.issuer);
            oidcConfiguration = await fetchOpenIDConfiguration(config.issuer);
            console.log("[Pelican Origin] OIDC config for", config.prefix, "→ authorization_endpoint:",
              oidcConfiguration?.authorization_endpoint, "token_endpoint:", oidcConfiguration?.token_endpoint);
          } catch (e) {
            console.warn("[Pelican Origin] OIDC discovery FAILED for", config.prefix, "issuer:", config.issuer,
              "— requireToken:", config.requireToken, "error:", e);
            // Public namespaces remain browsable even if their issuer can't be reached.
            if (config.requireToken) throw e;
          }
          const namespace: Namespace = {
            ...cached,
            prefix: config.prefix,
            clientId: publicClientId,
            requireToken: config.requireToken,
            oidcConfiguration: oidcConfiguration ?? cached?.oidcConfiguration,
          };
          setActiveNamespace((p) => (p && p.prefix === namespace.prefix ? p : namespace));
          setFederations((prev) => {
            const f = prev[federationHostname] ?? federation;
            return {
              ...prev,
              [federationHostname]: {
                ...f,
                configuration: { ...f.configuration, director_endpoint: originBaseUrl },
                namespaces: { ...f.namespaces, [namespace.prefix]: { ...f.namespaces[namespace.prefix], ...namespace } },
              },
            };
          });
          setPrefixToNamespace((prev) => ({
            ...prev,
            [collectionPath]: { federation: federationHostname, namespace: namespace.prefix },
          }));
          return { federation, namespace };
        } catch (e) {
          setError("Couldn't load namespace metadata: " + e);
          throw e;
        } finally {
          metadataPromises.current.delete(cacheKey);
        }
      })();

      metadataPromises.current.set(cacheKey, fetchPromise);
      return fetchPromise;
    }

    // Check if we already have both federation and namespace in cache
    const _federation = federations[federationHostname];
    const namespaceKey = prefixToNamespace[collectionPath]?.namespace;
    const _namespace = namespaceKey && _federation
      ? _federation.namespaces[namespaceKey]
      : null;

    if (_federation && _namespace) {
      return { federation: _federation, namespace: _namespace };
    }

    // Create a new promise for this fetch operation
    const fetchPromise = (async () => {
      try {
        let federation = federations[federationHostname];
        if (!federation) {
          federation = await fetchFederation(federationHostname);
          setFederations((prev) => ({
            ...prev,
            [federationHostname]: federation as Federation
          }));
        }

        // Check if we have already mapped that object prefix to a namespace
        const namespaceKey = prefixToNamespace[collectionPath]?.namespace;
        let namespace = namespaceKey ? federation.namespaces[namespaceKey] : null;

        // If it is not mapped, fetch the namespace metadata and map it
        if (!namespace) {
          namespace = await fetchNamespace(objectPath, federation);

          // Check if this namespace already exists in the federation (it might if another URL with the
          // same namespace but different path was loaded first), if so use the existing one instead of
          // the newly fetched one to avoid overwriting tokens
          if (namespace?.prefix && namespace.prefix in federation.namespaces) {
            namespace = federation.namespaces[namespace.prefix];
          }

          setActiveNamespace((p) => {
            if (p && p.prefix === namespace!.prefix) {
              return p;
            }
            return namespace as Namespace;
          });
          setPrefixToNamespace((prev) => ({
            ...prev,
            [collectionPath]: {
              federation: federationHostname,
              namespace: (namespace as Namespace).prefix
            }
          }));

          // If the namespace doesn't exist in the federation yet, add it
          if(namespace && !(namespace.prefix in federation.namespaces)) {
            setFederations((prev) => ({
              ...prev,
              [federationHostname]: {
                ...(federation as Federation),
                namespaces: {
                  ...federation.namespaces,
                  [namespace!.prefix]: namespace as Namespace
                }
              }
            }));
          }
        }
        return { federation, namespace };
      } catch (e) {
        setError("Couldn't fetch metadata: " + e);
        throw e;
      } finally {
        metadataPromises.current.delete(cacheKey);
      }
    })();

    metadataPromises.current.set(cacheKey, fetchPromise);
    return fetchPromise;
  }, [federations, prefixToNamespace, localOnly, originHost, originBaseUrl, publicClientId, originConfigByPrefix]);

  // Store the latest ensureMetadata function in a ref
  const ensureMetadataRef = useRef(ensureMetadata);

  useEffect(() => {
    ensureMetadataRef.current = ensureMetadata;
  }, [ensureMetadata]);

  // Pull Federation and Namespace Metadata as needed for the current collection Url
  useEffect(() => {
    (async () => {

      setLoading(true);

      const { federationHostname, objectPath } = parseObjectUrl(objectUrl);

      if (!objectUrl || !federationHostname || !objectPath) {
        setLoading(false);
        return;
      }

      try {
        await ensureMetadataRef.current(objectUrl, "collection");
      } catch (e) {
        setError(`Failed to fetch metadata for ${objectUrl}: ${e}`);
      }

      setLoading(false);
    })();
  }, [objectUrl]);

  /**
   * Get the list of objects at the specified URL.
   * Results are cached with a TTL to avoid redundant requests.
   */
  const getObjectList = useCallback(async (targetObjectUrl?: string, forceRefresh = false): Promise<ObjectList[]> => {
    try {
      const urlToFetch = (targetObjectUrl || objectUrl);

      // Check cache first (unless force refresh is requested)
      if (!forceRefresh) {
        const cached = objectListCache.current.get(urlToFetch);
        if (cached && Date.now() - cached.timestamp < OBJECT_LIST_CACHE_TTL) {
          return cached.data;
        }
      }

      const { federationHostname, objectPath } = parseObjectUrl(urlToFetch);
      const { federation, namespace } = await ensureMetadataRef.current(objectUrl, "collection");

      if (!federation || !namespace) {
        throw new Error("Federation or Namespace metadata is missing");
      }

      let objects = await list(urlToFetch, federation, namespace);

      // No longer need authorization
      setAuthorizationRequired(false);

      // Get authenticated collections for the current namespace and filter objects based on permissions
      const currentCollections = getTokenCollections(namespace);

      // add parent directory entry
      const inCollections = currentCollections && currentCollections.length > 0

      // If we are in collections we only show the parent if it is in a collection
      const collectionPath = objectPath.replace(namespace.prefix, "");
      const pathParts = collectionPath.split("/").filter((p) => p.length > 0);
      const relativeParentPath = "/" + pathParts.slice(0, -1).join("/")
      const isParentInCollections = currentCollections.some(c => relativeParentPath.startsWith(c.objectPath));
      if(inCollections && isParentInCollections) {
        objects.push({
          href: namespace.prefix + relativeParentPath || "/",
          getcontentlength: 0,
          getlastmodified: "",
          resourcetype: "collection",
          iscollection: true,
          executable: "",
          status: "",
        });
      }

      // If we are not in collections we show the parent as long as it is in the namespace and not the root
      const parentPath = "/" + objectPath.split("/").filter((p) => p.length > 0).slice(0, -1).join("/");
      const isParentInNamespace = parentPath.startsWith(namespace.prefix);
      if(!inCollections && isParentInNamespace) {
        objects.push({
          href: parentPath || "/",
          getcontentlength: 0,
          getlastmodified: "",
          resourcetype: "collection",
          iscollection: true,
          executable: "",
          status: "",
        });
      }

      // Drop the collection's self-entry (PROPFIND returns the directory itself alongside its
      // children) and any blank entries. Normalize trailing slashes on BOTH sides so a self
      // href of "/test/" matches the requested path "/test".
      const objectPathWithoutSlash = objectPath.replace(/\/+$/, "");
      objects = objects.filter((obj) => {
        const href = obj.href.replace(/\/+$/, "");
        return href !== objectPathWithoutSlash && href !== "";
      });

      objects.reverse();

      // Cache the result
      objectListCache.current.set(urlToFetch, {
        data: objects,
        timestamp: Date.now()
      });

      return objects;

    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        setAuthorizationRequired(true);
        cleanExpiredTokens()
        return [];
      }
      setError(`Failed to fetch object list for ${targetObjectUrl || objectUrl}: ${e}`);
      return [];
    }
  }, [objectUrl, OBJECT_LIST_CACHE_TTL]);

  /**
   * Invalidate the object list cache for a specific URL or all URLs.
   */
  const invalidateObjectListCache = useCallback((targetObjectUrl?: string) => {
    if (targetObjectUrl) {
      // Delete target cache and parent caches in case of directory changes
      const toDelete = targetObjectUrl.replace("pelican://", "").split("/").map((_, idx, arr) => "pelican://" + arr.slice(0, idx + 1).join("/"));
      toDelete.forEach(url => {
        objectListCache.current.delete(url)
      });
    } else {
      objectListCache.current.clear();
    }
  }, []);

  const [downloadsInProgress, setDownloadsInProgress] = useState<Record<string, DownloadProgress>>({});

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type !== "PELICAN_DOWNLOAD_PROGRESS") return;
      const { type, ...progress } = event.data as { type: string } & DownloadProgress;
      setDownloadsInProgress((prev) => {
        if (progress.status === "completed" || progress.status === "cancelled") {
          const next = { ...prev };
          delete next[progress.id];
          return next;
        }
        if (progress.status === "failed") {
          // Show the failure briefly, then remove it
          setTimeout(() => {
            setDownloadsInProgress((p) => {
              const next = { ...p };
              delete next[progress.id];
              return next;
            });
          }, 5000);
        }
        return { ...prev, [progress.id]: progress };
      });
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  /**
   * Keep page auth-state in sync with the service worker, which is the sole holder of
   * the access tokens. Handles in-session silent refresh (new exp), logout, and
   * reconciling stale claims after the SW was terminated (its in-memory tokens are
   * then gone, so anything the page still believes it holds is stale).
   */
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker || !enableAuth) {
      // Nothing to reconcile against — don't hold consumers waiting on the reconcile.
      setAuthReconciled(true);
      return;
    }

    const applyStatus = (nsKey: string, status: Omit<Token, "value"> | null) => {
      const { host, prefix } = parseNamespaceKey(nsKey);
      setFederations((prev) => {
        const fed = prev[host];
        if (!fed || !fed.namespaces[prefix]) return prev;
        const ns: Namespace = { ...fed.namespaces[prefix] };
        if (status) ns.token = status as Token; else delete ns.token;
        return { ...prev, [host]: { ...fed, namespaces: { ...fed.namespaces, [prefix]: ns } } };
      });
      setActiveNamespace((p) => {
        if (!p || p.prefix !== prefix) return p;
        const next: Namespace = { ...p };
        if (status) next.token = status as Token; else delete next.token;
        return next;
      });
    };

    const handler = (event: MessageEvent) => {
      if (event.data?.type !== "PELICAN_AUTH_STATUS") return;
      applyStatus(event.data.nsKey, event.data.status ?? null);
    };
    navigator.serviceWorker.addEventListener("message", handler);

    // Reconcile stored claims against what the SW actually holds. Drop anything the page
    // thinks it has but the SW does not (stale after SW termination → forces re-login).
    (async () => {
      try {
        console.log("[Pelican Reconcile] querying SW. controller present:",
          !!navigator.serviceWorker.controller);
        const statuses = await queryAuthStatus();
        console.log("[Pelican Reconcile] SW reports tokens for:", Object.keys(statuses));
        setFederations((prev) => {
          let changed = false;
          const next: FederationStore = {};
          for (const [host, fed] of Object.entries(prev)) {
            const namespaces: Record<string, Namespace> = {};
            for (const [prefix, ns] of Object.entries(fed.namespaces)) {
              if (ns.token && !statuses[namespaceKey(host, prefix)]) {
                console.warn("[Pelican Reconcile] DROPPING stale page token for",
                  namespaceKey(host, prefix), "— SW has no matching token");
                const { token, ...rest } = ns;
                namespaces[prefix] = rest;
                changed = true;
              } else {
                namespaces[prefix] = ns;
              }
            }
            next[host] = { ...fed, namespaces };
          }
          return changed ? next : prev;
        });
      } catch (e) {
        // No controlling SW yet — skip; the exchange/broadcast path will sync state.
        console.warn("[Pelican Reconcile] SKIPPED (no controlling SW?) — stale page claims kept:", e);
      } finally {
        setAuthReconciled(true);
      }
    })();

    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [enableAuth]);

  const handleDownload = useCallback(async (downloadObjectUrl: string) => {
    try {
      const { federation, namespace } = await ensureMetadataRef.current(downloadObjectUrl, "object");
      if (!federation || !namespace) return;
      await download(downloadObjectUrl, federation, namespace);
    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        setAuthorizationRequired(true);
        cleanExpiredTokens()
      }
      setError(`Download failed: ${e}`);
      throw e;
    } finally {
      console.log("Finished download attempt for " + downloadObjectUrl);
      setDownloadsInProgress((p) => {
        const updated = { ...p };
        delete updated[downloadObjectUrl];
        return updated;
      })
    }
  }, []);

  const handleUpload = useCallback(async (
    file: File,
    uploadObjectUrl?: string
  ) => {
    try {
      const targetUrl = uploadObjectUrl || objectUrl;
      // The upload target is the directory being uploaded into — a collection, not an object.
      // Parsing it as "object" takes its parent, which is empty at a single-segment namespace
      // root (e.g. pelican://host/test) and makes ensureMetadata reject the URL.
      const { federation, namespace } = await ensureMetadataRef.current(targetUrl, "collection");
      if (!federation || !namespace) return;

      const finalUploadUrl = targetUrl.endsWith("/")
        ? `${targetUrl}${file.name}`
        : `${targetUrl}/${file.name}`;

      await put(finalUploadUrl, file, federation, namespace);

      // Invalidate cache for the directory after successful upload
      invalidateObjectListCache(targetUrl);
    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        setAuthorizationRequired(true);
        cleanExpiredTokens()
      }
      setError(`Upload failed: ${e}`);
      throw e;
    }
  }, [objectUrl, invalidateObjectListCache]);

  const handleLogin = useCallback(async () => {
    try {
      const { federation, namespace } = await ensureMetadataRef.current(objectUrl, "collection");

      if (!federation || !namespace) return;
      if (!enableAuth) return;

      await startAuthorizationCodeFlow(
        ensureCodeVerifier(),
        namespace,
        federation,
        { objectUrl }
      );
    } catch (e) {
      setError(`Login failed: ${e}`);
      throw e;
    }
  }, [objectUrl, ensureCodeVerifier, enableAuth]);

  /**
   * Attempt a non-interactive login (no page navigation). Only works when the page and issuer
   * share an origin and the user already has an issuer session. Returns:
   *  - true  → signed in (claims stored, `authorized` will flip)
   *  - false → can't even attempt (auth disabled, or namespace/OIDC not ready)
   * and throws (e.g. SilentLoginError "login_required") when interaction is required — callers
   * should fall back to `handleLogin()`'s redirect.
   */
  const handleSilentLogin = useCallback(async (): Promise<boolean> => {
    if (!enableAuth) return false;

    const { federation, namespace } = await ensureMetadataRef.current(objectUrl, "collection");
    const authorizationEndpoint = namespace?.oidcConfiguration?.authorization_endpoint;
    const tokenEndpoint = namespace?.oidcConfiguration?.token_endpoint;
    if (!federation || !namespace || !namespace.clientId || !authorizationEndpoint || !tokenEndpoint) {
      return false;
    }

    // Must be identical for the authorize request and the token exchange.
    const redirectUri = `${window.location.origin}${window.location.pathname}`;
    const codeVerifier = ensureCodeVerifier();

    // Silent login is a *credentialed* request, so it must be same-origin (a wildcard CORS
    // origin is rejected with credentials). Route the authorize call through this page's own
    // origin: in production that's already the issuer's origin (a no-op); in dev a Next rewrite
    // proxies it to the real issuer. The token exchange stays on the discovered endpoint — it's
    // non-credentialed, so cross-origin with a wildcard ACAO is fine.
    const sameOriginAuthorize = new URL(authorizationEndpoint);
    sameOriginAuthorize.protocol = window.location.protocol;
    sameOriginAuthorize.host = window.location.host;

    const { code } = await silentLogin({
      authorizationEndpoint: sameOriginAuthorize.toString(),
      clientId: namespace.clientId,
      codeVerifier,
      redirectUri,
    });

    // Exchange the code in the service worker; only the non-secret claims come back to the page.
    const status = await exchangeAuthCode({
      nsKey: namespaceKey(federation.hostname, namespace.prefix),
      code,
      codeVerifier,
      clientId: namespace.clientId,
      clientSecret: namespace.clientSecret,
      tokenEndpoint,
      redirectUri,
    });

    const updated: Namespace = { ...namespace, token: status as Token };
    setActiveNamespace(updated);
    setFederations((f) => ({
      ...f,
      [federation.hostname]: {
        ...f[federation.hostname],
        namespaces: {
          ...f[federation.hostname]?.namespaces,
          [namespace.prefix]: { ...f[federation.hostname]?.namespaces?.[namespace.prefix], token: status as Token },
        },
      },
    }));
    return true;
  }, [enableAuth, objectUrl, ensureCodeVerifier]);

  const contextValue: PelicanClientContextValue = {
    enableAuth,
    loading: loading || authLoading,
    error,
    setError,
    authorizationRequired,
    authorized,
    authReconciled,
    objectUrl,
    federationHostname,
    objectPath,
    federation,
    namespace,
    collections,
    ensureMetadata,
    getObjectList,
    invalidateObjectListCache,
    handleDownload,
    handleUpload,
    handleLogin,
    handleSilentLogin,
    setObjectUrl,
    downloadsInProgress
  };

  return (
    <PelicanClientContext.Provider value={contextValue}>
      {children}
    </PelicanClientContext.Provider>
  );
}

export default PelicanClientProvider
