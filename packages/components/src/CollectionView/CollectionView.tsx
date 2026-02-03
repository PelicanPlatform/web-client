"use client";

import {Check} from "@mui/icons-material";
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type {Collection} from "@pelicanplatform/web-client";

interface CollectionViewProps {
  /** List of collections to display */
  collections: Collection[];
  /** Callback when a collection is clicked */
  onExplore: (collectionPath: string) => void;
}

/**
 * A full-width view component to display and navigate collections.
 */
function CollectionView({collections, onExplore}: CollectionViewProps) {
  return (
    <Box sx={{minHeight: "350px"}}>
      <TableContainer component={Box}>
        <Table size={"small"}>
          <TableHead>
            <TableRow>
              <TableCell>Collection</TableCell>
              <TableCell align="center">Read</TableCell>
              <TableCell align="center">Write</TableCell>
              <TableCell align="center">Modify</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {collections.map((collection, index) => (
              <TableRow
                key={index}
                hover
                onClick={() => onExplore(collection.objectPath)}
                style={{cursor: "pointer"}}
              >
                <TableCell sx={{px: 2, py: 1}}>
                  {collection.objectPath}
                </TableCell>
                <TableCell align="center" sx={{px: 2, py: 1}}>
                  {collection.permissions.includes('read') && (
                    <Check fontSize="small" color="success"/>
                  )}
                </TableCell>
                <TableCell align="center" sx={{px: 2, py: 1}}>
                  {collection.permissions.includes('create') && (
                    <Check fontSize="small" color="success"/>
                  )}
                </TableCell>
                <TableCell align="center" sx={{px: 2, py: 1}}>
                  {collection.permissions.includes('modify') && (
                    <Check fontSize="small" color="success"/>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

export default CollectionView;
