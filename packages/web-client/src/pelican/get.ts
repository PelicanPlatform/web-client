import { parseObjectUrl, resolveDataUrl } from "./index";
import { buildAuthHeaders, assertAuthorized } from "./authorization";
import { Federation, Namespace } from "../types";

/**
 * Get an object from a pelican federation
 * @param objectUrl pelican://<federation-hostname>/<object-path>
 * @param federation Federation to get the object from
 * @param namespace Namespace to get the object from
 */
const get = async (objectUrl: string, federation: Federation, namespace: Namespace): Promise<Response> => {
    const { objectPath } = parseObjectUrl(objectUrl);

    // Resolve the director redirect to a concrete endpoint, then request it directly so the
    // cross-origin redirect (which strips Authorization) is never involved.
    const cacheUrl = await resolveDataUrl(federation, objectPath, "GET");

    const { headers, token } = await buildAuthHeaders(federation, namespace);
    const response = await fetch(cacheUrl, { headers });

    if (response.status === 200) {
        return response;
    }
    assertAuthorized(response, token);
    throw new Error(`Could not get object: ${response.status} ${response.statusText}`);
};

export default get;
