Cascade Canvass — Geocoder "Next Closest Door" Patch
======================================================

What changed
------------
- Replaces the old Turf list with **geocoder-based suggestions** using OpenStreetMap (Overpass API).
- On **Next Door**, the app fetches nearby addresses around your GPS, sorts by distance, and shows the **closest door**.
- After you log an outcome, tap **Next Closest →** to advance. A **segmented progress bar** lets you jump to any suggestion.

How to use
----------
1) Replace **/assets/app.js** in your Backend v2 repo with the one from this patch.
2) Commit & push to GitHub Pages.
3) On device, open **Next Door** → allow location → the app will load ~25 nearby addresses within ~150 m.
4) Log outcomes (Lead / No Answer / Left Literature / Skipped):
   - **Lead** jumps to the Lead form.
   - Others auto-advance to the next closest address.
5) Use **Reload Nearby** to refresh suggestions if you’ve moved or want a new set (radius defaults to ~150 m).

Notes
-----
- Uses public Overpass API; please be gentle to avoid rate limits.
- If GPS or geocoder fails, the view falls back to manual address entry.

Config
------
- You can adjust defaults at the top of the patch:
  - `S.geoRadius` (meters, default 150)
  - `S.geoLimit` (count, default 25)
