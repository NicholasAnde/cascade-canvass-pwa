/* ============================================================================
  Cascade Canvass — app.js (v3: fix insertBefore parent, resilient startup)
============================================================================ */
const SETTINGS_URL =
  "https://script.google.com/macros/s/AKfycbwPEUITyVd3jaSywdjO1dKiBt3M5Mn_yRt4g9UaR3be1_1HAUN0aHicGTLH12XULnANoQ/exec";
const NOMINATIM_REVERSE =
  "https://nominatim.openstreetmap.org/reverse?format=jsonv2";
const LS_KEYS = {
  KNOCKED: "cc.knocked.v1",
  SETTINGS: "cc.settings.v1",
  LAST_CENTER: "cc.map.center.v1",
};
const UI = {
  bg: "#0f1115",
  panel: "#151922",
  text: "#d6deeb",
  subtle: "#9aa4b2",
  accent: "#7aa2f7",
  error: "#e26d6d",
  ok: "#6bdba7",
};

/* --------------------- tiny helpers --------------------- */
function $(sel, root) { return (root || document).querySelector(sel); }
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}
function saveLS(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); } catch(e){ console.error(e); } }
function loadLS(k,f){ try{ const r=localStorage.getItem(k); return r?JSON.parse(r):f; } catch(e){ console.error(e); return f; } }
function fmtLatLng(lat,lng){ return `${lat.toFixed(6)}, ${lng.toFixed(6)}`; }

