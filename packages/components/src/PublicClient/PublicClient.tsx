"use client";

import { Box } from "@mui/material";

import {usePelicanClient} from "../PelicanClientProvider";
import {useEffect, useMemo, useState} from "react";
import {ObjectList, parseObjectUrl} from "@pelicanplatform/web-client";


/**
 * A public Pelican client, with authentication features disabled.
 */
function PublicClient() {

  const {
    objectUrl,
    handleDownload,
    handleUpload,
    federation,
    namespace,
    getObjectList
  } = usePelicanClient();

  const [objectList, setObjectList] = useState<ObjectList[]>([]);

  const updateObjectList = async (o: string) => {
    setObjectList(await getObjectList(o, false));
  }

  // On mount attempt to load the object list
  useEffect(() => {
    updateObjectList(objectUrl);
  }, []);

  const collectionPath = useMemo(() => {
    // If no namespace this can't be determined
    if (!namespace) return undefined;
    try {
      const {objectPath} = parseObjectUrl(objectUrl);
      return objectPath.replace(namespace.prefix, "")
    } catch {}
  }, [namespace, objectUrl]);

  return (
    <Box>
      TODO
    </Box>
  );
}

export default PublicClient;
