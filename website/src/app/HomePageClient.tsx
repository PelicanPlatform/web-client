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

    const directorNamespace = namespaces?.find(ns => ns.path === namespace?.prefix) || namespaces[0];

    return (
      <>
        <>
          <Box mb={2}>
            <NamespaceSelector
              onChange={(ns) => {
                // Remove url from query params when changing namespace
                const params = new URLSearchParams(window.location.search);
                params.delete("url");
                const newSearch = params.toString();
                window.history.replaceState({}, "", newSearch ? `?${newSearch}` : window.location.pathname);
                setObjectUrl(`pelican://osg-htc.org${ns.path}`)
              }}
              value={directorNamespace}
              data={namespaces || []}
            />
          </Box>
          {/*<ObjectUrlSetter />*/}
          <AuthenticatedClient key={directorNamespace?.path} />
        </>
      </>
    );
}
