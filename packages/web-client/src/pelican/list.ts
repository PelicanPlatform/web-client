import { Federation, Namespace, ObjectList } from "../types";
import { parseObjectUrl, resolveDataUrl } from "./";
import { buildAuthHeaders, assertAuthorized } from "./authorization";
import { parseWebDavXmlToJson } from "../util";

const list = async (collectionUrl: string, federation: Federation, namespace?: Namespace): Promise<ObjectList[]> => {
    const { objectPath } = parseObjectUrl(collectionUrl);

    // Resolve to the concrete origin/collections endpoint, then PROPFIND it directly — the
    // director's cross-origin redirect strips Authorization and Safari mishandles it for PROPFIND.
    const collectionEndpoint = await resolveDataUrl(federation, objectPath, "PROPFIND");

    const { headers, token } = await buildAuthHeaders(federation, namespace, { Depth: "1" });
    const response = await fetch(collectionEndpoint, { method: "PROPFIND", headers });

    if (response.status === 200 || response.status === 207) {
        return parseWebDavXmlToJson(await response.text());
    }
    assertAuthorized(response, token);
    if (response.status === 404) {
        // The collection doesn't exist yet (e.g. a path that was just created/navigated into but
        // has no objects). Treat it as an empty listing instead of surfacing an error.
        return [];
    }
    throw new Error(`Could not get object: ${response.status} ${response.statusText}`);
};

export default list;
