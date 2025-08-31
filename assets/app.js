/* ============================================================================
  Cascade Canvass — app.js (drop-in)
  Requirements:
    - Leaflet JS & CSS loaded in HTML
    - A <div id="map"></div> somewhere on the page
    - This file at /app/assets/app.js (or your existing path)

  What it does:
    - Initializes a dark-themed Leaflet map
    - NO forward geocoding (address -> coords) is used
    - Provides Reverse Lookup: GPS -> coords -> address (Nominatim)
    - Lets you mark “Door Knocked” at map center or GPS point
    - Persists knocked doors in localStorage and reloads them
    - Safe for older JS targets (no optional-catch binding)
============================================================================ */

/* ====== Config ====== */
const SETTINGS_URL =
  "https://script.google.com/macros/s/AKfycbwPEUITyVd3jaSywdjO1dKiBt3M5Mn_yRt4g9UaR3be1_1HAUN0aHicGTLH12XULnANoQ/exec";

const NOMINATIM_REVERSE =
  "https://nominatim.openstreetmap.org/reverse?format=jsonv2";

/* LocalStorage keys */
const LS_KEYS = {
  KNOCKED: "cc.knocked.v1",
  SETTINGS: "cc.settings.v1",
  LAST_CENTER: "cc.map.center.v1",
};

/* Minimal dark theme tokens (used for injected UI) */
const UI = {
  bg: "#0f1115",
  panel: "#151922",
  text: "#d6deeb",
  subtle: "#9aa4b2",
  accent: "#7aa2f7",
  error: "#e26d6d",
  ok: "#6bdba7",
};

