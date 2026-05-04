"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  CircularProgress,
  Divider,
  Fab,
  IconButton,
  LinearProgress,
  Paper,
  Tooltip,
  Typography,
} from "@mui/material";
import { Close, Download as DownloadIcon, ExpandMore } from "@mui/icons-material";
import { DownloadProgress, usePelicanClient } from "@pelicanplatform/hooks";
import { formatBytes, getPendingDownloads, retriggerPendingDownloads } from "@pelicanplatform/web-client";

interface SpeedSample {
  timestamp: number;
  bytesDownloaded: number;
}

function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function computeEta(d: DownloadProgress, samples: Record<string, SpeedSample>): number {
  const sample = samples[d.id];
  if (!sample || d.totalByteSize <= 0 || d.status !== "in-progress") return Infinity;
  const elapsed = (Date.now() - sample.timestamp) / 1000;
  const bytesDone = d.bytesDownloaded - sample.bytesDownloaded;
  if (elapsed <= 0 || bytesDone <= 0) return Infinity;
  const speed = bytesDone / elapsed;
  return (d.totalByteSize - d.bytesDownloaded) / speed;
}

export function DownloadManager() {
  const { downloadsInProgress } = usePelicanClient();
  const [minimized, setMinimized] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [pendingDownloads, setPendingDownloads] = useState<DownloadProgress[]>([]);

  // Track speed samples: record bytes + time when each download first appears
  const speedSamples = useRef<Record<string, SpeedSample>>({});
  useEffect(() => {
    Object.values(downloadsInProgress).forEach((d) => {
      if (!speedSamples.current[d.id]) {
        speedSamples.current[d.id] = { timestamp: Date.now(), bytesDownloaded: d.bytesDownloaded };
      }
    });
    // Clean up samples for downloads that are gone
    Object.keys(speedSamples.current).forEach((id) => {
      if (!downloadsInProgress[id]) delete speedSamples.current[id];
    });
  }, [downloadsInProgress]);

  // On mount, check for pending (interrupted) downloads
  useEffect(() => {
    getPendingDownloads()
      .then((pending) => {
        if (pending.length > 0) {
          setPendingDownloads(
            pending.map((r) => ({
              id: r.id,
              objectUrl: r.objectUrl,
              bytesDownloaded: r.bytesDownloaded,
              totalByteSize: r.totalByteSize ?? 0,
              status: r.status,
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  // Remove pending downloads that have been picked up by the SW
  useEffect(() => {
    if (Object.keys(downloadsInProgress).length === 0) return;
    setPendingDownloads((prev) => prev.filter((p) => !downloadsInProgress[p.id]));
  }, [downloadsInProgress]);

  const activeDownloads = Object.values(downloadsInProgress);
  const activeCount = activeDownloads.filter((d) => d.status === "in-progress").length;
  const totalVisible = activeDownloads.length + pendingDownloads.length;
  const badgeCount = activeCount + pendingDownloads.length;

  const etaSeconds = activeDownloads.map((d) => computeEta(d, speedSamples.current)).filter(isFinite);
  const largestEta = etaSeconds.length > 0 ? Math.max(...etaSeconds) : null;

  // Reset hidden when new downloads appear so the panel reappears automatically
  useEffect(() => {
    if (totalVisible > 0) setHidden(false);
  }, [totalVisible]);

  if (totalVisible === 0 || hidden) return null;

  const fileName = (objectUrl: string) => objectUrl.split("/").at(-1) ?? objectUrl;

  return (
    <Box sx={{ position: "fixed", bottom: 24, right: 24, zIndex: 1400 }}>
      {minimized ? (
        <Tooltip title={`${badgeCount} download${badgeCount !== 1 ? "s" : ""} pending/active`} placement="left">
          <Badge badgeContent={badgeCount} color="primary" overlap="circular" sx={{ "& .MuiBadge-badge": { zIndex: 1401 } }}>
            <Fab color="default" size="medium" onClick={() => setMinimized(false)} aria-label="Show downloads">
              <DownloadIcon />
            </Fab>
          </Badge>
        </Tooltip>
      ) : (
        <Paper elevation={6} sx={{ width: 340, borderRadius: 2, overflow: "hidden" }}>
          {/* Header */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              px: 2,
              py: 1,
              bgcolor: "primary.main",
              color: "primary.contrastText",
            }}
          >
            <Box display="flex" alignItems="center" gap={1}>
              <DownloadIcon fontSize="small" />
              <Box>
                <Typography variant="subtitle2" fontWeight="bold" lineHeight={1.2}>
                  Downloads
                  {activeCount > 0 && (
                    <Typography component="span" variant="caption" sx={{ ml: 1, opacity: 0.85 }}>
                      ({activeCount} active)
                    </Typography>
                  )}
                </Typography>
                {largestEta !== null && (
                  <Typography variant="caption" sx={{ opacity: 0.85 }}>
                    Up to {formatEta(largestEta)} remaining
                  </Typography>
                )}
              </Box>
            </Box>
            <Box>
              <IconButton size="small" onClick={() => setMinimized(true)} sx={{ color: "inherit" }} aria-label="Minimize">
                <ExpandMore fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => setHidden(true)} sx={{ color: "inherit" }} aria-label="Close">
                <Close fontSize="small" />
              </IconButton>
            </Box>
          </Box>

          {/* Pending (interrupted) downloads */}
          {pendingDownloads.length > 0 && (
            <>
              {pendingDownloads.map((d) => {
                const progress = d.totalByteSize > 0 ? Math.round((d.bytesDownloaded / d.totalByteSize) * 100) : 0;
                return (
                  <Box key={d.id} sx={{ px: 2, py: 1.25, borderBottom: "1px solid", borderColor: "divider" }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                      <Tooltip title={d.objectUrl} placement="top">
                        <Typography variant="body2" noWrap sx={{ maxWidth: 220, fontWeight: 500 }}>
                          {fileName(d.objectUrl)}
                        </Typography>
                      </Tooltip>
                      <Typography variant="caption" color="text.secondary">{progress}%</Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={progress} color="warning" sx={{ borderRadius: 1, height: 5 }} />
                    <Box display="flex" justifyContent="space-between" mt={0.5}>
                      <Typography variant="caption" color="text.secondary">
                        {formatBytes(d.bytesDownloaded)}{d.totalByteSize > 0 && ` / ${formatBytes(d.totalByteSize)}`}
                      </Typography>
                      <Typography variant="caption" color="warning.main">interrupted</Typography>
                    </Box>
                  </Box>
                );
              })}
              {activeDownloads.length > 0 && <Divider />}
            </>
          )}

          {/* Active downloads list */}
          <Box sx={{ maxHeight: 320, overflowY: "auto" }}>
            {activeDownloads.map((d) => {
              const progress = d.totalByteSize > 0 ? Math.round((d.bytesDownloaded / d.totalByteSize) * 100) : 0;
              const isActive = d.status === "in-progress";
              const eta = computeEta(d, speedSamples.current);
              const etaLabel = formatEta(eta);

              return (
                <Box
                  key={d.id}
                  sx={{ px: 2, py: 1.25, borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: "none" } }}
                >
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                    <Tooltip title={d.objectUrl} placement="top">
                      <Typography variant="body2" noWrap sx={{ maxWidth: 200, fontWeight: 500 }}>
                        {fileName(d.objectUrl)}
                      </Typography>
                    </Tooltip>
                    <Box display="flex" alignItems="center" gap={0.5}>
                      {isActive && <CircularProgress size={14} thickness={5} />}
                      <Typography variant="caption" color="text.secondary">{progress}%</Typography>
                    </Box>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={progress}
                    color={d.status === "failed" ? "error" : "primary"}
                    sx={{ borderRadius: 1, height: 5 }}
                  />
                  <Box display="flex" justifyContent="space-between" mt={0.5}>
                    <Typography variant="caption" color="text.secondary">
                      {formatBytes(d.bytesDownloaded)}{d.totalByteSize > 0 && ` / ${formatBytes(d.totalByteSize)}`}
                    </Typography>
                    <Box display="flex" gap={0.5} alignItems="center">
                      {etaLabel && (
                        <Typography variant="caption" color="text.secondary">
                          {etaLabel}
                        </Typography>
                      )}
                      <Typography
                        variant="caption"
                        color={d.status === "failed" ? "error" : d.status === "completed" ? "success.main" : "text.secondary"}
                        sx={{ textTransform: "capitalize" }}
                      >
                        {d.status}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              );
            })}
          </Box>

          {pendingDownloads.length > 0 && (
            <>
              <Divider />
              <Box sx={{ px: 2, py: 1, display: "flex", justifyContent: "flex-end" }}>
                <Button
                  size="small"
                  variant="contained"
                  color="warning"
                  onClick={() => {
                    const activeIds = new Set(Object.keys(downloadsInProgress));
                    retriggerPendingDownloads(activeIds).catch(() => {});
                    setPendingDownloads([]);
                  }}
                >
                  Resume All
                </Button>
              </Box>
            </>
          )}
        </Paper>
      )}
    </Box>
  );
}

export default DownloadManager;
