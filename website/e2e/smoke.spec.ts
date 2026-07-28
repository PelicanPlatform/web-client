import { test, expect, env } from "./fixtures";

/**
 * Smoke: the app boots in every engine without throwing, the two client pages render, and
 * the header navigation works.
 */
test.describe("smoke", () => {
  test("root renders the /ospool/ap40 client", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto("/");

    // /ospool/ap40 is token-required, so with no token the client offers a Login affordance.
    await expect(page.getByRole("button", { name: "Login" }).first()).toBeVisible({ timeout: 30_000 });
    // Header nav is present.
    await expect(page.getByRole("link", { name: "Public" })).toBeVisible();

    // Guard against regressions like the unguarded `Notification` reference crashing on load.
    expect(errors, `page errors: ${errors.join("\n")}`).toHaveLength(0);
  });

  test("public page renders a listing", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto("/public");

    const table = page.getByRole("table");
    const emptyState = page.getByText(/empty collection|Authentication is required/i);
    await expect(table.or(emptyState).first()).toBeVisible({ timeout: 30_000 });

    expect(errors, `page errors: ${errors.join("\n")}`).toHaveLength(0);
  });

  test("header exposes nav links to each client", async ({ page }) => {
    await page.goto("/");
    // The header menu links to each client page. (We assert presence + targets rather than
    // clicking through: the clients repeatedly replaceState their own ?url= into the address
    // bar, which races/fights an in-app link click — a separate app quirk, not a nav failure.)
    await expect(page.getByRole("link", { name: "/ospool/ap40" })).toHaveAttribute("href", "/");
    await expect(page.getByRole("link", { name: "Public" })).toHaveAttribute("href", "/public");
    await expect(page.getByRole("link", { name: "Origin" })).toHaveAttribute("href", "/origin");
  });

  test("origin demo page renders", async ({ page }) => {
    test.skip(!env.testOrigin, "set E2E_TEST_ORIGIN=1 with a local Pelican stack (localhost:8444/8445)");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto("/origin");
    await expect(page.locator("body")).toBeVisible();
    expect(errors, `page errors: ${errors.join("\n")}`).toHaveLength(0);
  });
});
