
let _cachedDirHandle: FileSystemDirectoryHandle | null = null;

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
  init: RequestInit = {}
): Promise<void> {
  // showSaveFilePicker must be called synchronously within the user gesture —
  // do it before any awaited network activity or the transient activation is lost.
  let fileHandle: FileSystemFileHandle | null = null;
  const dir = typeof window !== "undefined" ? await getDownloadDir() : null;
  if (dir) {
    fileHandle = await dir.getFileHandle(filename, { create: true });
  }

  const t0 = performance.now();
  const response = await pelicanFetch(url, init);

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
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  }
}

async function getDownloadDir(): Promise<FileSystemDirectoryHandle | null> {
  if (!("showDirectoryPicker" in window)) return null;
  if (_cachedDirHandle) {
    const perm = await _cachedDirHandle.requestPermission({ mode: "readwrite" });
    if (perm === "granted") return _cachedDirHandle;
  }
  _cachedDirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  return _cachedDirHandle;
}

