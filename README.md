# Cascade Canvass — Stable Base v1 (from scratch)
Minimal, robust PWA using old design ideas (Jony Ive vibe, phone-first, fixed header/footer) with:
- Next Door (Visits), New Lead (photos), Map/Turf (import/export + Start Here)
- Offline queue with secret injection on retry
- Settings + Admin overrides + Test POST
- PST/PDT Sheets logging + email attachments (no Drive)
- Service worker caches only local assets (avoids CDN CORS failures)

## Deploy
1) Apps Script: open `backend/Code.gs` → Deploy **Web App** (Execute as Me, Anyone with link). Copy the `/exec` URL.
2) Edit `app.settings.json`: set `"sheetsEndpoint"` and `"sharedSecret"` to match Code.gs.
3) Push repo to GitHub root → enable Pages. On device: open app → Settings → **Refresh Offline Cache**.

## Notes
- If you change files, bump the cache key in `sw.js` to force updates.
- CSV export: Visits on Home; Leads in Settings.
