import {CollectionPermission} from "@pelicanplatform/web-client";
import { Visibility, Edit, AdminPanelSettings, Block } from "@mui/icons-material";

interface PermissionIconProps {
    permission: CollectionPermission
}

function PermissionIcon({permission}: PermissionIconProps) {
    switch (permission) {
        case 'read':
            return <Visibility aria-label="Read Permission" />;
        case 'modify':
            return <Edit aria-label="Modify Permission" />;
        case 'create':
            return <AdminPanelSettings aria-label="Create Permission" />;
        default:
            return <Block aria-label="No Permission" />;
    }
}

export default PermissionIcon;
