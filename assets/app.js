// State & storage
const S = {
  rep: localStorage.getItem('rep') || '',
  endpoint: null,
  cooldownDays: 90,
  visitsIndex: JSON.parse(localStorage.getItem('visitsIndex') || '{}'),
  visitsLog: JSON.parse(localStorage.getItem('visitsLog') || '[]'),
  leadsLog: JSON.parse(localStorage.getItem('leadsLog') || '[]'),
  queue: JSON.parse(localStorage.getItem('queue') || '[]'),
  map: null, markers: [], drawn: null, drawnLayer: null
};

const el = s => document.querySelector(s);
const saveLS = () => {
  localStorage.setItem('visitsIndex', JSON.stringify(S.visitsIndex));
  localStorage.setItem('visitsLog', JSON.stringify(S.visitsLog));
  localStorage.setItem('leadsLog', JSON.stringify(S.leadsLog));
  localStorage.setItem('queue', JSON.stringify(S.queue));
};

async function boot(){
  try{
    const cfg = await fetch('./app.settings.json').then(r=>r.json());
    S.endpoint = cfg.sheetsEndpoint; S.cooldownDays = cfg.cooldownDays ?? 90;
    el('#ep').textContent = S.endpoint;
  }catch(e){ el('#ep').textContent = '(endpoint not loaded)'; }
  go('dashboard');
}

// Tabs
function go(tab){
  document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  if(tab==='dashboard') renderDashboard();
  if(tab==='map') renderMapView();
  if(tab==='knock') renderKnock();
  if(tab==='lead') renderLead();
  if(tab==='settings') renderSettings();
}

