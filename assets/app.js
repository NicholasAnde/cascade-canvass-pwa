// === Shared state & persistence ===
const S = {
  rep: localStorage.getItem('rep') || '',
  endpoint: null,
  cooldownDays: 90,
  visitsIndex: JSON.parse(localStorage.getItem('visitsIndex') || '{}'),
  visitsLog: JSON.parse(localStorage.getItem('visitsLog') || '[]'),
  leadsLog: JSON.parse(localStorage.getItem('leadsLog') || '[]'),
  queue: JSON.parse(localStorage.getItem('queue') || '[]'),
  // NEW: user preferences
  fontScale: parseFloat(localStorage.getItem('fontScale') || '1'),
  btnScale: parseFloat(localStorage.getItem('btnScale') || '1'),
  // Map & scripts
  map:null, markers:[], drawn:null, drawnLayer:null,
  scriptStats: JSON.parse(localStorage.getItem('scriptStats') || '{}')
};

const el = s => document.querySelector(s);
const saveLS = () => {
  localStorage.setItem('visitsIndex', JSON.stringify(S.visitsIndex));
  localStorage.setItem('visitsLog', JSON.stringify(S.visitsLog));
  localStorage.setItem('leadsLog', JSON.stringify(S.leadsLog));
  localStorage.setItem('queue', JSON.stringify(S.queue));
  localStorage.setItem('fontScale', String(S.fontScale));
  localStorage.setItem('btnScale', String(S.btnScale));
  localStorage.setItem('scriptStats', JSON.stringify(S.scriptStats));
};

// Apply UI scales
function applyScales(){
  const r = document.documentElement.style;
  r.setProperty('--font-scale', S.fontScale);
  r.setProperty('--btn-scale', S.btnScale);
}

async function boot(){
  applyScales();
  try{
    const cfg = await fetch('./app.settings.json').then(r=>r.json());
    S.endpoint = cfg.sheetsEndpoint; S.cooldownDays = cfg.cooldownDays || 90;
    el('#ep').textContent = S.endpoint;
  }catch(e){ el('#ep').textContent = '(endpoint not loaded)'; }

  // NEW: background retry without manual refresh
  window.addEventListener('online', retryQueue);
  setInterval(retryQueue, 60_000); // try every 60s

  go('dashboard');
}

function go(tab){
  if(tab==='dashboard') renderDashboard();
  if(tab==='map') renderMapView();
  if(tab==='knock') renderKnock();
  if(tab==='lead') renderLead();
  if(tab==='scripts') renderScripts();
  if(tab==='settings') renderSettings();
}

