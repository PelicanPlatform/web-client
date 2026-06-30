# Pelican Platform Web Client Monorepo

A collection of TypeScript/React libraries for interacting with the [Pelican Platform](https://pelicanplatform.org) and the [Open Science Data Federation (OSDF)](https://osg-htc.org) from the browser. The packages let you discover federations, resolve namespaces, authenticate, and read/write objects directly from web applications.

## Packages

This monorepo contains three independently versioned and published npm packages, plus a demo website.

| Package | Description |
| --- | --- |
| [`@pelicanplatform/web-client`](packages/web-client) | Core, framework-agnostic client for talking to a Pelican federation: discovery, namespace resolution, token handling, and object `get`/`put`/`list`/`download`. Includes a download service worker. |
| [`@pelicanplatform/hooks`](packages/hooks) | React bindings — a `PelicanClientProvider` and `usePelicanClient` hook for sharing a configured client across a React tree. |
| [`@pelicanplatform/components`](packages/components) | Ready-made [MUI](https://mui.com)-based React components (client browser, object views, upload/download manager, collection views, etc.). |
| [`website`](website) | A [Next.js](https://nextjs.org) demo app that exercises the packages. Not published. |

The packages build on one another: `components` depends on `hooks`, which depends on `web-client`.

## Installation

Each package is published to npm under the `@pelicanplatform` scope.

```shell
# Core client only
npm i @pelicanplatform/web-client

# React hooks (pulls in web-client)
npm i @pelicanplatform/hooks

# UI components (requires MUI + Emotion peer deps)
npm i @pelicanplatform/components @mui/material @emotion/react @emotion/styled
```

## Quick start

```javascript
import Client from "@pelicanplatform/web-client";

const discoveryUrl = "https://osg-htc.org"; // Example discovery URL used for the OSDF
const filePath = "/example/file/path.txt";

const webClient = new Client(discoveryUrl);


try {
    await webClient.getObject(filePath); // Downloads file to path.txt
} catch (e) {
    // handle errors
}
```

A fuller, end-to-end example lives in the demo website:
[`website/src/app/page.tsx`](website/src/app/page.tsx).

## Development

This repo is a [pnpm](https://pnpm.io) workspace. Node 22 and pnpm 10 are recommended (see the CI workflows).

```shell
# Install all workspace dependencies
pnpm install

# Build every package
pnpm -r run build

# Run the demo website against the local packages
cd website && pnpm run dev
```

Packages resolve to their TypeScript source (via the `development` export condition) during local development and to the compiled `dist/` output once built and published.

### Testing

Each package uses [Jest](https://jestjs.io):

```shell
# From a package directory, e.g. packages/web-client
pnpm test
```

Coverage and test summaries are written to `.github/` and surfaced as README badges.

## Publishing

To publish a new version of a package:

1. Bump the version in the package directory: `npm version patch` (or `minor`/`major`).
2. Commit the change and push to `main`.

The **Publish Packages** GitHub Actions workflow (`.github/workflows/publish.yml`) detects which `packages/*/package.json` files changed and publishes any package whose version is new. It can also be triggered manually from the Actions tab to publish a specific package or all of them.

The demo website is deployed to GitHub Pages by the **Deploy Next.js site** workflow (`.github/workflows/nextjs.yml`) on every push to `main`.

## License

[Apache-2.0](LICENSE).
