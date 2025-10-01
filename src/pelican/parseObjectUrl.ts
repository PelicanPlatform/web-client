/**
 * Parse an object url and extract its federation hostname and object path
 * @param objectUrl URL in the form pelican://(federation_hostname)/(object_path)
 * @returns An object with the federation hostname, object path and object prefix
 */
function parseObjectUrl(objectUrl: string): {federationHostname: string, objectPath: string, objectPrefix: string} {

	// Pulls information from the object URL using regex
	// e.g. pelican://example.com/namespace/myfolder/myobject.txt
	// federationHostnameRegex = ["pelican://example.com/namespace/myfolder/myobject.txt", "example.com"]
	// objectPathRegex = ["pelican://example.com/namespace/myfolder/myobject.txt", "/namespace/myfolder/myobject.txt"]
	// objectPrefixRegex = ["pelican://example.com/namespace/myfolder/myobject.txt", "example.com/namespace/myfolder"]
	const federationHostnameRegex = objectUrl.match(/pelican:\/\/([^\/]+).*/)
	const objectPathRegex = objectUrl.match(/pelican:\/\/[^\/]+(.*)/)
	const objectPrefixRegex = objectUrl.match(/pelican:\/\/(.*)\/(.*)/)

	// Check that this is a valid pelican url
	if(
		federationHostnameRegex === null || federationHostnameRegex.length != 2 ||
		objectPathRegex === null || objectPathRegex.length != 2 ||
	  objectPrefixRegex === null || objectPrefixRegex.length != 3
	){
		throw new Error(`Invalid pelican object url: ${objectUrl}`)
	}

	return {
		federationHostname: federationHostnameRegex[1],
		objectPath: objectPathRegex[1],
		objectPrefix: objectPrefixRegex[1]
	}
}

export default parseObjectUrl;
