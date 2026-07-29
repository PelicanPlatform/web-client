import { parseObjectUrl, resolveDataUrl } from "./index";
import { buildAuthHeaders, assertAuthorized } from "./authorization";
import { Federation, Namespace } from "../types";

const put = async (objectUrl: string, file: File, federation: Federation, namespace: Namespace): Promise<Response> => {
    const { objectPath } = parseObjectUrl(objectUrl);

    // Resolve to the concrete origin write endpoint, then PUT directly (no auth-stripping redirect).
    const writeUrl = await resolveDataUrl(federation, objectPath, "PUT");

    const { headers, token } = await buildAuthHeaders(federation, namespace, { "Content-Length": String(file.size) });
    const response = await fetch(writeUrl, {
        method: "PUT",
        headers,
        body: file
    });

    if (response.status === 201 || response.status === 200) {
        return response;
    }
    assertAuthorized(response, token);
    throw new Error(`Could not put object: ${response.status} ${response.statusText}`);
};

export default put;
