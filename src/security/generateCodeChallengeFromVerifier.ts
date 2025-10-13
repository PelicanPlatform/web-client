async function generateCodeChallengeFromVerifier(v: string) {
    let hashed = await sha256(v);
    let base64encoded = base64urlencode(hashed);
    return base64encoded;
}

function base64urlencode(a: ArrayBuffer) {
    let str = "";
    let bytes = new Uint8Array(a);
    let len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        str += String.fromCharCode(bytes[i]);
    }
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(plain: string) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return window.crypto.subtle.digest("SHA-256", data);
}

export default generateCodeChallengeFromVerifier;
