/* Aurelion Private — offline app shell. Paths are relative to this file, so the
   worker is safe under any GitHub Pages subdirectory. Values are stamped at build time. */
const VERSION = '__VERSION__';
const CACHE = 'aurelion-' + VERSION;
const ASSETS = "__ASSETS__";

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('aurelion-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === 'navigate') { const shell = await cache.match('./index.html'); if (shell) return shell; }
      throw err;
    }
  })());
});
