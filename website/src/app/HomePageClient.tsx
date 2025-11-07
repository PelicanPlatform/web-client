"use client";

import { Box } from "@mui/material";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useSessionStorage } from "usehooks-ts";
import Client from "@pelicanplatform/components";

function parseStateParam(state: string | null): Partial<Record<string, string>> {
    if (state === null) return {};
    return state.split(";").reduce((acc, pair) => {
        const colonIndex = pair.indexOf(":");
        if (colonIndex === -1) return acc;
        const key = pair.substring(0, colonIndex);
        const value = pair.substring(colonIndex + 1);
        acc[key] = value;
        return acc;
    }, {} as Partial<Record<string, string>>);
}

export default function HomePageClient() {
    const [publicClient, setPublicClient] = useState(false);
    const [objectUrl, setObjectUrl] = useSessionStorage("pelican-object-url", "pelican://osg-htc.org/ncar");
    const searchParams = useSearchParams();
    const state = searchParams.get("state");
    const providedObjectUrl = parseStateParam(state)["objectUrl"];

    return (
        <Box minHeight={"90vh"} margin={4} width={"1200px"} mx={"auto"}>
            <Box minHeight={"90vh"} margin={4} width={"1200px"} mx={"auto"}>
                <Box display="flex" justifyContent="flex-end" mb={2} alignItems="center">
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                            type="checkbox"
                            checked={publicClient}
                            onChange={() => setPublicClient((r) => !r)}
                            aria-label="Toggle read-write"
                        />
                        <span>Read-only Mode</span>
                    </label>
                </Box>
                <Client
                    objectUrl={providedObjectUrl ?? objectUrl}
                    setObjectUrl={setObjectUrl}
                    enableAuth={!publicClient}
                />
            </Box>
        </Box>
    );
}
