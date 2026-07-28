import { test, expect } from "./fixtures";

/**
 * Anonymous browsing of the public namespace (no token) at /public. The page auto-loads the
 * first public namespace (no selector), so this exercises the resolve→list path end-to-end
 * against the real director. Skips gracefully if nothing lists (e.g. director unreachable).
 */
test.describe("public browse", () => {
  test("lists the public namespace and navigates a collection", async ({ page }) => {
    await page.goto("/public");

    // Either a populated listing table or an empty/auth state is acceptable.
    const table = page.getByRole("table");
    const emptyState = page.getByText(/empty collection|Authentication is required|No public namespaces/i);
    await expect(table.or(emptyState).first()).toBeVisible({ timeout: 30_000 });

    test.skip(!(await table.isVisible().catch(() => false)), "public namespace listed nothing");

    // The listing has Name / Updated / Size columns.
    await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Size" })).toBeVisible();

    // Drill into the first sub-collection, if any, then confirm the ".." parent row appears.
    const explore = page.locator('[aria-label^="Explore "]').first();
    if (await explore.count()) {
      await explore.click();
      await expect(page.getByText("..", { exact: true })).toBeVisible({ timeout: 30_000 });
    }
  });

  test("sort headers are interactive", async ({ page }) => {
    await page.goto("/public");

    const table = page.getByRole("table");
    await table.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    test.skip(!(await table.isVisible().catch(() => false)), "public namespace listed nothing");

    await page.getByRole("button", { name: "Size" }).click();
    // Toggling sort keeps the table mounted (the assertion is that it doesn't throw/blank).
    await expect(table).toBeVisible();
  });
});
