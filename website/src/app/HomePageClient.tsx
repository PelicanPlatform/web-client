"use client";

import { Box } from "@mui/material";
import React from "react";
import {AuthenticatedClient, usePelicanClient} from "@pelicanplatform/components";
import NamespaceSelector from "@/components/NamespaceSelector/NamespaceSelector";
import {Namespace} from "@/types";

interface HomePageClientProps {
  namespaces: Namespace[];
}

export default function HomePageClient({namespaces}: HomePageClientProps) {
    const {namespace, setObjectUrl, objectUrl, getObjectList} = usePelicanClient()

    const directorNamespace = namespaces?.find(ns => ns.path === namespace?.prefix);

    return (
      <>
        <>
          <Box mb={2}>
            <NamespaceSelector onChange={(ns) => setObjectUrl(`pelican://osg-htc.org${ns.path}`)} value={directorNamespace} data={namespaces || []} />
          </Box>
          {/*<ObjectUrlSetter />*/}
          <AuthenticatedClient key={directorNamespace?.path} />
        </>
      </>
    );
}
