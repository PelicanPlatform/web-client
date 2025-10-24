"use client";

import { Box } from "@mui/material";

import ObjectInput from "../ObjectInput";
import ObjectView from "../ObjectView";
import ClientMetadata from "../ClientMetadata";
import usePelicanClient from "../usePelicanClient";

interface PelicanWebClientProps {
    /** The initial object URL to load */
    startingUrl?: string;
}

function AuthenticatedClient({ startingUrl }: PelicanWebClientProps = {}) {
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
    } = usePelicanClient({ startingUrl, enableAuth: true });

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

export default AuthenticatedClient;
