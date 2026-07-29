import { Federation, Namespace, Token } from "../types";
import getObjectToken from "./getObjectToken";
import { UnauthenticatedError, UnauthorizedError } from "../errors";
import { AUTH_REQUIRED_HEADER, NAMESPACE_HEADER, namespaceKey, usesServiceWorkerAuth, waitForController } from "../serviceWorker";

export interface RequestAuth {
    headers: Headers;
    /**
     * The token this request is effectively authenticated with, for error classification.
     * `undefined` when the request goes out unauthenticated — including the page-side case
     * of a claims-only token (no raw JWT), which cannot be attached to a request.
     */
    token: Token | undefined;
}

/**
 * Build the auth for a data request — the single owner of the browser-model split:
 *   - Chromium (service-worker model): tag the request with the non-secret
 *     `X-Pelican-Namespace` routing key; the SW injects the in-memory token. Tagging only
 *     happens once a SW actually CONTROLS the page (we wait briefly for first-load
 *     registration) — a tagged request issued to an uncontrolled page goes to the network
 *     with no Authorization and leaks the routing header. When no controller arrives (e.g.
 *     a hard reload, which stays uncontrolled for its whole lifetime), the request goes out
 *     unauthenticated and a 401/403 classifies as "login required" so the login flow recovers.
 *   - Firefox/Safari (page-side model): attach the page-held token directly as
 *     `Authorization: Bearer`. A claims-only token (no `.value` — the shape the SW model
 *     stores) can't authenticate anything, so it is treated as absent; the request goes out
 *     unauthenticated and a 401/403 correctly classifies as "login required".
 *
 * @param base extra headers to include (e.g. `{ Depth: "1" }` for PROPFIND)
 */
export async function buildAuthHeaders(federation: Federation, namespace?: Namespace, base?: HeadersInit): Promise<RequestAuth> {
    const headers = new Headers(base);
    const raw = namespace ? getObjectToken(namespace) : undefined;

    if (usesServiceWorkerAuth()) {
        if (raw && namespace) {
            const controller = await waitForController();
            if (!controller) {
                // SW-held token is unreachable this page load — go out unauthenticated.
                return { headers, token: undefined };
            }
            headers.set(NAMESPACE_HEADER, namespaceKey(federation.hostname, namespace.prefix));
        }
        return { headers, token: raw };
    }

    const token = raw?.value ? raw : undefined;
    if (token?.value) {
        headers.set("Authorization", `Bearer ${token.value}`);
    }
    return { headers, token };
}

/**
 * Shared 401/403 classification for data responses; no-op for any other status.
 *   - synthetic SW 401 (AUTH_REQUIRED_HEADER) → UnauthenticatedError (SW lost its token)
 *   - 401/403 without a usable token       → UnauthenticatedError (login required)
 *   - 401/403 with a token                 → UnauthorizedError (insufficient access)
 */
export function assertAuthorized(response: Response, token: Token | undefined): void {
    if (response.status === 401 && response.headers.get(AUTH_REQUIRED_HEADER) === "true") {
        // SW holds no usable token (e.g. it was terminated) — re-authentication required.
        throw new UnauthenticatedError("Access token required to access the object");
    }
    if ((response.status === 401 || response.status === 403) && !token) {
        throw new UnauthenticatedError("Access token required to access the object");
    }
    if (response.status === 401 || response.status === 403) {
        throw new UnauthorizedError("Provided token does not have access to the object");
    }
}
