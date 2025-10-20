"use client";

import { Box } from "@mui/material";

import PelicanWebClient from "@/components/client/PelicanWebClient";
import PelicanWebClientRO from "@/components/client/PelicanWebClientRO";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

function parseStateParam(state: string | null): Record<string, string> {
    if (!state) return {};

    return state.split(";").reduce((acc, pair) => {
        const colonIndex = pair.indexOf(":");
        if (colonIndex === -1) return acc;

        const key = pair.substring(0, colonIndex);
        const value = pair.substring(colonIndex + 1);
        acc[key] = value;
        return acc;
    }, {} as Record<string, string>);
}

function Page() {
    const searchParams = useSearchParams();
    const state = searchParams.get("state");

    const providedObjectUrl = parseStateParam(state)["objectUrl"];
    const objectUrl = providedObjectUrl ?? "pelican://osg-htc.org/ncar/";

    const [readOnly, setReadOnly] = useState(false);

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

            {readOnly ? <PelicanWebClientRO startingUrl={objectUrl} /> : <PelicanWebClient startingUrl={objectUrl} />}
        </Box>
    );
}

export default Page;