// CSV export
function toCSV(rows){
  const esc = v => ('"'+String(v??'').replace(/"/g,'""')+'"');
  const keys = Object.keys(rows[0]||{});
  const header = keys.map(esc).join(',');
  const data = rows.map(r=> keys.map(k=> esc(r[k])).join(',')).join('\n');
  return header + '\n' + data;
}
function downloadCSV(name, rows){
  if(!rows.length){ alert('No data'); return; }
  const blob = new Blob([toCSV(rows)], {type:'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
}

// Dashboard
function renderDashboard(){
  el('#view').innerHTML = `
    <section class="card">
      <h2>Welcome ${S.rep?('<span class="success">'+S.rep+'</span>'):'(Set Rep in Settings)'} </h2>
      <div class="stats">
        <span class="badge">Cooldown ${S.cooldownDays}d</span>
        <span class="badge">Photos on Leads</span>
        <span class="badge">OSM + Turf</span>
        <span class="badge">Offline queue</span>
      </div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem">
        <button class="primary" onclick="go('knock')">Next Door</button>
        <button class="ghost" onclick="go('lead')">New Lead</button>
        <button class="ghost" onclick="go('map')">Map / Turf</button>
        <button class="ghost" onclick="exportVisits()">Export Visits CSV</button>
        <button class="ghost" onclick="exportLeads()">Export Leads CSV</button>
      </div>
    </section>
  `;
}
function exportVisits(){ downloadCSV('visits.csv', S.visitsLog); }
function exportLeads(){ downloadCSV('leads.csv', S.leadsLog); }

// Settings
function renderSettings(){
  el('#view').innerHTML = `
    <section class="card">
      <h2>Settings</h2>
      <label>Rep Name</label>
      <input id="s_rep" value="${S.rep||''}" placeholder="Your name">
      <div style="margin-top:.75rem;display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="primary" onclick="saveRep()">Save</button>
        <button class="ghost" onclick="refreshCache()">Refresh Offline Cache</button>
        <button class="ghost" onclick="retryQueue()">Retry Offline Queue (${S.queue.length})</button>
      </div>
      <p class="mono" style="margin-top:.5rem;">Endpoint: ${S.endpoint||'(not loaded)'}</p>
    </section>
  `;
}
function saveRep(){ const v = el('#s_rep').value.trim(); if(!v){alert('Enter name');return;} localStorage.setItem('rep', v); S.rep=v; go('dashboard'); }
async function refreshCache(){ if('caches' in window){ const ks=await caches.keys(); await Promise.all(ks.map(k=>caches.delete(k))); location.reload(); } }
async function retryQueue(){
  if(!S.queue.length){ alert('Queue empty'); return; }
  const q = [...S.queue]; S.queue = []; saveLS();
  for(const item of q){
    try{
      const r = await fetch(S.endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(item)});
      if(!r.ok) throw new Error('HTTP '+r.status);
    }catch(e){
      S.queue.push(item);
    }
  }
  saveLS();
  alert(`Queue retry done. Remaining: ${S.queue.length}`);
}

// Knock
function renderKnock(){
  el('#view').innerHTML = `
    <section class="card">
      <h2>Next Door</h2>
      <div class="row">
        <div><label>Address*</label><input id="k_addr" placeholder="1208 Maple St"></div>
        <div><label>Notes</label><input id="k_notes" placeholder="Optional"></div>
      </div>
      <div style="display:flex;gap:.5rem;margin-top:.75rem;flex-wrap:wrap">
        <button class="primary" onclick="postVisit('Lead')">Lead</button>
        <button class="ghost" onclick="postVisit('No Answer')">No Answer</button>
        <button class="ghost" onclick="postVisit('Left Literature')">Left Literature</button>
        <button class="ghost" onclick="openObjection()">Objection</button>
      </div>
      <div style="margin-top:.75rem;">
        <button class="ghost" onclick="autoFillAddressFromGPS()">Use my location</button>
      </div>
      <div id="k_msg" style="margin-top:.5rem"></div>
    </section>
  `;
}
async function autoFillAddressFromGPS(){
  if(!navigator.geolocation){ alert('Geolocation not available'); return; }
  navigator.geolocation.getCurrentPosition(async pos=>{
    const {latitude, longitude} = pos.coords;
    try{
      const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=en`;
      const j = await fetch(u, {headers:{'Accept':'application/json'}}).then(r=>r.json());
      el('#k_addr').value = j.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    }catch(e){ el('#k_addr').value = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`; }
  }, err=> alert('Location error'));
}
function openObjection(){
  const o = prompt('Objection: Renter / Already have someone / Too Busy / Cost / Later / Other','Renter'); if(!o) return;
  postVisit('Objection', o);
}
async function postVisit(outcome, objection=''){
  const addr = el('#k_addr').value.trim();
  const notes = el('#k_notes').value.trim();
  if(!addr){ alert('Address required'); return; }
  const item = {
    type: outcome==='Lead' ? 'lead' : 'visit',
    date: new Date().toISOString().slice(0,10),
    time: new Date().toISOString(),
    address: addr, name:'', phone:'', email:'',
    service:'', urgency:'', timeline:'', budget:'',
    notes, turf:'', source:'PWA', rep:S.rep||'',
    outcome: outcome==='Lead'? undefined: outcome,
    objection: objection||''
  };
  try{
    const r = await fetch(S.endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(item)});
    if(!r.ok) throw new Error('HTTP '+r.status);
    el('#k_msg').innerHTML = '<span class="success">Saved ✓</span>';
  }catch(e){
    S.queue.push(item); el('#k_msg').innerHTML = '<span class="error">Offline: queued</span>';
  }
  // Local cooldown index + local log
  S.visitsIndex[addr] = new Date().toISOString(); saveLS();
  S.visitsLog.push(item); saveLS();
  if(outcome==='Lead') go('lead');
}

// Lead (with photos)
async function readFilesAsBase64Limited(input, max=3, maxW=1280){
  const files = Array.from(input.files||[]).slice(0,max);
  const out = [];
  for(const f of files){
    const img = await createImageBitmap(f);
    const c = document.createElement('canvas');
    const scale = Math.min(1, maxW/img.width);
    c.width = Math.round(img.width*scale); c.height = Math.round(img.height*scale);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    out.push(c.toDataURL('image/jpeg', 0.85));
  }
  return out;
}
function renderLead(){
  el('#view').innerHTML = `
  <section class="card">
    <h2>New Lead</h2>
    <div class="row">
      <div><label>Name*</label><input id="l_name"></div>
      <div><label>Phone*</label><input id="l_phone"></div>
      <div><label>Email</label><input id="l_email"></div>
      <div><label>Address</label><input id="l_addr" placeholder="From knock"></div>
    </div>
    <div class="row">
      <div><label>Service</label>
        <select id="l_service"><option>Removal</option><option>Trim</option><option>Storm Prep</option><option>Planting</option><option>Other</option></select>
      </div>
      <div><label>Urgency</label>
        <select id="l_urgency"><option>High</option><option>Medium</option><option>Low</option></select>
      </div>
      <div><label>Timeline</label>
        <select id="l_timeline"><option>This Week</option><option>This Month</option><option>Flexible</option></select>
      </div>
      <div><label>Budget</label>
        <select id="l_budget"><option><$500</option><option>$500+</option><option>$1k+</option></select>
      </div>
    </div>
    <label>Notes</label><textarea id="l_notes" rows="4"></textarea>
    <label style="margin-top:.5rem">Photos (up to 3)</label>
    <input id="l_photos" type="file" accept="image/*" capture="environment" multiple />
    <div style="display:flex;gap:.5rem;margin-top:.75rem">
      <button class="primary" onclick="saveLead()">Save Lead</button>
      <button class="ghost" onclick="go('dashboard')">Cancel</button>
    </div>
    <div id="l_msg" style="margin-top:.5rem"></div>
  </section>`;
}
async function saveLead(){
  const b = {
    type:'lead',
    date:new Date().toISOString().slice(0,10),
    time:new Date().toISOString(),
    address:(el('#l_addr').value||'').trim(),
    name:(el('#l_name').value||'').trim(),
    phone:(el('#l_phone').value||'').trim(),
    email:(el('#l_email').value||'').trim(),
    service:el('#l_service').value,
    urgency:el('#l_urgency').value,
    timeline:el('#l_timeline').value,
    budget:el('#l_budget').value,
    notes:(el('#l_notes').value||'').trim(),
    turf:'',source:'PWA',rep:S.rep||''
  };
  if(!b.name||!b.phone){ alert('Name and phone required'); return; }
  let photosBase64=[];
  const inp=el('#l_photos'); if(inp.files&&inp.files.length){ photosBase64=await readFilesAsBase64Limited(inp,3,1280); }
  const item = {...b, photosBase64};
  try{
    const r = await fetch(S.endpoint,{method:'POST',headers:{'Content-Type':'application/json'}, body: JSON.stringify(item)});
    const t = await r.text();
    el('#l_msg').innerHTML = r.ok ? '<span class="success">Lead saved ✓</span>' : '<span class="error">Error: '+t+'</span>';
  }catch(e){
    S.queue.push(item); el('#l_msg').innerHTML = '<span class="error">Offline: queued</span>';
  }
  S.leadsLog.push(item); saveLS();
}

// Map / Turf with Leaflet.draw
function renderMapView(){
  el('#view').innerHTML = `
  <section class="card">
    <h2>Map / Turf</h2>
    <div class="stats" style="margin-bottom:.5rem">
      <button class="primary" onclick="startHere()">Start Here</button>
      <button class="ghost" onclick="exportPoints()">Export Points</button>
      <button class="ghost" onclick="exportPolygon()">Export Polygon</button>
      <label class="ghost" style="padding:.6rem 1rem;border-radius:12px;border:1px solid var(--line);">
        Import GeoJSON <input type="file" accept="application/geo+json,application/json" style="display:none" onchange="importGeo(event)">
      </label>
    </div>
    <div id="map" class="map"></div>
    <p class="muted">Draw a polygon (✏️), or import one. Tap markers to log quick visits. Green = eligible (≥ ${S.cooldownDays}d), gray = cooling.</p>
    <div id="map_msg"></div>
  </section>`;
  setTimeout(()=>{
    if(!S.map){
      S.map = L.map('map').setView([45.64,-122.67], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; OSM'}).addTo(S.map);
      S.drawn = new L.FeatureGroup(); S.map.addLayer(S.drawn);
      const drawCtrl = new L.Control.Draw({ draw:{ polyline:false, rectangle:false, circle:false, circlemarker:false, marker:false }, edit:{ featureGroup:S.drawn } });
      S.map.addControl(drawCtrl);
      S.map.on(L.Draw.Event.CREATED, function (e) {
        S.drawn.clearLayers();
        S.drawnLayer = e.layer; S.drawn.addLayer(e.layer);
      });
    } else { S.map.invalidateSize(); }
  }, 50);
}

// Turf helpers
function exportPoints(){
  if(!S.markers.length){ alert('No markers'); return; }
  const fc = { type:'FeatureCollection', features: S.markers.map(({lat,lng})=>({type:'Feature',geometry:{type:'Point',coordinates:[lng,lat]},properties:{}})) };
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(fc,null,2)],{type:'application/geo+json'})); a.download='turf_points.geojson'; a.click();
}
function exportPolygon(){
  if(!S.drawnLayer){ alert('Draw a polygon first'); return; }
  const gj = S.drawnLayer.toGeoJSON();
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(gj,null,2)],{type:'application/geo+json'})); a.download='turf_polygon.geojson'; a.click();
}
async function importGeo(evt){
  const file = evt.target.files[0]; if(!file) return;
  const text = await file.text(); let gj=null; try{ gj=JSON.parse(text);}catch(e){ alert('Invalid JSON'); return; }
  // Clear
  S.markers.forEach(m=> S.map.removeLayer(m.marker)); S.markers=[];
  S.drawn.clearLayers(); S.drawnLayer=null;
  const pts=[];
  if(gj.type==='FeatureCollection'){
    for(const f of gj.features||[]){
      if(f.geometry?.type==='Point'){ const [lng,lat]=f.geometry.coordinates; pts.push([lat,lng]); createMarker(lat,lng); }
      if(f.geometry?.type==='Polygon'){ const p = L.geoJSON(f); p.addTo(S.drawn); S.drawnLayer=p.getLayers()[0]; }
    }
  } else if(gj.type==='Polygon'){
    const p = L.geoJSON(gj); p.addTo(S.drawn); S.drawnLayer=p.getLayers()[0];
  }
  if(pts.length){ const b=L.latLngBounds(pts.map(p=>L.latLng(p[0],p[1]))); S.map.fitBounds(b.pad(0.25)); }
  colorMarkers();
}
// Markers + cool down
function createMarker(lat,lng){
  const m = L.marker([lat,lng]);
  m.on('click', async ()=>{
    const addr = await reverseGeocode(lat,lng);
    const eligible = !S.visitsIndex[addr] || daysSince(S.visitsIndex[addr]) >= S.cooldownDays;
    const msg = eligible ? '<span class="success">Eligible</span>' : '<span class="error">Cooling</span>';
    L.popup().setLatLng([lat,lng]).setContent(`
      <div class="mono">${addr}</div>
      <div>${msg}</div>
      <div style="display:flex;gap:.5rem;margin-top:.5rem;flex-wrap:wrap">
        <button onclick="quickVisit('${addr.replace(/'/g,"\'")}','Lead')">Lead</button>
        <button onclick="quickVisit('${addr.replace(/'/g,"\'")}','No Answer')">No Answer</button>
        <button onclick="quickVisit('${addr.replace(/'/g,"\'")}','Left Literature')">Left Lit</button>
        <button onclick="quickObjection('${addr.replace(/'/g,"\'")}')">Objection</button>
      </div>`).openOn(S.map);
  });
  m.addTo(S.map); S.markers.push({marker:m, lat, lng}); return m;
}
function colorMarkers(){
  S.markers.forEach(async ({marker,lat,lng})=>{
    const addr = await reverseGeocode(lat,lng);
    const eligible = !S.visitsIndex[addr] || daysSince(S.visitsIndex[addr]) >= S.cooldownDays;
    const icon = new L.DivIcon({className:'', html:`<div style="width:14px;height:14px;border-radius:50%;border:2px solid #000;background:${eligible?'#4ade80':'#6b7280'}"></div>`});
    marker.setIcon(icon);
  });
}

