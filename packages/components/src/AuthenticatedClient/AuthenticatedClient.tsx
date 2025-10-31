"use client";

import { Box } from "@mui/material";
import { useRef } from "react";

import ClientMetadata from "../ClientMetadata";
import ObjectInput from "../ObjectInput";
import ObjectUpload, { ObjectUploadRef } from "../ObjectUpload";
import ObjectView from "../ObjectView";
import usePelicanClient from "../usePelicanClient";

interface PelicanWebClientProps {
    /** The initial object URL to load */
    startingUrl?: string | undefined;
}

function AuthenticatedClient({ startingUrl }: PelicanWebClientProps) {
    const uploadRef = useRef<ObjectUploadRef>(null);

    const {
        objectUrl,
        setObjectUrl,
        objectList,
        loading,
        showDirectories,
        permissions,
        setShowDirectories,
        loginRequired,
        handleLogin,
        handleRefetchObject,
        handleExplore,
        handleDownload,
        handleUpload,
    } = usePelicanClient({ startingUrl, enableAuth: true });

    return (
        <Box {...(uploadRef.current?.dragHandlers ?? {})}>
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
                {!loginRequired && (
                    <Box pt={2}>
                        <ObjectUpload
                            refs={uploadRef}
                            disabled={false}
                            onUpload={handleUpload}
                            currentPath={objectUrl}
                        />
                    </Box>
                )}
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
            <Box mt={4} component="pre">
                {/* {JSON.stringify(federations, null, 2)} */}
            </Box>
        </Box>
    );
}

export default AuthenticatedClient;
