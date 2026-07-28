import { test, expect, env, seedToken } from "./fixtures";

/**
 * Authenticated behavior at the root (/ospool/ap40, token-required). Interactive OAuth can't
 * be automated, so the positive case seeds a token into the page store (see seedToken) and
 * asserts the app issues an authenticated request. Which header carries the auth depends on
 * the model: Firefox/Safari attach `Authorization: Bearer` (page-side); Chromium tags
 * `X-Pelican-Namespace` for the service worker to inject — so we accept either.
 */
test.describe("auth", () => {
  test("unauthenticated: the token-required root offers a Login affordance", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Login" }).first()).toBeVisible({ timeout: 30_000 });
  });

  test("authenticated: an outgoing data request is tagged for auth", async ({ page }) => {
    test.skip(!env.token, "set E2E_TOKEN (a valid access-token JWT) to run authenticated specs");

    let sawAuth = false;
    page.on("request", (req) => {
      const h = req.headers();
      if (h["authorization"]?.startsWith("Bearer ") || h["x-pelican-namespace"]) sawAuth = true;
    });

    await seedToken(page, { jwt: env.token! });
    await page.goto("/");

    await expect
      .poll(() => sawAuth, {
        timeout: 30_000,
        message: "expected a request with Authorization: Bearer or X-Pelican-Namespace",
      })
      .toBe(true);
  });

  test("expired token is dropped and login is offered again", async ({ page }) => {
    test.skip(!env.token, "set E2E_TOKEN to run authenticated specs");

    // Seed the token with an expiry in the past; the provider's cleanup drops it, leaving the
    // UI unauthenticated.
    await seedToken(page, { jwt: env.token!, expOverride: Math.floor(Date.now() / 1000) - 60 });
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Login" }).first()).toBeVisible({ timeout: 30_000 });
  });
});
