Cascade Canvass — Hotfix (Buttons/Menu + Geocoder Cooldown)
=========================================================

What this fixes
---------------
- Restores the **full app.js** after the previous geocoder patch overwrote it with a partial file.
- Re-enables **all routes** (Home, Next Door, New Lead, Lead Tracker, Scripts, Settings).
- Keeps **Geocoder + 90‑day cooldown** workflow for Next Door with sticky strip + segmented progress.
- **Removes "Turf"** from the menu (per your request).

Apply
-----
1) Replace your repo files with:
   - `/index.html` (hamburger menu without "Turf")
   - `/assets/app.js` (consolidated, working routes + geocoder cooldown)
2) Commit & push to GitHub Pages.
3) On device: reload the app.

Notes
-----
- If you had a service worker from older builds, the current index.html already unregisters it (always online assets).
- Backend posting uses `app.settings.json` and Admin overrides (press & hold Settings header).