// ---------- CSV export ----------
function toCSV(rows){
  const esc=v=>('"'+String(v??'').replace(/"/g,'""')+'"');
  const keys=Object.keys(rows[0]||{});
  return [keys.map(esc).join(','), ...rows.map(r=>keys.map(k=>esc(r[k])).join(','))].join('\n');
}
function downloadCSV(name, rows){
  if(!rows.length){ alert('No data'); return; }
  const blob = new Blob([toCSV(rows)], {type:'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
}

// ---------- Dashboard (bigger, only functional buttons) ----------
function renderDashboard(){
  const hasVisits = S.visitsLog.length > 0;
  const hasLeads  = S.leadsLog.length  > 0;

  el('#view').innerHTML = `
  <section class="card">
    <h2>Welcome ${S.rep?('<span class="success">'+S.rep+'</span>'):'(Set Rep in Settings)'} </h2>
    <div class="stats">
      <span class="badge">Cooldown ${S.cooldownDays}d</span>
      <span class="badge">Photos</span>
      <span class="badge">OSM + Turf</span>
      <span class="badge">Scripts</span>
      <span class="badge">Offline queue (${S.queue.length})</span>
    </div>
    <div class="btn-row" style="margin-top:.6rem">
      <button class="primary" onclick="go('knock')">Next Door</button>
      <button class="primary" onclick="go('lead')">New Lead</button>
      <button class="primary" onclick="go('map')">Map / Turf</button>
      ${hasVisits ? `<button class="ghost" onclick="downloadCSV('visits.csv', S.visitsLog)">Export Visits</button>` : ``}
      ${hasLeads  ? `<button class="ghost" onclick="downloadCSV('leads.csv',  S.leadsLog )">Export Leads</button>`  : ``}
    </div>
  </section>`;
}

// ---------- Settings (font + button size controls) ----------
function renderSettings(){
  el('#view').innerHTML = `
  <section class="card">
    <h2>Settings</h2>
    <div class="row">
      <div>
        <label>Rep Name</label>
        <input id="s_rep" value="${S.rep||''}" placeholder="Your name">
      </div>
      <div>
        <label>Font Size</label>
        <select id="s_font">
          ${[0.9,1.0,1.1,1.2,1.3,1.4,1.5].map(v=>`<option value="${v}" ${S.fontScale===v?'selected':''}>${Math.round(v*100)}%</option>`).join('')}
        </select>
      </div>
      <div>
        <label>Button Size</label>
        <select id="s_btn">
          ${[0.9,1.0,1.1,1.2,1.3,1.4,1.5,1.6].map(v=>`<option value="${v}" ${S.btnScale===v?'selected':''}>${Math.round(v*100)}%</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="btn-row" style="margin-top:.6rem">
      <button class="primary" onclick="savePrefs()">Save</button>
      <button class="ghost"   onclick="refreshCache()">Refresh Offline Cache</button>
      <button class="ghost"   onclick="retryQueue()">Retry Offline Queue (${S.queue.length})</button>
    </div>
    <p class="mono" style="margin-top:.5rem;">Endpoint: ${S.endpoint||'(not loaded)'}</p>
  </section>`;
}
function savePrefs(){
  const rep = el('#s_rep').value.trim();
  if(rep){ S.rep = rep; localStorage.setItem('rep', rep); }
  S.fontScale = parseFloat(el('#s_font').value);
  S.btnScale  = parseFloat(el('#s_btn').value);
  applyScales(); saveLS();
  go('dashboard');
}
async function refreshCache(){
  if('caches' in window){
    const ks = await caches.keys(); await Promise.all(ks.map(k=>caches.delete(k)));
    location.reload();
  }
}
async function retryQueue(){
  if(!S.queue.length) return;
  const q=[...S.queue]; S.queue=[]; saveLS();
  for(const it of q){
    try{
      const r = await fetch(S.endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(it)});
      if(!r.ok) throw new Error('HTTP '+r.status);
    }catch(e){ S.queue.push(it); }
  }
  saveLS();
}

// ---------- Knock ----------
function renderKnock(){
  el('#view').innerHTML = `
  <section class="card">
    <h2>Next Door</h2>
    <div class="row">
      <div><label>Address*</label><input id="k_addr" placeholder="1208 Maple St"></div>
      <div><label>Notes</label><input id="k_notes" placeholder="Optional"></div>
    </div>
    <div class="btn-row" style="margin-top:.6rem">
      <button class="primary" onclick="postVisit('Lead')">Lead</button>
      <button class="ghost"   onclick="postVisit('No Answer')">No Answer</button>
      <button class="ghost"   onclick="postVisit('Left Literature')">Left Literature</button>
      <button class="ghost"   onclick="openObjection()">Objection</button>
      <button class="ghost"   onclick="autoFillAddressFromGPS()">Use my location</button>
    </div>
    <div id="k_msg" style="margin-top:.5rem"></div>
  </section>`;
}
function openObjection(){
  const o = prompt('Objection: Renter / Already have someone / Too Busy / Cost / Later / Other','Renter');
  if(!o) return; postVisit('Objection', o);
}
async function autoFillAddressFromGPS(){
  if(!navigator.geolocation){ alert('Geolocation not available'); return; }
  navigator.geolocation.getCurrentPosition(async pos=>{
    const {latitude, longitude} = pos.coords;
    try{
      const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=en`;
      const j = await fetch(u,{headers:{'Accept':'application/json'}}).then(r=>r.json());
      el('#k_addr').value = j.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    }catch(e){ el('#k_addr').value = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`; }
  }, ()=> alert('Location error'));
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
    outcome: outcome==='Lead'? undefined : outcome,
    objection: objection||''
  };
  try{
    const r = await fetch(S.endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(item)});
    if(!r.ok) throw new Error('HTTP '+r.status);
    el('#k_msg').innerHTML = '<span class="success">Saved ✓</span>';
  }catch(e){
    S.queue.push(item);
    el('#k_msg').innerHTML = '<span class="error">Offline: queued</span>';
  }
  S.visitsIndex[addr] = new Date().toISOString(); S.visitsLog.push(item); saveLS();
  if(outcome==='Lead') go('lead');
}

// ---------- Lead with photos ----------
async function readFilesAsBase64Limited(input,max=3,maxW=1280){
  const files = Array.from(input.files||[]).slice(0,max);
  const out = [];
  for(const f of files){
    const img = await createImageBitmap(f);
    const c = document.createElement('canvas');
    const scale = Math.min(1, maxW/img.width);
    c.width = Math.round(img.width*scale); c.height = Math.round(img.height*scale);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    out.push(c.toDataURL('image/jpeg',0.85));
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
    <div class="btn-row" style="margin-top:.6rem">
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
    turf:'', source:'PWA', rep:S.rep||''
  };
  if(!b.name || !b.phone){ alert('Name and phone required'); return; }
  let photosBase64 = [];
  const inp = el('#l_photos'); if(inp.files && inp.files.length){ photosBase64 = await readFilesAsBase64Limited(inp,3,1280); }
  const item = {...b, photosBase64};
  try{
    const r = await fetch(S.endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(item)});
    const t = await r.text();
    el('#l_msg').innerHTML = r.ok ? '<span class="success">Lead saved ✓</span>' : '<span class="error">Error: '+t+'</span>';
  }catch(e){
    S.queue.push(item);
    el('#l_msg').innerHTML = '<span class="error">Offline: queued</span>';
  }
  S.leadsLog.push(item); saveLS();
}

// ---------- Map / Turf (unchanged features; drawer-aware) ----------
function renderMapView(){
  el('#view').innerHTML = `
  <section class="card">
    <h2>Map / Turf</h2>
    <div class="btn-row" style="margin-bottom:.5rem">
      <button class="primary" onclick="startHere()">Start Here</button>
      <button class="ghost" onclick="exportPoints()">Export Points</button>
      <button class="ghost" onclick="exportPolygon()">Export Polygon</button>
      <label class="ghost" style="padding:.6rem 1rem;border-radius:12px;border:1px solid var(--line);">
        Import GeoJSON <input type="file" accept="application/geo+json,application/json" style="display:none" onchange="importGeo(event)">
      </label>
    </div>
    <div id="map" class="map"></div>
    <p class="muted">Tap markers to quick-log. Green = eligible (≥ ${S.cooldownDays}d), gray = cooling.</p>
    <div id="map_msg"></div>
  </section>`;
  setTimeout(()=>{
    if(!S.map){
      S.map = L.map('map').setView([45.64,-122.67], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; OSM'}).addTo(S.map);
      S.drawn = new L.FeatureGroup(); S.map.addLayer(S.drawn);
      const draw = new L.Control.Draw({ draw:{ polyline:false, rectangle:false, circle:false, circlemarker:false, marker:false }, edit:{ featureGroup:S.drawn } });
      S.map.addControl(draw);
      S.map.on(L.Draw.Event.CREATED, (e)=>{ S.drawn.clearLayers(); S.drawnLayer=e.layer; S.drawn.addLayer(e.layer); });
    } else { S.map.invalidateSize(); }
  }, 50);
}

// helpers for Map/Turf
function exportPoints(){ /* ... unchanged from your previous unified build ... */ }
function exportPolygon(){ /* ... unchanged ... */ }
async function importGeo(evt){ /* ... unchanged ... */ }
function createMarker(lat,lng){ /* ... unchanged ... */ }
function colorMarkers(){ /* ... unchanged ... */ }
async function reverseGeocode(lat,lng){ /* ... unchanged ... */ }
async function quickVisit(address,outcome){ /* ... unchanged ... */ }
function quickObjection(address){ /* ... unchanged ... */ }
async function quickVisitObjection(address,objection){ /* ... unchanged ... */ }
function startHere(){ /* ... unchanged ... */ }

// ---------- Scripts & Rebuttals (unchanged API; reads assets/scripts.json) ----------
async function renderScripts(){
  const lib = await fetch('./assets/scripts.json').then(r=>r.json());
  const seasonOpts = Object.keys(lib.seasons).map(s=>`<option>${s}</option>`).join('');
  const audOpts    = Object.keys(lib.audience).map(s=>`<option>${s}</option>`).join('');
  const locOpts    = Object.keys(lib.localCues).map(s=>`<option>${s}</option>`).join('');

  el('#view').innerHTML = `
  <section class="card">
    <h2>Scripts & Rebuttals</h2>
    <div class="row">
      <div><label>Season</label><select id="s_season">${seasonOpts}</select></div>
      <div><label>Audience</label><select id="s_aud">${audOpts}</select></div>
      <div><label>Local Cue</label><select id="s_local">${locOpts}</select></div>
    </div>
    <div id="scriptBox" class="card"></div>
    <div id="rebuttals"></div>
  </section>`;

  const month=new Date().getMonth()+1;
  const def=(month>=3&&month<=5)?'Spring':(month>=6&&month<=8)?'Summer':(month>=9&&month<=11)?'Fall':'Winter';
  el('#s_season').value=def; el('#s_aud').value='General'; el('#s_local').value='Felida';

  const refresh=()=>{
    const s=el('#s_season').value, a=el('#s_aud').value, l=el('#s_local').value;
    const hook=lib.seasons[s], tilt=lib.audience[a]?(' '+lib.audience[a]):'', local=lib.localCues[l]?(' '+lib.localCues[l]):'';
    el('#scriptBox').innerHTML = `
      <p><b>Hook:</b> ${hook}</p>
      <p><b>Opener:</b> ${lib.core.opener}</p>
      <p><b>Ask:</b> ${lib.core.ask}</p>
      <p><b>Close:</b> ${lib.core.close}</p>
      <p class='muted'><i>${(tilt+(tilt&&local?' • ':'')+local).trim()}</i></p>`;

    el('#rebuttals').innerHTML = Object.keys(lib.rebuttals).map(k=>{
      const A=S.scriptStats[`${k}__A`]||{used:0,won:0}, B=S.scriptStats[`${k}__B`]||{used:0,won:0};
      const rate=o=>o.used?Math.round((o.won/o.used)*100)+'%':'—';
      return `<div class="card"><b>${k}</b><br/>
        A) ${lib.rebuttals[k].A}<br/>B) ${lib.rebuttals[k].B}<br/>
        <div class="btn-row" style="margin-top:.5rem">
          <button onclick="markUsed('${k}','A')">Used A</button>
          <button onclick="markWon('${k}','A')">Won A</button>
          <button onclick="markUsed('${k}','B')">Used B</button>
          <button onclick="markWon('${k}','B')">Won B</button>
        </div>
        <small class="muted">A: ${A.won}/${A.used} (${rate(A)}) • B: ${B.won}/${B.used} (${rate(B)})</small>
      </div>`;
    }).join('');
  };
  ['s_season','s_aud','s_local'].forEach(id=>el('#'+id).addEventListener('change',refresh));
  refresh();
}
function markUsed(k,v){ const key=`${k}__${v}`; S.scriptStats[key]=S.scriptStats[key]||{used:0,won:0}; S.scriptStats[key].used++; saveLS(); renderScripts(); }
function markWon(k,v){  const key=`${k}__${v}`; S.scriptStats[key]=S.scriptStats[key]||{used:0,won:0}; S.scriptStats[key].used++; S.scriptStats[key].won++; saveLS(); renderScripts(); }

// Boot
window.addEventListener('load', boot);
