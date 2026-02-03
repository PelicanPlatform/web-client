import { Box, Button, Typography } from "@mui/material";
import { Upload } from "@mui/icons-material";

import {
    Collection,
    CollectionPermission
} from "@pelicanplatform/web-client";
import PermissionIcon from "../PermissionIcon";
import {parseObjectUrl} from "@pelicanplatform/web-client";

interface ClientMetadataProps {
    federation?: string | null;
    namespace?: string | null;
    objectUrl?: string | null;
    permissions?: CollectionPermission[];
    onUpload?: () => void;
}

/**
 * A small metadata row that contains options like "Show Directories", and the current federation/namespace.
 */
function ClientMetadata({ federation, namespace, objectUrl, onUpload, permissions = [] }: ClientMetadataProps) {

    const objectPathWithNamespace = getObjectPath(objectUrl || null);
    const collectionPath = namespace && objectPathWithNamespace.startsWith(namespace)
        ? objectPathWithNamespace.replace(namespace, "")
        : objectPathWithNamespace;

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
                    <strong>Collection:</strong> {collectionPath}
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

const getObjectPath = (objectUrl: string | null) => {
    if (!objectUrl) return "N/A";
    try {
        const { objectPath } = parseObjectUrl(objectUrl);
        return objectPath || "N/A";
    } catch {
        return "N/A";
    }
}

export default ClientMetadata;
