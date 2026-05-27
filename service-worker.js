// Family App — Service Worker
//
// Responsibilities:
//   1) Install / activate housekeeping — take control of the page fast so
//      subsequent reloads use the cached shell.
//   2) Cache the app shell (HTML/CSS/JS) so the app loads even with no
//      network — important for installed PWA reliability.
//   3) Handle notification clicks — bring the existing tab into focus or
//      open a new one if none exists.
//   4) Receive `push` events (when a server-side push is added in a
//      future iteration). The wiring is here so we don't need to touch
//      the SW again for that.
//
// Notes:
//   - SW cannot wake itself up on a schedule. For "fire at HH:MM even
//     when the tab is closed", a separate server has to send a push at
//     that moment. The handler below is ready for that step.
//   - On iOS Safari, Web Push requires the site to be installed to the
//     home screen as a PWA (iOS 16.4+). The manifest.json + meta tags
//     in app.html provide that.

// Bump this version on every meaningful release. The activate handler
// drops any cache whose name doesn't match, so users on a stale cache
// will get fresh HTML/assets on next visit.
const CACHE_NAME = 'family-app-v24-parse-timeout-8s-2026-05-28';
const SHELL_FILES = [
  '/app.html',
  '/manifest.json',
  '/icon.svg',
  '/parser.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES).catch(() => {/* ignore individual misses */}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first for HTML, cache-first for static assets — keeps the
// experience fast offline without serving stale HTML when online.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Don't interfere with cross-origin requests (e.g. fonts.googleapis,
  // OpenAI/Claude APIs called from /api routes).
  if (url.origin !== self.location.origin) return;

  const isHTML = req.headers.get('accept')?.includes('text/html');
  if (isHTML) {
    // Strict network-first with a short timeout — if the network is
    // even slightly responsive, the user gets fresh code. Only fall
    // back to cache on outright failure. Prevents the "weak signal
    // serves stale HTML" pattern we hit on a train with bad 5G.
    event.respondWith((async () => {
      try {
        const netRes = await Promise.race([
          fetch(req, { cache: 'no-store' }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('html-timeout')), 4000)),
        ]);
        if (netRes && netRes.ok) {
          const copy = netRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(()=>{});
          return netRes;
        }
        throw new Error('html-bad-status-' + (netRes && netRes.status));
      } catch (_) {
        const cached = await caches.match(req);
        return cached || (await caches.match('/app.html'));
      }
    })());
    return;
  }
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (!res || !res.ok) return res;
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(()=>{});
        return res;
      });
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/app.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow('/app.html');
    })
  );
});

// Push handler — fires when a server-sent push arrives. Wired up now so
// the eventual backend (Step 2) doesn't need any SW changes.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {
    try { data = { body: event.data ? event.data.text() : '' }; } catch (_) {}
  }
  const title = data.title || 'Family';
  const body  = data.body  || '';
  const tag   = data.tag   || undefined;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: '/icon.svg',
      badge: '/icon.svg',
      silent: false,
    })
  );
});
