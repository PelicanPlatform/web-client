"use client";

import { ArrowUpward, Download, Folder, InsertDriveFile, MenuOpen } from "@mui/icons-material";
import {
    Box,
    Button,
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
import {ObjectList, formatBytes} from "@pelicanplatform/web-client";
import { useMemo, useState } from "react";

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
    /** Namespace prefix to strip from display (e.g., /namespace) */
    namespace?: string | null;
}

/**
 * A component that lists all the provided objects as a table.
 */
function ObjectView({
    collectionPath,
    objectList,
    onExplore,
    onDownload,
    loginRequired,
    canLogin,
    onLoginRequest,
    namespace,
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
    }, [objectList, sortColumn, sortDirection]);

    if(loginRequired || !objectList || objectList.length === 0) {
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
              // Login prompt
              <>
                Authentication is required.
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
      )
    }

    return (
      <Box>
          <TableContainer component={Box}>
              <Table size={"small"}>
                  <TableHead >
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
                              active={sortColumn === "getlastmodified"}
                              direction={sortColumn === "getlastmodified" ? sortDirection : "asc"}
                              onClick={() => handleSort("getlastmodified")}
                            >
                              Updated
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
                          <TableCell></TableCell>
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
                              <TableCell sx={{ px: 2, py: 1}}>
                                  <ObjectName {...obj} namespace={namespace} collectionPath={collectionPath} />
                              </TableCell>
                              <TableCell sx={{ px: 2, py: 1, textWrap: "nowrap" }}>
                                {obj.getlastmodified ? new Date(obj.getlastmodified).toLocaleString() : ''}
                              </TableCell>
                              <TableCell sx={{ px: 2, py: 1, textWrap: "nowrap" }}>
                                  {obj.iscollection ? "" : formatBytes(obj.getcontentlength)}
                              </TableCell>
                              <TableCell sx={{ px: 2, py: 1 }} align={'right'}>
                                  {obj.iscollection ? (
                                      <IconButton
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
                                      </IconButton>
                                  ) : (
                                      <IconButton
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
                                      </IconButton>
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

function ObjectName(props: ObjectList & { namespace?: string | null, collectionPath?: string | null }) {
    const { href, iscollection, getlastmodified, namespace, collectionPath } = props;

    // Strip namespace from the display name
    let displayName = href;
    if (namespace && href.startsWith(namespace)) {
        displayName = href.slice(namespace.length) || "/";
    }

    // Strip collectionPath from the display name
    if (collectionPath && displayName.startsWith(collectionPath)) {
      displayName = displayName.replace(collectionPath, "") || "/";
    }

    return (
        <Box display="flex" alignItems="center" gap={1}>
            {iscollection ? (
                // Check if this is the parent directory (first item with empty getlastmodified)
                getlastmodified === "" ? (
                    <ArrowUpward color="primary" fontSize="small" />
                ) : (
                    <Folder color="primary" fontSize="small" />
                )
            ) : (
                <InsertDriveFile color="action" fontSize="small" />
            )}
            {/* Show ".." for parent directory (synthetic entry with empty getlastmodified) */}
          <Box
            sx={{ whiteSpace: "nowrap", textWrap: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "15ch" }}
            title={iscollection && getlastmodified === "" ? ".." : displayName}
          >
            {iscollection && getlastmodified === "" ? ".." : displayName}
          </Box>
        </Box>
    );
}

export default ObjectView;
