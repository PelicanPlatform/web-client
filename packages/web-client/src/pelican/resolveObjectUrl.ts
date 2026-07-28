import { parseLinkHeader, parseRecordHeader } from "../util";

/**
 * Successful resolutions are cached so repeated operations against the same path re-probe
 * the director at most once per TTL (the PROPFIND/PUT answer — the origin's collections
 * endpoint — is stable per namespace; GET cache lists are stable enough for a short TTL).
 * Failures and fallbacks are never cached.
 */
const resolveCache = new Map<string, { url: string; expiresAt: number }>();
const RESOLVE_CACHE_TTL_MS = 5 * 60 * 1000;
const RESOLVE_CACHE_MAX = 200;

/**
 * Resolve a director object URL to the concrete endpoint to send a request to, without
 * following the director's cross-origin 307 (which strips the `Authorization` header).
 *
 * Resolution depends on what you're doing, because the director routes by operation:
 *   - `GET` (object read) → a **cache** replica, listed in the `Link: rel="duplicate"`
 *     header (ordered by `pri`). Caches only exist for reads.
 *   - `PROPFIND` (listing) / `PUT` (write) → the **origin's collections endpoint**, which
 *     the director advertises in `X-Pelican-Namespace: …collections-url=…`. These are NOT
 *     cache operations, so there is no `Link` entry for them — asking for one is a category
 *     error (a namespace-root PROPFIND legitimately has no cache links).
 *
 * A single `?redirect=false` probe returns both, needs no token, and performs no redirect.
 *
 * When the probe fails (non-OK response, network error, or a server that doesn't implement
 * `?redirect=false` — e.g. Origin-local mode points directly at the data endpoint), this
 * returns the ORIGINAL URL unchanged rather than throwing: the caller's request then runs
 * against the director exactly as it did before resolution existed, and its own status
 * handling (404→empty listing, 401/403→auth errors) stays in charge. An abort is the one
 * exception — that propagates so cancellation works.
 *
 * @param directorObjectUrl `${director_endpoint}${objectPath}`
 * @param method            the method the caller will use (default `GET`)
 * @param signal            optional abort signal (aborts propagate; other probe failures fall back)
 * @returns the resolved URL, or `directorObjectUrl` itself when resolution isn't possible
 */
export async function resolveObjectUrl(directorObjectUrl: string, method: string = "GET", signal?: AbortSignal): Promise<string> {
    // PROPFIND and PUT both resolve to the collections endpoint; GET resolves to a cache.
    const cacheKey = `${method === "GET" ? "GET" : "COLLECTION"}:${directorObjectUrl}`;
    const cached = resolveCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.url;
    }

    let resolved: string | null;
    try {
        resolved = await probeForEndpoint(directorObjectUrl, method, signal);
    } catch (e) {
        if (signal?.aborted) throw e;
        resolved = null;
    }

    if (!resolved) {
        console.warn(`[Pelican] Could not resolve ${directorObjectUrl} via ?redirect=false — using the direct URL`);
        return directorObjectUrl;
    }

    if (resolveCache.size >= RESOLVE_CACHE_MAX) {
        resolveCache.clear();
    }
    resolveCache.set(cacheKey, { url: resolved, expiresAt: Date.now() + RESOLVE_CACHE_TTL_MS });
    return resolved;
}

async function probeForEndpoint(directorObjectUrl: string, method: string, signal?: AbortSignal): Promise<string | null> {
    const probe = new URL(directorObjectUrl);
    probe.searchParams.set("redirect", "false");

    const response = await fetch(probe.toString(), { method: "GET", signal });
    if (!response.ok) return null;

    // Object reads go to a cache replica: only rel="duplicate" entries are caches, and a
    // missing/zero/NaN pri must not outrank a real priority (lowest positive pri wins).
    if (method === "GET") {
        const links = (parseLinkHeader(response.headers.get("Link")) ?? []).filter((l) => l.rel === "duplicate");
        if (links.length > 0) {
            const priority = (l: { pri: number }) => (Number.isFinite(l.pri) && l.pri > 0 ? l.pri : Number.POSITIVE_INFINITY);
            const best = links.reduce((a, b) => (priority(b) < priority(a) ? b : a));
            return best.url;
        }
        // No cache advertised — fall through to the origin below.
    }

    // Listing / writes (and reads with no cache) go to the origin's collections endpoint.
    const ns = parseRecordHeader(response.headers.get("X-Pelican-Namespace"));
    const collectionsUrl: string | undefined = ns?.["collections-url"];
    if (collectionsUrl) {
        const objectPath = new URL(directorObjectUrl).pathname;
        return new URL(objectPath, collectionsUrl).toString();
    }

    return null;
}

export default resolveObjectUrl;
