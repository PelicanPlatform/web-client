"use client";

import { Box } from "@mui/material";

import PelicanWebClient from "@/components/client/PelicanWebClient";
import { useSessionStorage } from "usehooks-ts";

function Page() {
    const [objectUrl] = useSessionStorage<string>("pelican-object-url", "pelican://osg-htc.org/ncar/");

    return (
        <Box minHeight={"90vh"} margin={4} width={"1200px"} mx={"auto"}>
            <PelicanWebClient startingUrl={objectUrl} authentication readonly />"
        </Box>
    );
}

export default Page;
