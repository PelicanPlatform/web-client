import { parseOauthState } from "../util";

export function getAuthorizationCode() {
    let url = new URL(window.location.href);
    const code = url.searchParams.get("code") || url.searchParams.get("CODE");
    const { federation: federationHostname, namespace: namespacePrefix } = parseOauthState(
        new URL(window.location.href)
    );

    // Clean up the window
    window.history.replaceState({}, document.title, window.location.pathname);

    return {
        federationHostname,
        namespacePrefix,
        code,
    };
}

export default getAuthorizationCode;
