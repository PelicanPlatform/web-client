"use client";

import { Box, Container } from "@mui/material";
import React from "react";
import Client from "@pelicanplatform/components";

export default function HomePageClient() {

    const [mounted, setMounted] =  React.useState(false);

    React.useEffect(() => {
      setMounted(true);
    }, []);

    return (
        <Container maxWidth="lg">
            <Box minHeight={"90vh"} margin={4} width={"100%"} mx={"auto"}>
              {mounted &&
                <Client
                    objectUrl={"pelican://osg-htc.org/ospool/ap40"}
                    enableAuth={true}
                />
              }
            </Box>
        </Container>
    );
}

