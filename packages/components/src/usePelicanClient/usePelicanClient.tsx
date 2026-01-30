"use client";

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
  Collection
} from "@pelicanplatform/web-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSessionStorage } from "./useSessionStorage";
import { useCodeVerifier } from "./useCodeVerifier";
import { useAuthExchange } from "./useAuthExchange";

export interface UsePelicanClientOptions {
    /** The initial object URL to load */
    objectUrl: string;
    /** Whether to enable authentication features */
    enableAuth?: boolean;
}

/**
 * A React hook to manage Pelican client state and actions.
 *
 * The main pieces of state are `objectUrl`, `federationHostname`, and `objectPrefix`.
 * These each represent:
 * - `objectUrl`: The full Pelican URL, as inputed by the user
 * - `federationHostname`: The hostname of the federation being accessed
 * - `objectPrefix`: The prefix (namespace) of the object being accessed
 */
function usePelicanClient({ objectUrl, enableAuth = true }: UsePelicanClientOptions) {

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [federations, setFederations] = useSessionStorage<FederationStore>("pelican-wc-federations", {});
    const [prefixToNamespace, setPrefixToNamespace] = useSessionStorage<ObjectPrefixStore>("pelican-wc-p2n", {});

    const [loginRequired, setLoginRequired] = useState(!enableAuth);

    // Handle OAuth authorization code exchange
    const [_, ensureCodeVerifier] = useCodeVerifier();
    const { exchangeComplete: authExchangeComplete } = useAuthExchange({
        enabled: enableAuth,
        codeVerifier: ensureCodeVerifier(),
        getNamespace: (federationHostname, namespacePrefix) => {
            return federations[federationHostname]?.namespaces[namespacePrefix];
        },
        onTokenReceived: (result) => {
            // Update federation state with the newly acquired token
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

    const federation = federationHostname && federations ? federations[federationHostname] : null

    const namespace = objectPath ? federation?.namespaces?.[prefixToNamespace?.[objectPath]?.namespace] || null : null;

    const collections = useMemo<Collection[]>(() => {
        if (!namespace?.token) return [];
        return getTokenCollections(namespace.token);
    }, [namespace]);

    // Pull Federation and Namespace Metadata as needed
    useEffect(() => {(async () => {

        setLoading(true);

        if (!objectUrl || !federationHostname || !objectPath) {
            setLoading(false);
            return; // Skip if value hasn't changed
        }

        let _federation = federation
        let _namespace = namespace;

        // Fetch Federation if missing
        if (!_federation) {
            try {
                _federation = await fetchFederation(federationHostname);
            } catch (e) {
                setError(`Failed to fetch federation for ${federationHostname}: ${e}`);
            }
        }

        // Fetch Namespace if missing
        if (_federation && !_namespace) {
            try {
                const _namespace = await fetchNamespace(objectPath, _federation);

                // Add this to the state store
                setPrefixToNamespace((p) => {
                    return {
                        ...p,
                        [objectPath]: { federation: federationHostname, namespace: _namespace.prefix }
                    }
                })

                _federation.namespaces[_namespace.prefix] = _namespace;

                setFederations((p) => {
                    return {
                        ...p,
                        [federationHostname]: _federation as Federation
                    }
                });

            } catch (e) {
                setError(`Failed to fetch namespace for ${objectUrl}: ${e}`);
            }
        }

        setLoading(false);

    })()}, [objectUrl, federationHostname, objectPath, federation, namespace]);

    const getObjectList = useCallback<() => Promise<ObjectList[]>>(async () => {

      if (!federation || !namespace || !objectUrl || !objectPath) return [];

      try {
        let objects = await list(objectUrl, federation, namespace);

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

        const objectPathWithoutSlash = objectPath.replace(/\/+$/, ""); // remove trailing slashes for comparison

        // remove current directory entry
        objects = objects.filter((obj) => obj.href !== objectPathWithoutSlash && obj.href !== "");

        // reverse so directories show first (and the parent entry shows at top)
        objects.reverse();

        return objects;

      } catch (e) {
        if (e instanceof UnauthenticatedError) {
          setLoginRequired(true);
          return []
        }
        throw e;
      }
    }, [federation, namespace, objectUrl, objectPath])

    const handleDownload = useCallback(
        async (objectUrl: string) => {

            if (!federation || !namespace) return; // cannot download without federation and namespace

            const { federationHostname, objectPath } = parseObjectUrl(objectUrl);

            try {
                const response = await get(
                    `pelican://${federationHostname}${objectPath}`,
                    federation,
                    namespace
                );
                downloadResponse(response);
            } catch (e) {
                console.error("Download failed:", e);
            }
        },
        [federation, namespace]
    );

    const handleLogin = useCallback(async () => {
        if (!federation || !namespace) return; // Cannot login without federation and namespace
        if (!enableAuth) return;

        try {
            await startAuthorizationCodeFlow(ensureCodeVerifier(), namespace, federation, { objectUrl: objectUrl });
        } catch (error) {
            console.error("Login failed:", error);
        }
    }, [enableAuth, ensureCodeVerifier, federation, namespace, objectUrl]);

    const handleUpload = useCallback(
        async (file: File) => {
            const { federation, namespace } = getUrlData(objectUrl);

            if (!federation || !namespace) return; // Cannot upload without federation and namespace

            // Construct upload URL by appending filename to current directory
            const uploadUrl = objectUrl.endsWith("/") ? `${objectUrl}${file.name}` : `${objectUrl}/${file.name}`;
            console.log("Uploading file to:", uploadUrl);
            await put(uploadUrl, file, federation, namespace);
        },
        [getUrlData, objectUrl]
    );

    return {
        loading,
        collections,
        loginRequired,
        getObjectList,
        handleLogin,
        handleDownload,
        handleUpload
    };
}

export default usePelicanClient;
