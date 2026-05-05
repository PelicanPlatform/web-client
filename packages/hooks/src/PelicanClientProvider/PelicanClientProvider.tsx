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
  download,
  list,
  parseObjectUrl,
  put,
  startAuthorizationCodeFlow,
  verifyToken,
  Federation,
  getTokenCollections,
  Collection,
  Namespace,
  UrlType
} from "@pelicanplatform/web-client";
import { PelicanClientContext, PelicanClientContextValue } from "./PelicanClientContext";
import { useSessionStorage } from "../helpers/useSessionStorage";
import { useCodeVerifier } from "../helpers/useCodeVerifier";
import { useAuthExchange } from "../helpers/useAuthExchange";
import {DownloadProgress} from "../types";

export interface PelicanClientProviderProps {
  /** Initial object URL */
  initialObjectUrl?: string;
  /** Whether to enable authentication features */
  enableAuth?: boolean;
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
  }, [federations, prefixToNamespace]);

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
      const urlToFetch = targetObjectUrl || objectUrl;

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
      const objectPathSansNamespace = objectPath.replace(namespace.prefix, "");
      const pathParts = objectPathSansNamespace.split("/").filter((p) => p.length > 0);
      const parentParts = pathParts.slice(0, -1);
      const parentPath = parentParts.length > 0 ? "/" + parentParts.join("/") : "";
      const inCollections = currentCollections && currentCollections.length > 0
      const isParentInNamespace = parentPath.startsWith(namespace.prefix);
      const isParentInCollections = currentCollections.some(c => parentPath.startsWith(c.objectPath));

      // If we are in collections we only show the parent if it is in a collection
      if(inCollections && isParentInCollections) {
        objects.push({
          href: namespace.prefix + parentPath || "/",
          getcontentlength: 0,
          getlastmodified: "",
          resourcetype: "collection",
          iscollection: true,
          executable: "",
          status: "",
        });
      }

      // If we are not in collections we show the parent as long as it is in the namespace and not the root
      if(!inCollections && isParentInNamespace) {
        objects.push({
          href: namespace.prefix + parentPath || "/",
          getcontentlength: 0,
          getlastmodified: "",
          resourcetype: "collection",
          iscollection: true,
          executable: "",
          status: "",
        });
      }

      const objectPathWithoutSlash = objectPath.replace(/\/+$/, "");
      objects = objects.filter((obj) =>
        obj.href !== objectPathWithoutSlash && obj.href !== ""
      );

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
        if (progress.status === "completed") {
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
      const { federation, namespace } = await ensureMetadataRef.current(objectUrl, "object");
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

  const contextValue: PelicanClientContextValue = {
    loading: loading || authLoading,
    error,
    setError,
    authorizationRequired,
    authorized,
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
