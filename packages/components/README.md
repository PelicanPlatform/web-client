# `@pelicanplatform/components`

Ready-made [React](https://react.dev) + [MUI](https://mui.com) components for browsing, uploading, and downloading objects from a [Pelican Platform](https://pelicanplatform.org) federation. These components are the UI layer on top of [`@pelicanplatform/web-client`](../web-client) (the core client) and [`@pelicanplatform/hooks`](../hooks) (the React state layer).

## Installation

```shell
npm i @pelicanplatform/components @mui/material @emotion/react @emotion/styled
```

MUI and Emotion are **peer dependencies** — your app must provide them (and an MUI `ThemeProvider`). React 17, 18, or 19 is supported.

## What's exported

The package's public surface is intentionally small:

| Export | Type | Description |
| --- | --- | --- |
| `AuthenticatedClient` | component | A complete, self-contained file browser: object list, breadcrumbs, upload, collection navigation, login, error toasts, and an embedded `DownloadManager`. Takes no props — it reads everything from the Pelican client context. |
| `DownloadManager` | component | A floating, minimizable panel showing active and interrupted downloads with progress, ETA, cancel, and "resume all". Already embedded inside `AuthenticatedClient`; render it yourself only when building a custom UI. Takes no props. |
| _everything from `@pelicanplatform/hooks`_ | — | Re-exported for convenience, most importantly `PelicanClientProvider` and `usePelicanClient`. |

Because both components consume React context, **they must be rendered inside a `PelicanClientProvider`.**

## Quick start

Three pieces are required: a theme, the provider, and the component.

```tsx
// app/page.tsx
"use client";

import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import { PelicanClientProvider, AuthenticatedClient } from "@pelicanplatform/components";

const theme = createTheme();

export default function Page() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <PelicanClientProvider
        initialObjectUrl="pelican://osg-htc.org/ncar"
        enableAuth={true}
      >
        <AuthenticatedClient />
      </PelicanClientProvider>
    </ThemeProvider>
  );
}
```

That single `AuthenticatedClient` gives you a working browser for the namespace at `initialObjectUrl`: listing objects, navigating into collections/folders, downloading files, and (when `enableAuth` is on and the user logs in) uploading and creating collections.

### `PelicanClientProvider` props

| Prop | Default | Description |
| --- | --- | --- |
| `initialObjectUrl` | `""` | The `pelican://<federation>/<path>` URL to load on mount. |
| `enableAuth` | `true` | Enables login, upload, and collection-creation UI. Set to `false` for a read-only, public browser. |
| `children` | — | Your component tree. |

The provider handles federation discovery, namespace resolution, token storage (in `sessionStorage`), the OAuth authorization-code flow, object-list caching, and download progress tracking. Components below it stay stateless.

## Enabling downloads (service worker)

Downloads stream through a service worker so large files don't have to be buffered in memory, and so transfers can resume after an interruption. The `DownloadManager` (and the one embedded in `AuthenticatedClient`) only reports progress once that worker is registered.

1. Make the worker file available at a public URL. The script ships in `@pelicanplatform/web-client`; copy it into your static assets at build time:

   ```jsonc
   // package.json
   "scripts": {
     "predev": "cp node_modules/@pelicanplatform/web-client/dist/serviceWorker/downloadServiceWorker.js public/downloadServiceWorker.js"
   }
   ```

2. Register it on the client once, early in your app:

   ```tsx
   "use client";
   import { useEffect } from "react";
   import { registerPelicanSw } from "@pelicanplatform/web-client";

   export default function PelicanSwRegistrar() {
     useEffect(() => {
       registerPelicanSw("/downloadServiceWorker.js");
     }, []);
     return null;
   }
   ```

The service worker is a crucial part of the security infrastructure and therefore is not optional. It holds the access
and refresh token in memory inaccessible to the rest of the application prevent token exfiltration in the case of XSS 
in your web application.

## Building a custom UI with `usePelicanClient`

If `AuthenticatedClient` doesn't fit your design, drive the client directly with the `usePelicanClient` hook (re-exported here) and compose your own components — optionally dropping in `DownloadManager` for the download panel.

```tsx
"use client";

import { usePelicanClient, DownloadManager } from "@pelicanplatform/components";
import { useEffect, useState } from "react";
import type { ObjectList } from "@pelicanplatform/web-client";

function Browser() {
  const {
    objectUrl,
    setObjectUrl,
    getObjectList,
    handleDownload,
    handleLogin,
    authorized,
    loading,
  } = usePelicanClient();

  const [objects, setObjects] = useState<ObjectList[]>([]);
  useEffect(() => {
    getObjectList(objectUrl).then(setObjects);
  }, [objectUrl, getObjectList]);

  if (loading) return <p>Loading…</p>;

  return (
    <>
      {!authorized && <button onClick={handleLogin}>Login</button>}
      <ul>
        {objects.map((o) => (
          <li key={o.href}>
            {o.iscollection ? (
              <button onClick={() => setObjectUrl(`pelican://osg-htc.org${o.href}`)}>
                {o.href}/
              </button>
            ) : (
              <button onClick={() => handleDownload(`pelican://osg-htc.org${o.href}`)}>
                {o.href}
              </button>
            )}
          </li>
        ))}
      </ul>
      <DownloadManager />
    </>
  );
}
```

The context exposes everything the built-in components use, including:

- `objectUrl` / `setObjectUrl` — the currently viewed `pelican://` URL.
- `getObjectList(url?, forceRefresh?)` — list objects (TTL-cached); returns `ObjectList[]`.
- `handleDownload(url)` / `handleUpload(file, url?)` — stream a download / upload a `File`.
- `handleLogin()` — start the OAuth authorization-code flow for the current namespace.
- `authorized`, `authorizationRequired`, `loading`, `error`, `setError`.
- `federation`, `namespace`, `collections` — resolved metadata for the current URL.
- `downloadsInProgress` — live map of download progress (what `DownloadManager` renders).

## Notes

- All components are marked `"use client"`; in Next.js App Router, render them in client components / below a client boundary. The `PelicanClientProvider` is typically placed in your root `layout.tsx`.
- A full working example — provider in the layout, `AuthenticatedClient` on the page, service-worker registration, and a namespace selector — lives in [`website/`](../../website) at the repo root.

## License

[Apache-2.0](../../LICENSE).
