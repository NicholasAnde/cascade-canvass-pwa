// === Shared state & persistence ===
const S = {
  rep: localStorage.getItem('rep') || '',
  endpoint: null,
  cooldownDays: 90,
  visitsIndex: JSON.parse(localStorage.getItem('visitsIndex') || '{}'),
  visitsLog: JSON.parse(localStorage.getItem('visitsLog') || '[]'),
  leadsLog: JSON.parse(localStorage.getItem('leadsLog') || '[]'),
  queue: JSON.parse(localStorage.getItem('queue') || '[]'),
  // user preferences
  fontScale: parseFloat(localStorage.getItem('fontScale') || '1'),
  btnScale: parseFloat(localStorage.getItem('btnScale') || '1'),
  // config overrides
  secret: '',
  emailNotifyTo: '',
  // map & scripts
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

// --- Toasts ---
function showToast(message, type='success', opts={}){
  const root = el('#toast-root'); if(!root) return alert(message);
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  div.innerHTML = `<span class="dot"></span><div>${message}</div><button class="close" aria-label="Close">×</button>`;
  root.appendChild(div);
  const close = ()=>{ div.style.animation = 'toast-out .16s ease forwards'; setTimeout(()=>div.remove(), 160); };
  div.querySelector('.close').onclick = close;
  try{ if(navigator.vibrate && type!=='info') navigator.vibrate(6); }catch(e){}
  const ms = opts.duration ?? (type==='error' ? 4200 : 2400);
  setTimeout(close, ms);
}

// View transition
async function swapView(renderFn){
  const v = el('#view');
  if(!v) return renderFn();
  v.classList.add('view-exit');
  await new Promise(r=>setTimeout(r, 140));
  renderFn();
  requestAnimationFrame(()=>{
    v.classList.remove('view-exit');
    v.classList.add('view-enter');
    setTimeout(()=>v.classList.remove('view-enter'), 180);
  });
}

async function boot(){
  applyScales();
  try{
    const cfg = await fetch('./app.settings.json').then(r=>r.json());
    S.endpoint = cfg.sheetsEndpoint;
    S.cooldownDays = cfg.cooldownDays || 90;
    S.secret = cfg.sharedSecret || "";
    S.emailNotifyTo = cfg.emailNotifyTo || "";
    // Local overrides (persisted in localStorage)
    const so = localStorage.getItem('secretOverride');
    const eo = localStorage.getItem('emailOverride');
    if (so) S.secret = so;
    if (eo) S.emailNotifyTo = eo;
    el('#ep').textContent = S.endpoint || '(none)';
  }catch(e){ el('#ep').textContent = '(endpoint not loaded)'; }

  // background retry without manual refresh
  window.addEventListener('online', retryQueue);
  setInterval(retryQueue, 60_000); // try every 60s

  go('dashboard');
}

document.addEventListener('DOMContentLoaded', boot);

function go(tab){
  const routes = {
    dashboard: renderDashboard,
    map: renderMapView,
    knock: renderKnock,
    lead: renderLead,
    scripts: renderScripts,
    settings: renderSettings
  };
  const fn = routes[tab] || renderDashboard;
  swapView(fn);
}

// ---------- CSV export ----------
function toCSV(rows){
  const esc=v=>('"' + String(v??'').replace(/"/g,'""') + '"');
  const keys=Object.keys(rows[0]||{});
  return [keys.map(esc).join(','), ...rows.map(r=>keys.map(k=>esc(r[k])).join(','))].join('\n');
}
function downloadCSV(name, rows){
  if(!rows.length){ alert('No data'); return; }
  const blob = new Blob([toCSV(rows)], {type:'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
}

// ---------- Dashboard ----------
function renderDashboard(){
  const hasVisits = S.visitsLog.length > 0;
  const hasLeads  = S.leadsLog.length  > 0;

  el('#view').innerHTML = `
  <section class="card">
    <h2>Welcome ${S.rep?('<span class="success">'+S.rep+'</span>'):'(Set Rep in Settings)'}</h2>
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

// ---------- Settings + Admin (long-press) ----------
function renderSettings(){
  el('#view').innerHTML = `
  <section class="card">
    <h2 id="settingsTitle" title="Press & hold to open admin">Settings</h2>
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
    <p class="mono" style="margin-top:.5rem;">Endpoint: ${S.endpoint||'(not loaded)'} • Email: ${S.emailNotifyTo||'—'}</p>

    <div id="adminCfg" class="card" style="display:none; margin-top:1rem;">
      <h3>Admin Config</h3>
      <div class="row">
        <div>
          <label>Shared Secret (local override)</label>
          <input id="adm_secret" value="${S.secret||''}" placeholder="CHANGE_ME">
        </div>
        <div>
          <label>Lead Email To (local override)</label>
          <input id="adm_email" value="${S.emailNotifyTo||''}" placeholder="you@example.com">
        </div>
      </div>
      <div class="btn-row" style="margin-top:.6rem">
        <button class="primary" onclick="saveAdminConfig()">Save Overrides</button>
        <button class="ghost" onclick="clearAdminConfig()">Clear Overrides</button>
        <button class="ghost" onclick="testPost()">Test POST</button>
      </div>
      <p class="mono" id="adm_msg"></p>
    </div>
  </section>`;

  const ttl = el('#settingsTitle');
  let pressTimer=null;
  const start = ()=>{ pressTimer=setTimeout(()=>toggleAdmin(true), 800); };
  const end   = ()=>{ clearTimeout(pressTimer); };
  ttl.addEventListener('mousedown', start);
  ttl.addEventListener('touchstart', start, {passive:true});
  ttl.addEventListener('mouseup', end);
  ttl.addEventListener('mouseleave', end);
  ttl.addEventListener('touchend', end);

  function toggleAdmin(force){
    const a=el('#adminCfg');
    a.style.display = (force || a.style.display==='none') ? 'block' : 'none';
  }
}
function savePrefs(){
  const rep = el('#s_rep').value.trim();
  if(rep){ S.rep = rep; localStorage.setItem('rep', rep); }
  S.fontScale = parseFloat(el('#s_font').value);
  S.btnScale  = parseFloat(el('#s_btn').value);
  applyScales(); saveLS();
  showToast('Preferences saved ✓','success');
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
  if(q.length){
    const sent = q.length - S.queue.length;
    if (sent>0) showToast(`Synced ${sent} item${sent>1?'s':''} ✓`,'success');
    if (S.queue.length>0) showToast(`${S.queue.length} item${S.queue.length>1?'s':''} still queued`,'info');
  }
}
function saveAdminConfig(){
  const s = (el('#adm_secret').value||'').trim();
  const e = (el('#adm_email').value||'').trim();
  if (s){ localStorage.setItem('secretOverride', s); S.secret = s; }
  if (e){ localStorage.setItem('emailOverride', e); S.emailNotifyTo = e; }
  saveLS();
  el('#adm_msg').textContent = 'Overrides saved locally.';
}
function clearAdminConfig(){
  localStorage.removeItem('secretOverride');
  localStorage.removeItem('emailOverride');
  el('#adm_msg').textContent = 'Overrides cleared. Reload to use file config.';
}
async function testPost(){
  if(!S.endpoint){ el('#adm_msg').textContent='No endpoint configured.'; return; }
  const payload = {
    type:'visit',
    date:new Date().toISOString().slice(0,10),
    time:new Date().toISOString(),
    address:'TEST ADDRESS',
    notes:'(test payload)',
    outcome:'No Answer',
    source:'PWA',
    rep:S.rep||'',
    secret:S.secret||'',
    emailNotifyTo:S.emailNotifyTo||''
  };
  try{
    const r = await fetch(S.endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
    if(r.ok){ showToast('Test POST ok ✓','success'); el('#adm_msg').textContent=''; }
    else{ showToast('Test POST failed','error'); el('#adm_msg').textContent='HTTP '+r.status; }
  }catch(e){
    showToast('Test POST failed (offline?)','error');
    el('#adm_msg').textContent = String(e);
  }
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
    </div>
  </section>`;
}
function openObjection(){
  const o = prompt('Objection: Renter / Already have someone / Too Busy / Cost / Later / Other','Renter');
  if(!o) return; postVisit('Objection', o);
}
function markInvalid($el){
  if(!$el) return;
  $el.classList.add('input-invalid');
  $el.focus();
  setTimeout(()=> $el.classList.remove('input-invalid'), 900);
}
async function postVisit(outcome, objection=''){
  const addr = el('#k_addr').value.trim();
  const notes = el('#k_notes').value.trim();
  if(!addr){
    showToast('Address is required.','error');
    markInvalid(el('#k_addr'));
    return;
  }
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
    S.queue.push(item);
    showToast('Offline: visit queued','info');
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
function digitsOnly(s){ return String(s||'').replace(/\D/g,''); }
function toE164(phone){
  const d = digitsOnly(phone);
  if (d.length === 10) return '+1' + d;
  if (d.length > 10 && d.length <= 15) return '+' + d;
  return null;
}
function validE164(p){ return /^\+[1-9]\d{7,14}$/.test(p); }

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
        <select id="l_budget"><option>&lt;$500</option><option>$500+</option><option>$1k+</option></select>
      </div>
    </div>
    <label>Notes</label><textarea id="l_notes" rows="4"></textarea>
    <label style="margin-top:.5rem">Photos (up to 3)</label>
    <input id="l_photos" type="file" accept="image/*" capture="environment" multiple />
    <div class="hp-wrap" aria-hidden="true">
      <label>Leave this field empty</label>
      <input id="hp_field" autocomplete="off" tabindex="-1">
    </div>
    <div class="btn-row" style="margin-top:.6rem">
      <button class="primary" onclick="saveLead()">Save Lead</button>
      <button class="ghost" onclick="go('dashboard')">Cancel</button>
    </div>
  </section>`;

  // simple phone mask
  setTimeout(()=>{
    const ph = el('#l_phone');
    if(ph){
      ph.addEventListener('input', ()=>{
        const d = digitsOnly(ph.value).slice(0,10);
        let out = '';
        if (d.length > 0) out = '(' + d.slice(0,3);
        if (d.length >= 4) out += ') ' + d.slice(3,6);
        if (d.length >= 7) out += '-' + d.slice(6,10);
        ph.value = out || d;
      });
    }
  }, 0);
}
async function saveLead(){
  if ((el('#hp_field')?.value || '').trim().length) {
    alert('Form error.'); return;
  }
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

  if(!b.name){
    showToast('Please enter the contact name.','error');
    markInvalid(el('#l_name')); return;
  }
  const e164 = toE164(b.phone);
  if(!e164 || !validE164(e164)){
    showToast('Enter a valid phone (US 10-digit or +country).','error');
    markInvalid(el('#l_phone')); return;
  }
  b.phone = e164;

  const dup = S.leadsLog.find(x => (x.phone||'')===b.phone &&
                                   (Date.now()-new Date(x.date).getTime()) < 30*86400000);
  if (dup){
    const proceed = confirm('This phone was captured within 30 days. Save anyway?');
    if(!proceed){ showToast('Save cancelled.','info'); return; }
  }

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
    S.queue.push(payload);
    showToast('Offline: lead queued','info');
  }
  S.leadsLog.push(payload); saveLS();
}

// ---------- Scripts & rebuttals with A/B counters ----------
async function renderScripts(){
  const data = await fetch('assets/scripts.json').then(r=>r.json());
  const seasons = Object.keys(data.seasons);
  const audiences = Object.keys(data.audience);
  const locales = Object.keys(data.localCues);

  const stat = (k)=> (S.scriptStats[k]||0);
  const bump = (k)=>{ S.scriptStats[k]=(S.scriptStats[k]||0)+1; saveLS(); renderScripts(); };

  el('#view').innerHTML = `
    <section class="card">
      <h2>Scripts</h2>
      <div class="row">
        <div>
          <label>Season Cue</label>
          <select id="sc_season">${seasons.map(s=>`<option>${s}</option>`).join('')}</select>
        </div>
        <div>
          <label>Audience Cue</label>
          <select id="sc_aud">${audiences.map(s=>`<option>${s}</option>`).join('')}</select>
        </div>
        <div>
          <label>Local Cue</label>
          <select id="sc_loc">${locales.map(s=>`<option>${s}</option>`).join('')}</select>
        </div>
      </div>
      <div class="card" style="margin-top:.75rem">
        <p><b>Opener</b> — ${data.core.opener}</p>
        <p><b>Ask</b> — ${data.core.ask}</p>
        <p><b>Close</b> — ${data.core.close}</p>
        <p class="mono" id="sc_preview"></p>
      </div>
      <div class="card">
        <h3>Rebuttals (A/B)</h3>
        ${Object.entries(data.rebuttals).map(([k,v])=>`
          <div style="margin:.35rem 0">
            <b>${k}</b>
            <div class="btn-row" style="margin-top:.35rem">
              <button class="ghost" onclick="(function(){(${bump})('reb:${k}:A')})()">Use A</button>
              <span class="badge">A ${stat('reb:'+k+':A')}</span>
              <button class="ghost" onclick="(function(){(${bump})('reb:${k}:B')})()">Use B</button>
              <span class="badge">B ${stat('reb:'+k+':B')}</span>
            </div>
            <div class="mono" style="opacity:.8">
              A: ${v.A}<br/>B: ${v.B}
            </div>
          </div>`).join('')}
      </div>
    </section>
  `;

  const updatePreview = ()=>{
    const s = el('#sc_season').value, a = el('#sc_aud').value, l = el('#sc_loc').value;
    el('#sc_preview').textContent =
      [data.seasons[s], data.audience[a], data.localCues[l]].filter(Boolean).join(' ');
  };
  ['sc_season','sc_aud','sc_loc'].forEach(id=> el('#'+id).addEventListener('change', updatePreview));
  updatePreview();
}

// ---------- Map / Turf (Leaflet + Draw + import/export) ----------
function renderMapView(){
  el('#view').innerHTML = `
    <section class="card">
      <h2>Map / Turf</h2>
      <div class="btn-row" style="margin-bottom:.5rem">
        <button class="primary" onclick="startHere()">Start Here</button>
        <button class="ghost" onclick="exportGeoJSON()">Export GeoJSON</button>
        <label class="ghost" style="display:inline-flex;align-items:center;gap:.5rem;cursor:pointer">
          <input id="gj_in" type="file" accept=".geojson,application/geo+json,application/json" style="display:none" onchange="importGeoJSON(this)"/>
          <span>Import GeoJSON</span>
        </label>
        <span class="badge">Cooldown ${S.cooldownDays}d</span>
      </div>
      <div id="map" class="map"></div>
      <p class="muted" id="map_msg"></p>
    </section>
  `;

  if(!S.map){
    S.map = L.map('map');
    S.map.setView([45.6387,-122.6615], 12);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors &copy; CARTO', subdomains: 'abcd'
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
  }else{
    S.map.invalidateSize();
  }
  drawCooldownHeat();
}

function exportGeoJSON(){
  const gj = S.drawn.toGeoJSON();
  const blob = new Blob([JSON.stringify(gj,null,2)], {type:'application/geo+json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'turf.geojson'; a.click();
}
function importGeoJSON(input){
  const f = input.files && input.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = ()=>{
    try{
      const gj = JSON.parse(r.result);
      const layer = L.geoJSON(gj,{style:{color:'#6cb3ff'}});
      S.drawn.addLayer(layer); S.map.fitBounds(layer.getBounds(), {padding:[20,20]});
    }catch(e){ alert('Invalid GeoJSON'); }
    input.value='';
  };
  r.readAsText(f);
}

let _lastRG = 0;
async function reverseGeocode(lat,lng){
  try{
    const now = Date.now(); if (now - _lastRG < 1500) await new Promise(r=>setTimeout(r, 1500-(now-_lastRG)));
    _lastRG = Date.now();
    const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`;
    const j = await fetch(u,{headers:{'Accept':'application/json','User-Agent':'Cascade-Canvass-PWA'}}).then(r=>r.json());
    return j.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }catch(e){ return `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
}
function createMarker(lat,lng){
  const m = L.marker([lat,lng]);
  m.on('click', async ()=>{
    const addr = await reverseGeocode(lat,lng);
    const eligible = !S.visitsIndex[addr] || daysSince(S.visitsIndex[addr]) >= S.cooldownDays;
    const msg = eligible ? '<span class="success">Eligible</span>' : '<span class="error">Cooling</span>';
    L.popup().setLatLng([lat,lng]).setContent(`
      <div class="mono">${addr}</div>
      <div>${msg}</div>
      <div class="btn-row" style="margin-top:.5rem">
        <button onclick="quickVisitWithPos('${addr.replace(/'/g,"\\'")}','Lead',${lat},${lng})">Lead</button>
        <button onclick="quickVisitWithPos('${addr.replace(/'/g,"\\'")}','No Answer',${lat},${lng})">No Answer</button>
        <button onclick="quickVisitWithPos('${addr.replace(/'/g,"\\'")}','Left Literature',${lat},${lng})">Left Lit</button>
        <button onclick="quickObjectionWithPos('${addr.replace(/'/g,"\\'")}',${lat},${lng})">Objection</button>
      </div>`).openOn(S.map);
  });
  m.addTo(S.map);
  S.markers.push({marker:m, lat, lng});
  return m;
}
async function quickVisitWithPos(address, outcome, lat, lng){
  const item = {
    type: outcome==='Lead' ? 'lead' : 'visit',
    date:new Date().toISOString().slice(0,10),
    time:new Date().toISOString(),
    address, name:'', phone:'', email:'',
    service:'', urgency:'', timeline:'', budget:'',
    notes:'(map quick-visit)', turf:'', source:'PWA', rep:S.rep||'',
    outcome: outcome==='Lead'? undefined: outcome,
    lat, lng,
    secret: S.secret, emailNotifyTo: S.emailNotifyTo
  };
  try{
    const r = await fetch(S.endpoint,{method:'POST',headers:{'Content-Type':'application/json'}, body: JSON.stringify(item)});
    if(!r.ok) throw new Error('HTTP '+r.status);
  }catch(e){ S.queue.push(item); }
  S.visitsIndex[address]=new Date().toISOString(); saveLS();
  S.visitsLog.push(item); saveLS();
  drawCooldownHeat();
  colorMarkers();
  showToast(outcome==='Lead' ? 'Lead logged ✓' : 'Visit logged ✓','success');
}
function quickObjectionWithPos(address, lat, lng){
  const o = prompt('Objection: Renter / Already have someone / Too Busy / Cost / Later / Other','Renter');
  if(!o) return;
  const item = {
    type:'visit',
    date:new Date().toISOString().slice(0,10),
    time:new Date().toISOString(),
    address, name:'', phone:'', email:'',
    service:'', urgency:'', timeline:'', budget:'',
    notes:'(map quick-objection)', turf:'', source:'PWA', rep:S.rep||'',
    outcome:'Objection', objection:o,
    lat, lng,
    secret: S.secret, emailNotifyTo: S.emailNotifyTo
  };
  (async ()=>{
    try{
      const r = await fetch(S.endpoint,{method:'POST',headers:{'Content-Type':'application/json'}, body: JSON.stringify(item)});
      if(!r.ok) throw new Error('HTTP '+r.status);
    }catch(e){ S.queue.push(item); }
    S.visitsIndex[address]=new Date().toISOString(); saveLS();
    S.visitsLog.push(item); saveLS();
    drawCooldownHeat();
    colorMarkers();
    showToast('Objection logged ✓','success');
  })();
}
function startHere(){
  if(!navigator.geolocation){ alert('Geolocation not available'); return; }
  navigator.geolocation.getCurrentPosition(pos=>{
    const {latitude, longitude} = pos.coords;
    if(!S.map){ renderMapView(); }
    S.map.setView([latitude, longitude], 16);
    // simple ring of markers (~20) around you
    const n=20, r=0.0015;
    S.markers.forEach(m=> S.map.removeLayer(m.marker)); S.markers=[];
    for(let i=0;i<n;i++){
      const ang=(i/n)*Math.PI*2;
      createMarker(latitude + r*Math.cos(ang), longitude + r*Math.sin(ang));
    }
    colorMarkers();
    el('#map_msg').textContent='Generated local ~20-door loop. Import a GeoJSON turf or draw a polygon to fix an area.';
  }, ()=> alert('Location error'));
}
function colorMarkers(){
  // colorize markers based on cooldown by reverse geocoding each (lightweight; uses rate limit)
  S.markers.forEach(async ({marker,lat,lng})=>{
    const addr = await reverseGeocode(lat,lng);
    const eligible = !S.visitsIndex[addr] || daysSince(S.visitsIndex[addr]) >= S.cooldownDays;
    const icon = new L.DivIcon({className:'', html:`<div style="width:14px;height:14px;border-radius:50%;border:2px solid #000;background:${eligible?'#22c55e':'#6b7280'}"></div>`});
    marker.setIcon(icon);
  });
}

let _cooldownLayer = null;
function drawCooldownHeat(){
  if (!S.map) return;
  if (_cooldownLayer){ _cooldownLayer.remove(); _cooldownLayer = null; }

  const circles = [];
  for (const v of S.visitsLog){
    if (!('lat' in v) || !('lng' in v)) continue;
    const lastIso = S.visitsIndex[v.address];
    const eligible = !lastIso || daysSince(lastIso) >= S.cooldownDays;
    const color = eligible ? '#22c55e' : '#9ca3af';
    const c = L.circle([v.lat, v.lng], {radius: 80, color: color, weight: 1, fillColor: color, fillOpacity: 0.18, opacity: 0.6});
    circles.push(c);
  }
  _cooldownLayer = L.layerGroup(circles).addTo(S.map);
}

const daysSince = iso => Math.floor((Date.now() - new Date(iso).getTime())/86400000);
