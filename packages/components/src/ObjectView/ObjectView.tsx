"use client";

import { ArrowUpward, Download, Folder, InsertDriveFile, MenuOpen } from "@mui/icons-material";
import {
    Box,
    Button,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    Typography,
} from "@mui/material";
import { ObjectList, formatBytes } from "@pelicanplatform/web-client";
import { useMemo, useState } from "react";

type SortableColumn = "href" | "getcontentlength" | "getlastmodified";
type SortDirection = "asc" | "desc";

interface ObjectListProps {
    objectList: ObjectList[];
    showCollections?: boolean;
    onExplore: (href: string) => void;
    onDownload: (href: string) => void;
    loginRequired: boolean;
    canLogin: boolean;
    onLoginRequest?: () => void;
}

/**
 * A component that lists all the provided objects as a table.
 */
function ObjectView({
    objectList,
    showCollections = true,
    onExplore,
    onDownload,
    loginRequired,
    canLogin,
    onLoginRequest,
}: ObjectListProps) {
    const [sortColumn, setSortColumn] = useState<SortableColumn>("href");
    const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

    const handleSort = (column: SortableColumn) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === "asc" ? "desc" : "asc");
        } else {
            setSortColumn(column);
            setSortDirection("asc");
        }
    };

    const handleRowClick = (obj: ObjectList) => {
        if (obj.iscollection) {
            onExplore(obj.href);
        } else {
            onDownload(obj.href);
        }
    };

    const sortedObjectList = useMemo(() => {
        return [...objectList]
            .filter((obj) => showCollections || !obj.iscollection)
            .sort((a, b) => {
                if (a.iscollection && !b.iscollection) return -1;
                if (!a.iscollection && b.iscollection) return 1;

                let aValue: string | number;
                let bValue: string | number;

                switch (sortColumn) {
                    case "href":
                        aValue = a.href.toLowerCase();
                        bValue = b.href.toLowerCase();
                        break;
                    case "getcontentlength":
                        aValue = a.getcontentlength;
                        bValue = b.getcontentlength;
                        break;
                    case "getlastmodified":
                        aValue = new Date(a.getlastmodified).getTime();
                        bValue = new Date(b.getlastmodified).getTime();
                        break;
                    default:
                        return 0;
                }

                if (aValue < bValue) {
                    return sortDirection === "asc" ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortDirection === "asc" ? 1 : -1;
                }
                return 0;
            });
    }, [objectList, showCollections, sortColumn, sortDirection]);

    return (
        <Box pt={2}>
            {loginRequired || !objectList || objectList.length === 0 ? (
                // Login prompt / Empty state
                <Box pt={4} display="flex" alignItems="center" justifyContent="center" minHeight={300}>
                    <Typography variant="h6" color="textSecondary" align="center">
                        {loginRequired ? (
                            // Login prompt
                            <>
                                Authentication is required to view this collection.
                                <br />
                                {loginRequired && canLogin && (
                                    <Button variant="contained" color="primary" onClick={onLoginRequest} sx={{ mt: 2 }}>
                                        Login
                                    </Button>
                                )}
                            </>
                        ) : (
                            // Empty state
                            <>
                                Enter Pelican Collection URL to View Contents:
                                <br />
                                <strong>pelican://&lt;federation&gt;/&lt;namespace&gt;/&lt;collection&gt;/</strong>
                            </>
                        )}
                    </Typography>
                </Box>
            ) : (
                // Full object list table
                <TableContainer component={Paper} variant="outlined">
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>
                                    <TableSortLabel
                                        active={sortColumn === "href"}
                                        direction={sortColumn === "href" ? sortDirection : "asc"}
                                        onClick={() => handleSort("href")}
                                    >
                                        Name
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>
                                    <TableSortLabel
                                        active={sortColumn === "getcontentlength"}
                                        direction={sortColumn === "getcontentlength" ? sortDirection : "asc"}
                                        onClick={() => handleSort("getcontentlength")}
                                    >
                                        Size
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>
                                    <TableSortLabel
                                        active={sortColumn === "getlastmodified"}
                                        direction={sortColumn === "getlastmodified" ? sortDirection : "asc"}
                                        onClick={() => handleSort("getlastmodified")}
                                    >
                                        Updated
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>Action</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {sortedObjectList.map((obj, index) => (
                                <TableRow
                                    key={index}
                                    hover
                                    onClick={() => handleRowClick(obj)}
                                    style={{ cursor: "pointer" }}
                                >
                                    <TableCell sx={{ px: 2, py: 1 }}>
                                        <ObjectName {...obj} />
                                    </TableCell>
                                    <TableCell sx={{ px: 2, py: 1 }}>
                                        {obj.iscollection ? "" : formatBytes(obj.getcontentlength)}
                                    </TableCell>
                                    <TableCell sx={{ px: 2, py: 1 }}>{obj.getlastmodified}</TableCell>
                                    <TableCell sx={{ px: 2, py: 1 }}>
                                        {obj.iscollection ? (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onExplore(obj.href);
                                                }}
                                                aria-label={`Explore ${obj.href}`}
                                                style={{
                                                    background: "transparent",
                                                    border: "none",
                                                    color: "var(--mui-palette-text-primary, #000)",
                                                    padding: 0,
                                                    cursor: "pointer",
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: 6,
                                                    fontSize: "0.95rem",
                                                }}
                                            >
                                                <MenuOpen fontSize="small" />
                                                <span style={{ opacity: 0.85 }}>Explore</span>
                                            </button>
                                        ) : (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDownload(obj.href);
                                                }}
                                                aria-label={`Download ${obj.href}`}
                                                style={{
                                                    background: "transparent",
                                                    border: "none",
                                                    color: "var(--mui-palette-text-primary, #000)",
                                                    padding: 0,
                                                    cursor: "pointer",
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: 6,
                                                    fontSize: "0.95rem",
                                                }}
                                            >
                                                <Download fontSize="small" />
                                                <span style={{ opacity: 0.85 }}>Download</span>
                                            </button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Box>
    );
}

function ObjectName(object: ObjectList) {
    return (
        <Box display="flex" alignItems="center" gap={1}>
            {object.iscollection ? (
                // Check if this is the parent directory (first item with empty getlastmodified)
                object.getlastmodified === "" ? (
                    <ArrowUpward color="primary" fontSize="small" />
                ) : (
                    <Folder color="primary" fontSize="small" />
                )
            ) : (
                <InsertDriveFile color="action" fontSize="small" />
            )}
            {/* Show ".." for parent directory (synthetic entry with empty getlastmodified) */}
            {object.iscollection && object.getlastmodified === "" ? ".." : object.href}
        </Box>
    );
}

export default ObjectView;
