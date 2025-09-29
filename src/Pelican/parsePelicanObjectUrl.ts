/**
 * Parse an object url and extract its federation hostname and object path
 * @param objectUrl URL in the form pelican://(federation_hostname)/(object_path)
 */
function parsePelicanObjectUrl(objectUrl: string): {federationHostname: string, objectPath: string, objectPrefix: string} {
	const federationHostnameRegex = objectUrl.match(/pelican:\/\/([^\/]+).*/)
	const objectPathRegex = objectUrl.match(/pelican:\/\/[^\/]+(.*)/)

	// Check that this is a valid pelican url
	if(federationHostnameRegex === null || objectPathRegex === null || federationHostnameRegex.length != 2 || objectPathRegex.length != 2){
		throw new Error(`Invalid pelican object url: ${objectUrl}`)
	}

	const objectPath = objectPathRegex[1]

	// Pull out the directory path
	const objectPrefix = objectPath.split('/').slice(0, -1).join('/')

	return {
		federationHostname: federationHostnameRegex[1],
		objectPath,
		objectPrefix
	}
}

export default parsePelicanObjectUrl;
