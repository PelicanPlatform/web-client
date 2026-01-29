"use client";

import { Star } from "@mui/icons-material";
import { Box, Paper, Typography } from "@mui/material";
import type {Collection} from "../usePelicanClient";

interface CollectionShortcutsProps {
    /** List of shortcut collections */
    collections: Collection[];
    /** Callback when a shortcut is clicked */
    onClick: (favorite: string) => void;
}

/**
 * A sidebar element to view a list of provided shortcuts, used for the user's authenticated routes.
 */
function CollectionShortcuts({ collections, onClick }: CollectionShortcutsProps) {
    return (
        <Paper variant="outlined" sx={{ width: "fit-content" }}>
            <Typography variant="h6" sx={{ px: 2, py: 1.5, fontWeight: 600 }}>
                Collections
            </Typography>
            {collections.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 2 }}>
                    No shortcuts available.
                </Typography>
            ) : (
                <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0 }}>
                    {collections.map((favorite, index) => (
                        <Box
                            component="li"
                            key={index}
                            onClick={() => onClick(favorite.href)}
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
                            <Star fontSize="small" color="action" />
                            <span>{favorite.objectPath}</span>
                        </Box>
                    ))}
                </Box>
            )}
        </Paper>
    );
}

export default CollectionShortcuts;
