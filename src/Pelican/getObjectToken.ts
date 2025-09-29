import {Federation, Namespace} from "../types";

/**
 * Get the best fit token for the given object path and federation or undefined if none are readily available
 *
 * @param objectPath Object path - pelican://<federation-hostname>/<object-path>
 * @param federation Federation hosting the requested object
 */
const getObjectToken = async (objectPath: string, federation: Federation) : Promise<string | undefined> => {

	const matchingNamespaces: Namespace[] = Object.values(federation.namespaces)
		// Only keep namespaces that match the object path
		.filter(namespace => objectPath.startsWith(namespace.prefix))
		// Only keep namespaces that have a token
		.filter(namespace => namespace.token !== undefined)
		// Only keep namespaces that haven't expired
		.filter(namespace => !namespaceTokenIsExpired(namespace))
		// Only keep tokens that haven't expired
		// Sort by best match
		.sort((a, b) => {
			return namespaceFitnessScore(a.prefix, objectPath) - namespaceFitnessScore(b.prefix, objectPath)
		})

	// Return the token from the best matching namespace or undefined if none matched
	return matchingNamespaces?.[0]?.token?.accessToken.value
}

/** Compare a path to a namespace, determining the fitness by the number of starting characters in common */
function namespaceFitnessScore(namespace: string, path: string) {
	let i = 0
	while(i < namespace.length && i < path.length && namespace[i] === path[i]){
		i++
	}
	return i
}

function namespaceTokenIsExpired(namespace: Namespace) {
	if(!namespace.token){
		return true
	}
	const now = Math.floor(Date.now() / 1000)
	return namespace.token.expiration <= now
}

export default getObjectToken;
