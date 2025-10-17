"use client";

import { Box } from "@mui/material";

import PelicanWebClient from "@/components/client/PelicanWebClient";

function Page() {
    return (
        <Box minHeight={"90vh"} margin={4} width={"1200px"} mx={"auto"}>
            <PelicanWebClient startingUrl="pelican://osg-htc.org/ncar/" />
        </Box>
    );
}

export default Page;
