
import { parseRecordHeader } from "./util";

import {DirectorNamespaceMetadata, Federation} from "./types";

/**
 * Parse an object url and extract its federation hostname and object path
 * @param objectUrl URL in the form pelican://(federation_hostname)/(object_path)
 */
export function parsePelicanObjectUrl(objectUrl: string): {federationHostname: string, objectPath: string} {
	const federationHostnameRegex = objectUrl.match(/pelican:\/\/([^\/]+).*/)
	const objectPathRegex = objectUrl.match(/pelican:\/\/[^\/]+(.*)/)

	// Check that this is a valid pelican url
	if(federationHostnameRegex === null || objectPathRegex === null || federationHostnameRegex.length != 2 || objectPathRegex.length != 2){
		throw new Error(`Invalid pelican object url: ${objectUrl}`)
	}

	return {
		federationHostname: federationHostnameRegex[1],
		objectPath: objectPathRegex[1]
	}
}

/** Compare a path to a namespace, determining the fitness by the number of starting characters in common */
export function namespaceFitness(namespace: string, path: string) {
	let i = 0
	while(i < namespace.length && i < path.length && namespace[i] === path[i]){
		i++
	}
	return i
}

/**
 * Fetch metadata for a object
 * @param objectPath
 * @param federation
 */
export async function getPathMetadataFromDirector(objectPath: string, federation: Federation) : Promise<DirectorNamespaceMetadata> {

	// Construct the request URL asking to not be redirected to the object endpoint so we can read the metadata headers
	const httpEndpoint = new URL(`${federation.configuration.director_endpoint}${objectPath}`)
	httpEndpoint.searchParams.append("redirect", "false")

	// Extract metadata from the director response headers
	const response = await fetch(httpEndpoint, {method: "HEAD"})
	if(response.status === 200){
		return transformNoRedirectResponseToPathMetadata(response)
	}

	throw new Error("Director endpoint returned ${response.status}: ${httpEndpoint}")
}

/**
 * Transform a director no redirect response into a PathMetadata object
 */
export const transformNoRedirectResponseToPathMetadata = (response: Response) : DirectorNamespaceMetadata => {
	try {
		// TODO: Check for a X-Collections-Header
		const {issuer: authIssuer} = parseRecordHeader(response.headers.get('X-Pelican-Authorization'))
		const {namespace, requireToken, collectionUrl} = parseRecordHeader(response.headers.get('X-Pelican-Namespace'))
		const {issuer, maxScopeDepth, strategy, basePath} = parseRecordHeader(response.headers.get('X-Pelican-Token-Generation'))

		return {
			issuer: authIssuer,
			namespace: {
				namespace,
				requireToken: requireToken === "true",
				collectionUrl
			},
			tokenGeneration: {
				issuer,
				maxScopeDepth: parseInt(maxScopeDepth),
				strategy,
				basePath
			}
		}
	} catch (e) {
		throw new Error(`Director endpoint did not return expected headers: ${response.headers}`)
	}

}

/** Fetch the issuer's OIDC configuration from the well-known endpoint */
export async function fetchIssuerConfiguration(issuer: string) : Promise<any> {
	const response = await fetch(`${issuer}/.well-known/openid-configuration`)
	if(response.status === 200){
		return await response.json()
	}
	throw new Error(`Issuer endpoint returned ${response.status}: ${issuer}/.well-known/openid-configuration`)
}
