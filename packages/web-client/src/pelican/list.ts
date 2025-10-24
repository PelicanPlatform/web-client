import { Federation, Namespace, ObjectList } from "../types";
import { getObjectToken, parseObjectUrl, UnauthorizedError } from "./";
import { parseWebDavXmlToJson } from "../util";
import UnauthenticatedError from "./UnauthenticatedError";

const list = async (collectionUrl: string, federation: Federation, namespace?: Namespace): Promise<ObjectList[]> => {
    const { objectPath } = parseObjectUrl(collectionUrl);
    const token = namespace ? await getObjectToken(namespace) : null;

    const objectHttpUrl = new URL(`${federation.configuration.director_endpoint}${objectPath}`);

    const response = await fetch(objectHttpUrl, {
        method: "PROPFIND",
        headers: {
            Authorization: `Bearer ${token?.value}`,
            Depth: "1",
        },
    });

    if (response.status === 200 || response.status === 207) {
        return parseWebDavXmlToJson(await response.text());
    } else if (response.status === 403 && !token) {
        throw new UnauthenticatedError("Access token required to access the object");
    } else if (response.status === 403) {
        throw new UnauthorizedError("Provided token does not have access to the object");
    } else {
        throw new Error(`Could not get object: ${response.status} ${response.statusText}`);
    }
};

export default list;
