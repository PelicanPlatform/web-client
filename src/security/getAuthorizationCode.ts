export function getAuthorizationCode() {
	let url = new URL(window.location.href)
	return url.searchParams.get("code") || url.searchParams.get("CODE")
}

export default getAuthorizationCode;
