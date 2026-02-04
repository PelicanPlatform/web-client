import { useEffect, useState } from "react";
import {
    getAuthorizationCode,
    getToken,
    Namespace,
    Token
} from "@pelicanplatform/web-client";

export interface AuthExchangeResult {
    federationHostname: string;
    namespacePrefix: string;
    token: Token;
}

export interface UseAuthExchangeOptions {
    /** Whether authentication is enabled */
    enabled: boolean;
    /** The PKCE code verifier for the OAuth flow */
    codeVerifier: string | null;
    /** Callback invoked when a token is successfully obtained */
    onTokenReceived?: (result: AuthExchangeResult) => void;
    /** Function to get namespace metadata by federation hostname and prefix */
    getNamespace: (federationHostname: string, namespacePrefix: string) => Namespace | undefined;
}

export interface UseAuthExchangeReturn {
    /** Whether the auth code exchange is ongoing */
    loading: boolean;
    /** Error message if exchange failed */
    error: string | null;
}

/**
 * Hook to manage OAuth authorization code exchange flow.
 *
 * On mount, checks URL params for an authorization code and exchanges it
 * for an access token using the PKCE code verifier. The token is returned
 * via the onTokenReceived callback for storage in the parent component.
 *
 * This hook is designed to run once per page load and handles:
 * - Parsing authorization code from URL params
 * - Validating required OAuth credentials exist
 * - Exchanging code for token
 * - Cleaning up URL params
 *
 * @param options Configuration options for the auth exchange
 * @returns Status of the exchange process
 */
export function useAuthExchange({
    enabled,
    codeVerifier,
    onTokenReceived,
    getNamespace
}: UseAuthExchangeOptions): UseAuthExchangeReturn {
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        async function exchange() {
            const { federationHostname, namespacePrefix, code } = getAuthorizationCode();

            try {
                // Check if we have an authorization code to exchange
                if (!code || !federationHostname || !namespacePrefix || !codeVerifier) {
                    // No code to exchange - this is normal for non-redirect page loads
                    setLoading(false);
                    return;
                }

                setLoading(true);

                // Get namespace metadata (includes OAuth client credentials)
                const namespace = getNamespace(federationHostname, namespacePrefix);

                if (!namespace) {
                    const errorMsg = `Cannot exchange code: namespace metadata not found for ${namespacePrefix}`;
                    console.error(errorMsg);
                    setError(errorMsg);
                    setLoading(false);
                    return;
                }

                if (!namespace.clientId || !namespace.clientSecret) {
                    const errorMsg = `Cannot exchange code: missing client credentials for namespace ${namespacePrefix}`;
                    console.error(errorMsg);
                    setError(errorMsg);
                    setLoading(false);
                    return;
                }

                if (!namespace.oidcConfiguration) {
                    const errorMsg = `Cannot exchange code: missing OIDC configuration for namespace ${namespacePrefix}`;
                    console.error(errorMsg);
                    setError(errorMsg);
                    setLoading(false);
                    return;
                }

                // Exchange authorization code for access token
                const tokenData = await getToken(
                    namespace.oidcConfiguration,
                    codeVerifier,
                    namespace.clientId,
                    namespace.clientSecret,
                    code
                );

                console.log("Obtained token via authorization code exchange:", tokenData);

                // Notify parent component of successful token acquisition
                if (onTokenReceived) {
                    onTokenReceived({
                        federationHostname,
                        namespacePrefix,
                        token: tokenData.accessToken,
                    });
                }

            } catch (e) {
                const errorMsg = `Error during authorization code exchange: ${e}`;
                console.error(errorMsg);
                setError(errorMsg);
            } finally {
                // Mark exchange as complete (whether successful or not)
                setLoading(false);
            }
        }

        exchange();
    }, [enabled, codeVerifier, getNamespace, onTokenReceived]);

    return {
        loading,
        error,
    };
}

export default useAuthExchange;
