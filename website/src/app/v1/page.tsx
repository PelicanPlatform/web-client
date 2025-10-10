"use client";

import { Box, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSessionStorage } from "usehooks-ts";

import ObjectInput from "@/components/client/ObjectInput";
import ObjectListComponent from "@/components/client/ObjectListComponent";
import {
    Federation,
    ObjectList,
    ObjectPrefixToNamespaceKeyMap,
    TokenPermission,
    UnauthenticatedError,
    fetchFederation,
    fetchNamespace,
    generateCodeVerifier,
    getAuthorizationCode,
    getToken,
    list,
    parseObjectUrl,
    permissions,
    get,
    startAuthorizationCodeFlow,
} from "../../../../src/index";
import { downloadResponse } from "../../../../src/util";

function Page() {
    // Pelican client state
    const [federations, setFederations] = useSessionStorage<Record<string, Federation>>("federations", {});

    // Map of object prefix to federation and namespace
    const [prefixToNamespace, setPrefixToNamespace] = useSessionStorage<ObjectPrefixToNamespaceKeyMap>(
        "prefixToNamespace",
        {}
    );

    // PKCE Code Verifier for OIDC Authorization Code Flow
    const [codeVerifier, setCodeVerifier] = useSessionStorage<string | undefined>("codeVerifier", undefined);

    // Initialize the code verifier if not present
    useEffect(() => {
        if (!codeVerifier) {
            setCodeVerifier(generateCodeVerifier());
        }
    }, [codeVerifier]);

    // Run list on load
    useEffect(() => {
        (async () => {
            await updateObjectUrlState(
                objectUrl,
                federations,
                setFederations,
                prefixToNamespace,
                setPrefixToNamespace,
                setPermissions,
                setLoginRequired,
                setObjectList
            );
        })();
    }, []);

    // On load, check if there is a code in the URL to exchange for a token
    useEffect(() => {
        (async () => {
            const { federationHostname, namespacePrefix, code } = getAuthorizationCode();

            // If there is a code in the URL, exchange it for a token
            if (code && federationHostname && namespacePrefix && codeVerifier) {
                const namespace = federations[federationHostname]?.namespaces[namespacePrefix];
                const token = await getToken(
                    namespace?.oidcConfiguration,
                    codeVerifier,
                    namespace?.clientId,
                    namespace?.clientSecret,
                    code
                );
                setFederations({
                    ...federations,
                    [federationHostname]: {
                        ...federations[federationHostname],
                        namespaces: {
                            ...federations[federationHostname]?.namespaces,
                            [namespacePrefix]: {
                                ...federations[federationHostname]?.namespaces[namespacePrefix],
                                token: token.accessToken,
                            },
                        },
                    },
                });
            }
        })();
    }, [federations, codeVerifier]);

    // UI State
    let [loginRequired, setLoginRequired] = useState<boolean>(false);
    let [objectUrl, setObjectUrl] = useSessionStorage<string>("objectUrl", "");
    let [permissions, setPermissions] = useState<TokenPermission[] | undefined>(undefined);
    let [objectList, setObjectList] = useState<ObjectList[]>([]);
    let [loading, setLoading] = useState<boolean>(false);

    let { federationHostname, objectPrefix, objectPath } = useMemo(() => {
        try {
            return parseObjectUrl(objectUrl);
        } catch {
            return { federationHostname: "", objectPrefix: "", objectPath: "" };
        }
    }, [objectUrl]);

    const handleRefetchObject = useCallback(
        async (url: string) => {
            console.log("Object URL changed to", url);
            setLoading(true);
            setObjectUrl(url);
            await updateObjectUrlState(
                url,
                federations,
                setFederations,
                prefixToNamespace,
                setPrefixToNamespace,
                setPermissions,
                setLoginRequired,
                setObjectList
            );
            setLoading(false);
        },
        [federations, prefixToNamespace]
    );

    const handleLogin = useCallback(async () => {
        if (!codeVerifier) return;

        try {
            const { federationHostname, objectPrefix } = parseObjectUrl(objectUrl);
            const federation = federations[federationHostname];
            const namespaceKey = prefixToNamespace[objectPrefix];
            const namespace = federation.namespaces[namespaceKey.namespace];

            startAuthorizationCodeFlow(codeVerifier, namespace, federation);
        } catch (error) {
            console.error("Login failed:", error);
        }
    }, [codeVerifier, objectUrl, federations, prefixToNamespace]);

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
            } catch (error) {
                console.error("Download failed:", error);
            }
        },
        [federationHostname, federations, prefixToNamespace, objectPrefix]
    );

    return (
        <Box minHeight={"90vh"} margin={4} width={"1200px"} mx={"auto"}>
            <Box mt={6} mx={"auto"} width={"100%"} display={"flex"} flexDirection={"column"}>
                <Box pt={2}>
                    <ObjectInput
                        objectUrl={objectUrl}
                        setObjectUrl={setObjectUrl}
                        handleRefetchObject={handleRefetchObject}
                        loginRequired={loginRequired && !!codeVerifier}
                        loading={loading}
                        onLoginClick={handleLogin}
                    />
                    <Typography variant={"subtitle2"}>
                        Namespace Permissions: {permissions ? permissions.join(", ") : "Unknown"}
                    </Typography>
                </Box>
            </Box>
            <ObjectListComponent objectList={objectList} onExplore={handleExplore} onDownload={handleDownload} />
        </Box>
    );
}

