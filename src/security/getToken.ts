import { OidcConfiguration, TokenSuccessResponse } from "../types";

async function getToken(oidcConfiguration: OidcConfiguration, codeVerifier: string, clientId: string, clientSecret: string, authCode: string) {

	const postUrl = oidcConfiguration.token_endpoint;

	const params = new URLSearchParams();
	params.append("grant_type", "authorization_code");
	params.append("code", authCode);
	params.append("redirect_uri", window.location.href);
	params.append("code_verifier", codeVerifier);
	params.append("client_id", clientId);
	params.append("client_secret", clientSecret);

	const response = await fetch(postUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded"
		},
		body: params.toString()
	})

	if (!response.ok) {
		throw new Error(`Failed to get token: ${response.statusText}`);
	}

	const {access_token, refresh_token, expires_in} = await response.json() as TokenSuccessResponse

	return {
		accessToken: {
			value: access_token,
			...parseJWT(access_token)
		},
		refreshToken: refresh_token,
		expiration: new Date(Date.now() + expires_in * 1000).getTime()
	}
}

function parseJWT(token: string): any {
	const parts = token.split(".");
	if (parts.length !== 3) {
		throw new Error("Invalid JWT token");
	}
	// JWT payload is the second part
	const payload = parts[1];
	// Pad base64 string if needed
	const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
	// Add padding if necessary
	const pad = base64.length % 4;
	const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
	try {
		const json = atob(padded);
		return JSON.parse(json);
	} catch (e) {
		throw new Error("Invalid JWT payload: " + e);
	}
}

export default getToken;
