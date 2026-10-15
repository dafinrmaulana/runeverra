// Runeverra service worker: lets the installed app open offline (bot and face to face work
// without a network; online play still needs one). It never touches WebSocket traffic or
// other origins. Pages are network-first so a new deploy is picked up as soon as you are online.
const CACHE = 'runeverra-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./', copy)); return res; })
        .catch(() => caches.match('./').then((hit) => hit || Response.error())),
    );
    return;
  }

  // Everything else on this origin (fonts, hashed bundles, hero art): serve the cached copy
  // at once and refresh it in the background.
  event.respondWith(
    caches.open(CACHE).then((cache) => cache.match(req).then((hit) => {
      const fresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || fresh;
    })),
  );
});
