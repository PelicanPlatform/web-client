import { AuthorizationClient, DynamicClientPayload } from "../types";

/**
 * Register a client dynamically at the OIDC provider
 * @param registrationEndpoint The registration endpoint of the OIDC provider
 * @param dynamicClientPayload The dynamic client registration request payload
 */
export async function registerClient(
    registrationEndpoint: string,
    dynamicClientPayload: DynamicClientPayload
): Promise<AuthorizationClient | null> {
    if (!registrationEndpoint) {
        throw new Error("No registration endpoint provided for dynamic client registration.");
    }

    const response = await fetch(registrationEndpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(dynamicClientPayload),
    });

    if (response.status === 201) {
        const { client_id, client_secret } = await response.json();
        return {
            clientId: client_id,
            clientSecret: client_secret,
        };
    }

    throw new Error("Was not able to register client at " + registrationEndpoint);
}

export default registerClient;
