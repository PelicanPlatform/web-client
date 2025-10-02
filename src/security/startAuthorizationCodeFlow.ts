import {generateCodeChallengeFromVerifier} from "./";
import {Federation, Namespace} from "../types";

/**
 * Start the OIDC authorization code flow to get a token for a namespace
 * @param codeVerifier
 * @param namespace
 * @param federation
 */
const startAuthorizationCodeFlow = async (codeVerifier: string, namespace: Namespace, federation: Federation) => {

	// Build the Oauth URL
	const codeChallenge = await generateCodeChallengeFromVerifier(codeVerifier)
	const authorizationUrl = new URL(namespace.oidcConfiguration.authorization_endpoint)
	authorizationUrl.searchParams.append("client_id", namespace.clientId)
	authorizationUrl.searchParams.append("response_type", "code")
	authorizationUrl.searchParams.append("scope", `storage.read:/cannon.lock storage.create:/cannon.lock`) // TODO: Don't hardcode scopes
	authorizationUrl.searchParams.append("redirect_uri", window.location.href)
	authorizationUrl.searchParams.append("code_challenge", codeChallenge)
	authorizationUrl.searchParams.append("code_challenge_method", "S256")
	authorizationUrl.searchParams.append("state", `namespace:${namespace.prefix};federation:${federation.hostname}`)
	authorizationUrl.searchParams.append("action", "")

	// Begin the authorization code flow to get a token
	window.location.href = authorizationUrl.toString()
}

export default startAuthorizationCodeFlow;
