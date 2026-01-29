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
        collections,
        loading,
        loginRequired,
        handleLogin,
        handleExplore,
        handleDownload,
        handleUpload,
        federation,
        namespace
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
                            onChange={setObjectUrl}
                            loading={loading}
                            federation={federation?.hostname}
                            namespace={namespace?.prefix}
                        />
                        <ClientMetadata
                            federation={federation?.hostname}
                            namespace={namespace?.prefix}
                            onUpload={!loginRequired ? () => uploadRef.current?.triggerFileSelect() : undefined}
                        />
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
                        onExplore={handleExplore}
                        onDownload={handleDownload}
                        loginRequired={loginRequired}
                        canLogin={true}
                        onLoginRequest={handleLogin}
                        namespace={namespace?.prefix}
                    />
                </Box>
                {collections.length > 0 && (
                    <Box pt={2} flexGrow={0}>
                        <CollectionShortcuts collections={collections} onClick={handleExplore} />
                    </Box>
                )}
            </Box>
        </Box>
    );
}

export default AuthenticatedClient;
