import { IconButton, ListItemIcon, ListItemText, MenuItem, MenuList, Paper } from "@mui/material";
import {Edit, LockOpen, Menu} from "@mui/icons-material";
import {useState} from "react";

interface ClientMenuProps {
  setCollectionsOpen: (open: boolean) => void;
  setUrlInputOpen: (open: boolean) => void;
}

export function ClientMenu({ setCollectionsOpen, setUrlInputOpen }: ClientMenuProps) {

  const [menuOpen, setMenuOpen] = useState<boolean>(false);

  return (
    <>
      <IconButton onClick={() => setMenuOpen((x) => !x)}>
        <Menu />
      </IconButton>
      {menuOpen && (
        <Paper>
          <MenuList>
            <MenuItem onClick={() => { setCollectionsOpen(true); setMenuOpen(false); }}>
              <ListItemIcon>
                <LockOpen />
              </ListItemIcon>
              <ListItemText>
                Toggle Auth Collections
              </ListItemText>
            </MenuItem>
            <MenuItem onClick={() => { setUrlInputOpen(true); setMenuOpen(false); }}>
              <ListItemIcon>
                <Edit />
              </ListItemIcon>
              <ListItemText>
                Toggle Url Input
              </ListItemText>
            </MenuItem>
          </MenuList>
        </Paper>
      )}
    </>
  )
}