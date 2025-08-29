const CACHE_NAME = "cc-v1.1-20250829230057";
const PRECACHE_URLS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "app.settings.json",
  "assets/app.js",
  "assets/style.css",
  "assets/scripts.json",
  "icons/favicon.png",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
      .then(self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(self.clients.claim())
  );
});

// Navigation fallback: return index.html when offline (SPA)
async function handleNavigate(request) {
  try {
    return await fetch(request);
  } catch (e) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match("index.html");
    return cached || new Response("Offline", { status: 503 });
  }
}

// Stale-while-revalidate for same-origin GET assets
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const networkFetch = fetch(request).then((response) => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || networkFetch;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return; // don't touch POST/PUT (e.g., Overpass or Apps Script writes)

  // App shell routing
  if (req.mode === "navigate") {
    event.respondWith(handleNavigate(req));
    return;
  }

  // Same-origin assets: SWR
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req));
  }
});
