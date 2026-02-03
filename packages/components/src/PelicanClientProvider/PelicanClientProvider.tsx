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
  get,
  list,
  parseObjectUrl,
  put,
  startAuthorizationCodeFlow,
  verifyToken,
  Federation,
  getTokenCollections,
  Collection,
  Namespace
} from "@pelicanplatform/web-client";
import { PelicanClientContext, PelicanClientContextValue } from "./PelicanClientContext";
import { useSessionStorage } from "../usePelicanClient/useSessionStorage";
import { useCodeVerifier } from "../usePelicanClient/useCodeVerifier";
import { useAuthExchange } from "../usePelicanClient/useAuthExchange";

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
export function PelicanClientProvider({
                                        initialObjectUrl = "",
                                        enableAuth = true,
                                        children
                                      }: PelicanClientProviderProps) {

  const [objectUrl, setObjectUrl] = useState(
    initialObjectUrl
  );

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
    namespace: Namespace
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
  const { exchangeComplete: authExchangeComplete } = useAuthExchange({
    enabled: enableAuth,
    codeVerifier: codeVerifier,
    getNamespace: (federationHostname, namespacePrefix) => {
      return federations[federationHostname]?.namespaces[namespacePrefix];
    },
    onTokenReceived: (result) => {
      setFederations((f) => ({
        ...f,
        [result.federationHostname]: {
          ...f[result.federationHostname],
          namespaces: {
            ...f[result.federationHostname]?.namespaces,
            [result.namespacePrefix]: {
              ...f[result.federationHostname]?.namespaces?.[result.namespacePrefix],
              token: result.token,
            },
          },
        },
      }));
    }
  });

  const { federationHostname, objectPath } = useMemo(() => {
    try {
      return parseObjectUrl(objectUrl);
    } catch {
      return { federationHostname: null, objectPath: null };
    }
  }, [objectUrl]);

  const federation = federationHostname && federations
    ? federations[federationHostname] || null
    : null;

  const namespace = useMemo(() => {
    if (!objectPath || !federation) return null;
    const namespaceKey = prefixToNamespace?.[objectPath]?.namespace;
    if (!namespaceKey) return null;
    return federation.namespaces?.[namespaceKey] || null;
  }, [prefixToNamespace, objectPath, federation]);

  const collections = useMemo<Collection[]>(() => {
    if (!verifyToken(namespace?.token)) return [];
    return getTokenCollections(namespace);
  }, [namespace]);

  const authorized = collections.length > 0 || !authorizationRequired || !enableAuth;

  /**
   * Helper function to ensure federation and namespace metadata is available.
   * Fetches on-demand if not in cache. Deduplicates concurrent requests for the same URL.
   */
  const ensureMetadata = useCallback(async (targetObjectUrl: string) => {
    const { federationHostname, objectPath } = parseObjectUrl(targetObjectUrl);

    if (!federationHostname || !objectPath) {
      throw new Error(`Invalid object URL: ${targetObjectUrl}`);
    }

    const cacheKey = `${federationHostname}:${objectPath}`;

    // Check if there's already an in-flight request for this URL
    const existingPromise = metadataPromises.current.get(cacheKey);
    if (existingPromise) {
      console.log(`Reusing in-flight request for ${cacheKey}`);
      return existingPromise;
    }

    // Check if we already have both federation and namespace in cache
    const _federation = federations[federationHostname];
    const namespaceKey = prefixToNamespace[objectPath]?.namespace;
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
          console.log("Updated federation:", federation.hostname);
          setFederations((prev) => ({
            ...prev,
            [federationHostname]: federation as Federation
          }));
        }

        // Check if we have already mapped that object prefix to a namespace
        const namespaceKey = prefixToNamespace[objectPath]?.namespace;
        let namespace = namespaceKey ? federation.namespaces[namespaceKey] : null;

        // If it is not mapped, fetch the namespace metadata and map it
        if (!namespace) {
          namespace = await fetchNamespace(objectPath, federation);

          setPrefixToNamespace((prev) => ({
            ...prev,
            [objectPath]: {
              federation: federationHostname,
              namespace: (namespace as Namespace).prefix
            }
          }));

          // If the namespace doesn't exist in the federation yet, add it
          if(!(namespace.prefix in federation.namespaces)) {
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
  }, [federations, prefixToNamespace, setFederations, setPrefixToNamespace]);

  // Pull Federation and Namespace Metadata as needed for the current objectUrl
  useEffect(() => {
    (async () => {
      setLoading(true);

      if (!objectUrl || !federationHostname || !objectPath) {
        setLoading(false);
        return;
      }

      try {
        await ensureMetadata(objectUrl);
      } catch (e) {
        setError(`Failed to fetch metadata for ${objectUrl}: ${e}`);
      }

      setLoading(false);
    })();
  }, [objectUrl, federationHostname, objectPath, ensureMetadata]);

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
          console.log(`Using cached object list for ${urlToFetch}`);
          return cached.data;
        }
      }

      const { federationHostname, objectPath } = parseObjectUrl(urlToFetch);
      const { federation, namespace } = await ensureMetadata(urlToFetch);

      if (!federation || !namespace) {
        throw new Error("Federation or Namespace metadata is missing");
      }

      let objects = await list(urlToFetch, federation, namespace);

      // No longer need authorization
      setAuthorizationRequired(false);

      // add parent directory entry
      const pathParts = objectPath.split("/").filter((p) => p.length > 0);
      if (pathParts.length > 0) {
        const parentParts = pathParts.slice(0, -1);
        const parentPath = parentParts.length > 0 ? "/" + parentParts.join("/") : "";
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
        return [];
      }
      setError(`Failed to fetch object list for ${targetObjectUrl || objectUrl}: ${e}`);
      return [];
    }
  }, [objectUrl, ensureMetadata, OBJECT_LIST_CACHE_TTL]);

  /**
   * Invalidate the object list cache for a specific URL or all URLs.
   */
  const invalidateObjectListCache = useCallback((targetObjectUrl?: string) => {
    if (targetObjectUrl) {
      objectListCache.current.delete(targetObjectUrl);
      console.log(`Invalidated cache for ${targetObjectUrl}`);
    } else {
      objectListCache.current.clear();
      console.log("Cleared entire object list cache");
    }
  }, []);

  const handleDownload = useCallback(async (downloadObjectUrl: string) => {
    try {
      const { federation, namespace } = await ensureMetadata(downloadObjectUrl);
      const response = await get(downloadObjectUrl, federation, namespace);
      downloadResponse(response);
    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        setAuthorizationRequired(true);
        console.error(e);
      }
      setError(`Download failed: ${e}`);
      throw e;
    }
  }, [ensureMetadata]);

  const handleUpload = useCallback(async (
    file: File,
    uploadObjectUrl?: string
  ) => {
    try {
      const targetUrl = uploadObjectUrl || objectUrl;
      const { federation, namespace } = await ensureMetadata(targetUrl);

      const finalUploadUrl = targetUrl.endsWith("/")
        ? `${targetUrl}${file.name}`
        : `${targetUrl}/${file.name}`;

      await put(finalUploadUrl, file, federation, namespace);

      // Invalidate cache for the directory after successful upload
      invalidateObjectListCache(targetUrl);
    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        setAuthorizationRequired(true);
      }
      setError(`Upload failed: ${e}`);
      throw e;
    }
  }, [objectUrl, ensureMetadata, invalidateObjectListCache]);

  const handleLogin = useCallback(async () => {
    try {
      const { federation, namespace } = await ensureMetadata(objectUrl);

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
  }, [objectUrl, ensureMetadata, ensureCodeVerifier, enableAuth]);

  const contextValue: PelicanClientContextValue = {
    loading,
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
  };

  return (
    <PelicanClientContext.Provider value={contextValue}>
      {children}
    </PelicanClientContext.Provider>
  );
}
