import { parseObjectUrl, resolveObjectUrl } from "./index";
import { buildAuthHeaders, assertAuthorized } from "./authorization";
import { Federation, Namespace } from "../types";
import { downloadResponse } from "../util";
import { pelicanFetchAndSave, usesServiceWorkerDownload } from "../serviceWorker";

export interface DownloadOptions {
  /** Progress callback — fires on the page-side path only (the SW reports over postMessage). */
  onProgress?: (bytesReceived: number, total: number | null) => void;
  /** Aborts the page-side download (the SW path is cancelled via cancelDownload instead). */
  signal?: AbortSignal;
  /**
   * Pre-decided routing from the caller. Pass the caller's own `usesServiceWorkerDownload()`
   * result so UI state (progress seeding, AbortController registration) and the actual
   * transfer path can never disagree. Defaults to deciding here.
   */
  pageSide?: boolean;
}

/**
 * Download an object from a pelican federation and save it to the user's disk.
 *
 * Chromium uses the service worker (parallel range requests, OPFS-backed, streamed to
 * disk) with the token injected from SW memory, and reports progress via postMessage.
 * Firefox/Safari — which have no reliable SW — use the page-side method: resolve, fetch
 * with the page-held token, report progress through `onProgress`, and save the collected
 * bytes as a blob at the end. Not resumable.
 *
 * BREAKING (vs 1.6.x): this function now always performs the save itself and resolves
 * `void`; it no longer returns the raw `Response` on the non-SW path. Callers that want
 * the object's bytes should use `get()` instead.
 */
const download = async (
  objectUrl: string,
  federation: Federation,
  namespace: Namespace,
  options: DownloadOptions = {}
): Promise<void> => {
  const { onProgress, signal } = options;
  const { objectPath } = parseObjectUrl(objectUrl);
  const directorUrl = `${federation.configuration.director_endpoint}${objectPath}`;
  const pageSide = options.pageSide ?? !usesServiceWorkerDownload();

  if (!pageSide) {
    const parts = objectPath.split("/");
    const filename = (parts[parts.length - 1] ?? "object").split("?")[0] ?? "object";
    const { headers } = buildAuthHeaders(federation, namespace);
    await pelicanFetchAndSave(directorUrl, filename, { headers });
    return;
  }

  // Firefox/Safari: resolve, fetch with the page-held token, and save via an in-memory blob.
  const cacheUrl = await resolveObjectUrl(directorUrl, "GET", signal);
  const { headers, token } = buildAuthHeaders(federation, namespace);
  const response = await fetch(cacheUrl, { headers, signal });

  if (response.status === 200) {
    await downloadResponse(response, onProgress, headers, signal);
    return;
  }
  assertAuthorized(response, token);
  throw new Error(`Could not get object: ${response.status} ${response.statusText}`);
};

export default download;