/**
 * Pull in objectUrl related information into React state.
 */
const updateObjectUrlState = async (
    objectUrl: string,
    federations: Record<string, Federation>,
    setFederations: (f: Record<string, Federation>) => void,
    prefixToNamespace: ObjectPrefixToNamespaceKeyMap,
    setPrefixToNamespace: (m: ObjectPrefixToNamespaceKeyMap) => void,
    setPermissions: (p: TokenPermission[]) => void,
    setLoginRequired: (b: boolean) => void,
    setObjectList: (l: ObjectList[]) => void
) => {
    // Parse the object URL
    let federationHostname, objectPrefix, objectPath;
    try {
        const parsed = parseObjectUrl(objectUrl);
        federationHostname = parsed.federationHostname;
        objectPrefix = parsed.objectPrefix;
        objectPath = parsed.objectPath;
    } catch {}

    if (!federationHostname || !objectPrefix || !objectPath) {
        // Total failure to parse URL, reset everything
        setLoginRequired(false);
        setPermissions([]);
        setObjectList([]);
        return;
    }

    // If we haven't registered the federation
    try {
        if (!(federationHostname in federations)) {
            const federation = await fetchFederation(federationHostname);
            federations = {
                ...federations,
                [federationHostname]: federation,
            };
            setFederations(federations);
        }
    } catch {}

    // If we haven't mapped this prefix to a namespace
    try {
        if (!(objectPrefix in prefixToNamespace)) {
            const namespace = await fetchNamespace(objectPath, federations[federationHostname]);
            prefixToNamespace = {
                ...prefixToNamespace,
                [objectPrefix]: {
                    federation: federationHostname,
                    namespace: namespace.prefix,
                },
            };
            setPrefixToNamespace(prefixToNamespace);

            // If we haven't registered this namespace
            if (!(namespace.prefix in federations[federationHostname].namespaces)) {
                setFederations({
                    ...federations,
                    [federationHostname]: {
                        ...federations[federationHostname],
                        namespaces: {
                            ...federations[federationHostname]?.namespaces,
                            [namespace.prefix]: namespace,
                        },
                    },
                });
            }
        }
    } catch {}

    // Try to list
    try {
        try {
            setObjectList(
                (
                    await list(
                        `pelican://${objectPrefix}`,
                        federations[federationHostname],
                        federations[federationHostname].namespaces?.[prefixToNamespace[objectPrefix]?.namespace]
                    )
                ).reverse()
            );
            setLoginRequired(false);
        } catch (e) {
            setObjectList(
                (
                    await list(
                        `pelican://${federationHostname}${objectPath}`,
                        federations[federationHostname],
                        federations[federationHostname].namespaces?.[prefixToNamespace[objectPrefix]?.namespace]
                    )
                ).reverse()
            );
            setLoginRequired(false);
        }
    } catch (e) {
        if (e instanceof UnauthenticatedError) {
            setLoginRequired(true);
            setObjectList([]);
        }
    }

    // Check permissions
    try {
        if (federations[federationHostname].namespaces?.[prefixToNamespace[objectPrefix]?.namespace]) {
            const perms = await permissions(
                objectUrl,
                federations[federationHostname].namespaces?.[prefixToNamespace[objectPrefix]?.namespace]
            );
            setPermissions(perms);
        }
    } catch {}
};

export default Page;
