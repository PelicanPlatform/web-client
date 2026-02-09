import { useEffect } from "react";
import { generateCodeVerifier } from "@pelicanplatform/web-client";
import { useSessionStorage } from "./useSessionStorage";

/**
 * Hook to manage OAuth PKCE code verifier generation and persistence.
 *
 * The code verifier is automatically generated on first use and persisted
 * in session storage for the duration of the OAuth flow.
 *
 * @returns {[string | null, () => string]} A tuple containing the current code verifier
 * and a function to ensure a code verifier exists (generating one if needed)
 */
export function useCodeVerifier(): [string | null, () => string] {
    const [codeVerifier, setCodeVerifier] = useSessionStorage<string | null>(
      "pelican-wc-cv",
      null
    );

    // Auto-generate on mount if missing
    useEffect(() => {
        if (!codeVerifier) {
            const cv = generateCodeVerifier();
            setCodeVerifier(cv);
        }
    }, [codeVerifier, setCodeVerifier]);

    /**
     * Ensures a code verifier exists, generating one if needed.
     * Returns the current or newly generated code verifier.
     */
    const ensureCodeVerifier = (): string => {
        if (codeVerifier) {
            return codeVerifier;
        }

        const cv = generateCodeVerifier();
        setCodeVerifier(cv);
        return cv;
    };

    return [codeVerifier, ensureCodeVerifier];
}

export default useCodeVerifier;
