/* MoRo Academy service worker: lets the academy open and be read without a connection after the first visit.
   - The page (index.html) is fetched fresh when online, and served from the saved copy when offline or slow.
   - Modules, exams, the glossary and the module index are served instantly from the device and refreshed in the background.
   - Anything from another website (fonts) is left entirely to the browser. */
const BUILD = 'moro-2026-10-27-64fba662';
const SHELL_CACHE = 'moro-shell-' + BUILD;
const CONTENT_CACHE = 'moro-content-1';          // same name the page uses for "Save everything for offline use"
const SHELL = ['./', 'index.html', 'modules-index.json', 'glossary.json', 'manifest.webmanifest', 'Difactoreallogo.jpg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => Promise.allSettled(SHELL.map(u => cache.add(new Request(u, { cache: 'reload' }))))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('moro-shell-') && k !== SHELL_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => { if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting(); });

const timeout = ms => new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), ms));
async function networkFirst(req) {
  try {
    const fresh = await Promise.race([fetch(req), timeout(4000)]);
    if (fresh && fresh.ok) { const c = await caches.open(SHELL_CACHE); c.put('index.html', fresh.clone()); }
    return fresh;
  } catch (e) {
    return (await caches.match('index.html')) || (await caches.match('./')) || Response.error();
  }
}
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CONTENT_CACHE), hit = await cache.match(req);
  const net = fetch(req).then(r => { if (r && r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
  return hit || (await net) || Response.error();
}
async function cacheFirst(req) {
  const hit = await caches.match(req); if (hit) return hit;
  const r = await fetch(req); if (r && r.ok) caches.open(SHELL_CACHE).then(c => c.put(req, r.clone())); return r;
}
self.addEventListener('fetch', event => {
  const req = event.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') return void event.respondWith(networkFirst(req));
  if (/\/(modules|exams)\/[^/]+\.json$|\/glossary\.json$|\/modules-index\.json$/.test(url.pathname)) return void event.respondWith(staleWhileRevalidate(req));
  event.respondWith(cacheFirst(req));
});
