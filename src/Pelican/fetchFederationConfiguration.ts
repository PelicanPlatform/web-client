import {FederationConfiguration} from "../types";

const registerFederation = async (federationHostname: string) => {

	// Load in the federation configuration and save to the session
	const configurationEndpoint = `https://${federationHostname}/.well-known/pelican-configuration`
	const res = await fetch(configurationEndpoint)
	if(res.status !== 200){
		throw new Error(`Metadata endpoint returned ${res.status}: ` + configurationEndpoint)
	}
	const federationConfiguration = await res.json() as FederationConfiguration
	const federation = {
		hostname: federationHostname,
		configuration: federationConfiguration,
		namespaces: {}
	}

	return federation
}

export default registerFederation;
