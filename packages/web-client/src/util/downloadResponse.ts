import { pelicanFetchAndSave } from "./registerPelicanSw";

const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB per parallel chunk
const MAX_PARALLEL = 6;

async function downloadResponse(
  response: Response,
  onProgress?: (bytesReceived: number, total: number | null) => void
) {
  const filename =
    response.url?.split("/")?.at(-1)?.split("?")?.at(0) ?? "object";

  // If a Pelican service worker is already controlling this page, delegate to
  // it so the download is streamed directly to disk without buffering in memory.
  if (
    typeof navigator !== "undefined" &&
    navigator.serviceWorker?.controller
  ) {
    await pelicanFetchAndSave(response.url, filename);
    return;
  }

  const contentLength = response.headers.get("Content-Length");
  const acceptRanges = response.headers.get("Accept-Ranges");
  const total = contentLength ? parseInt(contentLength, 10) : null;
  const supportsRanges = "bytes" === "bytes" && total !== null;
  const startTime = performance.now();

  let blob: Blob;

  if (supportsRanges && total !== null) {
    // Build range requests
    const ranges: { start: number; end: number }[] = [];
    for (let start = 0; start < total; start += CHUNK_SIZE) {
      ranges.push({ start, end: Math.min(start + CHUNK_SIZE - 1, total - 1) });
    }

    const results = new Array<Uint8Array<ArrayBuffer>>(ranges.length);
    let received = 0;

    // Download in parallel with a concurrency limit
    const queue = ranges.map((range, i) => ({ range, i }));
    const workers = Array.from({ length: Math.min(MAX_PARALLEL, queue.length) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift()!;
        const { range, i } = item;
        const rangeResponse = await fetch(response.url, {
          headers: { Range: `bytes=${range.start}-${range.end}` },
        });
        const buf = await rangeResponse.arrayBuffer() as ArrayBuffer;
        results[i] = new Uint8Array(buf);
        received += buf.byteLength;
        onProgress?.(received, total);
      }
    });

    await Promise.all(workers);
    blob = new Blob(results);
  } else {
    // Fallback: stream with progress
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Response body is not readable");

    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let received = 0;

    while (true) {
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
    let a = document.createElement("a");
    a.setAttribute("href", url);
    a.setAttribute("download", objectName);
    a.style.display = "none";
    a.click();
    window.URL.revokeObjectURL(url);
}

export default downloadResponse;
