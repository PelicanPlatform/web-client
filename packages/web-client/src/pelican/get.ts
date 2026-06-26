import { getObjectToken, parseObjectUrl } from "./index";
import { UnauthorizedError, UnauthenticatedError } from "../errors";
import { Federation, Namespace } from "../types";
import { AUTH_REQUIRED_HEADER, NAMESPACE_HEADER, namespaceKey } from "../serviceWorker";

/**
 * Get an object from a pelican federation
 * @param objectUrl pelican://<federation-hostname>/<object-path>
 * @param federation Federation to get the object from
 * @param namespace Namespace to get the object from
 */
const get = async (objectUrl: string, federation: Federation, namespace: Namespace): Promise<Response> => {
    const { objectPath } = parseObjectUrl(objectUrl);

    // Tag the request with the namespace so the service worker injects the in-memory
    // access token. The raw token never lives on the page. Only tag when we believe we
    // hold a token (non-secret claims present); otherwise let it through unauthenticated.
    const token = getObjectToken(namespace);
    const headers = new Headers()
    if (token) {
        headers.set(NAMESPACE_HEADER, namespaceKey(federation.hostname, namespace.prefix));
    }

    const objectHttpUrl = new URL(`${federation.configuration.director_endpoint}${objectPath}`);
    const response = await fetch(objectHttpUrl, { headers });

    if (response.status === 200) {
        return response;
    } else if (response.status === 401 && response.headers.get(AUTH_REQUIRED_HEADER) === "true") {
        // SW holds no usable token (e.g. it was terminated) — re-authentication required.
        throw new UnauthenticatedError("Access token required to access the object");
    } else if (response.status === 403 && !token) {
        throw new UnauthenticatedError("Access token required to access the object");
    } else if (response.status === 403) {
        throw new UnauthorizedError("Provided token does not have access to the object");
    } else {
        throw new Error(`Could not get object: ${response.status} ${response.statusText}`);
    }
};

export default get;
