import { generateCodeChallengeFromVerifier } from "./";
import { Federation, Namespace } from "../types";

/**
 * Start the OIDC authorization code flow to get a token for a namespace
 * @param codeVerifier
 * @param namespace
 * @param federation
 */
const startAuthorizationCodeFlow = async (
    codeVerifier: string,
    namespace: Namespace,
    federation: Federation,
    state: Record<string, string> = {}
) => {
    if (!namespace.clientId || !namespace.oidcConfiguration.authorization_endpoint) {
        throw new Error("Namespace is missing required OIDC configuration for authorization code flow.");
    }

    // Build the Oauth URL
    const codeChallenge = await generateCodeChallengeFromVerifier(codeVerifier);
    const authorizationUrl = new URL(namespace.oidcConfiguration.authorization_endpoint);
    const stateString = [
        `namespace:${namespace.prefix}`,
        `federation:${federation.hostname}`,
        ...Object.entries(state).map(([key, value]) => `${key}:${value}`),
    ].join(";");
    authorizationUrl.searchParams.append("client_id", namespace.clientId);
    authorizationUrl.searchParams.append("response_type", "code");
    authorizationUrl.searchParams.append("scope", `storage.read:/ storage.create:/`);
    authorizationUrl.searchParams.append("redirect_uri", window.location.href);
    authorizationUrl.searchParams.append("code_challenge", codeChallenge);
    authorizationUrl.searchParams.append("code_challenge_method", "S256");
    authorizationUrl.searchParams.append("state", stateString);
    authorizationUrl.searchParams.append("action", "");

    // Begin the authorization code flow to get a token
    window.location.href = authorizationUrl.toString();
};

export default startAuthorizationCodeFlow;
