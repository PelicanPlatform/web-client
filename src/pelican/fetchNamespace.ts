import { Federation, Namespace } from "../types";
import { fetchDynamicClient, fetchNamespaceMetadata, fetchOpenIDConfiguration } from "./";

const fetchNamespace = async (objectPath: string, federation: Federation): Promise<Namespace> => {
    const namespaceMetadata = await fetchNamespaceMetadata(objectPath, federation);
    const issuerOidcConfiguration = await fetchOpenIDConfiguration(namespaceMetadata.issuer);
    const authorizationClient = await fetchDynamicClient(issuerOidcConfiguration);

    return {
        prefix: namespaceMetadata.namespace.namespace,
        token: undefined,
        clientId: authorizationClient.clientId,
        clientSecret: authorizationClient.clientSecret,
        oidcConfiguration: issuerOidcConfiguration,
    };
};

export default fetchNamespace;
