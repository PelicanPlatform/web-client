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
const permissions = async (namespace: Namespace): Promise<TokenPermission[]> => {
    const token = getObjectToken(namespace);

    // Check what token permissions we have
    if (!token) return [];

    // Iterate scopes and return those that match the namespaceRelativePrefix
    return token.scope.split(" ").filter((scope) => scope.startsWith("storage.")) as TokenPermission[];
};

export default permissions;
