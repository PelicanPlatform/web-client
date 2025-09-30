import {Namespace, Token} from "../types";

/**
 * Get the best fit token for the given object path and federation or undefined if none are readily available
 *
 * @param namespace Federation hosting the requested object
 */
const getObjectToken = async (namespace: Namespace) : Promise<Token | undefined> => {

	// Check if we have a token for this namespace and that it is not expired
	if(namespaceTokenIsExpired(namespace)){
		return undefined
	}

	// Return the token from the best matching namespace or undefined if none matched
	return namespace.token
}

function namespaceTokenIsExpired(namespace: Namespace) {
	if(!namespace.token){
		return true
	}
	const now = Math.floor(Date.now() / 1000)
	return namespace.token.exp <= now
}

export default getObjectToken;
