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
const TRIGGER_HEADER = "x-pelican-parallel";
const RESUME_HEADER = "x-pelican-resume-id";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSw() {
  return self as any;
}

// ─── Install / Activate ──────────────────────────────────────────────────────

if (typeof self !== "undefined" && "ServiceWorkerGlobalScope" in self) {
  getSw().addEventListener("install", () => { getSw().skipWaiting(); });
  getSw().addEventListener("activate", (event: any) => { event.waitUntil(getSw().clients.claim()); });
  getSw().addEventListener("fetch", (event: any) => {
    const { request } = event;
    if (!request.headers.has(TRIGGER_HEADER)) return;
    event.respondWith(parallelDownload(request));
  });
}

// ─── Core logic ──────────────────────────────────────────────────────────────

async function parallelDownload(request: Request): Promise<Response> {

  // Short-circuit if OPFS isn't supported - Firefox/Safari
  if (!(await opfsSupported())) {
    return fetch(request);
  }

  // If we have a resume download header, try to resume the download instead of starting a new one
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

  // Get the total object size
  const { objectSize: totalByteSize, cacheUrl } = await getObjectMetadata(request);
  const pendingChunks = new Set(Array.from({ length: Math.ceil(totalByteSize / CHUNK_SIZE) }, (_, i) => i))

  const downloadSizePatch: Pick<Download, 'pendingChunks' | 'totalByteSize'> = {
    totalByteSize,
    pendingChunks
  };
  await patchDownloadRecord(db, download.id, downloadSizePatch);

  const abort = new AbortController();

  const storageRoot = await navigator.storage.getDirectory();
  const tmpName = `pelican-tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpHandle = await storageRoot.getFileHandle(tmpName, { create: true });
  const fileWritable = await tmpHandle.createWritable();

  await runWorkers(pendingChunks, abort, downloadChunkFactory(db, request, download.id, download.chunkSize, totalByteSize, abort, cacheUrl, fileWritable));

  await fileWritable.close();
  const tmpFile = await tmpHandle.getFile();
  const fileStream = tmpFile.stream() as ReadableStream<Uint8Array>;
  const cleanup = () => storageRoot.removeEntry(tmpName).catch(() => {});
  const { readable: r, writable: passThrough } = new TransformStream<Uint8Array, Uint8Array>();
  fileStream.pipeTo(passThrough).then(cleanup, cleanup);

  // If Notifications permission is granted, show a notification when the download is complete
  if (Notification.permission === "granted" && !(await anyClientVisible())) {
    await getSw().registration.showNotification("Download complete", {
      body: `File Downloaded: ${request.url.split("/").at(-1)?.split("?").at(0) ?? "object"}`,
      icon: "https://pelicanplatform.org/favicon.ico",
    });
  }

  const responseHeaders = new Headers();
  responseHeaders.set("Content-Length", String(totalByteSize));

  return new Response(r, { status: 200, headers: responseHeaders });
}

async function resumeDownload(request: Request, id: string): Promise<Response> {
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

  const abort = new AbortController();

  const storageRoot = await navigator.storage.getDirectory();

  // Reuse the existing OPFS file if it exists, otherwise create a new one
  const tmpHandle = await storageRoot.getFileHandle(filePath, { create: true });
  const fileWritable = await tmpHandle.createWritable({ keepExistingData: true });

  await patchDownloadRecord(db, id, { status: "in-progress", updatedAt: Date.now() });

  const { cacheUrl } = await getObjectMetadata(request);

  await runWorkers(
    pendingChunks,
    abort,
    downloadChunkFactory(db, request, id, chunkSize, totalByteSize, abort, cacheUrl, fileWritable)
  );

  await fileWritable.close();
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
}

function downloadChunkFactory(db: IDBDatabase, request: Request, id: string, chunkSize: number, totalByteSize: number, abort: AbortController, cacheUrl: URL, fileWritable: FileSystemWritableFileStream): (i: number) => Promise<void> {
  return async (i: number) => {
    const range = getByteRange(i, chunkSize, totalByteSize);
    const data = await fetchChunk(cacheUrl, range, request.headers, abort);
    await fileWritable.write({ type: "write", position: range.start, data: data.buffer as ArrayBuffer });
    await patchDownloadRecord(db, id, (prev) => {
      const bytesDownloaded = prev.bytesDownloaded + data.byteLength;
      prev.pendingChunks?.delete(i);
      return { bytesDownloaded, pendingChunks: prev.pendingChunks };
    })
  }
}

async function getObjectMetadata(request: Request): Promise<{objectSize: number, cacheUrl: URL}> {

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

async function opfsSupported(): Promise<boolean> {
  try {
    const root = await navigator.storage.getDirectory();
    const h = await root.getFileHandle(`pelican-probe-${Date.now()}`, { create: true });
    const w = await h.createWritable();
    await w.close();
    await root.removeEntry(h.name).catch(() => {});
    return true;
  } catch {
    return false;
  }
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

export async function retriggerPendingDownloads(): Promise<void> {
  const db = await openDownloadDb();
  const records = await getDownloadRecords(db);

  const pending = records.filter(
    (r) => r.status === "in-progress" && !r.authenticated
  );

  for (const record of pending) {
    const headers = new Headers();
    headers.set(TRIGGER_HEADER, "true");
    headers.set(RESUME_HEADER, record.id);

    fetch(record.objectUrl, { headers }).catch((err) => {
      console.warn(`[Pelican SW] Failed to retrigger download ${record.id}:`, err);
    });
  }
}

async function anyClientVisible(): Promise<boolean> {
  const allClients = await getSw().clients.matchAll({ type: "window", includeUncontrolled: false });
  return allClients.some((c: any) => c.visibilityState === "visible");
}