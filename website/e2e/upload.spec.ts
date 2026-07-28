import { test, expect, env, seedToken } from "./fixtures";

/**
 * Upload (PUT) to the root /ospool/ap40 client — a @mutating flow. Requires a token with
 * write scope, and self-skips when targeting an external/live instance (E2E_EXTERNAL) so it
 * never writes to prod.
 *
 * Chromium is skipped: seedToken populates the page-side store, but Chromium keeps tokens in
 * the service worker (which a test can't seed), so the authenticated PUT can't succeed there.
 */
test.describe("upload @mutating", () => {
  test.beforeEach(() => {
    test.skip(env.external, "@mutating: skipped against external/live targets (E2E_EXTERNAL)");
    test.skip(!env.token, "set E2E_TOKEN (with write scope) to run the upload spec");
  });

  test("uploading a file shows progress and the file appears in the listing", async ({ page, browserName }) => {
    test.skip(browserName === "chromium", "seedToken can't seed the Chromium SW token store; upload runs on the page-side model (Firefox/Safari)");

    await seedToken(page, { jwt: env.token! });
    await page.goto("/");

    // Unique name so re-runs don't collide and we can find it in the listing.
    const name = `e2e-upload-${Date.now()}.txt`;

    // The upload control is a hidden <input type=file>; setInputFiles works on hidden inputs.
    const fileInput = page.locator('input[type="file"]');
    await fileInput.waitFor({ state: "attached", timeout: 30_000 });
    await fileInput.setInputFiles({ name, mimeType: "text/plain", buffer: Buffer.from("pelican e2e upload\n") });

    // The upload overlay reports progress then completion.
    await expect(page.getByText("Uploading Files")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Complete")).toBeVisible({ timeout: 60_000 });

    // After the listing refreshes, the new file is present.
    await expect(page.getByText(name, { exact: false })).toBeVisible({ timeout: 30_000 });
  });
});
