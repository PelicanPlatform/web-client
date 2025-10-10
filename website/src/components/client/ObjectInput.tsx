"use client";

import { KeyboardDoubleArrowRight, Lock } from "@mui/icons-material";
import { Box, IconButton, InputAdornment, LinearProgress, TextField } from "@mui/material";
import { useDebounceCallback } from "usehooks-ts";

interface ObjectInputProps {
    objectUrl: string;
    /**
     * objectUrl is the actual text value used by the UI
     */
    setObjectUrl: (url: string) => void;
    /**
     * handleRefetchObject is a debounced callback for when the user stops typing,
     * signifying to change the object.
     */
    handleRefetchObject: (url: string) => void;
    loginRequired: boolean;
    loading: boolean;
    onLoginClick?: () => void;
}

/**
 * The ObjectInput component allows users to input an object URL, handles authentication if required,
 * and displays a loading indicator during asynchronous operations.
 */
function ObjectInput({
    objectUrl,
    setObjectUrl,
    handleRefetchObject,
    loginRequired,
    loading,
    onLoginClick,
}: ObjectInputProps) {
    const debounced = useDebounceCallback(handleRefetchObject, 300);

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
                            endAdornment: loginRequired && onLoginClick && (
                                <InputAdornment position="end">
                                    <IconButton onClick={onLoginClick} edge="end">
                                        <Lock />
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
