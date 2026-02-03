import { Namespace, Token } from "../types";
import verifyToken from "./verifyToken";

/**
 * Get the best fit token for the given object path and federation or undefined if none are readily available
 *
 * @param namespace Federation hosting the requested object
 */
const getObjectToken = (namespace: Namespace): Token | undefined => {
    // Check if we have a token for this namespace and that it is not expired
    if (!verifyToken(namespace?.token)) {
        return undefined;
    }

    // Return the token from the best matching namespace or undefined if none matched
    return namespace.token;
};

export default getObjectToken;
