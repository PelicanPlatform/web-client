"use client";

import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import { Box, Paper, Typography } from "@mui/material";
import { DragEvent, Ref, useCallback, useImperativeHandle, useRef, useState } from "react";

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
    /** Callback when files are dropped/selected */
    onUpload?: (files: File[]) => void;
    /** Current object path for context */
    currentPath?: string;
    /** Ref to expose drag handlers */
    refs?: Ref<ObjectUploadRef>;
}

const ObjectUpload = ({ disabled = false, onUpload, currentPath, refs }: ObjectUploadProps) => {
    const [isDragging, setIsDragging] = useState(false);
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
            if (droppedFiles.length > 0 && onUpload) {
                onUpload(droppedFiles);
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
        </>
    );
};

export default ObjectUpload;
