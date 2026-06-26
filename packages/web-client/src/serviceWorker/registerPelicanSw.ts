
import {AUTH_REQUIRED_HEADER, getPendingDownloads, RESUME_HEADER,} from "./downloadServiceWorker";
import { UnauthenticatedError } from "../errors";
import type { Token } from "../types";

let _cachedDirHandle: FileSystemDirectoryHandle | null = null;
let _pendingDirHandle: Promise<FileSystemDirectoryHandle | null> | null = null;

/**
 * registerPelicanSw
 *
 * Registers the Pelican download service worker.  Call this once near the top
 * of your app entry point (client-side only).
 *
 * @param swUrl  Path to the compiled service-worker script served from your
 *               public / static directory.  Defaults to `/pelican-sw.js`.
 * @param scope  Optional registration scope.  Defaults to `/`.
 *
 * @returns The ServiceWorkerRegistration, or null if SW is not supported.
 *
 * @example
 *   // In Next.js app router: app/layout.tsx (client component)
 *   import { registerPelicanSw } from "@pelican/web-client";
 *   registerPelicanSw();
 */
export async function registerPelicanSw(
  swUrl = "/pelican/downloadServiceWorker.js",
  scope = "/"
): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register(swUrl, { scope, type: "module" });
    console.log("[Pelican SW] Registered:", registration.scope);
    return registration;
  } catch (err) {
    console.error("[Pelican SW] Registration failed:", err);
    return null;
  }
}

/**
 * pelicanFetch
 *
 * Drop-in wrapper around `fetch` that adds the `X-Pelican-Parallel: true`
 * header so the registered service worker will handle the request with
 * parallel byte-range downloading.
 *
 * Falls back to a normal `fetch` when no service worker is available.
 *
 * @example
 *   const response = await pelicanFetch("https://origin/large-file.zip");
 */
export async function pelicanFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("X-Pelican-Parallel", "true");
  return fetch(url, { ...init, headers });
}

/**
 * pelicanFetchAndSave
 *
 * Prompts the user with a "Save As" dialog (via `showSaveFilePicker`), then
 * streams the parallel-downloaded file **directly to their chosen location**
 * on disk — the response body is never fully buffered in memory on the page.
 *
 * Flow:
 *   Origin ──► SW (OPFS staging) ──► pipeTo(FileSystemWritableFileStream) ──► user's disk
 *
 * Must be called from a user-gesture handler (click, etc.) because
 * `showSaveFilePicker` requires a transient activation.
 *
 * Falls back to an in-memory blob download if `showSaveFilePicker` is
 * unavailable (e.g. Firefox, or non-secure context).
 *
 * @example
 *   <button onClick={() => pelicanFetchAndSave(url, "large-file.zip")} />
 */
export async function pelicanFetchAndSave(
  url: string,
  filename: string,
  init: RequestInit = {},
  fileHandle?: FileSystemFileHandle
): Promise<void> {
  // showSaveFilePicker must be called synchronously within the user gesture —
  // do it before any awaited network activity or the transient activation is lost.
  const dir = typeof window !== "undefined" ? await getDownloadDir() : null;
  if (dir) {
    fileHandle = await dir.getFileHandle(filename, { create: true });
  }

  const t0 = performance.now();
  const response = await pelicanFetch(url, init);

  // 499 is the service worker's signal that the user cancelled the download.
  // This is not an error — the SW has already cleaned up and notified the page,
  // so we just return quietly instead of surfacing a "Download failed" error.
  if (response.status === 499) {
    return;
  }

  // 401 + AUTH_REQUIRED_HEADER means the SW holds no usable token for this namespace
  // (e.g. it was terminated and its in-memory tokens were lost). Surface it as an
  // authentication error so the UI prompts the user to log in again.
  if (response.status === 401 && response.headers.get(AUTH_REQUIRED_HEADER) === "true") {
    throw new UnauthenticatedError("Access token required to access the object");
  }

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error("Response has no body");
  }

  const contentLength = response.headers.get("Content-Length");
  const totalBytes = contentLength ? parseInt(contentLength, 10) : null;

  const logStats = (bytes: number) => {
    const seconds = (performance.now() - t0) / 1000;
    const mb = bytes / 1024 / 1024;
    const mbps = mb / seconds;
    console.info(
      `[Pelican] Download complete — ${mb.toFixed(2)} MB in ${seconds.toFixed(2)}s (${mbps.toFixed(2)} MB/s)`
    );
  };

  if (fileHandle) {
    const writable = await fileHandle.createWritable();
    await response.body.pipeTo(writable);
    logStats(totalBytes ?? 0);
    await deleteDownloadRecord(url);
    return;
  }

  // Fallback: collect into a blob (will buffer in memory) and click a link.
  const blob = await response.blob();
  logStats(blob.size);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    await deleteDownloadRecord(url);
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  }
}

