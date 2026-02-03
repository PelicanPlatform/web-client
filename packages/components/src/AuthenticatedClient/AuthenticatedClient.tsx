"use client";

import {Alert, Badge, Box, IconButton, Paper, Skeleton, Snackbar } from "@mui/material";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";

import { usePelicanClient } from "../PelicanClientProvider";
import ClientMetadata from "../ClientMetadata";
import ObjectUpload, { ObjectUploadRef } from "../ObjectUpload";
import ObjectView from "../ObjectView";
import CollectionView from "../CollectionView";
import {ObjectList, parseObjectUrl} from "@pelicanplatform/web-client";
import { UploadFile, List, ContentCopy } from "@mui/icons-material";

/**
 * Inner component that uses the context
 */
function AuthenticatedClient() {

  const {
    error,
    setError,
    objectUrl,
    setObjectUrl,
    collections,
    loading,
    authorizationRequired,
    authorized,
    handleLogin,
    handleDownload,
    handleUpload,
    federation,
    namespace,
    getObjectList
  } = usePelicanClient();

  const uploadRef = useRef<ObjectUploadRef>(null);

  const [objectList, setObjectList] = useState<ObjectList[]>([]);

  const [showCollections, setShowCollections] = useState<boolean>(false);
  const [highlightCollections, setHighlightCollections] = useState<boolean>(false);

  // If there is just one collection found lets auto-navigate into it
  useEffect(() => {
    if(!namespace || !federation) return;
    if (collections.length > 0) {
      setHighlightCollections(true);
      setShowCollections(true);
    }
  }, [collections]);

  // Load object list when objectUrl changes
  // Note: getObjectList uses a cache with 5-minute TTL to avoid redundant requests
  useEffect(() => {
    getObjectList(objectUrl).then(setObjectList);
  }, [objectUrl, getObjectList]);

  // Wrap handleUpload to refresh object list after successful upload
  const handleUploadWithRefresh = useCallback(async (file: File) => {
    await handleUpload(file);
    // Refresh the object list after successful upload
    setObjectList(await getObjectList(objectUrl, true));
  }, [handleUpload, getObjectList, objectUrl]);

  const collectionPath = useMemo(() => {
    try {
      const {objectPath} = parseObjectUrl(objectUrl);
      const collectionPath = namespace && objectPath.startsWith(namespace.prefix)
        ? objectPath.replace(namespace.prefix, "")
        : objectPath
      return collectionPath;
    } catch {}
  }, [namespace, objectUrl]);

  return (
    <Box mt={6} {...(uploadRef.current?.dragHandlers ?? {})}>
      <Box
        width={"100%"}
        sx={{
          display: {
            xs: "block",
            md: "flex",
          },
        }}
        gap={2}
      >
        <Box pt={2} display={"flex"} flexDirection={"column"} flexGrow={1}>
          {authorized && (
            <Box>
              <ObjectUpload
                refs={uploadRef}
                disabled={false}
                onUpload={handleUploadWithRefresh}
                currentPath={objectUrl}
              />
            </Box>
          )}
          <Box display={"flex"} gap={1} my={1} justifyContent={'space-between'}>
            <ClientMetadata
              federation={federation?.hostname}
              namespace={namespace?.prefix}
              collectionPath={collectionPath}
              onUpload={!authorized ? () => uploadRef.current?.triggerFileSelect() : undefined}
            />
            <Box display={'flex'} mb={-1}>
              <IconButton onClick={() => navigator.clipboard.writeText(objectUrl)}>
                <ContentCopy />
              </IconButton>
              <IconButton onClick={() => uploadRef.current?.triggerFileSelect()} disabled={!authorized}>
                <UploadFile />
              </IconButton>
              <Badge invisible={!highlightCollections} badgeContent={collections.length} color={'primary'}>
                <IconButton
                  onClick={() => {
                    setShowCollections((x) => !x)
                  }}
                  disabled={!authorized}
                >
                  <List />
                </IconButton>
              </Badge>
            </Box>
          </Box>
          <Paper elevation={1}>
            {showCollections ? (
              <CollectionView
                collections={collections}
                onExplore={(collectionPath: string) => {
                  if (!federation || !namespace) return;
                  const newUrl = `pelican://${federation.hostname}${namespace.prefix}${collectionPath}`;
                  setObjectUrl(newUrl);
                  setShowCollections(false);
                }}
              />
            ) : loading ? (
              <Skeleton variant={"rectangular"} height={"350px"} width={"100%"} />
            ) : (
              <ObjectView
                objectList={objectList}
                collectionPath={collectionPath}
                onDownload={(x) => handleDownload(`pelican://${federation?.hostname}${x}`)}
                loginRequired={authorizationRequired && !authorized}
                canLogin={true}
                onLoginRequest={handleLogin}
                namespace={namespace?.prefix}
                onExplore={(objectHref) => {
                  const {federationHostname} = parseObjectUrl(objectUrl);
                  const newUrl = `pelican://${federationHostname}${objectHref}`;
                  setObjectUrl(newUrl);
                }}
              />
            )}
          </Paper>
        </Box>
        <Snackbar open={error !== null} autoHideDuration={6000} onClose={() => setError(null)}>
          <Alert severity="error">
            {error}
          </Alert>
        </Snackbar>
      </Box>
    </Box>
  );
}

export default AuthenticatedClient;