/* ====== Utility helpers ====== */
function $(sel, root) {
  return (root || document).querySelector(sel);
}
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "style" && typeof v === "object") {
      Object.assign(node.style, v);
    } else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2), v);
    } else {
      node.setAttribute(k, v);
    }
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}
function saveLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error("localStorage save failed:", err);
  }
}
function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.error("localStorage load failed:", err);
    return fallback;
  }
}
function fmtLatLng(lat, lng) {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

/* ====== DOM bootstrap (inject minimal controls if missing) ====== */
function ensureDOM() {
  // Map container
  let mapHost = $("#map");
  if (!mapHost) {
    mapHost = el("div", { id: "map" });
    document.body.appendChild(mapHost);
  }
  Object.assign(mapHost.style, {
    width: "100%",
    height: "calc(100vh - 120px)",
    background: "#0b0e14",
    borderRadius: "10px",
  });

  // Status & control panel
  let panel = $("#control-panel");
  if (!panel) {
    panel = el(
      "div",
      {
        id: "control-panel",
        style: {
          background: UI.panel,
          color: UI.text,
          padding: "12px",
          margin: "12px 0",
          borderRadius: "10px",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        },
      },
      [
        el(
          "div",
          {
            style: {
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: "8px",
              alignItems: "center",
              marginBottom: "8px",
            },
          },
          [
            el(
              "div",
              {},
              el("strong", { style: { color: UI.subtle } }, "Address")
            ),
            el(
              "div",
              { style: { textAlign: "right", color: UI.subtle } },
              "Map center updates this"
            ),
          ]
        ),
        el("input", {
          id: "addressInput",
          type: "text",
          placeholder: "Enter/confirm address…",
          style: {
            width: "100%",
            padding: "10px",
            borderRadius: "8px",
            border: "1px solid #2a3140",
            background: UI.bg,
            color: UI.text,
            outline: "none",
          },
        }),
        el(
          "div",
          {
            style: {
              display: "flex",
              gap: "8px",
              marginTop: "10px",
              flexWrap: "wrap",
            },
          },
          [
            el(
              "button",
              {
                id: "reverseBtn",
                style: btnStyle(),
                onClick: onReverseLookup,
              },
              "Reverse Lookup (GPS)"
            ),
            el(
              "button",
              {
                id: "markBtn",
                style: btnStyle(UI.ok),
                onClick: onMarkKnocked,
              },
              "Mark Door Knocked"
            ),
            el(
              "button",
              {
                id: "clearBtn",
                style: btnStyle(UI.error),
                onClick: onClearKnocked,
              },
              "Clear All"
            ),
          ]
        ),
        el("div", {
          id: "status",
          style: {
            marginTop: "10px",
            color: UI.subtle,
            fontSize: "12px",
          },
        }),
      ]
    );
    document.body.insertBefore(panel, mapHost);
  }

  // Footer error bar (non-intrusive)
  let err = $("#error-bar");
  if (!err) {
    err = el("div", {
      id: "error-bar",
      style: {
        display: "none",
        position: "fixed",
        left: "0",
        right: "0",
        bottom: "0",
        padding: "10px 14px",
        background: "#3b1f22",
        color: "#ffb4a9",
        fontFamily:
          "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      },
    });
    document.body.appendChild(err);
  }

  // Body background
  document.body.style.background = UI.bg;
  document.body.style.color = UI.text;
}

function btnStyle(bg) {
  const base = {
    padding: "10px 12px",
    border: "1px solid #2a3140",
    background: "#1b2230",
    color: UI.text,
    borderRadius: "8px",
    cursor: "pointer",
  };
  if (bg) base.background = "#1b2230";
  return base;
}

/* ====== Map state ====== */
let map; // Leaflet map
let markersLayer; // LayerGroup for knocked doors
let currentSettings = null;

/* ====== Core: init, map, settings ====== */
async function init() {
  ensureDOM();
  setStatus("Loading…");

  await loadSettings(); // optional
  await bootMap();
  await hydrateKnockedFromLS();

  // Set initial status from center
  const c = map.getCenter();
  setStatus(`Ready. Center @ ${fmtLatLng(c.lat, c.lng)}`);
}

async function loadSettings() {
  // Pull remote settings (optional); cache to LS
  try {
    const res = await fetch(SETTINGS_URL, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    currentSettings = data || {};
    saveLS(LS_KEYS.SETTINGS, currentSettings);
  } catch (err) {
    console.warn("Settings fetch failed, using cached or defaults:", err);
    currentSettings = loadLS(LS_KEYS.SETTINGS, {});
  }
}

async function bootMap() {
  try {
    const last = loadLS(LS_KEYS.LAST_CENTER, { lat: 45.6387, lng: -122.6615, z: 12 });
    map = L.map("map", {
      center: [last.lat, last.lng],
      zoom: last.z || 12,
      zoomControl: true,
      attributionControl: false,
    });

    // Dark tile layer
    L.tileLayer(
      currentSettings?.tiles?.url ||
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          currentSettings?.tiles?.attribution ||
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      }
    ).addTo(map);

    // Layer for knocked markers
    markersLayer = L.layerGroup().addTo(map);

    // Update address field when map stops moving (reverse lookup optional)
    map.on("moveend", async () => {
      const c = map.getCenter();
      saveLS(LS_KEYS.LAST_CENTER, { lat: c.lat, lng: c.lng, z: map.getZoom() });

      // Try “soft” reverse lookup if GPS button not used (best-effort & silent)
      try {
        const addr = await reverseLookup(c.lat, c.lng, true);
        if (addr) {
          const input = $("#addressInput");
          if (input && input.value.trim().length === 0) {
            input.value = addr;
          }
        }
      } catch (err) {
        // silent
      }

      setStatus(`Center @ ${fmtLatLng(c.lat, c.lng)}`);
    });
  } catch (err) {
    renderError("Map failed to initialize.");
    throw err;
  }
}

/* ====== Knocked Doors persistence ====== */
function getKnocked() {
  return loadLS(LS_KEYS.KNOCKED, []);
}
function setKnocked(list) {
  saveLS(LS_KEYS.KNOCKED, list);
}
async function hydrateKnockedFromLS() {
  try {
    const items = getKnocked();
    items.forEach((m) => {
      addMarker(m.lat, m.lng, m.address, false);
    });
    if (items.length) {
      setStatus(`Loaded ${items.length} knocked door(s).`);
    }
  } catch (err) {
    console.error("Hydrate failed:", err);
  }
}

/* ====== Reverse Lookup (GPS) ====== */
async function onReverseLookup() {
  setStatus("Reverse lookup: getting GPS…");
  try {
    const pos = await getPosition({ enableHighAccuracy: true, timeout: 12000 });
    const { latitude: lat, longitude: lng } = pos.coords;
    setStatus(`GPS: ${fmtLatLng(lat, lng)} — resolving address…`);
    const addr = await reverseLookup(lat, lng, false);

    if (addr) {
      const input = $("#addressInput");
      if (input) input.value = addr;
      // center map to GPS
      map.setView([lat, lng], Math.max(map.getZoom(), 17));
      setStatus("Address filled from GPS.");
    } else {
      setStatus("No address found for GPS point.");
    }
  } catch (err) {
    renderError("Reverse lookup failed. Check location permissions.");
    console.error(err);
  }
}

function getPosition(opts) {
  return new Promise(function (resolve, reject) {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, opts || {});
  });
}

async function reverseLookup(lat, lng, quiet) {
  const url =
    (currentSettings?.reverseUrl || NOMINATIM_REVERSE) +
    `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Cascade-Canvass/1.0 (contact: support@shiftsignalsupply.shopifyemail.com)",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Build a friendly line
    const disp =
      data?.display_name ||
      [
        data?.address?.house_number,
        data?.address?.road,
        data?.address?.city || data?.address?.town || data?.address?.village,
        data?.address?.state,
        data?.address?.postcode,
      ]
        .filter(Boolean)
        .join(", ");

    if (!disp && !quiet) {
      renderError("Could not resolve an address at this location.");
    }
    return disp || "";
  } catch (err) {
    if (!quiet) {
      renderError("Reverse lookup service error.");
    }
    console.error("Reverse lookup error:", err);
    return "";
  }
}

/* ====== Markers ====== */
function onMarkKnocked() {
  try {
    const input = $("#addressInput");
    const address = (input?.value || "").trim();

    const c = map.getCenter();
    addMarker(c.lat, c.lng, address || "(no address provided)", true);
    setStatus("Saved knocked door.");
  } catch (err) {
    renderError("Could not mark door.");
    console.error(err);
  }
}

function addMarker(lat, lng, address, persist) {
  const marker = L.circleMarker([lat, lng], {
    radius: 6,
    weight: 2,
    color: "#7aa2f7",
    fillColor: "#7aa2f7",
    fillOpacity: 0.35,
  }).addTo(markersLayer);

  const addrHtml = address
    ? `<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(
        address
      )}</div>`
    : "";

  marker.bindPopup(
    `${addrHtml}<div style="font-size:12px;color:${UI.subtle}">${fmtLatLng(
      lat,
      lng
    )}</div>`
  );

  if (persist) {
    const list = getKnocked();
    list.push({ lat, lng, address, ts: Date.now() });
    setKnocked(list);
  }
}

function onClearKnocked() {
  if (!confirm("Clear all knocked doors from this device?")) return;
  markersLayer.clearLayers();
  setKnocked([]);
  setStatus("Cleared.");
}

/* ====== Status & Error ====== */
function setStatus(msg) {
  const s = $("#status");
  if (s) s.textContent = String(msg || "");
}
function renderError(msg) {
  const bar = $("#error-bar");
  if (!bar) return;
  bar.textContent = msg || "An error occurred.";
  bar.style.display = "block";
  setTimeout(function () {
    bar.style.display = "none";
  }, 4000);
}
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ====== Init on DOM ready ====== */
document.addEventListener("DOMContentLoaded", function () {
  init()
    .then(function () {
      // ok
    })
    .catch(function (err) {
      renderError("Failed to initialize app.");
      console.error(err);
    });
});

