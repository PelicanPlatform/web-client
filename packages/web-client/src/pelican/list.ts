import { Federation, Namespace, ObjectList } from "../types";
import { getObjectToken, parseObjectUrl } from "./";
import { UnauthorizedError, UnauthenticatedError } from "../errors";
import { parseWebDavXmlToJson } from "../util";
import { AUTH_REQUIRED_HEADER, NAMESPACE_HEADER, namespaceKey } from "../serviceWorker";

const list = async (collectionUrl: string, federation: Federation, namespace?: Namespace): Promise<ObjectList[]> => {
    const { objectPath } = parseObjectUrl(collectionUrl);
    const token = namespace ? getObjectToken(namespace) : null;

    const objectHttpUrl = new URL(`${federation.configuration.director_endpoint}${objectPath}`);

    // Tag with the namespace so the service worker injects the in-memory access token.
    const buildHeaders = () => {
      const headers = new Headers();
      headers.set("Depth", "1");
      if (token && namespace) {
        headers.set(NAMESPACE_HEADER, namespaceKey(federation.hostname, namespace.prefix));
      }
      return headers;
    };

    // Check and handle per browser

    let response: Response;

    // If Safari
    if (navigator.userAgent.includes("Safari")) {
      const partialResponse = await fetch(objectHttpUrl, {
        method: "PROPFIND",
        headers: buildHeaders(),
      });

      const partialUrl = partialResponse.url

      response = await fetch(partialUrl, {
        method: "PROPFIND",
        headers: buildHeaders(),
      });

    } else {
      response = await fetch(objectHttpUrl, {
        method: "PROPFIND",
        headers: buildHeaders(),
      });
    }

    if (response.status === 200 || response.status === 207) {
        return parseWebDavXmlToJson(await response.text());
    } else if (response.status === 401 && response.headers.get(AUTH_REQUIRED_HEADER) === "true") {
        throw new UnauthenticatedError("Access token required to access the object");
    } else if (response.status === 403 && !token) {
        throw new UnauthenticatedError("Access token required to access the object");
    } else if (response.status === 403) {
        throw new UnauthorizedError("Provided token does not have access to the object");
    } else if (response.status === 404) {
        // The collection doesn't exist yet (e.g. a path that was just created/navigated into but
        // has no objects). Treat it as an empty listing instead of surfacing an error.
        return [];
    } else {
        throw new Error(`Could not get object: ${response.status} ${response.statusText}`);
    }
};

export default list;
