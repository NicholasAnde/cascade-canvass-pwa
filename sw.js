// Always-Online SW: clears caches and unregisters itself.
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Unregister this service worker
    try {
      const regs = await self.registration.unregister();
    } catch (e) {}
    // Claim clients to ensure control is released ASAP
    try { await self.clients.claim(); } catch (e) {}
  })());
});

// Network-only: do nothing special on fetch (no caching)
self.addEventListener('fetch', (e) => {
  // Let the browser fetch normally (no cache handling)
});
