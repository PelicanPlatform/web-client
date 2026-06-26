# `@pelicanplatform/hooks`

React state bindings for the [Pelican Platform](https://pelicanplatform.org) web client. This package wraps the core, framework-agnostic [`@pelicanplatform/web-client`](../web-client) in a React context so a whole component tree can share one configured client — with federation discovery, namespace resolution, token storage, the OAuth login flow, object-list caching, and live download progress all handled for you.

It has no UI of its own. If you want ready-made components, use [`@pelicanplatform/components`](../components) (which builds on this package). If you want to build your own UI, use these hooks directly.

## Installation

```shell
npm i @pelicanplatform/hooks
```

`@pelicanplatform/web-client` comes along as a dependency. React 17, 18, or 19 is a peer dependency and must be provided by your app.

## What's exported

| Export | Type | Description |
| --- | --- | --- |
| `PelicanClientProvider` | component | Context provider that holds and manages all client state. Wrap your tree with it. |
| `PelicanClientProviderProps` | type | Props for the provider. |
| `usePelicanClient` | hook | Read the client state and actions from any descendant. Throws if used outside a provider. |
| `PelicanClientContext` | context | The raw React context (rarely needed — prefer `usePelicanClient`). |
| `PelicanClientContextValue` | type | The shape of everything the hook returns. |
| `DownloadProgress` | type | Progress record for a single download. |

## Quick start

Wrap your app (or the relevant subtree) in the provider, then read from it with the hook.

```tsx
"use client";

import { PelicanClientProvider, usePelicanClient } from "@pelicanplatform/hooks";

function App() {
  return (
    <PelicanClientProvider
      initialObjectUrl="pelican://osg-htc.org/ncar"
      enableAuth={true}
    >
      <Browser />
    </PelicanClientProvider>
  );
}

function Browser() {
  const { objectUrl, getObjectList, handleDownload, loading } = usePelicanClient();
  // ...drive your own UI from the context
}
```

### `PelicanClientProvider` props

| Prop | Default | Description |
| --- | --- | --- |
| `initialObjectUrl` | `""` | The `pelican://<federation>/<path>` URL to load on mount. |
| `enableAuth` | `true` | Enables the login flow and authenticated actions (upload, collections). Set to `false` for read-only, public access. |
| `children` | — | Your component tree. |

## What the provider does for you

State is derived from the current `objectUrl`. When it changes, the provider:

- Discovers the **federation** for the URL's hostname and resolves the **namespace** for its path (deduplicating concurrent fetches).
- Persists federations, namespace→prefix mappings, and **tokens** in `sessionStorage` (keys prefixed `pelican-wc-`), and prunes expired tokens.
- Runs the **OAuth authorization-code flow** (with PKCE) on login and exchanges the returned code for a token.
- **Caches object lists** with a 5-minute TTL, and exposes cache invalidation.
- Subscribes to the download **service worker** and tracks live progress per download.

Because all of this lives in the provider, the components reading from it stay stateless.

## `usePelicanClient()`

Returns the `PelicanClientContextValue`. Must be called inside a `PelicanClientProvider` — otherwise it throws:

```
usePelicanClient must be used within a PelicanClientProvider.
```

### Context value reference

**State**

| Field | Type | Description |
| --- | --- | --- |
| `enableAuth` | `boolean` | The `enableAuth` prop, passed through. |
| `loading` | `boolean` | True while metadata or an auth exchange is in flight. |
| `error` | `string \| null` | Last error message (e.g. for a toast). |
| `authorizationRequired` | `boolean` | The current URL needs login to be listed. |
| `authorized` | `boolean` | A valid token granting one or more collections is present. |
| `objectUrl` | `string` | The currently viewed `pelican://` URL. |
| `federationHostname` | `string \| null` | Hostname parsed from `objectUrl`. |
| `objectPath` | `string \| null` | Object path parsed from `objectUrl`. |
| `federation` | `Federation \| null` | Resolved federation metadata. |
| `namespace` | `Namespace \| null` | Resolved namespace metadata. |
| `collections` | `Collection[]` | Collections granted by the current token. |
| `downloadsInProgress` | `Record<string, DownloadProgress>` | Live download progress, keyed by id. |

**Actions**

| Function | Description |
| --- | --- |
| `setObjectUrl(url)` | Navigate to a new `pelican://` URL (a `useState` setter — accepts a value or updater). |
| `getObjectList(url?, forceRefresh?)` | List objects at `url` (defaults to `objectUrl`); TTL-cached unless `forceRefresh`. Returns `ObjectList[]`. |
| `invalidateObjectListCache(url?)` | Drop cached listings for `url` (and its parents), or all if omitted. |
| `handleDownload(url)` | Stream a download of the object at `url` through the service worker. |
| `handleUpload(file, url?)` | Upload a `File` to `url` (defaults to `objectUrl`); invalidates the relevant list cache. |
| `handleLogin()` | Start the OAuth authorization-code flow for the current namespace. |
| `ensureMetadata(url, urlType)` | Low-level: ensure the federation/namespace for `url` are fetched and cached. Returns `{ federation, namespace }`. |
| `setError(message)` | Set or clear (`null`) the error message. |

### `DownloadProgress`

```ts
interface DownloadProgress {
  id: string;
  objectUrl: string;
  bytesDownloaded: number;
  totalByteSize: number;
  status: "pending" | "in-progress" | "completed" | "failed" | "cancelled";
}
```

## Example: a minimal browser

```tsx
"use client";

import { usePelicanClient } from "@pelicanplatform/hooks";
import { useEffect, useState } from "react";
import type { ObjectList } from "@pelicanplatform/web-client";

export function Browser() {
  const { objectUrl, setObjectUrl, getObjectList, handleDownload, handleLogin, authorized, loading } =
    usePelicanClient();

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
              <button onClick={() => setObjectUrl(`pelican://osg-htc.org${o.href}`)}>{o.href}/</button>
            ) : (
              <button onClick={() => handleDownload(`pelican://osg-htc.org${o.href}`)}>{o.href}</button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
```

## Notes

- The provider and hook are marked `"use client"`. In the Next.js App Router, place `PelicanClientProvider` in a client boundary (commonly the root `layout.tsx`) and call `usePelicanClient` only from client components.
- For live **download progress** to populate `downloadsInProgress`, register the download service worker shipped in `@pelicanplatform/web-client` (see that package's docs and the [`components`](../components) README).
- A full working example is in [`website/`](../../website) at the repo root.

## License

[Apache-2.0](../../LICENSE).
