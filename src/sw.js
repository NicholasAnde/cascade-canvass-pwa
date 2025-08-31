const CACHE = 'cascade-v1-0-0';
const PRECACHE = [
  '/index.html',
  '/src/styles/style.css?v=100',
  '/src/scripts/app.js?v=100',
  '/src/scripts/api.js',
  '/src/scripts/ui-map.js',
  '/src/scripts/ui-lead.js',
  '/src/scripts/ui-pulse.js',
  '/src/scripts/ui-settings.js',
  '/src/scripts/ui-scripts.js',
  '/src/scripts/photos.js',
  '/src/scripts/queue.js',
  '/src/scripts/scripts.json'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return resp;
    }).catch(()=> hit))
  );
});
