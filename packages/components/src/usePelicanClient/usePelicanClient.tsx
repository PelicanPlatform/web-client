"use client";

import {
    FederationStore,
    ObjectList,
    ObjectPrefixStore,
    TokenPermission,
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
} from "@pelicanplatform/web-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSessionStorage } from "./useSessionStorage";

export interface UsePelicanClientOptions {
    /** The initial object URL to load */
    startingUrl?: string | undefined;
    /** Whether to enable authentication features */
    enableAuth?: boolean;
}

function usePelicanClient({ startingUrl = "", enableAuth = true }: UsePelicanClientOptions = {}) {
    const [objectUrl, setObjectUrl] = useState(startingUrl ?? "");
    const [federations, setFederations] = useSessionStorage<FederationStore>("pelican-wc-federations", {});
    const [prefixToNamespace, setPrefixToNamespace] = useSessionStorage<ObjectPrefixStore>("pelican-wc-p2n", {});
    const [codeVerifier, setCodeVerifier] = useSessionStorage<string | null>("pelican-wc-cv", null);

    const [permissions, setPermissions] = useState<TokenPermission[] | null>(null);
    const [objectList, setObjectList] = useState<ObjectList[]>([]);
    const [loading, setLoading] = useState(false);
    const [showDirectories, setShowDirectories] = useState(true);
    const [loginRequired, setLoginRequired] = useState(false);

    const [authExchangeComplete, setAuthExchangeComplete] = useState(false);
    const [initialFetchDone, setInitialFetchDone] = useState(false);

    // parse object url safely
    const { federationHostname, objectPrefix } = useMemo(() => {
        try {
            return parseObjectUrl(objectUrl);
        } catch {
            return { federationHostname: "", objectPrefix: "", objectPath: "" };
        }
    }, [objectUrl]);

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
                    console.log(0);
                    const namespace = federations[fh]?.namespaces[namespacePrefix];
                    if (namespace?.clientId === undefined || namespace?.clientSecret === undefined) {
                        console.log(1);
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
                    setFederations({
                        ...federations,
                        [fh]: {
                            ...federations[fh],
                            namespaces: {
                                ...federations[fh]?.namespaces,
                                [namespacePrefix]: {
                                    ...federations[fh]?.namespaces?.[namespacePrefix],
                                    token: token.accessToken,
                                },
                            },
                        },
                    });
                }
            } catch (e) {
                console.error("Error during authorization code exchange:", e);
            } finally {
                console.log(2);
                // exchange complete (whether we did it or not)
                setAuthExchangeComplete(true);
            }
        }

        exchange();
    }, [enableAuth, codeVerifier, federations, setFederations]);

    // if not enabling auth, never require login
    useEffect(() => {
        if (!enableAuth) setLoginRequired(false);
    }, [enableAuth]);

    // if no code verifier, generate one
    useEffect(() => {
        if (!codeVerifier) {
            const cv = generateCodeVerifier();
            setCodeVerifier(cv);
        }
    }, [codeVerifier]);

    // shared update function
    const updateObjectUrlState = useCallback(
        async (url: string) => {
            // (This is the same logic as your existing function but embedded here.)
            // Keep concise: parse, fetch federation/namespace if missing, list objects, set permissions.
            let federationHostnameLocal: string, objectPrefixLocal: string, objectPath: string;
            try {
                const parsed = parseObjectUrl(url);
                federationHostnameLocal = parsed.federationHostname;
                objectPrefixLocal = parsed.objectPrefix;
                objectPath = parsed.objectPath;
            } catch {
                setLoginRequired(false);
                setPermissions([]);
                setObjectList([]);
                return;
            }

            let nextFederations = federations; // react state isn't updated immediately so track locally
            // ensure federation
            if (!(federationHostnameLocal in nextFederations)) {
                try {
                    const fed = await fetchFederation(federationHostnameLocal);
                    nextFederations = { ...nextFederations, [federationHostnameLocal]: fed };
                    setFederations(nextFederations);
                } catch {}
            }

            const federation = nextFederations[federationHostnameLocal];
            if (!federation) {
                throw new Error("Federation not found (which should be impossible due to prior fetch).");
            }

            let nextPrefixToNamespace = prefixToNamespace;
            // ensure prefix -> namespace
            if (!(objectPrefixLocal in nextPrefixToNamespace)) {
                try {
                    const ns = await fetchNamespace(objectPath, federation);
                    nextPrefixToNamespace = {
                        ...nextPrefixToNamespace,
                        [objectPrefixLocal]: { federation: federationHostnameLocal, namespace: ns.prefix },
                    };
                    setPrefixToNamespace(nextPrefixToNamespace);

                    if (!(ns.prefix in nextFederations[federationHostnameLocal].namespaces)) {
                        nextFederations = {
                            ...nextFederations,
                            [federationHostnameLocal]: {
                                ...nextFederations[federationHostnameLocal],
                                namespaces: {
                                    ...nextFederations[federationHostnameLocal].namespaces,
                                    [ns.prefix]: ns,
                                },
                            },
                        };
                        setFederations(nextFederations);
                    }
                } catch (e) {
                    console.log("Failed to fetch namespace for prefix:", objectPrefixLocal, e);
                }
            }

            const namespace =
                nextFederations[federationHostnameLocal].namespaces?.[
                    nextPrefixToNamespace[objectPrefixLocal]?.namespace
                ];
            if (!namespace) {
                throw new Error("Namespace not found (which should be impossible due to prior fetch).");
            }

            // list
            try {
                let objects: ObjectList[] = [];
                setLoginRequired(false);
                try {
                    objects = await list(`pelican://${objectPrefixLocal}`, federation, namespace);
                } catch {
                    objects = await list(`pelican://${federationHostnameLocal}${objectPath}`, federation, namespace);
                }

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

                // reverse so directories show first (and the parent entry shows at top)
                setObjectList(objects.reverse());
            } catch (e) {
                if (e instanceof UnauthenticatedError) {
                    setLoginRequired(true);
                    setObjectList([]);
                }
            }

            // permissions
            try {
                const perms = await fetchPermissions(url, namespace);
                setPermissions(perms);
            } catch {}
        },
        [federations, prefixToNamespace, setFederations, setPrefixToNamespace]
    );

    // expose handlers
    const handleRefetchObject = useCallback(
        async (url: string) => {
            setLoading(true);
            setObjectUrl(url);
            await updateObjectUrlState(url);
            setLoading(false);
        },
        [updateObjectUrlState]
    );

    // initial fetch if starting url present - but only after auth exchange is complete
    useEffect(() => {
        if (!authExchangeComplete || initialFetchDone) return;

        handleRefetchObject(objectUrl);
        setInitialFetchDone(true);
    }, [authExchangeComplete, initialFetchDone, startingUrl, objectUrl, federations, handleRefetchObject]);

    const handleExplore = useCallback(
        (href: string) => {
            handleRefetchObject(`pelican://${federationHostname}${href}/`);
        },
        [federationHostname, handleRefetchObject]
    );

    const handleDownload = useCallback(
        async (href: string) => {
            try {
                const response = await get(
                    `pelican://${federationHostname}${href}`,
                    federations[federationHostname],
                    federations[federationHostname].namespaces?.[prefixToNamespace[objectPrefix]?.namespace]
                );
                downloadResponse(response);
            } catch (e) {
                console.error("Download failed:", e);
            }
        },
        [federationHostname, federations, prefixToNamespace, objectPrefix]
    );

    const handleLogin = useCallback(async () => {
        if (!enableAuth) return;
        if (!codeVerifier) return;
        try {
            const federation = federations[federationHostname];
            const namespaceKey = prefixToNamespace[objectPrefix];
            const namespace = federation.namespaces[namespaceKey.namespace];
            startAuthorizationCodeFlow(codeVerifier, namespace, federation, { objectUrl });
        } catch (error) {
            console.error("Login failed:", error);
        }
    }, [enableAuth, codeVerifier, federations, prefixToNamespace, federationHostname, objectPrefix]);

    const handleUpload = useCallback(
        async (file: File) => {
            console.log("Uploading file:", `pelican://${objectPrefix}/${file.name}`);
            try {
                await put(
                    `pelican://${objectPrefix}/${file.name}`,
                    file,
                    federations[federationHostname],
                    federations[federationHostname].namespaces?.[prefixToNamespace[objectPrefix]?.namespace]
                );
            } catch (e) {
                console.error("Upload failed:", e);
                throw new Error("Upload failed.");
            }
            handleRefetchObject(objectUrl); // refresh current object list after upload
        },
        [federationHostname, objectPrefix, objectUrl, federations, prefixToNamespace, handleRefetchObject]
    );

    return {
        objectUrl,
        setObjectUrl,
        federations,
        setFederations,
        prefixToNamespace,
        setPrefixToNamespace,
        permissions: permissions,
        setPermissions,
        objectList,
        loading,
        showDirectories,
        setShowDirectories,
        loginRequired,
        handleRefetchObject,
        handleLogin,
        handleExplore,
        handleDownload,
        handleUpload,
    };
}

export default usePelicanClient;
