/* Offline support: keeps the app, its fonts and cover images on the phone so it opens without internet.
 * When releasing a new version, bump VERSION here and the ?v= numbers in index.html.
 */
const VERSION = '1.6.0';
const CACHE = 'lyrica-app-' + VERSION;
const RUNTIME = 'lyrica-runtime-v1';
const SHELL = ['./', 'index.html', 'style.css?v=' + VERSION, 'app.js?v=' + VERSION, 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache so every file comes from the same release
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(SHELL.map((u) => fetch(new Request(u, { cache: 'reload' })).then((res) => {
      if (!res.ok) throw new Error(u + ' ' + res.status);
      return c.put(u, res);
    }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE && k !== RUNTIME).map((k) => caches.delete(k)));
    await self.clients.claim();
    // Reload any open window so it picks up the new version straight away.
    const wins = await self.clients.matchAll({ type: 'window' });
    for (const w of wins) { try { w.navigate(w.url); } catch (err) { /* ignore */ } }
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fonts and cover art: keep a copy after the first download.
  if (RUNTIME_HOSTS.includes(url.hostname) || url.hostname.endsWith('.mzstatic.com')) {
    e.respondWith(caches.open(RUNTIME).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return; // lyrics and cover searches go straight to the network

  // The page itself: always try the network first so updates arrive, fall back to the saved copy offline.
  // Only the app's own page is saved for offline use. Other pages on this site (like test pages) pass straight through.
  const scopePath = new URL(self.registration.scope).pathname;
  if (req.mode === 'navigate' && url.pathname !== scopePath && url.pathname !== scopePath + 'index.html') return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req, { cache: 'no-cache' })
      .then((res) => { if (res.ok) caches.open(CACHE).then((c) => c.put('./', res.clone())); return res; })
      .catch(() => caches.match('./', { cacheName: CACHE }).then((r) => r || caches.match('index.html'))));
    return;
  }
  // Versioned app files and icons: saved copy first, network if missing.
  e.respondWith(caches.match(req, { cacheName: CACHE }).then((hit) => hit || fetch(req)));
});
