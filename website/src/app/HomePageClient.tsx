"use client";

import { Box, Container } from "@mui/material";
import React from "react";
import {AuthenticatedClient, PelicanClientProvider} from "@pelicanplatform/components";
import ObjectUrlSetter from "../components/ObjectUrlSetter";

export default function HomePageClient() {

    const [mounted, setMounted] =  React.useState(false);

    React.useEffect(() => {
      setMounted(true);
    }, []);

    return (
        <Container maxWidth="lg">
            <Box minHeight={"90vh"} margin={4} width={"100%"} mx={"auto"}>
              {mounted &&
                  <PelicanClientProvider initialObjectUrl={"pelican://osg-htc.org/ospool/ap40"} enableAuth={true} >
                    <ObjectUrlSetter />
                    <AuthenticatedClient />
                  </PelicanClientProvider>
              }
            </Box>
        </Container>
    );
}

