/**
 * Pelican Download Service Worker
 *
 * Intercepts fetch requests that carry the `X-Pelican-Parallel: true` header
 * and re-downloads the resource using parallel byte-range requests, then
 * streams the assembled bytes back to the page as if it were a normal response.
 *
 * USAGE (in your app):
 *   1. Copy / bundle this file into your public directory as `pelican-sw.js`.
 *   2. Call `registerPelicanSw()` (exported from this package) once on startup.
 *   3. Use `pelicanFetch(url, init?)` instead of `fetch()` for large files, or
 *      add the header manually: `{ headers: { 'X-Pelican-Parallel': 'true' } }`.
 */

import { Download } from "./types";

const CHUNK_SIZE = 32 * 1024 * 1024;
const MAX_PARALLEL = 6;
const MAX_RETRIES = 3;
export const TRIGGER_HEADER = "x-pelican-parallel";
export const RESUME_HEADER = "x-pelican-resume-id";
/** Non-secret routing hint: which in-memory token to inject. `${enc(host)}:${enc(prefix)}`. */
export const NAMESPACE_HEADER = "x-pelican-namespace";
/** Set on a synthetic 401 the SW returns when it holds no usable token for a tagged request. */
export const AUTH_REQUIRED_HEADER = "x-pelican-auth-required";

// ─── In-memory authorization store ─────────────────────────────────────────────
//
// Access + refresh tokens live ONLY here, in service-worker module memory. They are
// never written to sessionStorage, IndexedDB, or handed back to the page in raw form.
// When the SW is terminated (idle) this map is lost and the user must re-authenticate
// — that is the deliberate cost of the memory-only XSS-hardening guarantee.

interface TokenEntry {
  accessToken: string;
  refreshToken?: string;
  exp: number; // seconds since epoch
  scope: string;
  // Cached at exchange time so silent refresh needs no page round-trip.
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
}

/** Non-secret token claims handed back to the page (never includes the JWT itself). */
interface TokenClaims {
  iss?: string;
  sub?: string;
  aud?: string;
  exp: number;
  iat?: number;
  scope: string;
}

const tokenStore = new Map<string, TokenEntry>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSw() {
  return self as any;
}

// ─── Cancellation registry ───────────────────────────────────────────────────

interface ActiveDownload {
  abort: AbortController;
  objectUrl: string;
  tmpName?: string; // OPFS staging file to remove on cancel
}

/** In-flight downloads keyed by download id, so they can be aborted on request. */
const activeDownloads = new Map<string, ActiveDownload>();
/** Ids that were explicitly cancelled, so the running task reports "cancelled" instead of "failed". */
const cancelledIds = new Set<string>();

/**
 * Cancel/abort a download. Works for both in-flight downloads (aborts the
 * network transfer) and interrupted/pending downloads (just removes the record).
 * Cleans up the OPFS staging file and the IndexedDB record, then notifies the page.
 */
async function cancelDownload(id: string): Promise<void> {
  cancelledIds.add(id);

  const active = activeDownloads.get(id);
  active?.abort.abort(new DOMException("Download cancelled", "AbortError"));

  const db = await openDownloadDb().catch(() => null);
  const record = db ? await getDownloadRecord(db, id).catch(() => null) : null;

  // Remove the OPFS staging file if we know about it.
  const tmpName = active?.tmpName ?? record?.filePath;
  if (tmpName) {
    try {
      const storageRoot = await navigator.storage.getDirectory();
      await storageRoot.removeEntry(tmpName);
    } catch {
      // file may not exist yet — ignore
    }
  }

  if (db) await deleteDownloadRecord(db, id).catch(() => {});

  await broadcastProgress({
    id,
    objectUrl: active?.objectUrl ?? record?.objectUrl ?? "",
    bytesDownloaded: record?.bytesDownloaded ?? 0,
    totalByteSize: record?.totalByteSize ?? 0,
    status: "cancelled",
  });
}

// ─── Install / Activate ──────────────────────────────────────────────────────