export async function retriggerPendingDownloads(activeIds: Set<string> = new Set()): Promise<void> {
  const pending = await getPendingDownloads();

  console.info("[Pelican SW] Retrigger pending:", pending);

  for (const record of pending) {
    if (activeIds.has(record.id)) {
      console.info(`[Pelican SW] Skipping ${record.id} — already downloading`);
      continue;
    }

    const filename = record.objectUrl.split("/").at(-1)?.split("?").at(0) ?? "download";
    const headers = new Headers();
    headers.set(RESUME_HEADER, record.id);

    pelicanFetchAndSave(record.objectUrl, filename, { headers }).catch((err) => {
      console.warn(`[Pelican] Failed to retrigger download ${record.id}:`, err);
    });
  }
}

async function deleteDownloadRecord(objectUrl: string): Promise<void> {
  return new Promise((resolve) => {
    const openReq = indexedDB.open("pelican-downloads", 1);
    openReq.onsuccess = () => {
      const db = openReq.result;
      if (!db.objectStoreNames.contains("downloads")) { resolve(); return; }
      const tx = db.transaction("downloads", "readwrite");
      const store = tx.objectStore("downloads");
      // Find the record by objectUrl then delete by its id key
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) { resolve(); return; }
        if (cursor.value?.objectUrl === objectUrl) {
          cursor.delete();
          resolve();
        } else {
          cursor.continue();
        }
      };
      cursorReq.onerror = () => resolve(); // non-fatal
    };
    openReq.onerror = () => resolve(); // non-fatal
  });
}

/**
 * cancelDownload
 *
 * Cancels/abandons a download by its id. Works for both:
 *  - active downloads — the service worker aborts the in-flight network transfer, and
 *  - interrupted/pending downloads — the persisted record is simply discarded.
 *
 * The service worker cleans up the OPFS staging file and IndexedDB record, then
 * broadcasts a `"cancelled"` progress update so the UI can remove the entry.
 *
 * A local fallback cleanup runs in case there is no controlling service worker
 * (e.g. it was unregistered or never claimed the page).
 *
 * @example
 *   <button onClick={() => cancelDownload(download.id)} />
 */
export async function cancelDownload(id: string): Promise<void> {
  const controller =
    typeof navigator !== "undefined" && "serviceWorker" in navigator
      ? navigator.serviceWorker.controller
      : null;

  if (controller) {
    controller.postMessage({ type: "PELICAN_CANCEL_DOWNLOAD", id });
    return;
  }

  // Fallback: no controlling SW — clean up the record directly so it stops
  // showing up as pending/interrupted.
  await deleteDownloadRecordById(id).catch(() => {});
}

async function deleteDownloadRecordById(id: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  return new Promise((resolve) => {
    const openReq = indexedDB.open("pelican-downloads", 1);
    openReq.onsuccess = () => {
      const db = openReq.result;
      if (!db.objectStoreNames.contains("downloads")) { resolve(); return; }
      const tx = db.transaction("downloads", "readwrite");
      tx.objectStore("downloads").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // non-fatal
    };
    openReq.onerror = () => resolve(); // non-fatal
  });
}

