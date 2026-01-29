"use client";

import { Box, Container } from "@mui/material";
import Client from "@pelicanplatform/components";

export default function HomePageClient() {
    return (
        <Container maxWidth="lg">
            <Box minHeight={"90vh"} margin={4} width={"100%"} mx={"auto"}>
                <Client
                    objectUrl={"pelican://osg-htc.org/ospool/ap40"}
                    enableAuth={true}
                />
            </Box>
        </Container>
    );
}
