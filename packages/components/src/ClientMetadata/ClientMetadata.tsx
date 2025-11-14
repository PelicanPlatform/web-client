import { Box, Chip, FormControlLabel, Switch, Typography } from "@mui/material";

interface ClientMetadataProps {
    federation: string | null;
    namespace: string | null;
    showDirectories: boolean;
    setShowDirectories: (show: boolean) => void;
}

/**
 * A small metadata row that contains options like "Show Directories", and the current federation/namespace.
 */
function ClientMetadata({ federation, namespace, showDirectories, setShowDirectories }: ClientMetadataProps) {
    return (
        <Box display={"flex"} alignItems={"center"} justifyContent={"space-between"} gap={2} my={1}>
            <Box>
                <Typography variant="body2" color="text.secondary">
                    <strong>Federation:</strong> {federation || "N/A"} <strong>Namespace:</strong> {namespace || "N/A"}
                </Typography>
            </Box>
            <FormControlLabel
                control={
                    <Switch
                        checked={showDirectories}
                        onChange={(e) => setShowDirectories(e.target.checked)}
                        name="show-directories"
                        color="primary"
                        size="small"
                    />
                }
                label="Show Directories"
                slotProps={{
                    typography: { variant: "body2" },
                }}
            />
        </Box>
    );
}

export default ClientMetadata;
