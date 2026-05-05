function parseOauthState(url: URL): Record<string, string> {
    const state = url.searchParams.get("state");

    if (state === null || state.trim() === "") {
        return {};
    }

    const stateParams = state.split(";").reduce((acc, param) => {
        const colonIndex = param.indexOf(":");
        if (colonIndex === -1) return acc;
        const key = param.slice(0, colonIndex);
        const value = param.slice(colonIndex + 1);
        acc[key] = value;
        return acc;
    }, {} as Record<string, string>);

    return stateParams;
}

export default parseOauthState;
