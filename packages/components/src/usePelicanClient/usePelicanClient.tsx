"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSessionStorage } from "./useSessionStorage";
import {
    FederationStore,
    ObjectList,
    ObjectPrefixStore,
    TokenPermission,
    UnauthenticatedError,
    fetchFederation,
    fetchNamespace,
    generateCodeVerifier,
    get,
    list,
    parseObjectUrl,
    permissions,
    startAuthorizationCodeFlow,
    getAuthorizationCode,
    getToken,
    downloadResponse,
} from "@pelicanplatform/web-client";

export interface UsePelicanClientOptions {
    /** The initial object URL to load */
    startingUrl?: string;
    /** Whether to enable authentication features */
    enableAuth?: boolean;
}

function usePelicanClient(opts: UsePelicanClientOptions = {}) {
    const { startingUrl = "", enableAuth = true } = opts;

    const [objectUrl, setObjectUrl] = useState(startingUrl);
    const [federations, setFederations] = useSessionStorage<FederationStore>("pelican-wc-federations", {});
    const [prefixToNamespace, setPrefixToNamespace] = useSessionStorage<ObjectPrefixStore>("pelican-wc-p2n", {});
    const [codeVerifier, setCodeVerifier] = useSessionStorage<string | null>("pelican-wc-cv", null);

    const [permissionsState, setPermissions] = useState<TokenPermission[] | null>(null);
    const [objectList, setObjectList] = useState<ObjectList[]>([]);
    const [loading, setLoading] = useState(false);
    const [showDirectories, setShowDirectories] = useState(true);
    const [loginRequired, setLoginRequired] = useState(false);

    // parse object url safely
    const { federationHostname, objectPrefix } = useMemo(() => {
        try {
            return parseObjectUrl(objectUrl);
        } catch {
            return { federationHostname: "", objectPrefix: "", objectPath: "" };
        }
    }, [objectUrl]);

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
                nextFederations[federationHostname].namespaces?.[nextPrefixToNamespace[objectPrefixLocal]?.namespace];
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

                const objectPathTrimmed = objectPath.endsWith("/") ? objectPath.slice(0, -1) : objectPath;
                objects = objects.filter((o) => o.href !== objectPathTrimmed);

                const pathParts = objectPath.split("/").filter(Boolean);
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

                setObjectList(objects.reverse());
            } catch (e) {
                if (e instanceof UnauthenticatedError) {
                    setLoginRequired(true);
                    setObjectList([]);
                }
            }

            // permissions
            try {
                const perms = await permissions(url, namespace);
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
            startAuthorizationCodeFlow(codeVerifier, namespace, federation);
        } catch (error) {
            console.error("Login failed:", error);
        }
    }, [enableAuth, codeVerifier, federations, prefixToNamespace, federationHostname, objectPrefix]);

    // auth code exchange effect only when enabled
    useEffect(() => {
        if (!enableAuth) return;

        async function exchange() {
            const { federationHostname: fh, namespacePrefix, code } = getAuthorizationCode();
            if (code && fh && namespacePrefix && codeVerifier) {
                const namespace = federations[fh]?.namespaces[namespacePrefix];
                if (namespace?.clientId === undefined || namespace?.clientSecret === undefined) {
                    console.error("Cannot exchange code: missing client credentials for namespace", namespacePrefix);
                    return;
                }

                const token = await getToken(
                    namespace?.oidcConfiguration,
                    codeVerifier,
                    namespace?.clientId ?? "",
                    namespace?.clientSecret ?? "",
                    code
                );

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
        }

        exchange();
    }, [enableAuth, codeVerifier, federations, setFederations]);

    // initial fetch if starting url present
    useEffect(() => {
        if (objectUrl) handleRefetchObject(objectUrl);
    }, []); // intentionally empty deps to mirror original behavior

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

    return {
        objectUrl,
        setObjectUrl,
        federations,
        setFederations,
        prefixToNamespace,
        setPrefixToNamespace,
        permissions: permissionsState,
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
    };
}

export default usePelicanClient;
