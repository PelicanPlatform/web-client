"use client";

import { registerClient } from "../security";
import { AuthorizationClient, OidcConfiguration } from "../types";

/** Path segment identifying Pelican's built-in namespace issuer. */
const PELICAN_EMBEDDED_ISSUER_PATH_SUBSTRING = "/api/v1.0/issuer/ns";

/** Pre-registered public (PKCE, no secret) client available on Pelican's built-in issuer. */
export const PELICAN_PUBLIC_CLIENT_ID = "pelican-public-client";

/** Whether the issuer is Pelican's embedded issuer, which ships a premade public client. */
const isPelicanNsIssuer = (issuer: string): boolean => {
    try {
        return new URL(issuer).pathname.includes(PELICAN_EMBEDDED_ISSUER_PATH_SUBSTRING);
    } catch {
        return issuer.includes(PELICAN_EMBEDDED_ISSUER_PATH_SUBSTRING);
    }
};

/**
 * Get a client for the Origin's issuer. Pelican's built-in issuer (`/api/v1.0/issuer/ns`)
 * provides the premade public client `pelican-public-client`, so registration is skipped there;
 * otherwise a client is registered via the issuer's dynamic client registration endpoint.
 * @param issuerConfiguration Issuer's OIDC configuration
 */
const fetchDynamicClient = async (issuerConfiguration: OidcConfiguration): Promise<AuthorizationClient | null> => {
    if (isPelicanNsIssuer(issuerConfiguration.issuer)) {
        return { clientId: PELICAN_PUBLIC_CLIENT_ID };
    }

    if (issuerConfiguration.registration_endpoint === undefined) {
        console.log("No registration endpoint found in issuer configuration:", issuerConfiguration.issuer);
        return null;
    }

    const dynamicClientPayload = {
        redirect_uris: [`${window.location.origin}${window.location.pathname}`],
        token_endpoint_auth_method: "client_secret_basic",
        grant_types: ["refresh_token", "authorization_code"],
        response_types: ["code"],
        client_name: "Pelican Web Client",
        scope: "openid storage.create:/ storage.modify:/ storage.read:/",
    };

    return await registerClient(issuerConfiguration.registration_endpoint, dynamicClientPayload);
};

export default fetchDynamicClient;