// ─── Authorization messaging (page → service worker) ──────────────────────────
//
// The access/refresh tokens live ONLY in the service worker's memory. These helpers
// are the page's entire interface to them: hand the SW an auth code to exchange,
// ask which namespaces are currently authenticated, or drop a token. The raw JWT is
// never returned to the page — only non-secret claims.

/** Non-secret token claims the SW reports back (no `value`/JWT). */
export type NamespaceTokenStatus = Omit<Token, "value">;

export interface AuthExchangeRequest {
  /** `${encodeURIComponent(host)}:${encodeURIComponent(prefix)}` — see namespaceKey(). */
  nsKey: string;
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
  redirectUri: string;
}

/** Build the non-secret namespace routing key used in messages and the X-Pelican-Namespace header. */
export function namespaceKey(host: string, prefix: string): string {
  return `${encodeURIComponent(host)}:${encodeURIComponent(prefix)}`;
}

/** Inverse of namespaceKey(). */
export function parseNamespaceKey(nsKey: string): { host: string; prefix: string } {
  const [h, p] = nsKey.split(":");
  return { host: decodeURIComponent(h ?? ""), prefix: decodeURIComponent(p ?? "") };
}

/** Resolve a controlling service worker, waiting briefly for it to claim this client. */
async function getController(timeoutMs = 3000): Promise<ServiceWorker | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  if (navigator.serviceWorker.controller) return navigator.serviceWorker.controller;
  await navigator.serviceWorker.ready.catch(() => null);
  if (navigator.serviceWorker.controller) return navigator.serviceWorker.controller;
  return new Promise((resolve) => {
    const cleanup = () => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
    };
    const onChange = () => { cleanup(); resolve(navigator.serviceWorker.controller); };
    const timer = setTimeout(() => { cleanup(); resolve(navigator.serviceWorker.controller); }, timeoutMs);
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
  });
}

/** Send a message to the SW and await its reply over a dedicated MessageChannel. */
async function sendAuthMessage<T>(message: Record<string, unknown>): Promise<T> {
  const controller = await getController();
  if (!controller) throw new Error("No controlling Pelican service worker");
  return new Promise<T>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => resolve(e.data as T);
    controller.postMessage(message, [channel.port2]);
  });
}

/**
 * Exchange an OAuth authorization code for tokens inside the service worker.
 * The tokens stay in SW memory; only the non-secret claims are returned here.
 */
export async function exchangeAuthCode(req: AuthExchangeRequest): Promise<NamespaceTokenStatus> {
  const reply = await sendAuthMessage<
    { ok: true; status: NamespaceTokenStatus } | { ok: false; error: string }
  >({ type: "PELICAN_AUTH_EXCHANGE", ...req });
  if (!reply.ok) throw new Error(reply.error);
  return reply.status;
}

/** Drop a namespace's token from SW memory (or all tokens when nsKey is omitted). */
export async function logoutNamespace(nsKey?: string): Promise<void> {
  await sendAuthMessage({ type: "PELICAN_AUTH_LOGOUT", nsKey }).catch(() => {});
}

/**
 * Ask the SW which namespaces it currently holds usable tokens for.
 * Rejects when there is no controlling SW, so callers can distinguish
 * "the SW reports no tokens" from "the SW isn't ready yet".
 */
export async function queryAuthStatus(nsKey?: string): Promise<Record<string, NamespaceTokenStatus>> {
  const reply = await sendAuthMessage<{ statuses: Record<string, NamespaceTokenStatus> }>({
    type: "PELICAN_AUTH_STATUS_QUERY",
    nsKey,
  });
  return reply.statuses;
}

async function getDownloadDir(): Promise<FileSystemDirectoryHandle | null> {
  if (!("showDirectoryPicker" in window)) return null;
  if (_cachedDirHandle) {
    const perm = await _cachedDirHandle.requestPermission({ mode: "readwrite" });
    if (perm === "granted") return _cachedDirHandle;
  }
  if (_pendingDirHandle) return _pendingDirHandle;
  _pendingDirHandle = (async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      _cachedDirHandle = handle;
      return handle;
    } catch {
      return null;
    } finally {
      _pendingDirHandle = null;
    }
  })();
  return _pendingDirHandle;
}

