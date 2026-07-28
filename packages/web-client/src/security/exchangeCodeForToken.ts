import getToken from "./getToken";
import { exchangeAuthCode, namespaceKey, usesServiceWorkerAuth } from "../serviceWorker";
import { Namespace, Token } from "../types";

export interface ExchangeCodeForTokenParams {
    federationHostname: string;
    /** Namespace carrying clientId, optional clientSecret, and oidcConfiguration. */
    namespace: Namespace;
    code: string;
    codeVerifier: string;
    /** Must match the redirect_uri used on the authorize request exactly. */
    redirectUri: string;
}

/**
 * Exchange an OAuth authorization code for a Token using the browser-appropriate model —
 * the single owner of the "where does the token live" decision:
 *   - Chromium: the exchange happens inside the service worker; only the non-secret claims
 *     come back to the page (no `value`).
 *   - Firefox/Safari: the exchange happens on the page; the access token (with `value`) is
 *     returned and the refresh token is deliberately discarded, so expiry means re-login
 *     rather than a stored renewable credential.
 */
export async function exchangeCodeForToken(p: ExchangeCodeForTokenParams): Promise<Token> {
    const { namespace } = p;
    if (!namespace.clientId) {
        throw new Error(`Cannot exchange code: missing client id for namespace ${namespace.prefix}`);
    }
    const tokenEndpoint = namespace.oidcConfiguration?.token_endpoint;
    if (!tokenEndpoint) {
        throw new Error(`Cannot exchange code: missing OIDC configuration for namespace ${namespace.prefix}`);
    }

    if (usesServiceWorkerAuth()) {
        const status = await exchangeAuthCode({
            nsKey: namespaceKey(p.federationHostname, namespace.prefix),
            code: p.code,
            codeVerifier: p.codeVerifier,
            clientId: namespace.clientId,
            clientSecret: namespace.clientSecret,
            tokenEndpoint,
            redirectUri: p.redirectUri,
        });
        return status as Token;
    }

    const { accessToken } = await getToken(
        namespace.oidcConfiguration!,
        p.codeVerifier,
        namespace.clientId,
        namespace.clientSecret,
        p.code,
        p.redirectUri,
    );
    return accessToken as Token;
}

export default exchangeCodeForToken;