/* --------------------- injected UI --------------------- */
function ensureDOM() {
  // Map container (explicit in index.html, but ensure anyway)
  let mapHost = $("#map");
  if (!mapHost) {
    mapHost = el("div", { id: "map" });
    // Put it into #view if present, otherwise body
    const view = $("#view") || document.body;
    view.appendChild(mapHost);
  }
  Object.assign(mapHost.style, {
    width: "100%",
    height: mapHost.style.height || "calc(100vh - 120px)",
    background: "#0b0e14",
    borderRadius: "10px",
  });

  // Control panel (address + buttons) — insert BEFORE #map within its parent
  if (!$("#control-panel")) {
    const panel = el(
      "div",
      {
        id: "control-panel",
        style: {
          background: UI.panel, color: UI.text, padding: "12px", margin: "12px 0",
          borderRadius: "10px",
          fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif",
        },
      },
      [
        el("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "8px" } },
          [el("strong", { style: { color: UI.subtle } }, "Address"),
           el("span", { style: { color: UI.subtle, fontSize: "12px" } }, "Map center updates this")]),
        el("input", {
          id: "addressInput", type: "text", placeholder: "Enter/confirm address…",
          style: {
            width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #2a3140",
            background: UI.bg, color: UI.text, outline: "none",
          },
        }),
        el("div", { style: { display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" } }, [
          el("button", { id: "reverseBtn", style: btnStyle(), onClick: onReverseLookup }, "Reverse Lookup (GPS)"),
          el("button", { id: "markBtn", style: btnStyle(UI.ok), onClick: onMarkKnocked }, "Mark Door Knocked"),
          el("button", { id: "clearBtn", style: btnStyle(UI.error), onClick: onClearKnocked }, "Clear All"),
        ]),
        el("div", { id: "status", style: { marginTop: "10px", color: UI.subtle, fontSize: "12px" } }),
      ]
    );

    const mapEl = $("#map");
    const parent = (mapEl && mapEl.parentNode) ? mapEl.parentNode : document.body;
    try {
      parent.insertBefore(panel, mapEl || null);
    } catch (err) {
      console.warn("insertBefore fell back to appendChild:", err);
      parent.appendChild(panel);
    }
  }

  // Error bar
  if (!$("#error-bar")) {
    const err = el("div", {
      id: "error-bar",
      style: {
        display: "none", position: "fixed", left: "0", right: "0", bottom: "0",
        padding: "10px 14px", background: "#3b1f22", color: "#ffb4a9",
        fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif",
        zIndex: "9999",
      },
    });
    document.body.appendChild(err);
  }

  document.body.style.background = UI.bg;
  document.body.style.color = UI.text;
}
function btnStyle() {
  return {
    padding: "10px 12px", border: "1px solid #2a3140", background: "#1b2230",
    color: UI.text, borderRadius: "8px", cursor: "pointer",
  };
}
function setStatus(msg){ const s=$("#status"); if(s) s.textContent = String(msg||""); }
function renderError(msg){ const bar=$("#error-bar"); if(!bar) return; bar.textContent=msg||"An error occurred."; bar.style.display="block"; setTimeout(function(){ bar.style.display="none"; }, 4000); }
function escapeHtml(str){ return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

/* --------------------- app state --------------------- */
let map, markersLayer, currentSettings=null;

/* --------------------- startup orchestration --------------------- */
function ready(fn){
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
  else fn();
}
function waitForLeaflet(maxMs){
  return new Promise(function(resolve, reject){
    const start = Date.now();
    (function check(){
      if (window.L && typeof L.map === "function") return resolve();
      if (Date.now() - start > (maxMs||10000)) return reject(new Error("Leaflet not loaded"));
      setTimeout(check, 50);
    })();
  });
}
function start() {
  ensureDOM();
  setStatus("Booting…");
  waitForLeaflet(10000)
    .then(function(){ return init(); })
    .catch(function(err){
      renderError("Leaflet failed to load. Check network or script tag.");
      console.error(err);
    });
}

/* --------------------- core init --------------------- */
async function init() {
  await loadSettings();         // optional
  await bootMap();              // map + listeners
  await hydrateKnockedFromLS(); // restore markers

  const c = map.getCenter();
  setStatus(`Ready. Center @ ${fmtLatLng(c.lat, c.lng)}`);
}

async function loadSettings() {
  try {
    const res = await fetch(SETTINGS_URL, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    currentSettings = (await res.json()) || {};
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

    markersLayer = L.layerGroup().addTo(map);

    map.on("moveend", async function(){
      const c = map.getCenter();
      saveLS(LS_KEYS.LAST_CENTER, { lat: c.lat, lng: c.lng, z: map.getZoom() });

      try {
        const addr = await reverseLookup(c.lat, c.lng, true);
        if (addr) {
          const input = $("#addressInput");
          if (input && input.value.trim().length === 0) input.value = addr;
        }
      } catch (err) { /* silent */ }

      setStatus(`Center @ ${fmtLatLng(c.lat, c.lng)}`);
    });

    // Ensure tiles lay out if container was just shown
    setTimeout(function(){ map.invalidateSize(); }, 150);
  } catch (err) {
    renderError("Map failed to initialize.");
    throw err;
  }
}

/* --------------------- knocked doors --------------------- */
function getKnocked(){ return loadLS(LS_KEYS.KNOCKED, []); }
function setKnocked(list){ saveLS(LS_KEYS.KNOCKED, list); }
async function hydrateKnockedFromLS(){
  try {
    const items = getKnocked();
    items.forEach(function(m){ addMarker(m.lat, m.lng, m.address, false); });
    if (items.length) setStatus(`Loaded ${items.length} knocked door(s).`);
  } catch (err) { console.error("Hydrate failed:", err); }
}

/* --------------------- reverse lookup --------------------- */
async function onReverseLookup() {
  setStatus("Reverse lookup: getting GPS…");
  try {
    const pos = await getPosition({ enableHighAccuracy: true, timeout: 12000 });
    const { latitude: lat, longitude: lng } = pos.coords;
    setStatus(`GPS: ${fmtLatLng(lat, lng)} — resolving address…`);
    const addr = await reverseLookup(lat, lng, false);

    if (addr) {
      const input = $("#addressInput"); if (input) input.value = addr;
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
function getPosition(opts){
  return new Promise(function(resolve, reject){
    if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
    navigator.geolocation.getCurrentPosition(resolve, reject, opts || {});
  });
}
async function reverseLookup(lat, lng, quiet){
  const url = (currentSettings?.reverseUrl || NOMINATIM_REVERSE) +
    `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Cascade-Canvass/1.0 (support@shiftsignalsupply.shopifyemail.com)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const disp =
      data?.display_name ||
      [
        data?.address?.house_number,
        data?.address?.road,
        data?.address?.city || data?.address?.town || data?.address?.village,
        data?.address?.state, data?.address?.postcode,
      ].filter(Boolean).join(", ");
    if (!disp && !quiet) renderError("Could not resolve an address at this location.");
    return disp || "";
  } catch (err) {
    if (!quiet) renderError("Reverse lookup service error.");
    console.error("Reverse lookup error:", err);
    return "";
  }
}

/* --------------------- markers --------------------- */
function onMarkKnocked(){
  try {
    const input = $("#addressInput");
    const address = (input?.value || "").trim();
    const c = map.getCenter();
    addMarker(c.lat, c.lng, address || "(no address provided)", true);
    setStatus("Saved knocked door.");
  } catch (err) {
    renderError("Could not mark door."); console.error(err);
  }
}
function addMarker(lat, lng, address, persist){
  const marker = L.circleMarker([lat, lng], {
    radius: 6, weight: 2, color: "#7aa2f7", fillColor: "#7aa2f7", fillOpacity: 0.35,
  }).addTo(markersLayer);

  const addrHtml = address ? `<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(address)}</div>` : "";
  marker.bindPopup(`${addrHtml}<div style="font-size:12px;color:${UI.subtle}">${fmtLatLng(lat,lng)}</div>`);

  if (persist) {
    const list = getKnocked();
    list.push({ lat, lng, address, ts: Date.now() });
    setKnocked(list);
  }
}
function onClearKnocked(){
  if (!confirm("Clear all knocked doors from this device?")) return;
  markersLayer.clearLayers(); setKnocked([]); setStatus("Cleared.");
}

/* --------------------- kick things off --------------------- */
(function bootstrap(){
  ready(function(){ start(); });
})();
