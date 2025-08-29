Cascade Canvass — Stripless UI + Read‑only Lead Tracker Patch
====================================================================

What this patch does
--------------------
1) **Removes** the sticky "current door" strip and segmented progress bar from all screens.
2) Makes **Lead Tracker** read‑only (no status changes, no copy/edit controls).

How to apply
------------
- Replace your repo’s `/assets/app.js` with this file (it only overrides functions and is safe on top of the hotfix/backend v2 builds).
- Commit & push to GitHub Pages.
- Reload the app.

Notes
-----
- All logging flows (Next Door, Lead form) remain unchanged.
- If you later want the strip back, restore your previous `assets/app.js`.
