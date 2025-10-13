import { getObjectToken } from "./index";
import { Namespace, TokenPermission } from "../types";
import { parseObjectUrl } from "../pelican";

/**
 * Reports the permissions associated with the objectUrl prefix
 *
 * For instance with the object url pelican://example.com/namespace/myfolder/myobject.txt
 * and token with scope "storage.read:/ storage.write:/myfolder"
 * the returned permissions would be {"storage.read": "/", "storage.write": "/myfolder"}
 *
 * @param objectUrl
 * @param namespace
 */
const permissions = async (objectUrl: string, namespace: Namespace): Promise<TokenPermission[]> => {
    const { federationHostname, objectPrefix } = parseObjectUrl(objectUrl);
    const token = await getObjectToken(namespace);

    // Pull out the federation and namespace paths that the token will be relative to
    // e.g. pelican://example.com/namespace/myfolder/test.txt -> /myfolder/
    // e.g. pelican://example.com/namespace/ -> /
    const namespaceRelativePrefix = objectUrl.replace(`pelican://${federationHostname}/${namespace.prefix}`, "");

    // Check what token permissions we have
    if (!token) return [];

    // Iterate scopes and return those that match the namespaceRelativePrefix
    return token.value
        .split(" ")
        .filter((scope) => scope.startsWith("storage."))
        .reduce((agg, scope) => {
            const [permission, path] = scope.split(":");
            if (namespaceRelativePrefix.startsWith(path)) return [...agg, permission as TokenPermission];
            return agg;
        }, [] as TokenPermission[]);
};

export default permissions;
