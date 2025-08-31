// v4.9 service worker
const CACHE_CORE = 'CACHE_CORE_v49';
const CACHE_RUNTIME = 'CACHE_RUNTIME_v49';
const CACHE_TILES = 'CACHE_TILES_v49';

const CORE_ASSETS = [
  '/', '/index.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_CORE).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => ![CACHE_CORE, CACHE_RUNTIME, CACHE_TILES].includes(k))
          .map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Cache-first for common map tile hosts
  const isTile = /tile|cartocdn|openstreetmap|tiles|basemaps|osm/i.test(url.hostname) || /\/tiles\//.test(url.pathname);
  if (isTile) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_TILES);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      try {
        const resp = await fetch(event.request);
        if (resp && resp.ok) cache.put(event.request, resp.clone());
        return resp;
      } catch (e) {
        return cached || Response.error();
      }
    })());
    return;
  }

  // Stale-while-revalidate for JS/CSS/requests
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_RUNTIME);
    const cached = await cache.match(event.request);
    const networkFetch = fetch(event.request).then(resp => {
      if (resp && resp.ok && event.request.method === 'GET') {
        cache.put(event.request, resp.clone());
      }
      return resp;
    }).catch(() => null);
    return cached || networkFetch || fetch(event.request);
  })());
});
