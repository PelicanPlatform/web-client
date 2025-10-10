"use client";

import { Download, MenuOpen } from "@mui/icons-material";
import {
    Box,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Typography,
} from "@mui/material";
import { ObjectList } from "../../../../src";

interface ObjectListProps {
    objectList: ObjectList[];
    onExplore: (href: string) => void;
    onDownload: (href: string) => void;
}

function ObjectListComponent({ objectList, onExplore, onDownload }: ObjectListProps) {
    if (!objectList || objectList.length === 0) {
        return (
            <Box pt={4} display="flex" alignItems="center" justifyContent="center" minHeight={300}>
                <Typography variant="h6" color="textSecondary" align="center">
                    Enter Pelican Collection URL to View Contents:
                    <br />
                    <strong>pelican://&lt;federation&gt;/&lt;namespace&gt;/&lt;collection&gt;/</strong>
                </Typography>
            </Box>
        );
    }

    return (
        <Box pt={2}>
            <TableContainer component={Paper} variant="outlined">
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Name</TableCell>
                            <TableCell>Size</TableCell>
                            <TableCell>Updated</TableCell>
                            <TableCell>Action</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {objectList.map((obj, index) => (
                            <TableRow key={index}>
                                <TableCell>{obj.href}</TableCell>
                                <TableCell>{obj.getcontentlength}</TableCell>
                                <TableCell>{obj.getlastmodified}</TableCell>
                                <TableCell>
                                    {obj.iscollection ? (
                                        <Button endIcon={<MenuOpen />} onClick={() => onExplore(obj.href)}>
                                            Explore
                                        </Button>
                                    ) : (
                                        <Button endIcon={<Download />} onClick={() => onDownload(obj.href)}>
                                            Download
                                        </Button>
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

export default ObjectListComponent;