if (typeof self !== "undefined" && "ServiceWorkerGlobalScope" in self) {
  getSw().addEventListener("install", () => { getSw().skipWaiting(); });
  getSw().addEventListener("activate", (event: any) => { event.waitUntil(getSw().clients.claim()); });
  getSw().addEventListener("fetch", (event: any) => {
    const { request } = event;
    // Parallel/SW-managed download path (also injects auth when tagged with a namespace).
    if (request.headers.has(TRIGGER_HEADER)) {
      event.respondWith(parallelDownload(request));
      return;
    }
    // Plain request that wants the SW to inject its in-memory token.
    if (request.headers.has(NAMESPACE_HEADER)) {
      event.respondWith(authPassthrough(request));
      return;
    }
    // Untagged request — leave it alone.
  });
  getSw().addEventListener("message", (event: any) => {
    const data = event.data;
    if (data?.type === "PELICAN_CANCEL_DOWNLOAD" && data.id) {
      event.waitUntil(cancelDownload(data.id).catch(() => {}));
      return;
    }
    // Auth messages reply on the MessageChannel port the page supplied.
    const port: MessagePort | undefined = event.ports?.[0];
    if (data?.type === "PELICAN_AUTH_EXCHANGE") {
      event.waitUntil(handleAuthExchange(data).then((r) => port?.postMessage(r)).catch((e) =>
        port?.postMessage({ ok: false, error: e instanceof Error ? e.message : String(e) })
      ));
      return;
    }
    if (data?.type === "PELICAN_AUTH_LOGOUT") {
      handleAuthLogout(data.nsKey);
      port?.postMessage({ ok: true });
      return;
    }
    if (data?.type === "PELICAN_AUTH_STATUS_QUERY") {
      port?.postMessage({ statuses: snapshotAuthStatuses(data.nsKey) });
      return;
    }
  });
  getSw().addEventListener("notificationclick", (event: any) => {
    event.notification.close();
    event.waitUntil(
      getSw().clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients: any[]) => {
        const existing = clients.find((c) => c.url && c.focus);
        if (existing) return existing.focus();
        return getSw().clients.openWindow(getSw().registration.scope);
      })
    );
  });
}

// ─── Authorization ─────────────────────────────────────────────────────────────

interface AuthExchangePayload {
  type: "PELICAN_AUTH_EXCHANGE";
  nsKey: string;
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
  redirectUri: string;
}

/**
 * Exchange an OAuth authorization code for tokens and store them in memory.
 * Returns only non-secret claims to the page — the access/refresh tokens stay here.
 */
async function handleAuthExchange(p: AuthExchangePayload): Promise<{ ok: true; status: TokenClaims } | { ok: false; error: string }> {
  const params = new URLSearchParams();
  params.append("grant_type", "authorization_code");
  params.append("code", p.code);
  params.append("redirect_uri", p.redirectUri);
  params.append("code_verifier", p.codeVerifier);
  params.append("client_id", p.clientId);
  params.append("client_secret", p.clientSecret);

  const response = await fetch(p.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    return { ok: false, error: `Failed to get token: ${response.status} ${response.statusText}` };
  }

  const { access_token, refresh_token, expires_in } = await response.json();
  const claims = parseJWT(access_token);
  const entry: TokenEntry = {
    accessToken: access_token,
    refreshToken: refresh_token,
    exp: claims.exp ?? Math.floor(Date.now() / 1000) + (expires_in ?? 0),
    scope: claims.scope ?? "",
    tokenEndpoint: p.tokenEndpoint,
    clientId: p.clientId,
    clientSecret: p.clientSecret,
  };
  tokenStore.set(p.nsKey, entry);
  return { ok: true, status: claimsOf(entry) };
}

function handleAuthLogout(nsKey?: string): void {
  if (nsKey) {
    tokenStore.delete(nsKey);
    broadcastAuthStatus(nsKey, null);
  } else {
    const keys = Array.from(tokenStore.keys());
    tokenStore.clear();
    keys.forEach((k) => broadcastAuthStatus(k, null));
  }
}

