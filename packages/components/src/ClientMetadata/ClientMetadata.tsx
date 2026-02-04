import { Box, Button, Typography } from "@mui/material";
import { Upload } from "@mui/icons-material";

import {
    CollectionPermission
} from "@pelicanplatform/web-client";
import PermissionIcon from "../PermissionIcon";

interface ClientMetadataProps {
    federation?: string | null;
    namespace?: string | null;
    collectionPath?: string | null;
    permissions?: CollectionPermission[];
    onUpload?: () => void;
}

/**
 * A small metadata row that contains options like "Show Directories", and the current federation/namespace.
 */
function ClientMetadata({ federation, namespace, collectionPath, onUpload, permissions = [] }: ClientMetadataProps) {
    return (
        <Box display={"flex"} alignItems={"end"} justifyContent={"space-between"} gap={2}>
            <Box display={"flex"} gap={1}>
                <Typography variant="body2" color="text.secondary">
                    <strong>Federation:</strong> {federation || "N/A"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    <strong>Namespace:</strong> {namespace || "N/A"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    <strong>Collection:</strong> {collectionPath || "N/A"}
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
