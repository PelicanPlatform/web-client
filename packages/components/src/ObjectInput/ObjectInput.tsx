"use client";

import { KeyboardDoubleArrowRight, Visibility, VisibilityOff } from "@mui/icons-material";
import { Box, IconButton, InputAdornment, LinearProgress, TextField } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useDebounceCallback } from "usehooks-ts";

interface ObjectInputProps {
    objectUrl: string;

    /** objectUrl is the actual text value used by the UI */
    setObjectUrl: (url: string) => void;
    /**
     * onChange is a debounced callback for when the user stops typing,
     * signifying to change the object.
     */
    onChange: (url: string) => void;

    loading: boolean;

    federation?: string | null;
    namespace?: string | null;
}

/**
 * The ObjectInput component allows users to input an object URL, handles authentication if required,
 * and displays a loading indicator during asynchronous operations.
 */
function ObjectInput({ objectUrl, setObjectUrl, onChange, loading, federation, namespace }: ObjectInputProps) {
    const debounced = useDebounceCallback(onChange, 300);
    const [showPrefix, setShowPrefix] = useState(false);

    // keep track of the last prefix to avoid flicker during loading
    const lastPrefixRef = useRef<string | null>(null);

    // calculate the prefix to hide
    const prefix = federation && namespace ? `pelican://${federation}${namespace}` : null;

    // remember the last prefix
    useEffect(() => {
        if (prefix) {
            lastPrefixRef.current = prefix;
        }
    }, [prefix]);

    // Use the current prefix if available, otherwise use the last known prefix
    const effectivePrefix = prefix || lastPrefixRef.current;

    // Determine what to display in the input
    const displayValue =
        !showPrefix && effectivePrefix && objectUrl.startsWith(effectivePrefix)
            ? objectUrl.slice(effectivePrefix.length) || "/"
            : objectUrl;

    return (
        <Box display={"flex"} flexDirection={"column"}>
            <Box display={"flex"} alignItems={"center"}>
                <TextField
                    fullWidth
                    onChange={(e) => {
                        // If prefix is hidden, reconstruct the full URL
                        const newValue =
                            !showPrefix && effectivePrefix ? effectivePrefix + e.target.value : e.target.value;
                        setObjectUrl(newValue);
                        debounced(newValue);
                    }}
                    value={displayValue}
                    id="pelican-url"
                    placeholder={"Enter Pelican URL ( pelican://<federation>/<namespace>/* )"}
                    variant="outlined"
                    size="medium"
                    slotProps={{
                        input: {
                            startAdornment: (
                                <InputAdornment position="start">
                                    <KeyboardDoubleArrowRight />
                                </InputAdornment>
                            ),
                            endAdornment: prefix && (
                                <InputAdornment position="end">
                                    <IconButton
                                        size="small"
                                        onClick={() => setShowPrefix(!showPrefix)}
                                        edge="end"
                                        title={showPrefix ? "Hide prefix" : "Show full URL"}
                                    >
                                        {showPrefix ? <VisibilityOff /> : <Visibility />}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        },
                    }}
                />
            </Box>
            {loading && <LinearProgress />}
        </Box>
    );
}

export default ObjectInput;
