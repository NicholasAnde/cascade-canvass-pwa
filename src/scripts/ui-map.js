import { listDoors, logVisit } from './api.js';
import { enqueue } from './queue.js';

export async function renderMapTab({ mountEl, getRep }){
  mountEl.innerHTML = `<section class="card">
    <div class="row" style="justify-content:space-between;">
      <div><strong>Map</strong></div>
      <div class="legend">
        <span><span class="dot r0"></span>0–7d</span>
        <span><span class="dot r1"></span>8–30d</span>
        <span><span class="dot r2"></span>31–90d</span>
        <span><span class="dot r3"></span>>90d</span>
      </div>
    </div>
    <div id="map"></div>
  </section>`;

  const map = L.map('map').setView([45.6387,-122.6615], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution:'&copy; OpenStreetMap' }).addTo(map);
  window._leafletMapInstance = map;

  try{
    const data = await listDoors(365);
    const lastByAddr = new Map();
    data.rows.forEach(r => {
      const k = norm(r.address);
      const t = Date.parse(r.dateISO || '') || 0;
      if (!lastByAddr.has(k) || t > lastByAddr.get(k).t) lastByAddr.set(k, { t, r });
    });
    for (const { r } of lastByAddr.values()){
      const days = daysSince(r.dateISO);
      const color = days<=7?'#8fe388':days<=30?'#5dc86a':days<=90?'#3da352':'#6b7280';
      const m = L.circleMarker([r.lat, r.lng], { radius:8, color, fillColor:color, fillOpacity:0.9 }).addTo(map);
      const html = document.createElement('div');
      html.innerHTML = `<div class="col">
        <div><strong>${escapeHtml(r.address)}</strong></div>
        <div class="row quickbar">
          <button class="btn" data-outcome="Lead">Lead</button>
          <button class="btn" data-outcome="Left Literature">Left Lit</button>
          <button class="btn" data-outcome="Declined">Declined</button>
        </div>
        <label class="row" style="gap:6px;align-items:center;margin-top:6px;">
          <input type="checkbox" class="mk"> <span>🏷 Add Marketing Tag</span>
        </label>
      </div>`;
      const pane = L.popup().setContent(html);
      m.bindPopup(pane);
      html.querySelectorAll('button[data-outcome]').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          const payload = { rep:getRep(), outcome:btn.dataset.outcome, address:r.address, notes:'', lat:r.lat, lon:r.lng, source:'pwa', marketing: html.querySelector('.mk').checked };
          try{ await logVisit(payload); window.toast('Logged'); }
          catch{ enqueue({ type:'visit', payload }); window.toast('Saved offline'); }
        });
      });
    }
  }catch{}

  const fab = document.createElement('button'); fab.className='fab'; fab.textContent='📍';
  fab.title='Current Location';
  fab.addEventListener('click', ()=>{
    if (navigator.geolocation){
      navigator.geolocation.getCurrentPosition(pos => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 14);
      });
    }
  });
  mountEl.appendChild(fab);
}

// Listen for Next Door events
window.addEventListener('visit:logged', (ev) => {
  const d = ev.detail || {};
  if (!d.lat || !d.lon) return;
  const color = '#8fe388';
  L.circleMarker([d.lat, d.lon], { radius:8, color, fillColor:color, fillOpacity:0.9 })
    .addTo(window._leafletMapInstance);
});

function daysSince(iso){ const t = Date.parse(iso||''); if(!t) return 9999; return Math.floor((Date.now()-t)/86400000); }
function norm(a){ return String(a||'').trim().toLowerCase(); }
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m])); }
