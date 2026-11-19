/* XAUUSD Journal service worker: offline app shell + runtime cache for Firebase SDK and fonts.
   Bump VERSION whenever you change any file, so users get the update. */
const VERSION = 'xauj-v1';
const SHELL_CACHE = VERSION + '-shell';
const RUNTIME_CACHE = VERSION + '-rt';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL_CACHE);
    /* index.html must cache; icons are best-effort */
    await c.add(new Request('index.html', { cache: 'reload' }));
    await Promise.all(SHELL.filter(u => u !== 'index.html').map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [SHELL_CACHE, RUNTIME_CACHE];
    for (const k of await caches.keys()) if (k.startsWith('xauj-') && !keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const okToCache = r => r && (r.ok || r.type === 'opaque');

/* network first (fresh when online), cached copy when offline or slow */
async function networkFirst(req, cacheName, fallbackUrl, timeoutMs) {
  const cache = await caches.open(cacheName);
  const fromCache = async () => (await cache.match(req, { ignoreSearch: true })) || (fallbackUrl ? await cache.match(fallbackUrl) : undefined);
  try {
    const net = fetch(req);
    const res = await (timeoutMs ? Promise.race([net, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), timeoutMs))]) : net);
    if (okToCache(res)) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = await fromCache();
    if (hit) return hit;
    throw err;
  }
}

/* cached copy now, refreshed in the background */
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const upd = fetch(req).then(res => { if (okToCache(res)) cache.put(req, res.clone()).catch(() => {}); return res }).catch(() => undefined);
  return hit || (await upd) || Response.error();
}

/* versioned files that never change: cache first */
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (okToCache(res)) cache.put(req, res.clone()).catch(() => {});
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      e.respondWith(networkFirst(req, SHELL_CACHE, 'index.html', 4000));
    } else if (url.pathname.endsWith('/sw.js')) {
      return; /* always let the browser check sw.js itself */
    } else {
      e.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
    }
    return;
  }

  /* Firebase SDK (versioned URLs) and Google Fonts, so the app also starts offline */
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    e.respondWith(cacheFirst(req, RUNTIME_CACHE));
  } else if (url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req, RUNTIME_CACHE));
  } else if (url.hostname === 'fonts.googleapis.com') {
    e.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
  }
  /* everything else (Firebase auth/Firestore, calendar API) goes straight to the network */
});
