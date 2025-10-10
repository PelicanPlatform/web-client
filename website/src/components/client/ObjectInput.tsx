"use client";

import { KeyboardDoubleArrowRight } from "@mui/icons-material";
import { Box, InputAdornment, LinearProgress, TextField } from "@mui/material";
import { useDebounceCallback } from "usehooks-ts";

interface ObjectInputProps {
    objectUrl: string;

    /** objectUrl is the actual text value used by the UI */
    setObjectUrl: (url: string) => void;
    /**
     * onRefetchObject is a debounced callback for when the user stops typing,
     * signifying to change the object.
     */
    onRefetchObject: (url: string) => void;

    loading: boolean;
}

/**
 * The ObjectInput component allows users to input an object URL, handles authentication if required,
 * and displays a loading indicator during asynchronous operations.
 */
function ObjectInput({ objectUrl, setObjectUrl, onRefetchObject, loading }: ObjectInputProps) {
    const debounced = useDebounceCallback(onRefetchObject, 300);

    return (
        <Box display={"flex"} flexDirection={"column"}>
            <Box display={"flex"} alignItems={"center"}>
                <TextField
                    fullWidth
                    onChange={(e) => {
                        setObjectUrl(e.target.value);
                        debounced(e.target.value);
                    }}
                    value={objectUrl}
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
                            // endAdornment: loginRequired && onLoginClick && (
                            //     <InputAdornment position="end">
                            //         <IconButton onClick={onLoginClick} edge="end">
                            //             <Lock />
                            //         </IconButton>
                            //     </InputAdornment>
                            // ),
                        },
                    }}
                />
            </Box>
            {loading && <LinearProgress />}
        </Box>
    );
}

export default ObjectInput;
