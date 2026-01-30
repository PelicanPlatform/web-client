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

  const [objectUrl, setObjectUrl] = useSessionStorage<string>(
    "pelican-wc-object-url",
    initialObjectUrl
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [federations, setFederations] = useSessionStorage<FederationStore>(
    "pelican-wc-federations",
    {}
  );

  const [prefixToNamespace, setPrefixToNamespace] = useSessionStorage<ObjectPrefixStore>(
    "pelican-wc-p2n",
    {}
  );

  const [authorizationRequired, setLoginRequired] = useState(!enableAuth);

  // Store in-flight metadata fetch promises to prevent duplicate concurrent requests
  const metadataPromises = useRef<Map<string, Promise<{
    federation: Federation;
    namespace: Namespace
  }>>>(new Map());

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
    if (!namespace?.token) return [];
    return getTokenCollections(namespace.token);
  }, [namespace]);

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
          setFederations((prev) => ({
            ...prev,
            [federationHostname]: federation as Federation
          }));
        }

        const namespaceKey = prefixToNamespace[objectPath]?.namespace;
        let namespace = namespaceKey ? federation.namespaces[namespaceKey] : null;

        if (!namespace) {
          namespace = await fetchNamespace(objectPath, federation);

          setPrefixToNamespace((prev) => ({
            ...prev,
            [objectPath]: {
              federation: federationHostname,
              namespace: (namespace as Namespace).prefix
            }
          }));

          federation.namespaces[namespace.prefix] = namespace;
          setFederations((prev) => ({
            ...prev,
            [federationHostname]: federation as Federation
          }));
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
   */
  const getObjectList = useCallback(async (targetObjectUrl?: string): Promise<ObjectList[]> => {
    try {
      const urlToFetch = targetObjectUrl || objectUrl;
      const { objectPath } = parseObjectUrl(urlToFetch);
      const { federation, namespace } = await ensureMetadata(urlToFetch);
      
      let objects = await list(urlToFetch, federation, namespace);

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
      return objects;

    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        setLoginRequired(true);
        return [];
      }
      setError(`Failed to fetch object list for ${targetObjectUrl || objectUrl}: ${e}`);
      return [];
    }
  }, [objectUrl, ensureMetadata]);

  const handleDownload = useCallback(async (downloadObjectUrl: string) => {
    try {
      const { federation, namespace } = await ensureMetadata(downloadObjectUrl);
      const response = await get(downloadObjectUrl, federation, namespace);
      downloadResponse(response);
    } catch (e) {
      setError(`Download failed: ${e}`);
      throw e;
    }
  }, [ensureMetadata]);

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
    } catch (e) {
      setError(`Upload failed: ${e}`);
      throw e;
    }
  }, [objectUrl, ensureMetadata]);

  const contextValue: PelicanClientContextValue = {
    loading,
    error,
    authorizationRequired,
    objectUrl,
    federationHostname,
    objectPath,
    federation,
    namespace,
    collections,
    ensureMetadata,
    getObjectList,
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
