"use client";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DeleteIcon from "@mui/icons-material/Delete";
import ErrorIcon from "@mui/icons-material/Error";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import {
    Box,
    Button,
    Chip,
    IconButton,
    LinearProgress,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Paper,
    Typography,
} from "@mui/material";
import { formatBytes } from "@pelicanplatform/web-client";
import { DragEvent, Ref, useCallback, useImperativeHandle, useRef, useState } from "react";

interface UploadFile {
    file: File;
    status: "pending" | "uploading" | "success" | "error";
    progress: number;
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
    /** Callback when files should be uploaded */
    onUpload?: (files: File[]) => Promise<void>;
    /** Current object path for context */
    currentPath?: string;
    /** Ref to expose drag handlers */
    refs?: Ref<ObjectUploadRef>;
}

const ObjectUpload = ({ disabled = false, onUpload, currentPath, refs }: ObjectUploadProps) => {
    const [isDragging, setIsDragging] = useState(false);
    const [files, setFiles] = useState<UploadFile[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
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
        (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            dragCounterRef.current = 0;

            if (disabled) return;

            const droppedFiles = Array.from(e.dataTransfer.files);
            if (droppedFiles.length > 0) {
                const newFiles: UploadFile[] = droppedFiles.map((file) => ({
                    file,
                    status: "pending",
                    progress: 0,
                }));
                setFiles((prev) => [...prev, ...newFiles]);
            }
        },
        [disabled]
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

    const handleFileSelect = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            if (disabled) return;
            const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
            if (selectedFiles.length > 0) {
                const newFiles: UploadFile[] = selectedFiles.map((file) => ({
                    file,
                    status: "pending",
                    progress: 0,
                }));
                setFiles((prev) => [...prev, ...newFiles]);
            }
            // reset input value to allow selecting the same file again
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        },
        [disabled]
    );

    const handleRemoveFile = useCallback((index: number) => {
        setFiles((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const handleUploadClick = useCallback(() => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    }, []);

    const handleStartUpload = useCallback(async () => {
        if (!onUpload) {
            console.warn("No upload handler provided");
            return;
        }

        const pendingFiles = files.filter((f) => f.status === "pending");
        if (pendingFiles.length === 0) return;

        // update all pending files to uploading
        setFiles((prev) =>
            prev.map((f) => (f.status === "pending" ? { ...f, status: "uploading" as const, progress: 0 } : f))
        );

        // simulate upload progress (in real implementation, you'd track actual progress)
        const uploadPromises = pendingFiles.map(async (uploadFile) => {
            try {
                // Simulate progress updates
                const progressInterval = setInterval(() => {
                    setFiles((prev) =>
                        prev.map((f) =>
                            f.file === uploadFile.file && f.status === "uploading"
                                ? { ...f, progress: Math.min(f.progress + 10, 90) }
                                : f
                        )
                    );
                }, 200);

                // Actual upload would happen here
                await onUpload([uploadFile.file]);

                clearInterval(progressInterval);

                // Mark as success
                setFiles((prev) =>
                    prev.map((f) =>
                        f.file === uploadFile.file ? { ...f, status: "success" as const, progress: 100 } : f
                    )
                );
            } catch (error) {
                // mark as error
                setFiles((prev) =>
                    prev.map((f) =>
                        f.file === uploadFile.file
                            ? {
                                  ...f,
                                  status: "error" as const,
                                  error: error instanceof Error ? error.message : "Upload failed",
                              }
                            : f
                    )
                );
            }
        });

        await Promise.all(uploadPromises);
    }, [files, onUpload]);

    const hasPendingFiles = files.some((f) => f.status === "pending");
    const hasUploadingFiles = files.some((f) => f.status === "uploading");

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

            {/* Upload controls */}
            <Box sx={{ mb: 2 }}>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    style={{ display: "none" }}
                    onChange={handleFileSelect}
                    disabled={disabled}
                />
                <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                    <Button
                        variant="contained"
                        startIcon={<CloudUploadIcon />}
                        onClick={handleUploadClick}
                        disabled={disabled}
                    >
                        Select Files
                    </Button>
                    {hasPendingFiles && (
                        <Button
                            variant="contained"
                            color="success"
                            onClick={handleStartUpload}
                            disabled={disabled || hasUploadingFiles}
                        >
                            Upload {files.filter((f) => f.status === "pending").length} File(s)
                        </Button>
                    )}
                    {disabled && <Chip label="Read-only" color="warning" size="small" />}
                </Box>
            </Box>

            {/* File list */}
            {files.length > 0 && (
                <Paper variant="outlined" sx={{ maxHeight: 400, overflow: "auto" }}>
                    <List>
                        {files.map((uploadFile, index) => (
                            <ListItem
                                key={index}
                                secondaryAction={
                                    uploadFile.status === "pending" || uploadFile.status === "error" ? (
                                        <IconButton edge="end" onClick={() => handleRemoveFile(index)}>
                                            <DeleteIcon />
                                        </IconButton>
                                    ) : null
                                }
                            >
                                <ListItemIcon>
                                    {uploadFile.status === "success" ? (
                                        <CheckCircleIcon color="success" />
                                    ) : uploadFile.status === "error" ? (
                                        <ErrorIcon color="error" />
                                    ) : (
                                        <InsertDriveFileIcon />
                                    )}
                                </ListItemIcon>
                                <ListItemText
                                    primary={uploadFile.file.name}
                                    secondary={
                                        <Box>
                                            <Typography variant="caption" component="span">
                                                {formatBytes(uploadFile.file.size)}
                                            </Typography>
                                            {uploadFile.status === "error" && uploadFile.error && (
                                                <Typography variant="caption" color="error" component="div">
                                                    {uploadFile.error}
                                                </Typography>
                                            )}
                                            {uploadFile.status === "uploading" && (
                                                <Box sx={{ width: "100%", mt: 1 }}>
                                                    <LinearProgress variant="determinate" value={uploadFile.progress} />
                                                </Box>
                                            )}
                                        </Box>
                                    }
                                />
                            </ListItem>
                        ))}
                    </List>
                </Paper>
            )}
        </>
    );
};

export default ObjectUpload;
