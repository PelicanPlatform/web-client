/**
 * Parse an object url and extract its federation hostname and object path
 * @param objectUrl URL in the form pelican://(federation_hostname)/(object_path)
 */
function parsePelicanObjectUrl(objectUrl: string): {federationHostname: string, objectPath: string} {
	const federationHostnameRegex = objectUrl.match(/pelican:\/\/([^\/]+).*/)
	const objectPathRegex = objectUrl.match(/pelican:\/\/[^\/]+(.*)/)

	// Check that this is a valid pelican url
	if(federationHostnameRegex === null || objectPathRegex === null || federationHostnameRegex.length != 2 || objectPathRegex.length != 2){
		throw new Error(`Invalid pelican object url: ${objectUrl}`)
	}

	return {
		federationHostname: federationHostnameRegex[1],
		objectPath: objectPathRegex[1]
	}
}

export default parsePelicanObjectUrl;
