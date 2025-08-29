Cascade Canvass — Geocoder Cooldown Patch
==============================================

This patch makes the geocoder-based Next Door flow **respect 90-day cooldowns**.

What it does
------------
- Fetches nearby addresses via Overpass (OpenStreetMap).
- Cross-references your local `visitsLog` to detect last visit per address.
- Marks each suggestion as **Eligible** or **Cooling (Xd left)**.
- Disables quick-log actions for cooling doors and auto-advances to the next eligible.
- After you log a door, it turns cooling immediately in the suggestion list.

How to apply
------------
1) You should already be on **Backend v2 + Geocoder**. Replace your repo’s `/assets/app.js` with this file.
2) Commit & push to GitHub Pages.
3) On device, open **Next Door** → allow location. You’ll see the closest eligible address, with a segmented progress bar (tap to jump).

Config
------
- Default cooldown: **90 days** (uses `S.cooldownDays`; you can change it in code).
- Geocoder defaults: `S.geoRadius = 150` (meters), `S.geoLimit = 25`.
