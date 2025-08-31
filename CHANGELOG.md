# Changelog

## v4.9 — 2025-08-30
- Removed all photo capture/upload (camera + gallery) — **disabled, not deleted** (commented out with `// v4.9: photos disabled`).
- Lead form: Phone is now **required**; Notes limited to 280 chars; Address locked/prefilled.
- Map: marker colors **Lead=green, Left Lit=blue, Declined=red**; filter chips Today / 7 days / All.
- Offline-first: durable Outbox (IndexedDB) + progressive Background Sync.
- Service Worker: precache core; stale-while-revalidate for JS/CSS; cache-first for map tiles; versioned keys `*_v49`.
- Footer: **Mobile PWA • v4.9**; asset cache-bust `?v=490`.
- Backend (Apps Script): removed “Photos attached” line; photo handling blocks commented out.
- Google Sheet: photo-related columns removed in spec (no longer used by script).
