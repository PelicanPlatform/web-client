function parseOauthState(url: URL): Record<string, string> {
    const state = url.searchParams.get("state");

    if (state === null || state.trim() === "") {
        return {};
    }

    const stateParams = state.split(";").reduce(
        (acc, param) => {
            const [key, value] = param.split(":");
            acc[key] = value;
            return acc;
        },
        {} as Record<string, string>,
    );

    return stateParams;
}

export default parseOauthState;
