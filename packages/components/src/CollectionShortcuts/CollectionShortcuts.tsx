"use client";

import { Box, Paper, Typography } from "@mui/material";

interface CollectionShortcutsProps {
    /** List of shortcut collections */
    shortcuts: string[];
    /** Callback when a shortcut is clicked */
    onClick: (favorite: string) => void;
}

function CollectionShortcuts({ shortcuts, onClick }: CollectionShortcutsProps) {
    return (
        <Paper variant="outlined" sx={{ width: "fit-content" }}>
            <Typography variant="h6" sx={{ px: 2, py: 1.5, fontWeight: 600 }}>
                Collections
            </Typography>
            {shortcuts.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 2 }}>
                    No shortcuts available.
                </Typography>
            ) : (
                <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0 }}>
                    {shortcuts.map((favorite, index) => (
                        <Box
                            component="li"
                            key={index}
                            onClick={() => onClick(favorite)}
                            sx={{
                                px: 2,
                                py: 1,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                "&:hover": {
                                    bgcolor: "action.hover",
                                },
                            }}
                        >
                            <span>⭐</span>
                            <span>{favorite}</span>
                        </Box>
                    ))}
                </Box>
            )}
        </Paper>
    );
}

export default CollectionShortcuts;
