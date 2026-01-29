"use client";


import { Box, LinearProgress, TextField } from "@mui/material";
import {useEffect, useState} from "react";
import { useDebounceCallback } from "usehooks-ts";


import StartAdornment from "./StartAdornment";



interface ObjectInputProps {
    objectUrl: string;

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
function ObjectInput({ objectUrl, onChange: _onChange, loading, federation, namespace }: ObjectInputProps) {

    const onChange = useDebounceCallback(_onChange, 300);
    const [expanded, _setExpanded] = useState(true);

    const setExpanded = (value: boolean) => {
        if(loading) return;
        _setExpanded(value);
    }

    // Controlled isPrefixComplete: only update when loading is false
    const computeIsPrefixComplete = () => !!federation && !!namespace;
    const [isPrefixComplete, setIsPrefixComplete] = useState(computeIsPrefixComplete());
    useEffect(() => {
        if (!loading) {
            setIsPrefixComplete(computeIsPrefixComplete());
        }
        // If loading is true, keep previous isPrefixComplete
    }, [federation, namespace, loading]);

    // Toggle expanded state if prefix becomes complete/incomplete
    useEffect(() => {
        if (isPrefixComplete) {
            setExpanded(false);
        } else {
            setExpanded(true);
        }
    }, [isPrefixComplete]);

    // Maintain a local objectUrl state to avoid input lag
    const [localObjectUrl, setLocalObjectUrl] = useState(objectUrl);
    useEffect(() => {
        if (!loading) setLocalObjectUrl(objectUrl);
    }, [objectUrl, loading]);

    // Controlled displayValue: only update when loading is false
    const computeDisplayValue = () => {
        if (!isPrefixComplete || expanded) {
            return localObjectUrl;
        } else {
            return localObjectUrl.replace(`pelican://${federation ?? ""}${namespace ?? ""}`, "");
        }
    }
    const [displayValue, setDisplayValue] = useState(computeDisplayValue());

    useEffect(() => {
        if (!loading) {
            setDisplayValue(computeDisplayValue());
        }
        // If loading is true, keep previous displayValue
    }, [isPrefixComplete, federation, namespace, localObjectUrl, expanded, loading]);

    return (
        <Box display={"flex"} flexDirection={"column"}>
            <Box display={"flex"} alignItems={"center"}>
                <TextField
                    fullWidth
                    onChange={(e) => {
                        const newValue = expanded ? e.target.value : `pelican://${federation ?? ""}${namespace ?? ""}${e.target.value}`;
                        setLocalObjectUrl(newValue);
                        onChange(newValue);
                    }}
                    value={displayValue}
                    id="pelican-url"
                    placeholder={expanded ? "Enter Pelican URL ( pelican://<federation>/<namespace>/* )" : "Enter object path..."}
                    variant="outlined"
                    size="medium"
                    slotProps={{
                        input: {
                            startAdornment: (
                                <StartAdornment federation={federation ?? ""} namespace={namespace ?? ""} expanded={expanded} setExpanded={setExpanded} />
                            )
                        },
                    }}
                />
            </Box>
            {loading ? <LinearProgress /> : <Box height={4} />}
        </Box>
    );
}

export default ObjectInput;
