# Cascade Canvass — App Build 4 (Dashboard-first)

**Dashboard front and center**, with a hamburger menu for navigation. PWA with offline queue and Google Sheets (Apps Script) integration points.

## Quick Start
1. Unzip and host these static files (e.g., GitHub Pages or any static host).
2. Update **Settings** in-app (⚙️) with your Google Apps Script endpoints:
   - POST Endpoint: where `door_knock` and `lead` JSON is sent.
   - GET Recent Endpoint: returns recent door knocks as JSON (fields: lat, lng, outcome, address).
3. Optional: set a **Remote Settings URL** (defaults provided) that returns JSON keys `postUrl`, `getRecentUrl`, and `recentDays`.

## File Paths
- `/index.html` — App shell
- `/manifest.webmanifest` — PWA manifest
- `/service-worker.js` — cache-first SW
- `/assets/styles.css` — Dark theme
- `/assets/icons/*` — PWA icons
- `/src/app.js` — App init & queue flush loop
- `/src/router.js` — SPA hash router
- `/src/api.js` — Settings, reverse geocode, POST/GET
- `/src/queue.js` — Local outbox queue (localStorage)
- `/src/storage.js` — JSON localStorage helpers
- `/src/components/*` — UI helpers (drawer, toast)
- `/src/ui/ui-*.js` — Views (Dashboard, Next Door, Map, Lead, Scripts, Settings, Queue)
- `/src/data/scripts.json` — Door script & rebuttals

## Google Apps Script (Example Contracts)
- **POST**: App sends `{ type: 'door_knock' | 'lead', payload: {...} }`.
- **GET**: `{getRecentUrl}?days=90` should return `[{ "lat": 45.6, "lng": -122.6, "outcome": "left_lit", "address": "..." }]`.

## Notes
- The app caches Leaflet from CDN via the service worker.
- Reverse geocoding uses OpenStreetMap’s Nominatim.
- Queue auto-flushes when back online or every 20s.

— Generated 2025-08-31T21:11:26.261213