function snapshotAuthStatuses(nsKey?: string): Record<string, TokenClaims> {
  const out: Record<string, TokenClaims> = {};
  for (const [key, entry] of tokenStore.entries()) {
    if (nsKey && key !== nsKey) continue;
    out[key] = claimsOf(entry);
  }
  return out;
}

/**
 * Return a usable access token for a namespace, refreshing it first if expired.
 * Returns null when nothing usable is available (caller should force re-login).
 */
async function getValidAccessToken(nsKey: string | null): Promise<string | null> {
  if (!nsKey) return null;
  const entry = tokenStore.get(nsKey);
  if (!entry) return null;

  const now = Math.floor(Date.now() / 1000);
  if (entry.exp > now + 5) return entry.accessToken; // small skew buffer

  // Expired — attempt an in-session silent refresh (refresh token is memory-only too).
  if (!entry.refreshToken) {
    tokenStore.delete(nsKey);
    broadcastAuthStatus(nsKey, null);
    return null;
  }
  try {
    const refreshed = await refreshAccessToken(entry);
    tokenStore.set(nsKey, refreshed);
    broadcastAuthStatus(nsKey, claimsOf(refreshed));
    return refreshed.accessToken;
  } catch (err) {
    console.warn("[Pelican SW] Token refresh failed:", err);
    tokenStore.delete(nsKey);
    broadcastAuthStatus(nsKey, null);
    return null;
  }
}

async function refreshAccessToken(entry: TokenEntry): Promise<TokenEntry> {
  const params = new URLSearchParams();
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", entry.refreshToken!);
  params.append("client_id", entry.clientId);
  params.append("client_secret", entry.clientSecret);

  const response = await fetch(entry.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) throw new Error(`Refresh failed: ${response.status} ${response.statusText}`);

  const { access_token, refresh_token, expires_in } = await response.json();
  const claims = parseJWT(access_token);
  return {
    ...entry,
    accessToken: access_token,
    // Honor refresh-token rotation when the server issues a new one.
    refreshToken: refresh_token ?? entry.refreshToken,
    exp: claims.exp ?? Math.floor(Date.now() / 1000) + (expires_in ?? 0),
    scope: claims.scope ?? entry.scope,
  };
}

function broadcastAuthStatus(nsKey: string, status: TokenClaims | null): void {
  getSw().clients.matchAll({ type: "window", includeUncontrolled: false }).then((clients: any[]) => {
    for (const client of clients) {
      try {
        client.postMessage({ type: "PELICAN_AUTH_STATUS", nsKey, status });
      } catch {
        // client gone — ignore
      }
    }
  });
}

function claimsOf(entry: TokenEntry): TokenClaims {
  const c = parseJWT(entry.accessToken);
  return { iss: c.iss, sub: c.sub, aud: c.aud, exp: entry.exp, iat: c.iat, scope: entry.scope };
}

function parseJWT(token: string): Record<string, any> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT token");
  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
  return JSON.parse(atob(padded));
}

/**
 * Inject the in-memory Authorization for a namespace-tagged request, strip the
 * routing header, and forward it. Returns a synthetic 401 (carrying
 * AUTH_REQUIRED_HEADER) when no usable token is held, so the page re-authenticates.
 */
