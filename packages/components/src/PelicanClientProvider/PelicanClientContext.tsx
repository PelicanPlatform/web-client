import { createContext, Dispatch, SetStateAction } from "react";
import { Federation, Namespace, Collection, ObjectList } from "@pelicanplatform/web-client";

export interface PelicanClientContextValue {
  // Metadata state
  loading: boolean;
  error: string | null;
  authorizationRequired: boolean;
  authorized: boolean;

  // Metadata management
  setError: (error: string | null) => void;

  // Current URL parsing
  objectUrl: string;
  federationHostname: string | null;
  objectPath: string | null;

  // Resolved metadata
  federation: Federation | null;
  namespace: Namespace | null;
  collections: Collection[];

  // Core metadata function
  ensureMetadata: (targetObjectUrl: string) => Promise<{
    federation: Federation;
    namespace: Namespace | null
  }>;

  // Action handlers
  getObjectList: (targetObjectUrl?: string, forceRefresh?: boolean) => Promise<ObjectList[]>;
  invalidateObjectListCache: (targetObjectUrl?: string) => void;
  handleDownload: (downloadObjectUrl: string) => Promise<void>;
  handleUpload: (file: File, uploadObjectUrl?: string) => Promise<void>;
  handleLogin: () => Promise<void>;

  // URL management
  setObjectUrl: Dispatch<SetStateAction<string>>;
}

export const PelicanClientContext = createContext<PelicanClientContextValue | null>(null);

PelicanClientContext.displayName = "PelicanClientContext";