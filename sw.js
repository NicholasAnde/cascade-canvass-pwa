// SW — hamburger frontend-only patch
const CACHE='canvass-hamburger-fo-v1';
const ASSETS=['./','./index.html','./manifest.webmanifest','./assets/style.css','./assets/app.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{const ks=await caches.keys();await Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)));self.clients.claim();})());});
self.addEventListener('fetch',e=>{const r=e.request; if(r.method!=='GET') return; const u=new URL(r.url); if(u.origin!==location.origin) return;
  e.respondWith((async()=>{const c=await caches.match(r); if(c) return c; try{const f=await fetch(r); const ca=await caches.open(CACHE); ca.put(r,f.clone()); return f;}catch(err){return c||new Response('Offline',{status:503});}})());
});