import { generateCodeChallengeFromVerifier } from "./";

/** Error thrown when silent auth can't complete without user interaction (or fails). */
export class SilentLoginError extends Error {
  constructor(public reason: string) {
    super(`Silent login failed: ${reason}`);
    this.name = "SilentLoginError";
  }
}

export interface SilentLoginParams {
  /** The issuer's authorization endpoint. */
  authorizationEndpoint: string;
  /** Public (PKCE) client id. */
  clientId: string;
  /** PKCE verifier — the same value must be used for the token exchange. */
  codeVerifier: string;
  /** Registered redirect URI; must match the one used in the token exchange. */
  redirectUri: string;
  scope?: string;
  /** Random CSRF value; generated if omitted. */
  state?: string;
  timeoutMs?: number;
}

export interface SilentLoginResult {
  code: string;
  state: string | null;
}

/**
 * Attempt a non-interactive ("silent") OAuth authorization-code request using `prompt=none`.
 *
 * This is only safe/reliable when the page and the issuer are the **same origin** (then the
 * issuer's session cookie is sent and the redirect target is readable). Rather than a hidden
 * iframe, it uses `fetch(..., { credentials: "include", redirect: "follow" })`: the browser
 * sends the issuer session cookie, follows the issuer's 302 to the (same-origin) redirect URI,
 * and exposes the final URL as `response.url` — from which we read `?code`/`?error`. Because
 * `fetch` never executes the redirect target's HTML/JS, the app does not boot a second time in
 * a hidden context and there's no competing code exchange.
 *
 * Resolves with the authorization `code` when the user already has an issuer session; throws a
 * {@link SilentLoginError} when interaction is required (`login_required`), on timeout, or on a
 * state mismatch — callers should fall back to the full-page redirect flow.
 */
export async function silentLogin(params: SilentLoginParams): Promise<SilentLoginResult> {
  if (typeof window === "undefined") throw new SilentLoginError("no_window");

  const state = params.state ?? crypto.randomUUID();
  const codeChallenge = await generateCodeChallengeFromVerifier(params.codeVerifier);

  const authorizationUrl = new URL(params.authorizationEndpoint);
  authorizationUrl.searchParams.set("client_id", params.clientId);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", params.scope ?? "storage.read:/ storage.create:/ storage.modify:/");
  authorizationUrl.searchParams.set("redirect_uri", params.redirectUri);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  authorizationUrl.searchParams.set("state", state);
  // Ask the issuer not to show any UI — only succeed if there's already a session.
  authorizationUrl.searchParams.set("prompt", "none");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 10000);

  let response: Response;
  try {
    response = await fetch(authorizationUrl.toString(), {
      method: "GET",
      credentials: "include",
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (e) {
    throw new SilentLoginError(controller.signal.aborted ? "timeout" : `network:${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }

  // After following the issuer's redirect, response.url is the (same-origin) redirect URI with
  // the OAuth params. If the issuer rendered something instead of redirecting (e.g. prompt=none
  // not honored), there will be no code and we treat it as interaction-required.
  let final: URL;
  try {
    final = new URL(response.url);
  } catch {
    throw new SilentLoginError("unreadable_response");
  }

  const error = final.searchParams.get("error");
  if (error) throw new SilentLoginError(error); // typically "login_required"

  const code = final.searchParams.get("code");
  if (!code) throw new SilentLoginError("login_required");

  const returnedState = final.searchParams.get("state");
  if (returnedState !== state) throw new SilentLoginError("state_mismatch");

  return { code, state: returnedState };
}

export default silentLogin;
