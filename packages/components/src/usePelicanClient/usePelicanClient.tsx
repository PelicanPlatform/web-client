"use client";

import {
  FederationStore,
  ObjectList,
  ObjectPrefixStore,
  UnauthenticatedError,
  downloadResponse,
  fetchFederation,
  fetchNamespace,
  permissions as fetchPermissions,
  generateCodeVerifier,
  get,
  getAuthorizationCode,
  getToken,
  list,
  parseObjectUrl,
  put,
  startAuthorizationCodeFlow,
  Federation, Collection, CollectionPermission
} from "@pelicanplatform/web-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSessionStorage } from "./useSessionStorage";

export interface UsePelicanClientOptions {
    /** The initial object URL to load */
    objectUrl?: string;
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
function usePelicanClient({ objectUrl: defaultObjectUrl, enableAuth = true }: UsePelicanClientOptions) {

    const [objectUrl, _setObjectUrl] = useSessionStorage<string>("pelican-wc-object-url", defaultObjectUrl || '');
    const [federations, setFederations] = useSessionStorage<FederationStore>("pelican-wc-federations", {});
    const [prefixToNamespace, setPrefixToNamespace] = useSessionStorage<ObjectPrefixStore>("pelican-wc-p2n", {});
    const [codeVerifier, setCodeVerifier] = useSessionStorage<string | null>("pelican-wc-cv", null);

    const [objectList, setObjectList] = useState<ObjectList[]>([]);
    const [loading, setLoading] = useState(false);
    const [loginRequired, setLoginRequired] = useState(!enableAuth);
    const [authExchangeComplete, setAuthExchangeComplete] = useState(false);

    const [listToggle, setListToggle] = useState(0); // used to trigger refetches

    // Set up URL tracking on mount
    useEffect(() => {
        const handlePopState = () => {
            const urlParams = new URLSearchParams(window.location.search);
            const paramObjectUrl = urlParams.get('objectUrl');
            if (paramObjectUrl) {
                _setObjectUrl(paramObjectUrl);
            }
        };

        handlePopState();
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // On ObjectUrl change update url params
    const setObjectUrl = useCallback((url: string) => {

        setLoading(true);

        const urlParams = new URLSearchParams(window.location.search);
        urlParams.set("objectUrl", url);
        const newSearch = urlParams.toString();
        const currentSearch = window.location.search.replace(/^\?/, "");

        if (currentSearch !== newSearch) {
            const newUrl = newSearch ? `${window.location.pathname}?${newSearch}` : window.location.pathname;
            history.pushState(null, "", newUrl);
        }

        _setObjectUrl(url);
    }, []);

    // parse object url safely
    const { federationHostname, objectPath } = useMemo(() => {
        try {
            return parseObjectUrl(objectUrl);
        } catch {
            return { federationHostname: null, objectPath: null };
        }
    }, [objectUrl]);

    const federation = useMemo(() => {
        if (!federationHostname) return null;
        if (!federations?.[federationHostname]) return null;
        return federations[federationHostname];
    }, [federations, federationHostname]);

    const namespace = useMemo(() => {
        if (!objectPath) return null;
        const namespaceKey = prefixToNamespace?.[objectPath];
        return federations?.[namespaceKey?.federation]?.namespaces?.[namespaceKey?.namespace] || null;
    }, [prefixToNamespace, objectPath]);

    const collections = useMemo<Collection[]>(() => {
        if (!federation || !namespace) return [];
        if (!namespace.token) return [];
        
        const collectionRecord = namespace.token?.scope.split(" ").reduce((cols: Record<string, Collection>, scopeStr: string) => {
            const storageMatch = scopeStr.match(/^storage\.(create|modify|read):(.+)$/);
            if (storageMatch) {
                const permission = storageMatch[1] as CollectionPermission;
                const collectionPath = storageMatch[2];

                // Find or create the collection entry
                let collection = cols?.[collectionPath];
                if (!collection) {
                    collection = {
                        href: collectionPath,
                        objectPath: collectionPath.replace(new RegExp(`^/${namespace.prefix}`), ""),
                        permissions: [],
                    };
                    cols[collectionPath] = collection;
                }

                // Add the permission if not already present
                if (!collection.permissions.includes(permission)) {
                    collection.permissions.push(permission);
                }
            }
            return cols;
        }, {} as Record<string, Collection>);

        return Object.values(collectionRecord);

    }, [federation, namespace, objectPath]);

    const permissions = useMemo(() => {
        if (!loginRequired) return ['read'];
        if (!federation || !namespace || !collections || !objectPath) return [];

        const namespaceRelativeObjectPath = objectPath.replace(namespace.prefix, "")

        // Find the collection that best matches the current objectPath and return its permissions
        const sortedCollections = collections
            .filter(col => namespaceRelativeObjectPath.startsWith(col.objectPath))
            .sort((a, b) => b.objectPath.length - a.objectPath.length);

        if (sortedCollections.length > 0) {
            return sortedCollections[0].permissions;
        }

        return [];
    }, [loginRequired, federation, namespace, collections, objectPath]);

    // auth code exchange effect only when enabled
    useEffect(() => {
        if (authExchangeComplete) {
            return;
        } else if (!enableAuth) {
            setAuthExchangeComplete(true);
            return;
        }

        async function exchange() {
            const { federationHostname: fh, namespacePrefix, code } = getAuthorizationCode();

            try {
                if (code && fh && namespacePrefix && codeVerifier) {
                    const namespace = federations[fh]?.namespaces[namespacePrefix];
                    if (namespace?.clientId === undefined || namespace?.clientSecret === undefined) {
                        console.error(
                            "Cannot exchange code: missing client credentials for namespace",
                            namespacePrefix
                        );
                        return;
                    }

                    const token = await getToken(
                        namespace?.oidcConfiguration,
                        codeVerifier,
                        namespace?.clientId ?? "",
                        namespace?.clientSecret ?? "",
                        code
                    );

                    console.log("Obtained token via authorization code exchange:", token);

                    setFederations((f) => {
                        const newFederations = {
                            ...f,
                            [fh]: {
                                ...f[fh],
                                namespaces: {
                                    ...f[fh]?.namespaces,
                                    [namespacePrefix]: {
                                        ...f[fh]?.namespaces?.[namespacePrefix],
                                        token: token.accessToken,
                                    },
                                },
                            },
                        }
                        return newFederations;
                    });
                }
            } catch (e) {
                console.error("Error during authorization code exchange:", e);
            } finally {
                // exchange complete (whether we did it or not)
                setAuthExchangeComplete(true);
            }
        }

        exchange();
    }, [enableAuth, codeVerifier, federations]);

    // if no code verifier, generate one
    useEffect(() => {
        if (!codeVerifier) {
            const cv = generateCodeVerifier();
            setCodeVerifier(cv);
        }
    }, []);

    // Pull Federation and Namespace Metadata as needed
    useEffect(() => {(async () => {

        if (!objectUrl || !federationHostname || !objectPath) {
            setLoading(false);
            return; // Skip if value hasn't changed
        }

        let _federation = federation

        // Fetch Federation if missing
        if (!_federation) {
            try {
                // Get this objects federation
                _federation = await fetchFederation(federationHostname);

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

                } catch (e) {
                    console.log("Failed to fetch namespace for objectUrl:", objectUrl, e);
                }


                console.log("Fetching new federation/namespace data for objectUrl:", objectUrl, federation, namespace);

                setFederations((p) => {
                    return {
                        ...p,
                        [federationHostname]: _federation as Federation
                    }
                });

            } catch (e) {
                console.log("Failed to fetch federation for objectUrl:", objectUrl, e);
            }
        } else if (!namespace) {

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


                console.log("Fetching new federation/namespace data for objectUrl:", objectUrl, federation, namespace);

                setFederations((p) => {
                    return {
                        ...p,
                        [federationHostname]: _federation as Federation
                    }
                });

            } catch (e) {
                console.log("Failed to fetch namespace for objectUrl:", objectUrl, e);
            }
        }

        setLoading(false);

    })()}, [objectUrl, federationHostname, objectPath, federation, namespace]);

    // Update the objectUrl automatically if the user only has access to one collection in a namespace
    useEffect(() => {
        if (!federation || !namespace || collections.length !== 1) return;
        setObjectUrl(`pelican://${federation.hostname}${namespace.prefix}/${collections[0].href}/`);
    }, [collections, federation, namespace]);

    // Update the object list when objectUrl, federation, or namespace changes
    useEffect(() => {(async () => {

        if (!objectUrl) return; // Skip if value hasn't changed
        if (!federationHostname || !objectPath) return; // Skip if we can't parse the URL
        if (!federation || !namespace) return; // Skip if we don't have federation or namespace
        if (!authExchangeComplete) return; // Skip until auth exchange is complete

        try {
            console.log('Federation hostname', federations[federationHostname]['namespaces']['/ospool/ap40']);
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
            setObjectList(objects.reverse());

        } catch (e) {
            if (e instanceof UnauthenticatedError) {
                setLoginRequired(true);
                setObjectList([]);
            }
        }
    })()}, [objectUrl, federationHostname, objectPath, federation, namespace, listToggle, authExchangeComplete])

    const getUrlData = useCallback((objectUrl: string) => {
        try {
            const {federationHostname, objectPath} = parseObjectUrl(objectUrl);
            const namespaceKey = prefixToNamespace[objectPath];
            return {
                federation: federations?.[namespaceKey.federation] || null,
                namespace: federations?.[namespaceKey.federation]?.namespaces?.[namespaceKey.namespace] || null
            }
        } catch {
            return { federation: null, namespace: null };
        }
    }, [federations, prefixToNamespace]);

    const handleExplore = useCallback(
        (href: string) => {
            setObjectUrl(`pelican://${federationHostname}${href}/`);
        },
        [federationHostname]
    );

    const handleDownload = useCallback(
        async (href: string) => {

            const { federation, namespace } = getUrlData(objectUrl);

            if (!federation || !namespace) return; // cannot download without federation and namespace

            try {
                const response = await get(
                    `pelican://${federation.hostname}${href}`,
                    federation,
                    namespace
                );
                downloadResponse(response);
            } catch (e) {
                console.error("Download failed:", e);
            }
        },
        [getUrlData]
    );

    const handleLogin = useCallback(async () => {

        const { federation, namespace } = getUrlData(objectUrl);

        if (!federation || !namespace) return; // Cannot login without federation and namespace
        if (!enableAuth) return;

        let _codeVerifier = codeVerifier;
        if (!codeVerifier) {
            _codeVerifier = generateCodeVerifier();
            setCodeVerifier(_codeVerifier);
        }

        try {
            await startAuthorizationCodeFlow(_codeVerifier as string, namespace, federation, { objectUrl: objectUrl });
        } catch (error) {
            console.error("Login failed:", error);
        }
    }, [enableAuth, codeVerifier, federations, prefixToNamespace, federationHostname, objectPath]);

    const handleUpload = useCallback(
        async (file: File) => {
            const { federation, namespace } = getUrlData(objectUrl);

            if (!federation || !namespace) return; // Cannot upload without federation and namespace

            // Construct upload URL by appending filename to current directory
            const uploadUrl = objectUrl.endsWith("/") ? `${objectUrl}${file.name}` : `${objectUrl}/${file.name}`;
            console.log("Uploading file to:", uploadUrl);
            await put(uploadUrl, file, federation, namespace);

            setListToggle((lt) => lt + 1); // trigger refetch
        },
        [federationHostname, objectPath, objectUrl, federations, prefixToNamespace]
    );

    return {
        objectUrl,
        setObjectUrl,
        objectList,
        collections,
        loading,
        loginRequired,
        permissions,
        handleLogin,
        handleExplore,
        handleDownload,
        handleUpload,
        namespace,
        federation
    };
}

export default usePelicanClient;
