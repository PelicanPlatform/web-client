import { Box, Chip, FormControlLabel, Switch, Typography } from "@mui/material";

interface ClientMetadataProps {
    showDirectories: boolean;
    setShowDirectories: (show: boolean) => void;
}

function ClientMetadata({ showDirectories, setShowDirectories }: ClientMetadataProps) {
    return (
        <Box
            display={"flex"}
            alignItems={"center"}
            justifyContent={"space-between"}
            gap={2}
            flexDirection="row-reverse"
            my={1}
        >
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
