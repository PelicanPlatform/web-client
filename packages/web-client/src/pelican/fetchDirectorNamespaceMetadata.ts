import { parseRecordHeader } from "../util";
import { DirectorNamespaceMetadata, Federation } from "../types";

/**
 * Fetch metadata for a namespace from the director endpoint
 * @param objectPath
 * @param federation
 */
async function fetchDirectorNamespaceMetadata(
    objectPath: string,
    federation: Federation
): Promise<DirectorNamespaceMetadata> {
    // Construct the request URL asking to not be redirected to the object endpoint so we can read the metadata headers
    const httpEndpoint = new URL(`${federation.configuration.director_endpoint}${objectPath}`);
    httpEndpoint.searchParams.append("redirect", "false");

    // Extract metadata from the director response headers
    const response = await fetch(httpEndpoint, { method: "HEAD" });
    if (response.status === 200) {
        return transformNoRedirectResponseToPathMetadata(response);
    }

    throw new Error("Director endpoint returned ${response.status}: ${httpEndpoint}");
}

/**
 * Transform a director no redirect response into a PathMetadata object
 */
const transformNoRedirectResponseToPathMetadata = (response: Response): DirectorNamespaceMetadata => {
    try {
        // TODO: Check for a X-Collections-Header
        const { issuer: authIssuer } = parseRecordHeader(response.headers.get("X-Pelican-Authorization"));
        const { namespace, requireToken, collectionUrl } = parseRecordHeader(
            response.headers.get("X-Pelican-Namespace")
        );
        const { issuer, maxScopeDepth, strategy, basePath } = parseRecordHeader(
            response.headers.get("X-Pelican-Token-Generation")
        );

        return {
            issuer: authIssuer,
            namespace: {
                namespace,
                requireToken: requireToken === "true",
                collectionUrl,
            },
            tokenGeneration: {
                issuer,
                maxScopeDepth: parseInt(maxScopeDepth),
                strategy,
                basePath,
            },
        };
    } catch (e) {
        throw new Error(`Director endpoint did not return expected headers: ${response.headers}`);
    }
};

export default fetchDirectorNamespaceMetadata;
