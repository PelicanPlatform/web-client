function generateCodeVerifier() {
	let array = new Uint32Array(56 / 2);
	window.crypto.getRandomValues(array);
	return Array.from(array, dec2hex).join("");
}

function dec2hex(dec: number) {
	return ("0" + dec.toString(16)).substr(-2);
}

export default generateCodeVerifier;
