"use client";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import ErrorIcon from "@mui/icons-material/Error";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import { Box, List, ListItem, ListItemIcon, ListItemText, Paper, Typography } from "@mui/material";
import { formatBytes } from "@pelicanplatform/web-client";
import { DragEvent, Ref, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

interface UploadingFile {
    file: File;
    status: "pending" | "uploading" | "success" | "error";
    error?: string;
}

export interface ObjectUploadRef {
    dragHandlers: {
        onDragEnter: (e: DragEvent) => void;
        onDragOver: (e: DragEvent) => void;
        onDragLeave: (e: DragEvent) => void;
        onDrop: (e: DragEvent) => void;
    };
}

interface ObjectUploadProps {
    /** Whether upload functionality is enabled */
    disabled?: boolean;
    /** Callback when files are dropped/selected - should return a Promise that resolves when upload is complete */
    onUpload?: (file: File) => Promise<void>;
    /** Current object path for context */
    currentPath?: string;
    /** Ref to expose drag handlers */
    refs?: Ref<ObjectUploadRef>;
}

/**
 * A drag-and-drop upload component that provides an overlay when dragging files over the window.
 * TODO: button to open file selector
 */
const ObjectUpload = ({ disabled = false, onUpload, currentPath, refs }: ObjectUploadProps) => {
    const [showOverlay, setShowOverlay] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
    const dragCounterRef = useRef(0);

    const handleDragEnter = useCallback((e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current++;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current--;
        if (dragCounterRef.current === 0) {
            setIsDragging(false);
        }
    }, []);

    const handleDragOver = useCallback((e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback(
        async (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            dragCounterRef.current = 0;

            if (disabled || !onUpload) return;

            const droppedFiles = Array.from(e.dataTransfer.files);
            if (droppedFiles.length > 0) {
                // Initialize upload tracking
                const newUploadingFiles: UploadingFile[] = droppedFiles.map((file) => ({
                    file,
                    status: "pending",
                }));
                setUploadingFiles(newUploadingFiles);
                setShowOverlay(true);

                droppedFiles.forEach(async (file, index) => {
                    // Update status to uploading
                    setUploadingFiles((prev) => {
                        const updated = [...prev];
                        updated[index].status = "uploading";
                        return updated;
                    });

                    try {
                        await onUpload(file);
                        // Update status to success
                        setUploadingFiles((prev) => {
                            const updated = [...prev];
                            updated[index].status = "success";
                            return updated;
                        });
                    } catch (e) {
                        // Update status to error
                        setUploadingFiles((prev) => {
                            const updated = [...prev];
                            updated[index].status = "error";
                            updated[index].error = e instanceof Error ? e.message : "Upload failed";
                            return updated;
                        });
                    }
                });
            }
        },
        [disabled, onUpload]
    );

    // expose drag handlers via ref
    useImperativeHandle(
        refs,
        () => ({
            dragHandlers: {
                onDragEnter: handleDragEnter,
                onDragOver: handleDragOver,
                onDragLeave: handleDragLeave,
                onDrop: handleDrop,
            },
        }),
        [handleDragEnter, handleDragOver, handleDragLeave, handleDrop]
    );

    // Auto-close overlay when all uploads are complete
    useEffect(() => {
        if (uploadingFiles.length === 0) return;

        const allComplete = uploadingFiles.every((f) => f.status === "success" || f.status === "error");
        const hasErrors = uploadingFiles.some((f) => f.status === "error");

        if (allComplete && !hasErrors) {
            // Close after a short delay to let user see completion
            const timer = setTimeout(() => {
                setShowOverlay(false);
                setUploadingFiles([]);
            }, 1500);
            return () => clearTimeout(timer);
        } else if (allComplete && hasErrors) {
            // Keep overlay open longer if there are errors
            const timer = setTimeout(() => {
                setShowOverlay(false);
                setUploadingFiles([]);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [uploadingFiles]);

    return (
        <>
            {/* Drag overlay - renders at top level */}
            {isDragging && !disabled && (
                <Paper
                    elevation={8}
                    sx={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 9999,
                        backgroundColor: "rgba(25, 118, 210, 0.1)",
                        backdropFilter: "blur(4px)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "4px dashed",
                        borderColor: "primary.main",
                        pointerEvents: "none",
                    }}
                >
                    <Box textAlign="center">
                        <CloudUploadIcon sx={{ fontSize: 80, color: "primary.main", mb: 2 }} />
                        <Typography variant="h4" color="primary">
                            Drop files to upload
                        </Typography>
                        {currentPath && (
                            <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
                                to {currentPath}
                            </Typography>
                        )}
                    </Box>
                </Paper>
            )}

            {/* Upload overlay */}
            {showOverlay && uploadingFiles.length > 0 && (
                <Paper
                    elevation={8}
                    sx={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 9999,
                        backgroundColor: "rgba(25, 118, 210, 0.1)",
                        backdropFilter: "blur(4px)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: "auto",
                    }}
                >
                    <Paper
                        elevation={4}
                        sx={{
                            maxWidth: 600,
                            width: "90%",
                            maxHeight: "80vh",
                            display: "flex",
                            flexDirection: "column",
                            overflow: "hidden",
                        }}
                    >
                        <Box sx={{ p: 3, borderBottom: 1, borderColor: "divider" }}>
                            <Typography variant="h5" component="h2">
                                Uploading Files
                            </Typography>
                            {currentPath && (
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                    to {currentPath}
                                </Typography>
                            )}
                        </Box>
                        <List sx={{ flex: 1, overflow: "auto", p: 0 }}>
                            {uploadingFiles.map((uploadFile, index) => (
                                <ListItem
                                    key={index}
                                    sx={{
                                        borderBottom: index < uploadingFiles.length - 1 ? 1 : 0,
                                        borderColor: "divider",
                                    }}
                                >
                                    <ListItemIcon>
                                        {uploadFile.status === "success" ? (
                                            <CheckCircleIcon color="success" />
                                        ) : uploadFile.status === "error" ? (
                                            <ErrorIcon color="error" />
                                        ) : (
                                            <InsertDriveFileIcon color="action" />
                                        )}
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={uploadFile.file.name}
                                        secondary={
                                            <Box sx={{ width: "100%" }}>
                                                <Box
                                                    sx={{
                                                        display: "flex",
                                                        justifyContent: "space-between",
                                                        alignItems: "center",
                                                        mb: 0.5,
                                                    }}
                                                >
                                                    <Typography variant="caption" component="span">
                                                        {formatBytes(uploadFile.file.size)}
                                                    </Typography>
                                                    {uploadFile.status === "success" && (
                                                        <Typography
                                                            variant="caption"
                                                            component="span"
                                                            color="success.main"
                                                        >
                                                            Complete
                                                        </Typography>
                                                    )}
                                                </Box>
                                                {uploadFile.status === "error" && uploadFile.error && (
                                                    <Typography variant="caption" color="error" component="div">
                                                        {uploadFile.error}
                                                    </Typography>
                                                )}
                                            </Box>
                                        }
                                    />
                                </ListItem>
                            ))}
                        </List>
                    </Paper>
                </Paper>
            )}
        </>
    );
};

export default ObjectUpload;
