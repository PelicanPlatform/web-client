"use client";

import {Alert, Box, Snackbar } from "@mui/material";
import {useEffect, useRef, useState} from "react";

import { PelicanClientProvider, usePelicanClient } from "../PelicanClientProvider";
import ClientMetadata from "../ClientMetadata";
import ObjectUpload, { ObjectUploadRef } from "../ObjectUpload";
import ObjectView from "../ObjectView";
import ObjectInput from "../ObjectInput";
import CollectionShortcuts from "../CollectionShortcuts";
import {ObjectList} from "@pelicanplatform/web-client";

interface AuthenticatedClientProps {
  objectUrl: string;
}

/**
 * Inner component that uses the context
 */
function AuthenticatedClientContent() {

  const uploadRef = useRef<ObjectUploadRef>(null);

  const {
    error,
    objectUrl,
    setObjectUrl,
    collections,
    loading,
    authorizationRequired,
    handleLogin,
    handleDownload,
    handleUpload,
    federation,
    namespace,
    getObjectList
  } = usePelicanClient();

  const [objectList, setObjectList] = useState<ObjectList[]>([]);

  // Load object list when objectUrl changes
  useEffect(() => {
    let isMounted = true;

    const fetchObjectList = async () => {
      const lists = await getObjectList(objectUrl);
      if (isMounted) {
        setObjectList(lists);
      }
    };

    fetchObjectList();

    return () => {
      isMounted = false;
    };
  }, [objectUrl, getObjectList]);

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
          <Box>
            <ObjectInput
              objectUrl={objectUrl}
              onChange={setObjectUrl}
              loading={loading}
              federation={federation?.hostname}
              namespace={namespace?.prefix}
            />
            <ClientMetadata
              federation={federation?.hostname}
              namespace={namespace?.prefix}
              onUpload={!authorizationRequired ? () => uploadRef.current?.triggerFileSelect() : undefined}
            />
          </Box>
          {!authorizationRequired && (
            <Box>
              <ObjectUpload
                refs={uploadRef}
                disabled={false}
                onUpload={handleUpload}
                currentPath={objectUrl}
              />
            </Box>
          )}
          <ObjectView
            objectList={objectList}
            onDownload={handleDownload}
            loginRequired={authorizationRequired}
            canLogin={true}
            onLoginRequest={handleLogin}
            namespace={namespace?.prefix}
            onExplore={(x) => setObjectUrl(x)}
          />
        </Box>
        {collections.length > 0 && (
          <Box pt={2} flexGrow={0}>
            <CollectionShortcuts collections={collections} onClick={(x) => setObjectUrl(x)} />
          </Box>
        )}
        <Snackbar open={error !== null} autoHideDuration={6000} onClose={() => {}}>
          <Alert severity="error">
            {error}
          </Alert>
        </Snackbar>
      </Box>
    </Box>
  );
}

/**
 * Wrapper that provides the context
 */
export default function AuthenticatedClient({ objectUrl }: AuthenticatedClientProps) {
  return (
    <PelicanClientProvider initialObjectUrl={objectUrl} enableAuth={true}>
      <AuthenticatedClientContent />
    </PelicanClientProvider>
  );
}