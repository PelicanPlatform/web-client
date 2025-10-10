"use client";

import { Box } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSessionStorage } from "usehooks-ts";

import ObjectInput from "@/components/client/ObjectInput";
import ObjectListComponent from "@/components/client/ObjectView";
import {
    Federation,
    ObjectList,
    ObjectPrefixToNamespaceKeyMap,
    TokenPermission,
    UnauthenticatedError,
    fetchFederation,
    fetchNamespace,
    generateCodeVerifier,
    get,
    getAuthorizationCode,
    getToken,
    list,
    parseObjectUrl,
    permissions,
    startAuthorizationCodeFlow,
} from "../../../../src/index";
import { downloadResponse } from "../../../../src/util";
import ClientMetadata from "./ClientMetadata";

interface PelicanWebClientProps {
    /** The initial object URL to load */
    startingUrl?: string;
    /** Whether to enable authentication/upload/metadata features */
    compact?: boolean;
}

function PelicanWebClient({ startingUrl, compact }: PelicanWebClientProps = {}) {
    const [objectUrl, setObjectUrl] = useState<string>(startingUrl ?? "");

    // Pelican client state
    const [federations, setFederations] = useSessionStorage<Record<string, Federation>>(
        "pelican-web-client-federations",
        {}
    );

    // Map of object prefix to federation and namespace
    const [prefixToNamespace, setPrefixToNamespace] = useSessionStorage<ObjectPrefixToNamespaceKeyMap>(
        "pelican-web-client-prefixToNamespace",
        {}
    );

    // PKCE Code Verifier for OIDC Authorization Code Flow
    const [codeVerifier, setCodeVerifier] = useSessionStorage<string | undefined>(
        "pelican-web-client-codeVerifier",
        undefined
    );

    // Initialize the code verifier if not present
    useEffect(() => {
        if (!codeVerifier) {
            setCodeVerifier(generateCodeVerifier());
        }
    }, [codeVerifier, setCodeVerifier]);

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
    }, [federations, objectUrl, prefixToNamespace, setFederations, setPrefixToNamespace]);

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
    }, [federations, setFederations, codeVerifier]);

    // UI State
    const [loginRequired, setLoginRequired] = useState<boolean>(false);
    const [permissions, setPermissions] = useState<TokenPermission[] | undefined>(undefined);
    const [objectList, setObjectList] = useState<ObjectList[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [showDirectories, setShowDirectories] = useState<boolean>(true);

    const { federationHostname, objectPrefix, objectPath } = useMemo(() => {
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
        [federations, setFederations, prefixToNamespace, setPrefixToNamespace]
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
        <Box>
            <Box mt={6} mx={"auto"} width={"100%"} display={"flex"} flexDirection={"column"}>
                <Box pt={2}>
                    <ObjectInput
                        objectUrl={objectUrl}
                        setObjectUrl={setObjectUrl}
                        onRefetchObject={handleRefetchObject}
                        loading={loading}
                    />
                    {!compact && (
                        <ClientMetadata
                            permissions={permissions}
                            showDirectories={showDirectories}
                            setShowDirectories={setShowDirectories}
                        />
                    )}
                </Box>
            </Box>
            <ObjectListComponent
                objectList={objectList}
                showCollections={showDirectories}
                onExplore={handleExplore}
                onDownload={handleDownload}
            />
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
        let objects: ObjectList[] = [];

        // 1. Find normal objects
        try {
            objects = await list(
                `pelican://${objectPrefix}`,
                federations[federationHostname],
                federations[federationHostname].namespaces?.[prefixToNamespace[objectPrefix]?.namespace]
            );
            setLoginRequired(false);
        } catch (e) {
            objects = await list(
                `pelican://${federationHostname}${objectPath}`,
                federations[federationHostname],
                federations[federationHostname].namespaces?.[prefixToNamespace[objectPrefix]?.namespace]
            );
            setLoginRequired(false);
        }

        // 2. Filter out the current directory entry (often shows up as "." or the current path)
        const currentDirName =
            objectPath
                .split("/")
                .filter((part) => part.length > 0)
                .pop() || "";
        objects = objects.filter((obj) => {
            // Remove entries that represent the current directory
            const objName =
                obj.href
                    .split("/")
                    .filter((part) => part.length > 0)
                    .pop() || obj.href;
            return objName !== "." && objName !== currentDirName && obj.href !== objectPath;
        });

        // 3. Insert synthetic ".." object if we're not at the root
        const pathParts = objectPath.split("/").filter((part) => part.length > 0);
        if (pathParts.length > 0) {
            // Calculate parent path
            const parentParts = pathParts.slice(0, -1);
            const parentPath = parentParts.length > 0 ? "/" + parentParts.join("/") : "";

            const parentObject: ObjectList = {
                href: parentPath || "/",
                getcontentlength: 0,
                getlastmodified: "",
                resourcetype: "collection",
                iscollection: true,
                executable: "",
                status: "",
            };

            // Reverse first, then add ".." to the beginning
            objects = objects.reverse();
            objects = [parentObject, ...objects];
        } else {
            objects = objects.reverse();
        }

        setObjectList(objects);
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

export default PelicanWebClient;
