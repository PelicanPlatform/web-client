# Website E2E (Playwright)

Cross-browser end-to-end tests for the demo site, run against **Chromium, Firefox, and
WebKit** — WebKit/Firefox coverage matters here because the client's download and auth
paths diverge by engine.

## Setup

```bash
pnpm install
pnpm --filter website exec playwright install   # one-time: browser binaries
cp e2e/.env.example e2e/.env                     # optional: fill in a token/targets
```

## Run

```bash
pnpm --filter website test:e2e            # all browsers, headless
pnpm --filter website test:e2e:ui         # interactive UI mode
pnpm --filter website test:e2e --project=webkit   # one engine
pnpm --filter website test:e2e:report     # open the last HTML report
```

By default Playwright launches `pnpm dev` and tests `http://localhost:3000` (reusing an
already-running dev server locally). Set `E2E_BASE_URL` to target something else.

## What runs without configuration

- **smoke** — the app boots in every engine with no page errors (guards regressions like an
  unguarded `Notification` crash): root (`/`, the `/ospool/ap40` client) shows a Login
  affordance, `/public` renders a listing, and the header nav links move between them.
- **public browse** — the `/public` page auto-loads the first public namespace (no selector);
  asserts the listing/empty state and navigates a collection. Self-skips if it lists nothing.

## What needs configuration (see `.env.example`)

- **auth** — the root (`/ospool/ap40`) is token-required. Interactive OAuth can't be
  automated, so the positive spec **seeds a token** into the page's `sessionStorage` store
  (`fixtures.ts → seedToken`). Provide `E2E_TOKEN` (a valid access-token JWT) plus the
  matching `E2E_NAMESPACE_PREFIX` / `E2E_FEDERATION_HOST` / `E2E_DIRECTOR_ENDPOINT`. It
  asserts an outgoing request is tagged for auth (`Authorization: Bearer` on Firefox/Safari,
  `X-Pelican-Namespace` on Chromium). The unauthenticated and expired-token specs run
  without a token.
- **upload** (`@mutating`) — uploads to the root `/ospool/ap40`; needs `E2E_TOKEN` with write
  scope. Skips under `E2E_EXTERNAL=1` (never writes to a live target) and on Chromium (its
  SW token store can't be seeded from a test, so upload runs on the page-side model).
- **origin** — the `/origin` demo targets a local Pelican stack (`localhost:8444/8445`);
  gate it with `E2E_TEST_ORIGIN=1`.
- **download** — downloads a real public file in every engine (Chromium via the SW
  accelerator, Firefox/Safari via the page-side blob download).

## Conventions

- `@mutating` marks create/update/delete specs; they skip under `E2E_EXTERNAL=1`. To also
  exclude them explicitly: `pnpm --filter website test:e2e --grep-invert @mutating`.
- Specs skip (rather than fail) when their backend/token isn't available, so a partial
  environment still yields a green, meaningful run.
