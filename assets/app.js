// Cascade Canvass — Stable Full (geocode + loop + clear-queue + map quick‑log)

const S = {
  rep: localStorage.getItem('rep') || '',
  endpoint: null,
  cooldownDays: 90,
  visitsLog: JSON.parse(localStorage.getItem('visitsLog') || '[]'),
  leadsLog: JSON.parse(localStorage.getItem('leadsLog') || '[]'),
  queue: JSON.parse(localStorage.getItem('queue') || '[]'),
  secret: '', emailNotifyTo: '',
  map:null, drawn:null, drawnLayer:null, markers: []
};

const el = s => document.querySelector(s);
function saveLS(){
  localStorage.setItem('visitsLog', JSON.stringify(S.visitsLog));
  localStorage.setItem('leadsLog', JSON.stringify(S.leadsLog));
  localStorage.setItem('queue', JSON.stringify(S.queue));
}
function showToast(message, type='success'){
  const root = el('#toast-root'); if(!root) return alert(message);
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  div.innerHTML = `<div>${message}</div><button class="close" aria-label="Close">×</button>`;
  root.appendChild(div);
  const close = ()=>{ div.style.animation = 'toast-out .16s ease forwards'; setTimeout(()=>div.remove(), 160); };
  div.querySelector('.close').onclick = close;
  setTimeout(close, type==='error' ? 4200 : 2400);
}
function setActiveTab(tab){
  document.querySelectorAll('.tabs [data-tab]').forEach(b=>b.classList.toggle('active', b.getAttribute('data-tab')===tab));
}
async function swapView(renderFn, tab){
  const v = el('#view'); if(!v){ renderFn(); return; }
  v.classList.add('view-exit'); await new Promise(r=>setTimeout(r,120));
  renderFn();
  requestAnimationFrame(()=>{ v.classList.remove('view-exit'); v.classList.add('view-enter'); setTimeout(()=>v.classList.remove('view-enter'),180); });
  if(tab) setActiveTab(tab);
}
function go(tab){
  const routes = {dashboard:renderDashboard, knock:renderKnock, lead:renderLead, map:renderMapView, settings:renderSettings};
  const fn = routes[tab] || renderDashboard;
  swapView(fn, tab);
}

async function boot(){
  try{
    const cfg = await fetch('./app.settings.json').then(r=>r.json());
    S.endpoint = cfg.sheetsEndpoint; S.cooldownDays = cfg.cooldownDays || 90;
    S.secret = cfg.sharedSecret || ''; S.emailNotifyTo = cfg.emailNotifyTo || '';
    const so = localStorage.getItem('secretOverride'); const eo = localStorage.getItem('emailOverride');
    if (so) S.secret = so; if (eo) S.emailNotifyTo = eo;
    el('#ep').textContent = S.endpoint || '(none)';
  }catch(e){ el('#ep').textContent = '(endpoint not loaded)'; }
  window.addEventListener('online', retryQueue);
  setInterval(retryQueue, 45000);
}
window.addEventListener('load', boot);

