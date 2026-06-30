"use client";

import { OriginClient } from "@pelicanplatform/components";
import type { OriginNamespaceConfig } from "@pelicanplatform/hooks";

/**
 * Demo page for the Origin-local client.
 *
 * The Origin reports its registration status as a payload like:
 *
 *   {
 *     "type": "posix",
 *     "exports": [
 *       { "federationPrefix": "/test/github-actions",
 *         "issuerUrls": ["https://localhost:8444/api/v1.0/origin"],
 *         "capabilities": { "PublicRead": true, ... } },
 *       { "federationPrefix": "/karate",
 *         "issuerUrls": ["https://localhost:8444/api/v1.0/origin"],
 *         "capabilities": { "PublicRead": true, ... } }
 *     ]
 *   }
 *
 * Each export maps to one OriginNamespaceConfig:
 *   prefix       <- export.federationPrefix
 *   issuer       <- export.issuerUrls[0]
 *   requireToken <- !export.capabilities.PublicRead   (both are PublicRead: true here)
 *
 * The transformed result is hardcoded below.
 */
const NAMESPACES: OriginNamespaceConfig[] = [
  {
    prefix: "/test",
    issuer: "https://localhost:8444/api/v1.0/issuer/ns/test",
    requireToken: false,
  },
  {
    prefix: "/karate",
    issuer: "https://localhost:8444/api/v1.0/issuer/ns/karate",
    requireToken: false,
  },
];

// The Origin serves its data (XRootD) on the same host as the registry/issuer but a
// different port. Point these at that data endpoint.
const ORIGIN_HOST = "localhost:8445";
const ORIGIN_BASE_URL = `https://${ORIGIN_HOST}`;

export default function OriginDemoPage() {
  return (
    <OriginClient
      originHost={ORIGIN_HOST}
      originBaseUrl={ORIGIN_BASE_URL}
      namespaces={NAMESPACES}
    />
  );
}