async function authPassthrough(request: Request): Promise<Response> {
  const nsKey = request.headers.get(NAMESPACE_HEADER);
  const accessToken = await getValidAccessToken(nsKey);
  if (!accessToken) {
    return new Response(null, { status: 401, headers: { [AUTH_REQUIRED_HEADER]: "true" } });
  }
  const headers = cleanHeaders(request.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  // Rebuild the request with the resolved headers (body included for PUT/PROPFIND).
  const forwarded = new Request(request, { headers });
  return fetch(forwarded);
}

// ─── Core logic ──────────────────────────────────────────────────────────────

async function parallelDownload(request: Request): Promise<Response> {
  // Resolve the in-memory token (if any) into an Authorization header up front, so the
  // download helpers can keep operating purely on request.headers. The page never sends
  // Authorization itself — only the non-secret X-Pelican-Namespace routing tag.
  const nsKey = request.headers.get(NAMESPACE_HEADER);
  if (nsKey) {
    const accessToken = await getValidAccessToken(nsKey);
    if (!accessToken) {
      return new Response(null, { status: 401, headers: { [AUTH_REQUIRED_HEADER]: "true" } });
    }
    const headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    request = new Request(request, { headers });
  }
  return parallelDownloadResolved(request);
}

async function parallelDownloadResolved(request: Request): Promise<Response> {

  // Short-circuit if OPFS isn't supported - Firefox/Safari
  if (!opfsSupported()) {
    return downloadWithoutOpfs(request);
  }

  // If we have a resume download header, try to resume the download instead of starting a new one
  console.log("[Pelican SW] Received request with headers:", Array.from(request.headers.entries()));
  if (request.headers.has(RESUME_HEADER)) {
    const id = request.headers.get(RESUME_HEADER)!;
    return resumeDownload(request, id);
  }

  return downloadObject(request)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Manages a single object download. Can be a new download or resume of an unauthenticated download.
 * Handles fetching byte ranges, writing to OPFS, and updating IndexedDB records for progress tracking.
 *
 * Returns a Response that streams the downloaded content back to the page.
 *
 * @param request
 * @param download
 */
async function downloadObject(request: Request): Promise<Response> {

  // Store a download record in IndexedDB so the page can show progress / cancellation UI
  const download: Download = {
    id: crypto.randomUUID(),
    filePath: `pelican-tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    objectUrl: request.url,
    bytesDownloaded: 0,
    chunkSize: CHUNK_SIZE,
    status: "in-progress",
    authenticated: request.headers.get("Authorization") !== null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const db = await openDownloadDb();
  await storeDownloadRecord(db, download);
  await broadcastProgress({ id: download.id, objectUrl: request.url, bytesDownloaded: 0, totalByteSize: 0, status: "in-progress" });

  const abort = new AbortController();
  activeDownloads.set(download.id, { abort, objectUrl: request.url });

  let fileWritable: FileSystemWritableFileStream | undefined;

  try {
    // Get the total object size
    const { objectSize: totalByteSize, cacheUrl } = await getObjectMetadata(request);
    const pendingChunks = new Set(Array.from({ length: Math.ceil(totalByteSize / CHUNK_SIZE) }, (_, i) => i))

    const downloadSizePatch: Pick<Download, 'pendingChunks' | 'totalByteSize'> = {
      totalByteSize,
      pendingChunks
    };
    await patchDownloadRecord(db, download.id, downloadSizePatch);
    await broadcastProgress({ id: download.id, objectUrl: request.url, bytesDownloaded: 0, totalByteSize, status: "in-progress" });

    const storageRoot = await navigator.storage.getDirectory();
    const tmpName = `pelican-tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    activeDownloads.get(download.id)!.tmpName = tmpName;
    await patchDownloadRecord(db, download.id, { filePath: tmpName });
    const tmpHandle = await storageRoot.getFileHandle(tmpName, { create: true });
    fileWritable = await tmpHandle.createWritable();

    await runWorkers(pendingChunks, abort, downloadChunkFactory(db, request, download.id, download.chunkSize, totalByteSize, abort, cacheUrl, fileWritable));

    if (abort.signal.aborted) throw new DOMException("Download cancelled", "AbortError");

    await fileWritable.close();

    await broadcastProgress({ id: download.id, objectUrl: request.url, bytesDownloaded: totalByteSize, totalByteSize, status: "completed" });

    const tmpFile = await tmpHandle.getFile();
    const fileStream = tmpFile.stream() as ReadableStream<Uint8Array>;
    const cleanup = () => storageRoot.removeEntry(tmpName).catch(() => {});
    const { readable: r, writable: passThrough } = new TransformStream<Uint8Array, Uint8Array>();
    fileStream.pipeTo(passThrough).then(cleanup, cleanup);

    if (Notification.permission === "granted" && !(await anyClientVisible())) {
      await getSw().registration.showNotification("Download complete", {
        body: `File Downloaded: ${request.url.split("/").at(-1)?.split("?").at(0) ?? "object"}`,
        icon: "https://pelicanplatform.org/favicon.ico",
        actions: [{ action: "open", title: "Open File" }],
      });
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Length", String(totalByteSize));
    return new Response(r, { status: 200, headers: responseHeaders });

  } catch (err) {
    await fileWritable?.abort().catch(() => {});
    if (cancelledIds.has(download.id)) {
      cancelledIds.delete(download.id);
      // cancelDownload already cleaned up the record and notified the page.
      return new Response("Download cancelled", { status: 499 });
    }
    await patchDownloadRecord(db, download.id, { status: "failed" }).catch(() => {});
    await broadcastProgress({ id: download.id, objectUrl: request.url, bytesDownloaded: download.bytesDownloaded, totalByteSize: download.totalByteSize ?? 0, status: "failed" });
    throw err;
  } finally {
    activeDownloads.delete(download.id);
  }
}

async function resumeDownload(request: Request, id: string): Promise<Response> {

  console.log("[Pelican SW] Attempting to resume download with ID:", id);

  const db = await openDownloadDb();
  const download = await getDownloadRecord(db, id);

  if (!download || !download.pendingChunks || !download.totalByteSize) {
    // Record not found or incomplete — fall back to a fresh download
    return downloadObject(request);
  }

  // If the download was authenticated but the resume request doesn't have auth headers, we can't resume — error out the request
  if(download.authenticated && request.headers.get("Authorization") === null) {
    return new Response("Cannot resume authenticated download without auth headers", { status: 400 });
  }

  const { pendingChunks, totalByteSize, chunkSize, filePath } = download;

  console.log(`[Pelican SW] Resuming download with: ${pendingChunks.size * chunkSize} bytes downloaded out of ${totalByteSize} total bytes`);

  const abort = new AbortController();
  activeDownloads.set(id, { abort, objectUrl: request.url, tmpName: filePath });

  let fileWritable: FileSystemWritableFileStream | undefined;

  try {
    const storageRoot = await navigator.storage.getDirectory();
    const tmpHandle = await storageRoot.getFileHandle(filePath, { create: true });
    fileWritable = await tmpHandle.createWritable({ keepExistingData: true });

    await patchDownloadRecord(db, id, { status: "in-progress", updatedAt: Date.now() });
    await broadcastProgress({ id, objectUrl: request.url, bytesDownloaded: download.bytesDownloaded, totalByteSize, status: "in-progress" });

    const { cacheUrl } = await getObjectMetadata(request);

    await runWorkers(
      pendingChunks,
      abort,
      downloadChunkFactory(db, request, id, chunkSize, totalByteSize, abort, cacheUrl, fileWritable)
    );

    if (abort.signal.aborted) throw new DOMException("Download cancelled", "AbortError");

    await fileWritable.close();

    await broadcastProgress({ id, objectUrl: request.url, bytesDownloaded: totalByteSize, totalByteSize, status: "completed" });

    const tmpFile = await tmpHandle.getFile();
    const fileStream = tmpFile.stream() as ReadableStream<Uint8Array>;
    const cleanup = () => storageRoot.removeEntry(filePath).catch(() => {});
    const { readable: r, writable: passThrough } = new TransformStream<Uint8Array, Uint8Array>();
    fileStream.pipeTo(passThrough).then(cleanup, cleanup);

    if (Notification.permission === "granted" && !(await anyClientVisible())) {
      await getSw().registration.showNotification("Download complete", {
        body: `File Downloaded: ${request.url.split("/").at(-1)?.split("?").at(0) ?? "object"}`,
        icon: "https://pelicanplatform.org/favicon.ico",
      });
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Length", String(totalByteSize));
    return new Response(r, { status: 200, headers: responseHeaders });

  } catch (err) {
    await fileWritable?.abort().catch(() => {});
    if (cancelledIds.has(id)) {
      cancelledIds.delete(id);
      // cancelDownload already cleaned up the record and notified the page.
      return new Response("Download cancelled", { status: 499 });
    }
    await patchDownloadRecord(db, id, { status: "failed" }).catch(() => {});
    await broadcastProgress({ id, objectUrl: request.url, bytesDownloaded: download.bytesDownloaded, totalByteSize, status: "failed" });
    throw err;
  } finally {
    activeDownloads.delete(id);
  }
}

/**
 * Downloads an object sequentially without OPFS, for browsers that don't support it (Firefox/Safari).
 * No resume support — if the connection drops the download must restart from the beginning.
 * Progress tracking and notifications are still supported.
 * Memory usage is bounded to roughly one chunk (~32MB) at a time due to backpressure.
 */
async function downloadWithoutOpfs(request: Request): Promise<Response> {

  console.log("[Pelican SW] OPFS not supported — falling back to in-memory download for:", request.url);

  const db = await openDownloadDb();

  // If this is a resume attempt, delete the old stale record before starting fresh
  const previousId = request.headers.get(RESUME_HEADER);
  if (previousId) {
    await deleteDownloadRecord(db, previousId).catch(() => {});
  }

  const download: Download = {
    id: crypto.randomUUID(),
    filePath: "",
    objectUrl: request.url,
    bytesDownloaded: 0,
    chunkSize: CHUNK_SIZE,
    status: "in-progress",
    authenticated: request.headers.get("Authorization") !== null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await storeDownloadRecord(db, download);
  await broadcastProgress({ id: download.id, objectUrl: request.url, bytesDownloaded: 0, totalByteSize: 0, status: "in-progress" });

  let totalByteSize: number;
  let cacheUrl: URL;
  let totalChunks: number;

  try {
    ({ objectSize: totalByteSize, cacheUrl } = await getObjectMetadata(request));
    totalChunks = Math.ceil(totalByteSize / CHUNK_SIZE);
  } catch (err) {
    await patchDownloadRecord(db, download.id, { status: "failed" }).catch(() => {});
    await broadcastProgress({ id: download.id, objectUrl: request.url, bytesDownloaded: 0, totalByteSize: 0, status: "failed" });
    return new Response(`Failed to fetch resource for size check: ${err instanceof Error ? err.message : String(err)}`, { status: 500 });
  }

  await patchDownloadRecord(db, download.id, { totalByteSize });
  await broadcastProgress({ id: download.id, objectUrl: request.url, bytesDownloaded: 0, totalByteSize, status: "in-progress" });

  const abort = new AbortController();
  activeDownloads.set(download.id, { abort, objectUrl: request.url });
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  (async () => {
    try {
      for (let i = 0; i < totalChunks; i++) {
        if (abort.signal.aborted) break;
        const range = getByteRange(i, CHUNK_SIZE, totalByteSize);
        const data = await fetchChunk(cacheUrl, range, request.headers, abort);
        await writer.write(data);
        download.bytesDownloaded += data.byteLength;
        await patchDownloadRecord(db, download.id, { bytesDownloaded: download.bytesDownloaded });
        console.log("[Pelican SW] Downloaded chunk", i + 1, "of", totalChunks, `(${download.bytesDownloaded}/${totalByteSize} bytes)`);
        await broadcastProgress({ id: download.id, objectUrl: request.url, bytesDownloaded: download.bytesDownloaded, totalByteSize, status: "in-progress" });
      }
      if (abort.signal.aborted) throw new DOMException("Download cancelled", "AbortError");
      await writer.close();
      await patchDownloadRecord(db, download.id, { status: "completed" });
      await broadcastProgress({ id: download.id, objectUrl: request.url, bytesDownloaded: totalByteSize, totalByteSize, status: "completed" });

      if (Notification.permission === "granted" && !(await anyClientVisible())) {
        await getSw().registration.showNotification("Download complete", {
          body: `File Downloaded: ${request.url.split("/").at(-1)?.split("?").at(0) ?? "object"}`,
          icon: "https://pelicanplatform.org/favicon.ico",
        });
      }
    } catch (err) {
      await writer.abort(err).catch(() => {});
      if (cancelledIds.has(download.id)) {
        cancelledIds.delete(download.id);
        // cancelDownload already cleaned up the record and notified the page.
        return;
      }
      console.log("[Pelican SW] Download failed:", err);
      await patchDownloadRecord(db, download.id, { status: "failed" });
      await broadcastProgress({ id: download.id, objectUrl: request.url, bytesDownloaded: download.bytesDownloaded, totalByteSize, status: "failed" });
    } finally {
      activeDownloads.delete(download.id);
    }
  })();

  const responseHeaders = new Headers();
  responseHeaders.set("Content-Length", String(totalByteSize));
  return new Response(readable, { status: 200, headers: responseHeaders });
}

async function broadcastProgress(update: {
  id: string;
  objectUrl: string;
  bytesDownloaded: number;
  totalByteSize: number;
  status: string;
}) {
  const clients = await getSw().clients.matchAll({ type: "window", includeUncontrolled: false });
  for (const client of clients) {
    try {
      console.log("[Pelican SW] Broadcasting progress to client:", update);
      client.postMessage({ type: "PELICAN_DOWNLOAD_PROGRESS", ...update });
    } catch (e) {
      // Client may have navigated away or closed — ignore disconnected port errors
    }
  }
}

function downloadChunkFactory(db: IDBDatabase, request: Request, id: string, chunkSize: number, totalByteSize: number, abort: AbortController, cacheUrl: URL, fileWritable: FileSystemWritableFileStream): (i: number) => Promise<void> {
  return async (i: number) => {
    const range = getByteRange(i, chunkSize, totalByteSize);
    const data = await fetchChunk(cacheUrl, range, request.headers, abort);
    await fileWritable.write({ type: "write", position: range.start, data: data.buffer as ArrayBuffer });
    await patchDownloadRecord(db, id, (prev) => {
      const bytesDownloaded = prev.bytesDownloaded + data.byteLength;
      prev.pendingChunks?.delete(i);
      broadcastProgress({ id, objectUrl: request.url, bytesDownloaded, totalByteSize, status: "in-progress" });
      return { bytesDownloaded, pendingChunks: prev.pendingChunks };
    });
  }
}

async function getObjectMetadata(request: Request): Promise<{objectSize: number, cacheUrl: URL}> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await getObjectMetadataOnce(request);
    } catch (err) {
      lastError = err;
      console.warn(`[Pelican SW] getObjectMetadata failed (attempt ${attempt}/${MAX_RETRIES}):`, err);
    }
  }
  throw lastError;
}

async function getObjectMetadataOnce(request: Request): Promise<{objectSize: number, cacheUrl: URL}> {

  const headResp = await fetch(request.url, {
    headers: cleanHeaders(request.headers)
  });

  if (!headResp.ok) throw new Error("Failed to fetch resource for size check: " + headResp.statusText);

  const cacheUrl = new URL(headResp.url);
  const totalStr = headResp.headers.get("Content-Length");
  const objectSize = totalStr ? parseInt(totalStr, 10) : NaN;

  await headResp.body?.cancel();

  return { objectSize, cacheUrl };
}

function cleanHeaders(headers: Headers): Headers {
  const clean = new Headers(headers);
  clean.delete(TRIGGER_HEADER);
  clean.delete(RESUME_HEADER);
  clean.delete(NAMESPACE_HEADER);
  return clean;
}

async function fetchChunk(
  url: URL,
  range: { start: number; end: number },
  headers: Headers,
  abort: AbortController
): Promise<Uint8Array> {
  const rangeHeaders = cleanHeaders(headers);
  rangeHeaders.set("Range", getRangeHeader(range));

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (abort.signal.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      const resp = await fetch(url, { headers: rangeHeaders, signal: abort.signal });
      if (!resp.ok && resp.status !== 206) {
        throw new Error(`Range request failed: ${resp.status} ${resp.statusText} (${url})`);
      }
      return new Uint8Array(await resp.arrayBuffer());
    } catch (err) {
      if (abort.signal.aborted) throw err;
      lastError = err;
      console.warn(`[Pelican SW] Chunk ${range.start}-${range.end} failed (attempt ${attempt}/${MAX_RETRIES}):`, err);
    }
  }
  abort.abort(lastError);
  throw lastError;
}

async function runWorkers(
  pendingChunks: Set<number>,
  abort: AbortController,
  process: (i: number) => Promise<void>
): Promise<void> {
  const workers = Array.from({ length: Math.min(MAX_PARALLEL, pendingChunks.size) }, async () => {
    while (pendingChunks.size > 0) {
      if (abort.signal.aborted) return;
      const i = pendingChunks.values().next().value; // Get first value
      if (i === undefined) return; // Set is empty
      pendingChunks.delete(i); // Remove it immediately to avoid duplicate work
      await process(i);
    }
  });
  await Promise.all(workers);
}

function opfsSupported(): boolean {
  const ua = self.navigator.userAgent;
  const isFirefox = ua.includes("Firefox/");
  const isSafari = ua.includes("Safari/") && !ua.includes("Chrome/");
  return !isFirefox && !isSafari;
}

function getByteRange(index: number, chunkSize: number, total: number): {start: number, end: number} {
  const start = index * chunkSize;
  const end = Math.min(start + chunkSize - 1, total - 1);
  return { start, end };
}

function getRangeHeader(range: {start: number, end: number}): string {
  return `bytes=${range.start}-${range.end}`;
}

async function storeDownloadRecord(db: IDBDatabase, record: Download): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("downloads", "readwrite");
    tx.objectStore("downloads").put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function patchDownloadRecord(
  db: IDBDatabase,
  id: string,
  update: Partial<Download> | ((prev: Download) => Partial<Download>)
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("downloads", "readwrite");
    const store = tx.objectStore("downloads");
    const req = store.get(id);
    req.onsuccess = () => {
      const record = req.result as Download;
      if (!record) {
        reject(new Error(`Download record not found: ${id}`));
        return;
      }
      const patch = typeof update === "function" ? update(record) : update;
      const updated = { ...record, ...patch, updatedAt: Date.now() };
      store.put(updated);
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getDownloadRecords(db: IDBDatabase): Promise<Download[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("downloads", "readonly");
    const req = tx.objectStore("downloads").getAll();
    req.onsuccess = () => resolve(req.result as Download[]);
    req.onerror = () => reject(req.error);
  });
}

async function getDownloadRecord(db: IDBDatabase, id: string): Promise<Download | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("downloads", "readonly");
    const req = tx.objectStore("downloads").get(id);
    req.onsuccess = () => {
      const record = req.result as Download | undefined;
      if (!record) { resolve(null); return; }
      if (record.pendingChunks !== undefined && !(record.pendingChunks instanceof Set)) {
        record.pendingChunks = new Set(record.pendingChunks as unknown as number[]);
      }
      resolve(record);
    };
    req.onerror = () => reject(req.error);
  });
}


function openDownloadDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("pelican-downloads", 1);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("downloads")) {
        db.createObjectStore("downloads", { keyPath: "id" });
      }
    };
    req.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
    req.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
  });
}

async function deleteDownloadRecord(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("downloads", "readwrite");
    tx.objectStore("downloads").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingDownloads(): Promise<Download[]> {
  const db = await openDownloadDb();
  const records = await getDownloadRecords(db);
  console.log(records)
  return records.filter((r) => r.status === "in-progress" && !r.authenticated);
}


async function anyClientVisible(): Promise<boolean> {
  const allClients = await getSw().clients.matchAll({ type: "window", includeUncontrolled: false });
  return allClients.some((c: any) => c.visibilityState === "visible");
}