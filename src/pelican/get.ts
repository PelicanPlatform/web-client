import {getObjectToken, parseObjectUrl, UnauthorizedError } from "./index";
import {Federation, Namespace} from "../types";
import UnauthenticatedError from "./UnauthenticatedError";

/**
 * Get an object from a pelican federation
 * @param objectUrl pelican://<federation-hostname>/<object-path>
 * @param federation Federation to get the object from
 * @param namespace Namespace to get the object from
 */
const get = async (objectUrl: string, federation: Federation, namespace: Namespace) : Promise<Response> => {

	const {objectPath} = parseObjectUrl(objectUrl)
	const token = await getObjectToken(namespace)

	const objectHttpUrl = new URL(`${federation.configuration.director_endpoint}${objectPath}`)
	const response = await fetch(objectHttpUrl, {
		headers: {
			"Authorization": `Bearer ${token?.value}`
		}
	})

	if(response.status === 200){
		return response
	} else if(response.status === 403 && !token) {
		throw new UnauthenticatedError("Access token required to access the object")
	} else if(response.status === 403){
		throw new UnauthorizedError("Provided token does not have access to the object")
	} else {
		throw new Error(`Could not get object: ${response.status} ${response.statusText}`)
	}
}

export default get;
