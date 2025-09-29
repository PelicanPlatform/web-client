import {AuthorizationClient, OidcConfiguration, TokenSuccessResponse, DynamicClientPayload} from "./types";

export function generateCodeVerifier() {
	let array = new Uint32Array(56 / 2);
	window.crypto.getRandomValues(array);
	return Array.from(array, dec2hex).join("");
}

export async function generateCodeChallengeFromVerifier(v: string) {
	let hashed = await sha256(v);
	let base64encoded = base64urlencode(hashed);
	return base64encoded;
}

async function sha256(plain: string) {
	const encoder = new TextEncoder();
	const data = encoder.encode(plain);
	return window.crypto.subtle.digest("SHA-256", data);
}

function base64urlencode(a: ArrayBuffer) {
	let str = "";
	let bytes = new Uint8Array(a);
	let len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		str += String.fromCharCode(bytes[i]);
	}
	return btoa(str)
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
}

function dec2hex(dec: number) {
	return ("0" + dec.toString(16)).substr(-2);
}

export function getAuthorizationCode() {
	let url = new URL(window.location.href)
	return url.searchParams.get("code") || url.searchParams.get("CODE")
}

export function parseJWT(token: string): any {
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

export async function getToken(oidcConfiguration: OidcConfiguration, codeVerifier: string, clientId: string, clientSecret: string, authCode: string) {

	const postUrl = oidcConfiguration.token_endpoint;

	const params = new URLSearchParams();
	params.append("grant_type", "authorization_code");
	params.append("code", authCode);
	params.append("redirect_uri", "http://localhost:3000");
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

/**
 * Register a client dynamically at the OIDC provider
 * @param registrationEndpoint The registration endpoint of the OIDC provider
 * @param dynamicClientPayload The dynamic client registration request payload
 */
export async function registerClient(registrationEndpoint: string, dynamicClientPayload: DynamicClientPayload): Promise<AuthorizationClient> {

	const response = await fetch(registrationEndpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify(dynamicClientPayload)
	})

	if(response.status === 201){
		const {client_id, client_secret, ..._} = await response.json()
		return {
			clientId: client_id,
			clientSecret: client_secret
		}
	}

	throw new Error("Was not able to register client at " + registrationEndpoint)
}