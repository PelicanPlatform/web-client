import { Box, Button, Typography } from "@mui/material";
import { Upload } from "@mui/icons-material";

import {
    Collection,
    CollectionPermission
} from "@pelicanplatform/web-client";
import PermissionIcon from "../PermissionIcon";

interface ClientMetadataProps {
    federation?: string | null;
    namespace?: string | null;
    permissions?: CollectionPermission[];
    onUpload?: () => void;
}

/**
 * A small metadata row that contains options like "Show Directories", and the current federation/namespace.
 */
function ClientMetadata({ federation, namespace, onUpload, permissions = [] }: ClientMetadataProps) {
    return (
        <Box display={"flex"} alignItems={"center"} justifyContent={"space-between"} gap={2} mt={1}>
            <Box>
                <Typography variant="body2" color="text.secondary">
                    <strong>Federation:</strong> {federation || "N/A"} <strong>Namespace:</strong> {namespace || "N/A"}
                </Typography>
            </Box>
            <Box>
                {permissions.map((permission, index) => (
                    <PermissionIcon key={index} permission={permission} />
                ))}
            </Box>
            <Box display={"flex"} alignItems={"center"} gap={1}>
                {onUpload && permissions.includes('create') && (
                    <Button variant="outlined" size="small" startIcon={<Upload />} onClick={onUpload}>
                        Upload
                    </Button>
                )}
            </Box>
        </Box>
    );
}

export default ClientMetadata;
