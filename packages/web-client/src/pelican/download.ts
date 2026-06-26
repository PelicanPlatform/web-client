import { getObjectToken, parseObjectUrl } from "./index";
import { Federation, Namespace } from "../types";
import { UnauthenticatedError, UnauthorizedError } from "../errors";
import { NAMESPACE_HEADER, namespaceKey, pelicanFetchAndSave } from "../serviceWorker";

/**
 * Get an object from a pelican federation
 * @param objectUrl pelican://<federation-hostname>/<object-path>
 * @param federation Federation to get the object from
 * @param namespace Namespace to get the object from
 */
const download = async (objectUrl: string, federation: Federation, namespace: Namespace): Promise<Response | void> => {
  const { objectPath } = parseObjectUrl(objectUrl);

  // Tag with the namespace so the service worker injects the in-memory access token
  // on its range requests. The raw token never lives on the page.
  const token = getObjectToken(namespace);
  const headers = new Headers()
  if (token) {
    headers.set(NAMESPACE_HEADER, namespaceKey(federation.hostname, namespace.prefix));
  }

  const objectHttpUrl = new URL(`${federation.configuration.director_endpoint}${objectPath}`);

  // Use the Pelican service worker (parallel range requests, OPFS-backed, streams
  // directly to disk) when it is available, otherwise fall back to a plain fetch.
  if (typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
    const parts = objectPath.split("/");
    const filename = (parts[parts.length - 1] ?? "object").split("?")[0] ?? "object";
    return pelicanFetchAndSave(objectHttpUrl.toString(), filename, { headers });
  }

  // Fallback to a normal fetch when no service worker is available
  const response = await fetch(objectHttpUrl.toString(), { headers });

  if (response.status === 200) {
    return response;
  } else if (response.status === 403 && !token) {
    throw new UnauthenticatedError("Access token required to access the object");
  } else if (response.status === 403) {
    throw new UnauthorizedError("Provided token does not have access to the object");
  } else {
    throw new Error(`Could not get object: ${response.status} ${response.statusText}`);
  }
};

export default download;
