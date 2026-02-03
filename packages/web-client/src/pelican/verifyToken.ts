import {Token} from "../types";

function verifyToken(token: Token | undefined) {
  if (token === undefined) return false;
  if (token.exp === undefined) return true;
  const now = Math.floor(Date.now() / 1000);
  return token.exp >= now;
}

export default verifyToken;
