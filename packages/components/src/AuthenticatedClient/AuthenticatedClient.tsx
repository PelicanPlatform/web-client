"use client";

import {Alert, Badge, Box, Button, IconButton, Paper, Skeleton, Snackbar } from "@mui/material";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";

import ClientMetadata from "../ClientMetadata";
import ObjectUpload, { ObjectUploadRef } from "../ObjectUpload";
import ObjectView from "../ObjectView";
import CollectionView from "../CollectionView";
import {ObjectList, parseObjectUrl} from "@pelicanplatform/web-client";
import { UploadFile, List, CreateNewFolderOutlined, Login } from "@mui/icons-material";
import AddCollectionButton from "../AddCollectionButton";
import {usePelicanClient} from "@pelicanplatform/hooks";
import {DownloadManager} from "../DownloadManager";

/**
 * Inner component that uses the context
 */
function AuthenticatedClient() {

  const {
    enableAuth,
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
    getObjectList,
    downloadsInProgress
  } = usePelicanClient();

  const uploadRef = useRef<ObjectUploadRef>(null);

  const [objectList, setObjectList] = useState<ObjectList[]>([]);
  const [listLoading, setListLoading] = useState<boolean>(false);
  const [muteError, setMuteError] = useState<boolean>(true);

  const [showCollections, setShowCollections] = useState<boolean>(false);
  const [highlightCollections, setHighlightCollections] = useState<boolean>(false);

  // If there is just one collection found lets auto-navigate into it
  useEffect(() => {
    if(!namespace || !federation) return;
    if (collections.length > 0) {
      setHighlightCollections(true);
      setShowCollections(true);
      setMuteError(true);
    }
  }, [collections]);

  // Single source of truth: refetch the listing whenever the active objectUrl changes — whether
  // from the namespace selector, a deep link, exploring into a folder, or any consumer calling
  // setObjectUrl. Navigation handlers below only need to setObjectUrl; this effect does the fetch
  // and mirrors the URL to ?url for deep-linking. The cancelled guard drops a stale in-flight
  // result if the user switches again before it resolves.
  useEffect(() => {
    if (!objectUrl) return;
    let cancelled = false;
    (async () => {
      setListLoading(true);
      const params = new URLSearchParams(window.location.search);
      params.set("url", objectUrl);
      window.history.replaceState(null, "", `?${params.toString()}`);
      const list = await getObjectList(objectUrl, false);
      if (cancelled) return;
      setObjectList(list);
      setListLoading(false);
    })();
    return () => { cancelled = true; };
  }, [objectUrl, getObjectList]);

  // On mount, seed objectUrl from a ?url deep link if present; the effect above does the fetching.
  useEffect(() => {
    const urlFromAddress = new URLSearchParams(window.location.search).get("url");
    if (urlFromAddress && urlFromAddress !== objectUrl) {
      setObjectUrl(urlFromAddress);
    }
    setMuteError(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On mount ask if we can send notifications, this is needed to show notifications for downloads in progress
  useEffect(() => {
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Wrap handleUpload to refresh object list after successful upload
  const handleUploadWithRefresh = useCallback(async (file: File) => {
    await handleUpload(file);
    // Refresh the object list after successful upload
    setObjectList(await getObjectList(objectUrl, true));
  }, [handleUpload, getObjectList, objectUrl]);

  const collectionPath = useMemo(() => {
    // If no namespace this can't be determined
    if (!namespace) return undefined;
    try {
      const {objectPath} = parseObjectUrl(objectUrl);
      return objectPath.replace(namespace.prefix, "")
    } catch {}
  }, [namespace, objectUrl]);

  return (
    <Box {...(uploadRef.current?.dragHandlers ?? {})}>
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
        <Box display={"flex"} flexDirection={"column"} flexGrow={1}>
          {authorized && enableAuth && (
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
              {authorized && enableAuth && (
                <>
                  <AddCollectionButton
                    icon={<CreateNewFolderOutlined />}
                    onSubmit={(i) => {
                      // Ensure the input starts with a "/" and does not end with a "/"
                      if(!i.startsWith("/")) i = "/" + i;
                      if(i.endsWith("/")) i = i.slice(0, -1);
                      // Navigate; the objectUrl effect refetches the listing.
                      setObjectUrl((prev: string) => prev + i);
                    }}
                  />
                  <IconButton onClick={() => uploadRef.current?.triggerFileSelect()}>
                    <UploadFile />
                  </IconButton>
                  {collections.length > 0 && (
                    <Badge invisible={!highlightCollections} badgeContent={collections.length} color={'primary'}>
                      <IconButton
                        onClick={() => {
                          if(collections.some(c => objectUrl.startsWith(`pelican://${federation?.hostname}${namespace?.prefix}${c.href}`))) {
                            setShowCollections((x) => !x)
                          }
                        }}
                      >
                        <List />
                      </IconButton>
                    </Badge>
                  )}
                </>
              )}
              {!authorized && enableAuth && (
                <Button endIcon={<Login />} variant="contained" size="small" sx={{mb:1}} onClick={handleLogin}>
                  Login
                </Button>
              )}
            </Box>
          </Box>
          <Paper elevation={1}>
            {showCollections && authorized && enableAuth ? (
              <CollectionView
                collections={collections}
                onExplore={(collectionPath: string) => {
                  if (!federation || !namespace) return;
                  setObjectUrl(`pelican://${federation.hostname}${namespace.prefix}${collectionPath}`);
                  setShowCollections(false);
                }}
              />
            ) : loading || listLoading ? (
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
                  setObjectUrl(`pelican://${federationHostname}${objectHref}`);
                }}
                downloadsInProgress={downloadsInProgress}
              />
            )}
          </Paper>
        </Box>
        <DownloadManager />
        <Snackbar
          open={error !== null && !muteError}
          autoHideDuration={6000}
          onClose={() => {
            setError(null);
            setMuteError(false);
          }}
        >
          <Alert severity="error">
            {error}
          </Alert>
        </Snackbar>
      </Box>
    </Box>
  );
}

export default AuthenticatedClient;
