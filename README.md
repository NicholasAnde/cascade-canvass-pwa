# Cascade Canvass — Increment 2
Adds Map/Turf with Leaflet + Draw + import/export + Start Here FAB on top of Increment 1.

## Deploy
1) Apps Script: `backend/Code.gs` → Deploy **Web App** (Execute as Me, Anyone with link). Copy `/exec` URL.
2) Edit `app.settings.json`: put the `/exec` URL in `"sheetsEndpoint"` and set `"sharedSecret"` (match `Code.gs`).
3) Push to GitHub root → enable Pages. On device: Settings → **Refresh Offline Cache** (pulls new assets).

## Features
- Visits (Next Door) with offline queue
- Leads w/ photos (client downscale), email attachments (no Drive)
- Map/Turf: Leaflet + Draw; **Import** GeoJSON, **Export** GeoJSON, **Start Here** GPS
- CSV export: Visits (Dashboard), Leads (Settings)
