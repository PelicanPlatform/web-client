"use client";

import { Box } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSessionStorage } from "usehooks-ts";

import ObjectInput from "@/components/client/ObjectInput";
import ObjectView from "@/components/client/ObjectView";
import {
    Federation,
    FederationStore,
    ObjectList,
    ObjectPrefixStore,
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
}

function PelicanWebClient({ startingUrl }: PelicanWebClientProps = {}) {
    // Current object URL
    const [objectUrl, setObjectUrl] = useState(startingUrl ?? "");
    // Map of federation hostname to Federation
    const [federations, setFederations] = useSessionStorage<FederationStore>("pelican-wc-federations", {});
    // Map of object prefix to federation and namespace
    const [prefixToNamespace, setPrefixToNamespace] = useSessionStorage<ObjectPrefixStore>("pelican-wc-p2n", {});

    // PKCE Code Verifier for OIDC Authorization Code Flow
    // Initializes with a new code verifier if one doesn't exist (via the function)
    const [codeVerifier, setCodeVerifier] = useSessionStorage<string | null>("pelican-wc-cv", null);

    // On load, generate a code verifier
    useEffect(() => {
        if (!codeVerifier) {
            const code = generateCodeVerifier();
            console.log("Generated code verifier:", code);
            setCodeVerifier(code);
        }
    }, [codeVerifier]);

    // On load, check if there is a code in the URL to exchange for a token
    useEffect(() => {
        if (!codeVerifier) return;
        exchangeCodeForToken(codeVerifier, federations, setFederations) satisfies Promise<void>;
    }, [codeVerifier, federations, setFederations]);

    // UI State
    const [loginRequired, setLoginRequired] = useState(false);
    const [permissions, setPermissions] = useState<TokenPermission[] | null>(null);
    const [objectList, setObjectList] = useState<ObjectList[]>([]);
    const [loading, setLoading] = useState(false);
    const [showDirectories, setShowDirectories] = useState(true);

    const { federationHostname, objectPrefix } = useMemo(() => {
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
        // if (loading) return;

        // prevent multiple login attempts
        setLoading(true);
        try {
            const federation = federations[federationHostname];
            const namespaceKey = prefixToNamespace[objectPrefix];
            const namespace = federation.namespaces[namespaceKey.namespace];

            startAuthorizationCodeFlow(codeVerifier, namespace, federation, {
                objectUrl,
            });
        } catch (error) {
            console.error("Login failed:", error);
        } finally {
            // startAuthorizationCodeFlow will redirect, but just incase there's an error
            setLoading(false);
        }
    }, [codeVerifier, federations, prefixToNamespace, federationHostname, objectPrefix]);

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
                        onChange={handleRefetchObject}
                        loading={loading}
                    />
                    <ClientMetadata
                        permissions={permissions}
                        showDirectories={showDirectories}
                        setShowDirectories={setShowDirectories}
                    />
                </Box>
            </Box>
            <ObjectView
                objectList={objectList}
                showCollections={showDirectories}
                onExplore={handleExplore}
                onDownload={handleDownload}
                loginRequired={loginRequired}
                onLoginRequest={handleLogin}
                canLogin={true}
            />
        </Box>
    );
}

/**
 * Pull in objectUrl related information into React state.
 */
async function updateObjectUrlState(
    objectUrl: string,
    federations: Record<string, Federation>,
    setFederations: (f: Record<string, Federation>) => void,
    prefixToNamespace: ObjectPrefixStore,
    setPrefixToNamespace: (m: ObjectPrefixStore) => void,
    setPermissions: (p: TokenPermission[]) => void,
    setLoginRequired: (b: boolean) => void,
    setObjectList: (l: ObjectList[]) => void
) {
    // Parse the object URL
    let federationHostname, objectPrefix, objectPath;
    try {
        const parsed = parseObjectUrl(objectUrl);
        federationHostname = parsed.federationHostname;
        objectPrefix = parsed.objectPrefix;
        objectPath = parsed.objectPath;
    } catch {
        // Total failure to parse URL, reset everything
        setLoginRequired(false);
        setPermissions([]);
        setObjectList([]);
        return;
    }

    // If we haven't registered the federation
    if (!(federationHostname in federations)) {
        try {
            const federation = await fetchFederation(federationHostname);
            federations = {
                ...federations,
                [federationHostname]: federation,
            };
            setFederations(federations);
        } catch {}
    }

    const federation = federations[federationHostname];
    // If we haven't mapped this prefix to a namespace
    if (!(objectPrefix in prefixToNamespace)) {
        try {
            const namespace = await fetchNamespace(objectPath, federation);
            prefixToNamespace = {
                ...prefixToNamespace,
                [objectPrefix]: {
                    federation: federationHostname,
                    namespace: namespace.prefix,
                },
            };
            setPrefixToNamespace(prefixToNamespace);

            // If we haven't registered this namespace
            if (!(namespace.prefix in federation.namespaces)) {
                setFederations({
                    ...federations,
                    [federationHostname]: {
                        ...federation,
                        namespaces: {
                            ...federation.namespaces,
                            [namespace.prefix]: namespace,
                        },
                    },
                });
            }
        } catch {}
    }

    const namespace = federation.namespaces?.[prefixToNamespace[objectPrefix]?.namespace];

    // Try to list
    try {
        let objects: ObjectList[] = [];

        // 1. Find normal objects
        // Also set loginRequired to false on every refetch, since list could fail due to 404
        setLoginRequired(false);
        try {
            objects = await list(`pelican://${objectPrefix}`, federation, namespace);
        } catch (e) {
            objects = await list(`pelican://${federationHostname}${objectPath}`, federation, namespace);
        }

        // 2. Filter out the current directory entry
        const objectPathTrimmed = objectPath.endsWith("/")
            ? objectPath.substring(0, objectPath.length - 1)
            : objectPath;
        objects = objects.filter((obj) => obj.href !== objectPathTrimmed);

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

            // Note: We push first, so parent is at end, and then reverse, so it ends up at the front.
            objects.push(parentObject);
        }

        objects = objects.reverse();
        setObjectList(objects);
    } catch (e) {
        if (e instanceof UnauthenticatedError) {
            setLoginRequired(true);
            setObjectList([]);
        }
    }

    // Check permissions
    try {
        const perms = await permissions(objectUrl, namespace);
        setPermissions(perms);
    } catch {}
}

async function exchangeCodeForToken(
    codeVerifier: string,
    federations: FederationStore,
    setFederations: (f: FederationStore) => void
) {
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
}

export default PelicanWebClient;
