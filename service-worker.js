/* Simple cache-first SW with network fallback */
const CACHE = 'cascade-v1';
const CORE = [
  '/',
  '/index.html',
  '/assets/styles.css',
  '/manifest.webmanifest',
  '/src/app.js',
  '/src/router.js',
  '/src/api.js',
  '/src/queue.js',
  '/src/storage.js',
  '/src/components/drawer.js',
  '/src/components/toast.js',
  '/src/ui/ui-dashboard.js',
  '/src/ui/ui-nextdoor.js',
  '/src/ui/ui-lead.js',
  '/src/ui/ui-map.js',
  '/src/ui/ui-scripts.js',
  '/src/ui/ui-settings.js',
  '/src/ui/ui-queue.js',
  '/src/data/scripts.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE && caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return; // let app handle POST/PUT with its queue
  e.respondWith(
    caches.match(e.request).then(res => {
      return res || fetch(e.request).then(networkRes => {
        // cache Leaflet CDN requests and same-origin GETs
        if (url.origin === location.origin || url.host.includes('unpkg.com')) {
          const resClone = networkRes.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, resClone));
        }
        return networkRes;
      }).catch(() => res);
    })
  );
});
