import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

/** Local, git-ignored config (tokens, target URLs). See e2e/.env.example. */
dotenv.config({ path: path.resolve(__dirname, "e2e", ".env") });

/** URL the specs run against. Defaults to the Next dev server we launch below. */
const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";

/**
 * Set E2E_EXTERNAL=1 when pointing at a live/shared deployment: `@mutating` specs
 * (upload/delete) skip themselves, and we don't try to spawn a dev server.
 */
const isExternal = !!process.env.E2E_EXTERNAL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    /* Keep CI artifacts small: capture only on failure. */
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "on-first-retry",
    /* The Origin/dev server use self-signed certs. */
    ignoreHTTPSErrors: true,
    /* Required for the download specs. */
    acceptDownloads: true,
  },

  /* All three engines — Chromium, Gecko (Firefox), and WebKit (Safari). */
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],

  /* Launch the site unless we're targeting an external instance. Reuses an already-running
     `pnpm dev` locally so you don't fight it for the port. Override the command with
     E2E_WEB_SERVER_CMD (e.g. to run a production `next start`). */
  webServer: isExternal
    ? undefined
    : {
        command: process.env.E2E_WEB_SERVER_CMD || "pnpm dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
