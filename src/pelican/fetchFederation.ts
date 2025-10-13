import { Federation, FederationConfiguration } from "../types";

const fetchFederation = async (federationHostname: string): Promise<Federation> => {
    const configurationEndpoint = `https://${federationHostname}/.well-known/pelican-configuration`;
    const res = await fetch(configurationEndpoint);
    if (res.status !== 200) {
        throw new Error(`Metadata endpoint returned ${res.status}: ` + configurationEndpoint);
    }
    const federationConfiguration = (await res.json()) as FederationConfiguration;
    return {
        hostname: federationHostname,
        configuration: federationConfiguration,
        namespaces: {},
    };
};

export default fetchFederation;
