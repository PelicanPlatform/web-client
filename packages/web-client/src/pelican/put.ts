import { getObjectToken, parseObjectUrl } from "./index";
import { UnauthorizedError, UnauthenticatedError } from "../errors";
import { Federation, Namespace } from "../types";
import { AUTH_REQUIRED_HEADER, NAMESPACE_HEADER, namespaceKey } from "../serviceWorker";

const put = async (objectUrl: string, file: File, federation: Federation, namespace: Namespace): Promise<Response> => {
    const { objectPath } = parseObjectUrl(objectUrl);
    const token = getObjectToken(namespace);
    const objectHttpUrl = new URL(`${federation.configuration.director_endpoint}${objectPath}`);

    // Tag with the namespace so the service worker injects the in-memory access token.
    const headers = new Headers();
    headers.set("Content-Length", String(file.size));
    if (token) {
        headers.set(NAMESPACE_HEADER, namespaceKey(federation.hostname, namespace.prefix));
    }
    const response = await fetch(objectHttpUrl, {
        method: "PUT",
        headers,
        body: file
    });

    if (response.status === 201 || response.status === 200) {
        return response;
    } else if (response.status === 401 && response.headers.get(AUTH_REQUIRED_HEADER) === "true") {
        throw new UnauthenticatedError("Access token required to access the object");
    } else if (response.status === 403 && !token) {
        throw new UnauthenticatedError("Access token required to access the object");
    } else if (response.status === 403) {
        throw new UnauthorizedError("Provided token does not have access to the object");
    } else {
        throw new Error(`Could not put object: ${response.status} ${response.statusText}`);
    }
};

export default put;
