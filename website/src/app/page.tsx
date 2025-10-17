"use client";

import { Box } from "@mui/material";

import PelicanWebClient from "@/components/client/PelicanWebClient";
import PelicanWebClientRO from "@/components/client/PelicanWebClientRO";
import { useState } from "react";

function Page() {
    const [readOnly, setReadOnly] = useState(true);

    return (
        <Box minHeight={"90vh"} margin={4} width={"1200px"} mx={"auto"}>
            <Box display="flex" justifyContent="flex-end" mb={2} alignItems="center">
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                        type="checkbox"
                        checked={readOnly}
                        onChange={() => setReadOnly((r) => !r)}
                        aria-label="Toggle read-write"
                    />
                    <span>Read-only Mode</span>
                </label>
            </Box>

            {readOnly ? (
                <PelicanWebClientRO startingUrl="pelican://osg-htc.org/ncar/" />
            ) : (
                <PelicanWebClient startingUrl="pelican://osg-htc.org/ncar/" />
            )}
        </Box>
    );
}

export default Page;
