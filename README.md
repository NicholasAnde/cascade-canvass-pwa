# Cascade Canvass — PWA

## Quick Start
1. Copy these files to a public GitHub repo at **repo root**.
2. Edit `app.settings.json` → set `"sheetsEndpoint"` to your Apps Script Web App `/exec` URL and set `"sharedSecret"`.
3. Commit & push, then enable **GitHub Pages** (Source: `main` and root).
4. Open the site on your phone → “Add to Home Screen.”

## Features
- Installable PWA (service worker, manifest, icons)
- Offline queue + auto-retry for POSTs
- Map/Turf with Leaflet Draw (import/export GeoJSON)
- Start Here (GPS) + cooldown heat tinting
- Lead form with photos (client downscale to ~1280px @ 0.85 JPEG)
- Scripts & rebuttals (A/B counters)
- Settings (font/button scale), hidden **Admin Config** (long-press title) with Test POST
- CSV export + `/export.html` merged export
- Toast notifications; validation autofocus

## Service Worker
- Bump cache key in `sw.js` to force updates (currently `canvass-v10`).
- Settings → *Refresh Offline Cache* also clears cache via the app.

## Notes
- Nominatim reverse-geocode used sparingly with a gentle rate-limit.
- Email subject fixed to **“New Lead (Cascade Lead App)”**; photos attached only (no Drive).
- Sheets logging is PST/PDT via Apps Script; phone stored as Pretty + E.164.

