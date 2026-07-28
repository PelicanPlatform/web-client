import { test as base, expect, type Page } from "@playwright/test";

/** Resolved test configuration, sourced from e2e/.env (see .env.example). */
export const env = {
  external: !!process.env.E2E_EXTERNAL,
  token: process.env.E2E_TOKEN,
  federationHostname: process.env.E2E_FEDERATION_HOST || "osg-htc.org",
  directorEndpoint: process.env.E2E_DIRECTOR_ENDPOINT || "https://osdf-director.osg-htc.org",
  namespacePrefix: process.env.E2E_NAMESPACE_PREFIX || "/ospool/ap40",
  objectHref: process.env.E2E_OBJECT_HREF,
  testOrigin: !!process.env.E2E_TEST_ORIGIN,
};

interface SeedTokenOptions {
  /** Raw access-token JWT (its claims are decoded to populate scope/exp). */
  jwt: string;
  federationHostname?: string;
  directorEndpoint?: string;
  namespacePrefix?: string;
  /** Override the token expiry (seconds since epoch). Use to seed an already-expired token. */
  expOverride?: number;
}

/**
 * Seed the page-side auth state before the app boots.
 *
 * The app now holds the access token itself (in the `pelican-wc-federations`
 * sessionStorage store) and attaches `Authorization: Bearer` directly — so we can put
 * the app into an authenticated state by writing that store, instead of driving a real
 * OAuth login (which needs an interactive IdP session we can't automate).
 *
 * This is a functional seed, not a full metadata hydrate: it's enough for
 * `getObjectToken`/`verifyToken` to treat the namespace as authenticated and for
 * list/get/put to attach the token. Login-specific config (clientId/OIDC) is omitted.
 */
export async function seedToken(page: Page, opts: SeedTokenOptions): Promise<void> {
  const federationHostname = opts.federationHostname ?? env.federationHostname;
  const directorEndpoint = opts.directorEndpoint ?? env.directorEndpoint;
  const namespacePrefix = opts.namespacePrefix ?? env.namespacePrefix;

  await page.addInitScript(
    ({ jwt, host, director, prefix, expOverride }) => {
      const decode = (t: string) => {
        try {
          const b64 = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
          const pad = b64.length % 4;
          return JSON.parse(atob(pad ? b64 + "=".repeat(4 - pad) : b64));
        } catch {
          return {};
        }
      };
      const claims = decode(jwt);
      const token = {
        value: jwt,
        iss: claims.iss,
        sub: claims.sub,
        aud: claims.aud,
        exp: expOverride ?? claims.exp,
        iat: claims.iat,
        scope: claims.scope ?? "storage.read:/ storage.modify:/ storage.create:/",
      };
      const federations = {
        [host]: {
          hostname: host,
          configuration: { director_endpoint: director },
          namespaces: { [prefix]: { prefix, token } },
        },
      };
      sessionStorage.setItem("pelican-wc-federations", JSON.stringify(federations));
      sessionStorage.setItem(
        "pelican-wc-p2n",
        JSON.stringify({ [prefix]: { federation: host, namespace: prefix } })
      );
    },
    { jwt: opts.jwt, host: federationHostname, director: directorEndpoint, prefix: namespacePrefix, expOverride: opts.expOverride }
  );
}

export const test = base;
export { expect };
