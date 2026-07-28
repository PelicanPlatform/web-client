const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB per parallel chunk
const MAX_PARALLEL = 6;

/**
 * Page-side download: pull the object (in parallel byte ranges when the endpoint supports
 * them) and save it via a blob + `<a download>`. This is the fallback used by browsers
 * without the service-worker accelerator (Firefox/Safari).
 *
 * @param response       an already-resolved, already-authenticated response for the object
 * @param onProgress     optional progress callback
 * @param requestHeaders headers (e.g. Authorization) to re-send on each range request
 */
async function downloadResponse(
  response: Response,
  onProgress?: (bytesReceived: number, total: number | null) => void,
  requestHeaders?: Headers,
  signal?: AbortSignal
) {
  const filename =
    response.url?.split("/")?.at(-1)?.split("?")?.at(0) ?? "object";

  const contentLength = response.headers.get("Content-Length");
  const acceptRanges = response.headers.get("Accept-Ranges");
  const total = contentLength ? parseInt(contentLength, 10) : null;
  const supportsRanges = acceptRanges === "bytes" && total !== null;
  const startTime = performance.now();

  // Report 0% up front so the UI shows the download starting immediately.
  onProgress?.(0, total);

  let blob: Blob;

  if (supportsRanges && total !== null) {
    // The range workers re-fetch the object; the already-started full-body response would
    // otherwise keep streaming in the background, transferring every byte twice.
    await response.body?.cancel().catch(() => {});

    const ranges: { start: number; end: number }[] = [];
    for (let start = 0; start < total; start += CHUNK_SIZE) {
      ranges.push({ start, end: Math.min(start + CHUNK_SIZE - 1, total - 1) });
    }

    const results = new Array<Uint8Array<ArrayBuffer>>(ranges.length);
    let received = 0;

    const queue = ranges.map((range, i) => ({ range, i }));
    const workers = Array.from({ length: Math.min(MAX_PARALLEL, queue.length) }, async () => {
      while (queue.length > 0) {
        if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");
        const { range, i } = queue.shift()!;
        const rangeHeaders = new Headers(requestHeaders);
        rangeHeaders.set("Range", `bytes=${range.start}-${range.end}`);
        const rangeResponse = await fetch(response.url, { headers: rangeHeaders, signal });
        // A range request must answer 206. Anything else (401 on token expiry, 5xx, or a
        // 200 from a server ignoring Range) would splice an error body / the whole object
        // into the blob — fail the download instead of silently corrupting the file.
        if (rangeResponse.status !== 206) {
          queue.length = 0; // stop the other workers from starting further chunks
          throw new Error(
            `Range request for bytes ${range.start}-${range.end} failed: ${rangeResponse.status} ${rangeResponse.statusText}`
          );
        }
        const buf = (await rangeResponse.arrayBuffer()) as ArrayBuffer;
        results[i] = new Uint8Array(buf);
        received += buf.byteLength;
        onProgress?.(received, total);
      }
    });

    await Promise.all(workers);
    blob = new Blob(results);
  } else {
    // Stream the already-fetched (authenticated) body with progress.
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Response body is not readable");

    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let received = 0;

    while (true) {
      if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      onProgress?.(received, total);
    }

    blob = new Blob(chunks);
  }

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
  console.log(`Download completed with Accept-Ranges=${acceptRanges} in ${elapsed}s${total ? ` (${(total / 1024 / 1024).toFixed(2)} MB)` : ""}`);

  const url = window.URL.createObjectURL(blob);
  downloadUrl(filename, url);
}

function downloadUrl(objectName: string = "object", url: string) {
  const a = document.createElement("a");
  a.setAttribute("href", url);
  a.setAttribute("download", objectName);
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revocation so the browser can start the download before the blob URL is freed.
  setTimeout(() => window.URL.revokeObjectURL(url), 10_000);
}

export default downloadResponse;
