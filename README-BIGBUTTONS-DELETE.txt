Cascade Canvass — Bigger Buttons + Delete Leads (Local) Patch
====================================================================

What this patch does
--------------------
1) **Buttons 50% bigger**: global button padding, font size, and height are increased for better tap targets.
2) **Lead Tracker delete (local only)**: Adds a ❌ Delete button on each lead card. Deletion removes it from localStorage only (no change to Google Sheets).

How to apply
------------
- Replace your repo’s files with the ones in this patch:
  - `/assets/style.css` (button size override)
  - `/assets/app.js` (Lead Tracker override)
- Commit & push to GitHub Pages.
- Reload the app.

Notes
-----
- If you also want delete to affect the Google Sheet later, we can add a server event or a “Deleted” status instead of hard-delete.
