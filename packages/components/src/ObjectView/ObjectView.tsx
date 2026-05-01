"use client";

import { ArrowUpward, Download as DownloadIcon, Folder, InsertDriveFile, MenuOpen } from "@mui/icons-material";
import {
    Box,
    Button,
    CircularProgress,
    IconButton,
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
import { DownloadProgress } from "@pelicanplatform/hooks";
import React, { forwardRef, useContext, useMemo, useState } from "react";
import { TableComponents, TableVirtuoso } from "react-virtuoso";

type SortableColumn = "href" | "getcontentlength" | "getlastmodified";
type SortDirection = "asc" | "desc";

interface ObjectListProps {
    collectionPath?: string;
    objectList: ObjectList[];
    onExplore: (href: string) => void;
    onDownload: (href: string) => void;
    loginRequired: boolean;
    canLogin: boolean;
    onLoginRequest?: () => void;
    downloadsInProgress: Record<string, DownloadProgress>;
    /** Namespace prefix to strip from display (e.g., /namespace) */
    namespace?: string | null;
}

const ROW_HEIGHT = 36;
const MAX_TABLE_HEIGHT = ROW_HEIGHT * 15;

const ObjectViewContext = React.createContext<{
    namespace?: string | null;
    collectionPath?: string;
    downloadsInProgress: Record<string, DownloadProgress>;
    onExplore: (href: string) => void;
    onDownload: (href: string) => void;
}>({
    downloadsInProgress: {},
    onExplore: () => {},
    onDownload: () => {},
});

const VirtuosoTableComponents: TableComponents<ObjectList> = {
    Scroller: forwardRef<HTMLDivElement>((props, ref) => (
        <TableContainer component={Box} {...props} ref={ref} />
    )),
    Table: (props) => (
        <Table
            {...props}
            size="small"
            sx={{ borderCollapse: "separate", tableLayout: "fixed" }}
        />
    ),
    TableHead: forwardRef<HTMLTableSectionElement>((props, ref) => (
        <TableHead {...props} ref={ref} />
    )),
    TableRow: ({ item: _item, ...props }) => <TableRow hover sx={{ cursor: "pointer" }} {...props} />,
    TableBody: forwardRef<HTMLTableSectionElement>((props, ref) => (
        <TableBody {...props} ref={ref} />
    )),
};

function FixedHeaderContent({
    sortColumn,
    sortDirection,
    onSort,
}: {
    sortColumn: SortableColumn;
    sortDirection: SortDirection;
    onSort: (col: SortableColumn) => void;
}) {
    return (
        <TableRow sx={{ bgcolor: "background.paper" }}>
            <TableCell>
                <TableSortLabel
                    active={sortColumn === "href"}
                    direction={sortColumn === "href" ? sortDirection : "asc"}
                    onClick={() => onSort("href")}
                >
                    Name
                </TableSortLabel>
            </TableCell>
            <TableCell>
                <TableSortLabel
                    active={sortColumn === "getlastmodified"}
                    direction={sortColumn === "getlastmodified" ? sortDirection : "asc"}
                    onClick={() => onSort("getlastmodified")}
                >
                    Updated
                </TableSortLabel>
            </TableCell>
            <TableCell>
                <TableSortLabel
                    active={sortColumn === "getcontentlength"}
                    direction={sortColumn === "getcontentlength" ? sortDirection : "asc"}
                    onClick={() => onSort("getcontentlength")}
                >
                    Size
                </TableSortLabel>
            </TableCell>
            <TableCell sx={{ width: 80, minWidth: 80 }} />
        </TableRow>
    );
}

function RowItem({ obj }: { obj: ObjectList }) {
    const { namespace, collectionPath, downloadsInProgress, onExplore, onDownload } = useContext(ObjectViewContext);
    const download = Object.values(downloadsInProgress).find((d) => d.objectUrl.endsWith(obj.href));

    return (
        <>
            <TableCell sx={{ py: "2px" }} onClick={() => obj.iscollection ? onExplore(obj.href) : onDownload(obj.href)}>
                <ObjectName {...obj} namespace={namespace} collectionPath={collectionPath} />
            </TableCell>
            <TableCell sx={{ py: "2px", textWrap: "nowrap" }} onClick={() => obj.iscollection ? onExplore(obj.href) : onDownload(obj.href)}>
                {obj.getlastmodified ? new Date(obj.getlastmodified).toLocaleString() : ""}
            </TableCell>
            <TableCell sx={{ py: "2px", textWrap: "nowrap" }} onClick={() => obj.iscollection ? onExplore(obj.href) : onDownload(obj.href)}>
                {obj.iscollection ? "" : formatBytes(obj.getcontentlength)}
            </TableCell>
            <TableCell sx={{ py: "2px", width: 90, minWidth: 90 }} align="right">
                {obj.iscollection ? (
                    <IconButton onClick={(e) => { e.stopPropagation(); onExplore(obj.href); }} aria-label={`Explore ${obj.href}`}>
                        <MenuOpen fontSize="small" />
                    </IconButton>
                ) : (
                    <IconButton onClick={(e) => { e.stopPropagation(); onDownload(obj.href); }} aria-label={`Download ${obj.href}`}>
                        {download ? <ProgressIcon bytesDownloaded={download.bytesDownloaded} totalByteSize={download.totalByteSize} /> : <DownloadIcon fontSize="small" />}
                    </IconButton>
                )}
            </TableCell>
        </>
    );
}

function RowContent(_index: number, obj: ObjectList) {
    return <RowItem obj={obj} />;
}

function ObjectView({
    collectionPath,
    objectList,
    onExplore,
    onDownload,
    loginRequired,
    canLogin,
    onLoginRequest,
    namespace,
    downloadsInProgress,
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

    const sortedObjectList = useMemo(() => {
        return [...objectList].sort((a, b) => {
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

            if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
            if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
            return 0;
        });
    }, [objectList, sortColumn, sortDirection]);

    if (loginRequired || !objectList || objectList.length === 0) {
        return (
            <Box
                pt={4}
                display="flex"
                alignItems="center"
                justifyContent="center"
                border={"1px dashed var(--mui-palette-divider, #e0e0e0)"}
                borderRadius={1}
                minHeight={300}
            >
                <Typography variant="h6" color="textSecondary" align="center">
                    {loginRequired ? (
                        <>
                            Authentication is required.
                            <br />
                            {canLogin && (
                                <Button variant="contained" color="primary" onClick={onLoginRequest} sx={{ mt: 2 }}>
                                    Login
                                </Button>
                            )}
                        </>
                    ) : (
                        <>
                            <Typography>You are in an empty collection.</Typography>
                            <Typography>
                                You can upload files here or navigate to your collections using the menu in the top right.
                            </Typography>
                        </>
                    )}
                </Typography>
            </Box>
        );
    }

    return (
        <ObjectViewContext.Provider value={{ namespace, collectionPath, downloadsInProgress, onExplore, onDownload }}>
            <TableVirtuoso
                data={sortedObjectList}
                components={VirtuosoTableComponents}
                fixedHeaderContent={() => (
                    <FixedHeaderContent
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                    />
                )}
                itemContent={RowContent}
                style={{ height: Math.min(sortedObjectList.length * ROW_HEIGHT + 48, MAX_TABLE_HEIGHT) }}
            />
        </ObjectViewContext.Provider>
    );
}

function ProgressIcon({ bytesDownloaded, totalByteSize }: { bytesDownloaded: number; totalByteSize: number }) {
    const progress = totalByteSize > 0 ? Math.round((bytesDownloaded / totalByteSize) * 100) : 0;
    return (
        <Box position="relative" display="inline-flex" gap={1}>
            <Typography variant={"subtitle2"}>{progress}%</Typography>
            <CircularProgress size={20} variant="determinate" value={progress} aria-label={`Download progress: ${progress}%`} />
        </Box>
    );
}

function ObjectName(props: ObjectList & { namespace?: string | null; collectionPath?: string | null }) {
    const { href, iscollection, getlastmodified, namespace, collectionPath } = props;

    let displayName = href;
    if (namespace && href.startsWith(namespace)) {
        displayName = href.slice(namespace.length) || "/";
    }
    if (collectionPath && displayName.startsWith(collectionPath)) {
        displayName = displayName.replace(collectionPath, "") || "/";
    }

    return (
        <Box display="flex" alignItems="center" gap={1}>
            {iscollection ? (
                getlastmodified === "" ? (
                    <ArrowUpward color="primary" fontSize="small" />
                ) : (
                    <Folder color="primary" fontSize="small" />
                )
            ) : (
                <InsertDriveFile color="action" fontSize="small" />
            )}
            <Box
                sx={{ whiteSpace: "nowrap", textWrap: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: { sm: "15ch", md: "25ch", lg: "35ch" } }}
                title={iscollection && getlastmodified === "" ? ".." : displayName}
            >
                {iscollection && getlastmodified === "" ? ".." : displayName}
            </Box>
        </Box>
    );
}

export default ObjectView;
