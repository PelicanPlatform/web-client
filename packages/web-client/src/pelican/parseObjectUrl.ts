import {UrlType} from "../types";

/**
 * Parse an object url and extract its federation hostname and object path
 * @param objectUrl URL in the form pelican://(federation_hostname)/(object_path)
 * @param urlType Optional parameter to specify if the URL is for a collection or an object. If "collection", the collection path will be returned as the object path. If "object", the collection path will be returned as the path up to the last slash in the object path.
 * @returns An object with the federation hostname, object path and object prefix
 */
function parseObjectUrl(objectUrl: string, urlType?: UrlType): { federationHostname: string; objectPath: string; collectionPath?: string } {
    // Pulls information from the object URL using regex
    // e.g. pelican://example.com/namespace/myfolder/myobject.txt
    // federationHostnameRegex = ["pelican://example.com/namespace/myfolder/myobject.txt", "example.com"]
    // objectPathRegex = ["pelican://example.com/namespace/myfolder/myobject.txt", "/namespace/myfolder/myobject.txt"]
    // objectPrefixRegex = ["pelican://example.com/namespace/myfolder/myobject.txt", "example.com/namespace/myfolder"]
    const federationHostnameRegex = objectUrl.match(/pelican:\/\/([^\/]+).*/);
    const objectPathRegex = objectUrl.match(/pelican:\/\/[^\/]+(.*)/);

    // Check that this is a valid pelican url
    if (
        federationHostnameRegex === null ||
        federationHostnameRegex.length != 2 ||
        objectPathRegex === null ||
        objectPathRegex.length != 2
    ) {
        throw new Error(`Invalid pelican object url: ${objectUrl}`);
    }

    const federationHostname = federationHostnameRegex[1]
    const objectPath = objectPathRegex[1];
    const collectionPath = urlType === "collection" ? objectPath
        : urlType === "object" ? objectPath.substring(0, objectPath.lastIndexOf("/")) || undefined
        : undefined;

    return {
        federationHostname,
        objectPath,
        collectionPath
    };
}

export default parseObjectUrl;
