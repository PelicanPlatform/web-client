import { parseOauthState } from "../util";

export function getAuthorizationCode() {
    let url = new URL(window.location.href);
    const code = url.searchParams.get("code") || url.searchParams.get("CODE");
    const parsedState = parseOauthState(new URL(window.location.href));
    const { federation: federationHostname, namespace: namespacePrefix, objectUrl } = parsedState;

    // Clean up only the OAuth params, preserving any other query params (e.g. ?url=)
    const cleanParams = new URLSearchParams(url.searchParams);
    cleanParams.delete("code");
    cleanParams.delete("CODE");
    cleanParams.delete("state");
    cleanParams.delete("iss");

    // Restore the objectUrl as ?url= if it was carried through the OIDC state
    if (objectUrl && !cleanParams.get("url")) {
        cleanParams.set("url", objectUrl);
    }

    const cleanSearch = cleanParams.toString();
    window.history.replaceState({}, document.title, window.location.pathname + (cleanSearch ? `?${cleanSearch}` : ""));

    return {
        federationHostname,
        namespacePrefix,
        code,
    };
}

export default getAuthorizationCode;
