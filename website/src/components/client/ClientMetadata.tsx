import { Box, Chip, FormControlLabel, Switch, Typography } from "@mui/material";

interface ClientMetadataProps {
    permissions: string[] | undefined;
    readonly: boolean;
    showDirectories: boolean;
    setShowDirectories: (show: boolean) => void;
}

function ClientMetadata({ permissions, readonly, showDirectories, setShowDirectories }: ClientMetadataProps) {
    return (
        <Box display={"flex"} alignItems={"center"} justifyContent={"space-between"} gap={2} mt={1} mb={1}>
            <Box display={"flex"} alignItems={"center"} gap={2}>
                {permissions && (
                    <Box display={"flex"} alignItems={"center"} gap={1}>
                        <Typography variant="body2">Permissions:</Typography>
                        {permissions.map((perm) => (
                            <Chip key={perm} label={perm} size="small" />
                        ))}
                    </Box>
                )}
                {readonly && <Chip label="Read Only" size="small" color="secondary" variant="outlined" />}
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