async function reverseGeocode(lat,lng){
  try{
    const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`;
    const j = await fetch(u, {headers:{'Accept':'application/json'}}).then(r=>r.json());
    return j.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }catch(e){ return `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
}

// Quick-visit helpers
async function quickVisit(address, outcome){
  const item = {
    type: outcome==='Lead' ? 'lead' : 'visit',
    date:new Date().toISOString().slice(0,10),
    time:new Date().toISOString(),
    address, name:'', phone:'', email:'',
    service:'', urgency:'', timeline:'', budget:'',
    notes:'(map quick-visit)', turf:'', source:'PWA', rep:S.rep||'',
    outcome: outcome==='Lead'? undefined: outcome
  };
  try{
    const r = await fetch(S.endpoint,{method:'POST',headers:{'Content-Type':'application/json'}, body: JSON.stringify(item)});
    if(!r.ok) throw new Error('HTTP '+r.status);
  }catch(e){ S.queue.push(item); }
  S.visitsIndex[address]=new Date().toISOString(); saveLS(); colorMarkers();
  S.visitsLog.push(item); saveLS();
  el('#map_msg').textContent = 'Saved (or queued)';
}
function quickObjection(address){
  const o = prompt('Objection: Renter / Already have someone / Too Busy / Cost / Later / Other','Renter');
  if(!o) return;
  return quickVisitObjection(address, o);
}
async function quickVisitObjection(address, objection){
  const item = {
    type:'visit',
    date:new Date().toISOString().slice(0,10),
    time:new Date().toISOString(),
    address, name:'', phone:'', email:'',
    service:'', urgency:'', timeline:'', budget:'',
    notes:'(map quick-objection)', turf:'', source:'PWA', rep:S.rep||'',
    outcome:'Objection', objection
  };
  try{
    const r = await fetch(S.endpoint,{method:'POST',headers:{'Content-Type':'application/json'}, body: JSON.stringify(item)});
    if(!r.ok) throw new Error('HTTP '+r.status);
  }catch(e){ S.queue.push(item); }
  S.visitsIndex[address]=new Date().toISOString(); saveLS(); colorMarkers();
  S.visitsLog.push(item); saveLS();
  el('#map_msg').textContent = 'Saved (or queued)';
}

// Boot
window.addEventListener('load', boot);
