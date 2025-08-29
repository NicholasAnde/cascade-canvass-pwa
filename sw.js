// Offline-first service worker for Increment 2
const CACHE = 'canvass-incr2-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './app.settings.json',
  './assets/style.css',
  './assets/app.js',
  './assets/scripts.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js'
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e=>{
  e.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    self.clients.claim();
  })());
});
self.addEventListener('fetch', e=>{
  const {request} = e;
  if(request.method !== 'GET') return;
  e.respondWith((async ()=>{
    const cached = await caches.match(request);
    if (cached) return cached;
    try{
      const fresh = await fetch(request);
      const cache = await caches.open(CACHE);
      cache.put(request, fresh.clone());
      return fresh;
    }catch(err){
      return cached || new Response('Offline', {status:503});
    }
  })());
});
