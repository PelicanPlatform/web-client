'use client';

import {registerClient} from "../security";
import {AuthorizationClient, OidcConfiguration} from "../types";

/**
 * Register a client via the dynamic client registration endpoint on the Origin's issuer
 * @param issuerConfiguration Issuer's OIDC configuration
 */
const fetchDynamicClient = async (issuerConfiguration: OidcConfiguration): Promise<AuthorizationClient> => {
	const dynamicClientPayload = {
		redirect_uris: [window.location.href],
		token_endpoint_auth_method: "client_secret_basic",
		grant_types: ["refresh_token", "authorization_code"],
		response_types: ["code"],
		client_name: "Pelican Web Client",
		scope: "openid storage.create:/ storage.modify:/ storage.read:/",
	}

	return await registerClient(issuerConfiguration.registration_endpoint, dynamicClientPayload)
}

export default fetchDynamicClient;
