/* Pelican PKCE + fetch proxy service worker */

const PELICAN_SW_VERSION = '1.0.0';
const TOKEN_STORAGE_KEY = 'pelican-sw-token';
const FED_NAMESPACE_KEY = 'pelican-sw-fedns';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Helper to parse JWT (no verification, just decode)
function parseJWT(token) {
  try {
    const [, payload] = token.split('.');
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
    const json = atob(padded);
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

async function getStoredToken() {
  const data = await self.registration.storage?.get(TOKEN_STORAGE_KEY);
  return data || null;
}

async function setStoredToken(tokenObj) {
  if (!self.registration.storage) return;
  await self.registration.storage.set(TOKEN_STORAGE_KEY, tokenObj);
}

self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};
  if (type === 'PELican_SW_SET_TOKEN') {
    setStoredToken(payload).catch(() => {});
  }
});

// Basic pelican URL detection: pelican:// or /pelican-proxy
function isPelicanRequest(url) {
  return url.startsWith('pelican://') || url.includes('/pelican-proxy');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  if (!isPelicanRequest(url)) {
    return; // let browser handle
  }

  event.respondWith(handlePelicanFetch(request));
});

async function handlePelicanFetch(request) {
  const tokenData = await getStoredToken();
  let headers = new Headers(request.headers);

  if (tokenData && tokenData.accessToken && tokenData.accessToken.value) {
    headers.set('Authorization', `Bearer ${tokenData.accessToken.value}`);
  }

  const proxiedRequest = new Request(request.url, {
    method: request.method,
    headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    mode: 'cors',
    credentials: 'omit',
    cache: request.cache,
    redirect: request.redirect,
  });

  return fetch(proxiedRequest);
}

