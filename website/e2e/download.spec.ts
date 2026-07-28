import { test, expect } from "./fixtures";

/**
 * Downloads a real file from the public namespace at /public, in every engine.
 *
 * Chromium downloads through the service worker; Firefox/Safari collect the bytes on the
 * page and save a blob. Either way the browser fires a download event. We drill into
 * sub-collections until we find a file, then assert the download occurs. (The SW control
 * wait is a harmless no-op on Firefox/Safari, which have no SW.)
 */
test.describe("download (cross-browser)", () => {
  test("downloads a file from the public namespace", async ({ page }) => {
    test.setTimeout(180_000); // a real network download far exceeds the 30s default
    await page.goto("/public");

    // Chromium's download path needs a controlling SW; a fresh context registers it just
    // after first paint, so wait for it to claim the page (reload once if it hasn't).
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 15_000 }).catch(() => {});
    if (!(await page.evaluate(() => !!navigator.serviceWorker?.controller))) {
      await page.reload();
      await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 15_000 }).catch(() => {});
    }

    // Find a file, drilling into sub-collections if a level has only folders.
    let downloadButton = null as import("@playwright/test").Locator | null;
    for (let depth = 0; depth <= 3; depth++) {
      await page.getByRole("table").waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
      const files = page.locator('[aria-label^="Download "]');
      if (await files.count()) {
        downloadButton = files.first();
        break;
      }
      const folders = page.locator('[aria-label^="Explore "]');
      if (!(await folders.count())) break;
      // The namespace root has no ".." row; deeper levels list ".." first, so skip index 0 there.
      await folders.nth(depth === 0 ? 0 : 1).click().catch(() => {});
    }

    test.skip(!downloadButton, "no downloadable file found under the public namespace");

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      downloadButton!.click(),
    ]);

    expect(await download.path(), "download did not produce a file").toBeTruthy();
    expect(download.suggestedFilename().length).toBeGreaterThan(0);
  });
});
