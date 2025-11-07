"use client";

import { Box } from "@mui/material";

import ClientMetadata from "../ClientMetadata";
import ObjectInput from "../ObjectInput";
import ObjectView from "../ObjectView";
import usePelicanClient, { UsePelicanClientOptions } from "../usePelicanClient";

function PublicClient(props: UsePelicanClientOptions) {
    const {
        objectUrl,
        setObjectUrl,
        objectList,
        loading,
        showDirectories,
        setShowDirectories,
        loginRequired,
        handleRefetchObject,
        handleExplore,
        handleDownload,
    } = usePelicanClient(props);

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
                    <ClientMetadata showDirectories={showDirectories} setShowDirectories={setShowDirectories} />
                </Box>
            </Box>
            <ObjectView
                objectList={objectList}
                showCollections={showDirectories}
                onExplore={handleExplore}
                onDownload={handleDownload}
                loginRequired={loginRequired}
                canLogin={false}
            />
        </Box>
    );
}

export default PublicClient;