// CSV helpers
function toCSV(rows){
  const esc=v=>('"' + String(v??'').replace(/"/g,'""') + '"');
  const keys=Object.keys(rows[0]||{});
  return [keys.map(esc).join(','), ...rows.map(r=>keys.map(k=>esc(r[k])).join(','))].join('\n');
}
function downloadCSV(name, rows){
  if(!rows.length){ showToast('No data to export','info'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([toCSV(rows)], {type:'text/csv'}));
  a.download = name; a.click();
}

// Reverse geocode (Nominatim) with gentle rate-limit
let _lastRG = 0;
async function reverseGeocode(lat,lng){
  try{
    const now = Date.now();
    if (now - _lastRG < 1200) await new Promise(r=>setTimeout(r, 1200-(now-_lastRG)));
    _lastRG = Date.now();
    const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`;
    const j = await fetch(u,{headers:{'Accept':'application/json','User-Agent':'Cascade-Canvass-PWA'}}).then(r=>r.json());
    return j.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }catch(e){
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

// Views
function renderDashboard(){
  el('#view').innerHTML = `
  <section class="card">
    <h2>Dashboard</h2>
    <div class="tiles" style="margin-top:.6rem">
      <div class="tile primary" onclick="go('knock')"><div class="big">Next Door</div><div class="sub">Knock & log quickly</div></div>
      <div class="tile primary" onclick="go('lead')"><div class="big">New Lead</div><div class="sub">Details & photos</div></div>
      <div class="tile" onclick="go('map')"><div class="big">Map / Turf</div><div class="sub">Plan & export</div></div>
      <div class="tile" onclick="go('settings')"><div class="big">Settings</div><div class="sub">Prefs & Admin</div></div>
    </div>
    <div class="btn-row" style="margin-top:1rem">
      <button class="ghost" onclick="downloadCSV('visits.csv', S.visitsLog)">Export Visits</button>
    </div>
    <p class="mono" style="opacity:.7;margin-top:.5rem">Offline queue: ${S.queue.length}</p>
  </section>`;
}

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
      <button class="ghost" onclick="postVisit('No Answer')">No Answer</button>
      <button class="ghost" onclick="postVisit('Left Literature')">Left Literature</button>
      <button class="ghost" onclick="openObjection()">Objection</button>
      <button class="ghost" onclick="autoFillAddressFromGPS()">Use My Location</button>
    </div>
  </section>`;
}
function autoFillAddressFromGPS(){
  if(!navigator.geolocation){ showToast('Geolocation not available','error'); return; }
  navigator.geolocation.getCurrentPosition(async pos=>{
    const {latitude, longitude} = pos.coords;
    const addr = await reverseGeocode(latitude, longitude);
    el('#k_addr').value = addr;
    showToast('Address filled from GPS','success');
  }, ()=> showToast('Location error','error'));
}

function openObjection(){
  const o = prompt('Objection: Renter / Already have someone / Too Busy / Cost / Later / Other','Renter');
  if(!o) return; postVisit('Objection', o);
}
async function postVisit(outcome, objection=''){
  const addr = (el('#k_addr').value||'').trim();
  const notes = (el('#k_notes').value||'').trim();
  if(!addr){ showToast('Address is required.','error'); el('#k_addr').focus(); return; }
  const item = {
    type: outcome==='Lead' ? 'lead' : 'visit',
    date: new Date().toISOString().slice(0,10),
    time: new Date().toISOString(),
    address: addr, name:'', phone:'', email:'',
    service:'', urgency:'', timeline:'', budget:'',
    notes, turf:'', source:'PWA', rep:S.rep||'',
    outcome: outcome==='Lead'? undefined : outcome,
    objection: objection||'',
    secret: S.secret, emailNotifyTo: S.emailNotifyTo
  };
  try{
    const r = await fetch(S.endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(item)});
    if(!r.ok) throw new Error('HTTP '+r.status);
    showToast('Visit saved ✓','success');
  }catch(e){
    S.queue.push(item); saveLS();
    showToast('Offline: visit queued','info');
  }
  S.visitsLog.push(item); saveLS();
  if(outcome==='Lead') go('lead');
}

// Lead with photos
function readFilesAsBase64Limited(input, max=3, maxW=1280){
  const files = Array.from(input.files||[]).slice(0,max);
  const out = [];
  return new Promise(resolve=>{
    let i=0;
    const next=()=>{
      if(i>=files.length) return resolve(out);
      const file=files[i++];
      const fr=new FileReader();
      fr.onload=()=>{
        const img=new Image();
        img.onload=()=>{
          const scale = Math.min(1, maxW/img.naturalWidth);
          const w = Math.round(img.naturalWidth*scale), h = Math.round(img.naturalHeight*scale);
          const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').drawImage(img,0,0,w,h);
          out.push(c.toDataURL('image/jpeg',0.85));
          next();
        };
        img.src=fr.result;
      };
      fr.readAsDataURL(file);
    };
    next();
  });
}
function digitsOnly(s){ return String(s||'').replace(/\D/g,''); }
function toE164(phone){ const d=digitsOnly(phone); if(d.length===10) return '+1'+d; if(d.length>10 && d.length<=15) return '+'+d; return null; }
function validE164(p){ return /^\+[1-9]\d{7,14}$/.test(p); }

function renderLead(){
  el('#view').innerHTML = `
  <section class="card">
    <h2>New Lead</h2>
    <div class="row">
      <div><label>Name*</label><input id="l_name"></div>
      <div><label>Phone*</label><input id="l_phone" placeholder="(###) ###-####"></div>
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
        <select id="l_budget"><option>&lt;$500</option><option>$500+</option><option>$1k+</option></select>
      </div>
    </div>
    <label>Notes</label><textarea id="l_notes" rows="4"></textarea>
    <label style="margin-top:.5rem">Photos (up to 3)</label>
    <input id="l_photos" type="file" accept="image/*" capture="environment" multiple />
    <div class="btn-row" style="margin-top:.6rem">
      <button class="primary" onclick="saveLead()">Save Lead</button>
      <button class="ghost" onclick="go('dashboard')">Cancel</button>
    </div>
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
    turf:'', source:'PWA', rep:S.rep||'',
    photos:[]
  };
  if(!b.name){ showToast('Please enter the contact name.','error'); el('#l_name').focus(); return; }
  const e164 = toE164(b.phone);
  if(!e164 || !validE164(e164)){ showToast('Enter a valid phone (US 10-digit or +country).','error'); el('#l_phone').focus(); return; }
  b.phone = e164;

  const input = el('#l_photos');
  if(input && input.files && input.files.length){
    try{ b.photos = await readFilesAsBase64Limited(input,3,1280); }catch(e){}
  }

  const payload = { ...b, secret: S.secret, emailNotifyTo: S.emailNotifyTo };
  try{
    const r = await fetch(S.endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
    if(!r.ok) throw new Error('HTTP '+r.status);
    showToast('Lead saved ✓','success');
  }catch(e){
    S.queue.push(payload); saveLS();
    showToast('Offline: lead queued','info');
  }
  S.leadsLog.push(payload); saveLS();
}

// Settings
function renderSettings(){
  el('#view').innerHTML = `
  <section class="card">
    <h2>Settings</h2>
    <div class="row">
      <div><label>Rep Name</label><input id="s_rep" value="${S.rep||''}" placeholder="Your name"></div>
    </div>
    <div class="btn-row" style="margin-top:.6rem">
      <button class="primary" onclick="savePrefs()">Save</button>
      <button class="ghost" onclick="downloadCSV('leads.csv', S.leadsLog)">Export Leads</button>
      <button class="ghost" onclick="refreshCache()">Refresh Offline Cache</button>
      <button class="ghost" onclick="retryQueue()">Retry Offline Queue (${S.queue.length})</button>
      <button class="ghost" onclick="clearQueue()">Clear Queue</button>
      <button class="ghost" onclick="toggleAdmin()">Admin</button>
    </div>
    <p class="mono" style="margin-top:.5rem;">Endpoint: ${S.endpoint||'(not loaded)'} • Email: ${S.emailNotifyTo||'—'}</p>

    <div id="admin" class="card" style="display:none;margin-top:1rem">
      <h3>Admin</h3>
      <div class="row">
        <div><label>Shared Secret (local override)</label><input id="adm_secret" value="${S.secret||''}" placeholder="CHANGE_ME"></div>
        <div><label>Lead Email To (local override)</label><input id="adm_email" value="${S.emailNotifyTo||''}" placeholder="you@example.com"></div>
      </div>
      <div class="btn-row" style="margin-top:.6rem">
        <button class="primary" onclick="saveAdmin()">Save Overrides</button>
        <button class="ghost" onclick="clearAdmin()">Clear Overrides</button>
        <button class="ghost" onclick="testPost()">Test POST</button>
      </div>
      <p class="mono" id="adm_msg"></p>
    </div>
  </section>`;
}
function toggleAdmin(){ const a=el('#admin'); if(a) a.style.display = a.style.display==='none' ? 'block' : 'none'; }
function savePrefs(){ const rep=(el('#s_rep').value||'').trim(); if(rep){ S.rep=rep; localStorage.setItem('rep', rep); } showToast('Preferences saved ✓','success'); go('dashboard'); }
async function refreshCache(){ if('caches' in window){ const ks=await caches.keys(); await Promise.all(ks.map(k=>caches.delete(k))); location.reload(); } }

async function retryQueue(){
  if(!S.queue.length) return;
  const q=[...S.queue]; S.queue=[]; saveLS();
  let sent=0, failed=0, lastErr='';
  for(const item of q){
    item.secret = S.secret; item.emailNotifyTo = S.emailNotifyTo;
    try{
      const r = await fetch(S.endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(item)});
      if(!r.ok){ failed++; lastErr='HTTP '+r.status; throw new Error(lastErr); }
      sent++;
    }catch(e){
      S.queue.push(item); lastErr = String(e?.message||e||'send failed');
    }
  }
  saveLS();
  if(sent) showToast(`Synced ${sent} ✓`,'success');
  if(failed) showToast(`${failed} still queued (${lastErr})`,'info');
}
function clearQueue(){
  const n = S.queue.length;
  if(!n) { showToast('Queue already empty','info'); return; }
  if(!confirm(`Permanently discard ${n} queued item(s)?`)) return;
  S.queue = []; saveLS(); showToast('Queue cleared','success');
}
function saveAdmin(){ const s=(el('#adm_secret').value||'').trim(); const e=(el('#adm_email').value||'').trim();
  if(s){ localStorage.setItem('secretOverride', s); S.secret=s; }
  if(e){ localStorage.setItem('emailOverride', e); S.emailNotifyTo=e; }
  showToast('Overrides saved','success'); el('#adm_msg').textContent='Overrides saved locally.';
}
function clearAdmin(){ localStorage.removeItem('secretOverride'); localStorage.removeItem('emailOverride'); el('#adm_msg').textContent='Overrides cleared. Reload app for file config.'; }
async function testPost(){
  if(!S.endpoint){ el('#adm_msg').textContent='No endpoint configured.'; return; }
  const payload={ type:'visit', date:new Date().toISOString().slice(0,10), time:new Date().toISOString(), address:'TEST ADDRESS',
    notes:'(test payload)', outcome:'No Answer', source:'PWA', rep:S.rep||'', secret:S.secret||'', emailNotifyTo:S.emailNotifyTo||'' };
  try{
    const r=await fetch(S.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    el('#adm_msg').textContent = r.ok ? 'Test POST ok ✓' : ('HTTP '+r.status);
    showToast(r.ok?'Test POST ok ✓':'Test POST failed', r.ok?'success':'error');
  }catch(e){ el('#adm_msg').textContent=String(e); showToast('Test POST failed','error'); }
}

// Map / Turf with loop + quick‑log
function renderMapView(){
  el('#view').innerHTML = `
  <section class="card">
    <h2>Map / Turf</h2>
    <div id="map" class="map"></div>
    <div class="fab-wrap">
      <button class="fab" title="Start Here" onclick="startHere()">📍</button>
      <button class="fab" title="Generate Loop" onclick="generateDoorLoop()">◎</button>
      <button class="fab" title="Export Turf" onclick="exportGeoJSON()">⬆</button>
      <label class="fab" title="Import Turf" style="cursor:pointer">⬇
        <input id="gj_in" type="file" accept=".geojson,application/geo+json,application/json" style="display:none"/>
      </label>
    </div>
  </section>`;

  if(!S.map){
    S.map = L.map('map');
    S.map.setView([45.6387,-122.6615], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
    }).addTo(S.map);

    S.drawn = new L.FeatureGroup(); S.map.addLayer(S.drawn);
    const draw = new L.Control.Draw({
      edit: { featureGroup: S.drawn },
      draw: { circle:false, circlemarker:false }
    });
    S.map.addControl(draw);

    S.map.on(L.Draw.Event.CREATED, e=>{
      const layer = e.layer;
      layer.options.color = '#6cb3ff';
      S.drawn.addLayer(layer);
      S.drawnLayer = S.drawn;
    });
  } else {
    S.map.invalidateSize();
  }

  const input = document.getElementById('gj_in');
  if(input){
    input.addEventListener('change', e=>{
      const f = e.target.files && e.target.files[0]; if(!f) return;
      const r = new FileReader();
      r.onload = ()=>{
        try{
          const gj = JSON.parse(r.result);
          const layer = L.geoJSON(gj,{style:{color:'#6cb3ff'}});
          S.drawn.addLayer(layer); S.map.fitBounds(layer.getBounds(), {padding:[20,20]});
        }catch(_){ alert('Invalid GeoJSON'); }
        e.target.value='';
      };
      r.readAsText(f);
    });
  }
}
function exportGeoJSON(){
  const gj = S.drawn ? S.drawn.toGeoJSON() : {type:'FeatureCollection', features:[]};
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(gj,null,2)], {type:'application/geo+json'}));
  a.download = 'turf.geojson'; a.click();
}
function startHere(){
  if(!navigator.geolocation){ showToast('Geolocation not available','error'); return; }
  navigator.geolocation.getCurrentPosition(pos=>{
    const {latitude, longitude} = pos.coords;
    if(!S.map) renderMapView();
    S.map.setView([latitude, longitude], 16);
  }, ()=> showToast('Location error','error'));
}
function clearMarkers(){
  S.markers.forEach(m=> S.map.removeLayer(m)); S.markers = [];
}
function createMarker(lat,lng){
  const m = L.marker([lat,lng]).addTo(S.map);
  m.on('click', async ()=>{
    const addr = await reverseGeocode(lat,lng);
    const popup = document.createElement('div');
    popup.innerHTML = `
      <div class="mono" style="max-width:240px">${addr}</div>
      <div class="btn-row" style="margin-top:.4rem">
        <button class="primary" id="ql_lead">Lead</button>
        <button class="ghost" id="ql_no">No Answer</button>
        <button class="ghost" id="ql_lit">Left Literature</button>
        <button class="ghost" id="ql_obj">Objection</button>
      </div>`;
    const p = L.popup({maxWidth:260}).setLatLng([lat,lng]).setContent(popup);
    S.map.openPopup(p);

    setTimeout(()=>{
      const post = async (outcome, objection='')=>{
        const item = {
          type: outcome==='Lead' ? 'lead' : 'visit',
          date:new Date().toISOString().slice(0,10),
          time:new Date().toISOString(),
          address: addr, name:'', phone:'', email:'',
          service:'', urgency:'', timeline:'', budget:'',
          notes:'(map quick-log)', turf:'', source:'PWA', rep:S.rep||'',
          outcome: outcome==='Lead'? undefined : outcome,
          objection, secret: S.secret, emailNotifyTo: S.emailNotifyTo
        };
        try{
          const r = await fetch(S.endpoint,{method:'POST',headers:{'Content-Type':'application/json'}, body: JSON.stringify(item)});
          if(!r.ok) throw new Error('HTTP '+r.status);
          showToast((outcome==='Lead'?'Lead':'Visit')+' saved ✓','success');
        }catch(e){
          S.queue.push(item); saveLS();
          showToast('Offline: queued','info');
        }
        S.visitsLog.push(item); saveLS();
        if(outcome==='Lead') go('lead');
      };
      popup.querySelector('#ql_lead')?.addEventListener('click', ()=> post('Lead'));
      popup.querySelector('#ql_no')?.addEventListener('click', ()=> post('No Answer'));
      popup.querySelector('#ql_lit')?.addEventListener('click', ()=> post('Left Literature'));
      popup.querySelector('#ql_obj')?.addEventListener('click', ()=>{
        const o = prompt('Objection?','Renter');
        if(o) post('Objection', o);
      });
    }, 0);
  });
  S.markers.push(m); return m;
}
async function generateDoorLoop(n=20, radius=0.0015){
  if(!navigator.geolocation){ showToast('Geolocation not available','error'); return; }
  navigator.geolocation.getCurrentPosition(async pos=>{
    const {latitude, longitude} = pos.coords;
    clearMarkers();
    for(let i=0;i<n;i++){
      const ang = (i/n) * Math.PI*2;
      createMarker(latitude + radius*Math.cos(ang), longitude + radius*Math.sin(ang));
    }
    S.map.setView([latitude, longitude], 16);
    showToast(`Generated ~${n} markers around you`,'success');
  }, ()=> showToast('Location error','error'));
}
