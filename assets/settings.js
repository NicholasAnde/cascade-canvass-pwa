<!-- Include this BEFORE app.js in /index.html -->
<script src="assets/settings.js?v=480" defer></script>
<script src="assets/app.js?v=480" defer></script>

/* /assets/settings.js — v4.8-nd (Sheets link-up)
   This file is loaded into window.* so app.js can read it at runtime. */

/** Your published Google Apps Script Web App URL (ends with /exec). */
window.APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwPEUITyVd3jaSywdjO1dKiBt3M5Mn_yRt4g9UaR3be1_1HAUN0aHicGTLH12XULnANoQ/exec";

/** Optional: separate reverse-lookup endpoint.
    Leave "" to fall back to APPS_SCRIPT_URL?action=reverse&lat=…&lon=… */
window.APPS_SCRIPT_LOOKUP_URL = "";

/** Sheets + tabs (must already exist in your spreadsheet). */
window.SHEETS = {
  /** Tab names (exact match). */
  VISITS: "Visits",
  LEADS:  "Leads",
  ERRORS: "Errors"
};

/** App + email basics used by Apps Script (optional but handy). */
window.SETTINGS = {
  emailTo: "nicholasande@gmail.com",            // who receives lead emails
  timeZone: "America/Los_Angeles",              // PST/PDT
  sourceTag: "Cascade Canvass PWA v4.8-nd"      // appears in logs/emails
};

/** Optional shared secret (if your GAS checks a header or field). */
window.APP_SECRET = ""; // e.g., "shh-123". Leave "" to disable.

/** Optional: request headers the app should send to GAS. */
window.REQUEST_HEADERS = {
  "Content-Type": "application/json"
  // "X-App-Secret": window.APP_SECRET  // enable if your GAS validates it
};

