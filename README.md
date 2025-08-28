# Cascade Canvass — Full PWA (Photos + Maps + Turf + Leads + CSV + Offline Queue)

Everything you asked for in a GitHub-ready PWA:
- **Next Door**: Lead / No Answer / Left Literature / Objection (incl. Renter)
- **Lead Capture**: Name/Phone required, optional photo upload (up to 3; resized; sent base64 to your Apps Script)
- **Map / Turf**: Leaflet + OpenStreetMap, Start Here ring of markers, draw/import/export polygon or points, tap markers to quick-log visits
- **Cooldown**: 90-day local index to avoid fresh re-hits; markers color-coded (green eligible, gray cooling)
- **Settings**: Rep name, offline cache refresh, **offline queue retry**
- **CSV export**: One-click export of Visits and Leads to CSV
- **PWA**: manifest + service worker, installable via GitHub Pages
- **Generated logo** in /icons

## Configure
Set your Google Apps Script endpoint in `app.settings.json`:
```json
{ "sheetsEndpoint": "https://script.google.com/macros/s/.../exec", "cooldownDays": 90 }
```

## Deploy on GitHub Pages
1) Create a **public repo** and upload all files at **repo root** (index.html must be at root).
2) Settings → Pages → Source = `main` / `(root)` → Save.
3) Visit the Pages URL in Chrome (Android) → menu → **Install app**.

## Notes
- Reverse geocoding uses Nominatim; respect rate limits.
- Photos are downsized client-side to keep payloads reasonable; Apps Script should save them to Drive.
- Offline queue retains unsent knocks/leads and can retry in **Settings**.
