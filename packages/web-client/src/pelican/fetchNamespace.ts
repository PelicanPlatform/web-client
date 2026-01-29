import { Federation, Namespace } from "../types";
import { fetchDynamicClient, fetchNamespaceMetadata, fetchOpenIDConfiguration } from "./";

const fetchNamespace = async (objectPath: string, federation: Federation): Promise<Namespace | null> => {

    const namespace: Partial<Namespace> = {}

    try {
        // Fetch the information from the director
        const namespaceMetadata = await fetchNamespaceMetadata(objectPath, federation);
        namespace['prefix'] = namespaceMetadata.namespace.namespace;

        // Fetch OIDC configuration
        const issuerOidcConfiguration = await fetchOpenIDConfiguration(namespaceMetadata.issuer);
        namespace['oidcConfiguration'] = issuerOidcConfiguration;

        // Register dynamic client
        const authorizationClient = await fetchDynamicClient(issuerOidcConfiguration);
        namespace['clientId'] = authorizationClient?.clientId;
        namespace['clientSecret'] = authorizationClient?.clientSecret;
    } catch {}

    // Check how complete the namespace information is
    if('prefix' in namespace) {
        return namespace as Namespace;
    }

    throw new Error("Was not able to fetch namespace information.");
};

export default fetchNamespace;
