"use client";


import { Box, LinearProgress, TextField } from "@mui/material";
import {useMemo, useState} from "react";


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
function ObjectInput({ objectUrl, onChange, loading, federation, namespace }: ObjectInputProps) {


    const [expanded, _setExpanded] = useState(true);

    const setExpanded = (value: boolean) => {
        if(loading) return;
        _setExpanded(value);
    }

    // Derive isPrefixComplete directly from props - no need for state or useEffect
    const isPrefixComplete = !!federation && !!namespace;

    // Derive displayValue directly - no need for state or useEffect
    const displayValue = useMemo(() => {
        if (!isPrefixComplete || expanded) {
            return objectUrl;
        } else {
            return objectUrl.replace(`pelican://${federation ?? ""}${namespace ?? ""}`, "");
        }
    }, [isPrefixComplete, expanded, objectUrl, federation, namespace]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {

      // If things are expanded then do nothing
      if (expanded) {
        objectUrl = e.target.value;

      // If things are collapsed then we are just operating on the object name relative to the namespace
      } else {
        objectUrl = `pelican://${federation ?? ""}${namespace ?? ""}${e.target.value}`;
      }

      onChange(objectUrl);
    }

    return (
        <Box display={"flex"} flexDirection={"column"}>
            <Box display={"flex"} alignItems={"center"}>
                <TextField
                    fullWidth
                    onChange={handleChange}
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
