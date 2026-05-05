import { getObjectToken, parseObjectUrl } from "./index";
import { UnauthorizedError, UnauthenticatedError } from "../errors";
import { Federation, Namespace } from "../types";

const put = async (objectUrl: string, file: File, federation: Federation, namespace: Namespace): Promise<Response> => {
    const { objectPath } = parseObjectUrl(objectUrl);
    const token = getObjectToken(namespace);
    const objectHttpUrl = new URL(`${federation.configuration.director_endpoint}${objectPath}`);

    const authHeaders = {
        Authorization: `Bearer ${token?.value}`,
    };
    const response = await fetch(objectHttpUrl, {
        method: "PUT",
        headers: {
            ...authHeaders,
            "Content-Length": String(file.size),
        },
        body: file
    });

    if (response.status === 201 || response.status === 200) {
        return response;
    } else if (response.status === 403 && !token) {
        throw new UnauthenticatedError("Access token required to access the object");
    } else if (response.status === 403) {
        throw new UnauthorizedError("Provided token does not have access to the object");
    } else {
        throw new Error(`Could not put object: ${response.status} ${response.statusText}`);
    }
};

export default put;
