"use client";

import { Box } from "@mui/material";
import { useRef } from "react";

import ClientMetadata from "../ClientMetadata";
import CollectionShortcuts from "../CollectionShortcuts";
import ObjectInput from "../ObjectInput";
import ObjectUpload, { ObjectUploadRef } from "../ObjectUpload";
import ObjectView from "../ObjectView";
import usePelicanClient, { UsePelicanClientOptions } from "../usePelicanClient";

/**
 * An authorized web-client, with upload functionality and enabled authentications
 */
function AuthenticatedClient(props: UsePelicanClientOptions) {
    const uploadRef = useRef<ObjectUploadRef>(null);

    const {
        objectUrl,
        setObjectUrl,
        objectList,
        shortcuts,
        loading,
        showDirectories,
        setShowDirectories,
        loginRequired,
        handleLogin,
        handleRefetchObject,
        handleExplore,
        handleDownload,
        handleUpload,
    } = usePelicanClient(props);

    return (
        <Box mt={6} {...(uploadRef.current?.dragHandlers ?? {})}>
            <Box
                width={"100%"}
                sx={{
                    display: {
                        xs: "block",
                        md: "flex",
                    },
                }}
                gap={2}
            >
                <Box pt={2} display={"flex"} flexDirection={"column"} flexGrow={1}>
                    <Box>
                        <ObjectInput
                            objectUrl={objectUrl}
                            setObjectUrl={setObjectUrl}
                            onChange={handleRefetchObject}
                            loading={loading}
                        />
                        <ClientMetadata showDirectories={showDirectories} setShowDirectories={setShowDirectories} />
                    </Box>
                    {!loginRequired && (
                        <Box>
                            <ObjectUpload
                                refs={uploadRef}
                                disabled={false}
                                onUpload={handleUpload}
                                currentPath={objectUrl}
                            />
                        </Box>
                    )}
                    <ObjectView
                        objectList={objectList}
                        showCollections={showDirectories}
                        onExplore={handleExplore}
                        onDownload={handleDownload}
                        loginRequired={loginRequired}
                        canLogin={true}
                        onLoginRequest={handleLogin}
                    />
                </Box>
                {shortcuts.length > 0 && (
                    <Box pt={2} flexGrow={0}>
                        <CollectionShortcuts shortcuts={shortcuts} onClick={handleExplore} />
                    </Box>
                )}
            </Box>
        </Box>
    );
}

export default AuthenticatedClient;
