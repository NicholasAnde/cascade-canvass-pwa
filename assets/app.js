// Increment 2 — adds Map/Turf (Leaflet + Draw + import/export + FABs)

const S = {
  rep: localStorage.getItem('rep') || '',
  endpoint: null,
  cooldownDays: 90,
  visitsLog: JSON.parse(localStorage.getItem('visitsLog') || '[]'),
  leadsLog: JSON.parse(localStorage.getItem('leadsLog') || '[]'),
  queue: JSON.parse(localStorage.getItem('queue') || '[]'),
  fontScale: parseFloat(localStorage.getItem('fontScale') || '1'),
  btnScale: parseFloat(localStorage.getItem('btnScale') || '1'),
  secret: '', emailNotifyTo: '',
  // Map state
  map:null, drawn:null, drawnLayer:null
};

const el = s => document.querySelector(s);
function saveLS(){
  localStorage.setItem('visitsLog', JSON.stringify(S.visitsLog));
  localStorage.setItem('leadsLog', JSON.stringify(S.leadsLog));
  localStorage.setItem('queue', JSON.stringify(S.queue));
  localStorage.setItem('fontScale', String(S.fontScale));
  localStorage.setItem('btnScale', String(S.btnScale));
}
function showToast(message, type='success', opts={}){
  const root = el('#toast-root'); if(!root) return alert(message);
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  div.innerHTML = `<span class="dot"></span><div>${message}</div><button class="close" aria-label="Close">×</button>`;
  root.appendChild(div);
  const close = ()=>{ div.style.animation = 'toast-out .16s ease forwards'; setTimeout(()=>div.remove(), 160); };
  div.querySelector('.close').onclick = close;
  setTimeout(close, opts.duration ?? (type==='error' ? 4200 : 2400));
}
function markInvalid($el){ if(!$el) return; $el.classList.add('input-invalid'); $el.focus(); setTimeout(()=> $el.classList.remove('input-invalid'), 900); }

function go(tab){
  if(tab==='dashboard') return renderDashboard();
  if(tab==='knock') return renderKnock();
  if(tab==='lead') return renderLead();
  if(tab==='map') return renderMapView();
  if(tab==='settings') return renderSettings();
  renderDashboard();
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
  setInterval(retryQueue, 45_000);
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

// Views
function renderDashboard(){
  el('#view').innerHTML = `
  <section class="card">
    <h2>Dashboard</h2>
    <div class="btn-row" style="margin-top:.5rem">
      <button class="primary" onclick="go('knock')">Next Door</button>
      <button class="primary" onclick="go('lead')">New Lead</button>
      <button class="primary" onclick="go('map')">Map/Turf</button>
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
    </div>
  </section>`;
}
function openObjection(){
  const o = prompt('Objection: Renter / Already have someone / Too Busy / Cost / Later / Other','Renter');
  if(!o) return; postVisit('Objection', o);
}
async function postVisit(outcome, objection=''){
  const addr = (el('#k_addr').value||'').trim();
  const notes = (el('#k_notes').value||'').trim();
  if(!addr){ showToast('Address is required.','error'); markInvalid(el('#k_addr')); return; }
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
  S.visitsLog.push(item); saveLS();
  if(outcome==='Lead') go('lead');
}

// Lead with photos
async function readFilesAsBase64Limited(input,max=3,maxW=1280){
  const files=Array.from(input.files||[]).slice(0,max);
  const out=[];
  for(const f of files){
    const img=await createImageBitmap(f);
    const c=document.createElement('canvas');
    const scale=Math.min(1, maxW/img.width);
    c.width=Math.round(img.width*scale); c.height=Math.round(img.height*scale);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    out.push(c.toDataURL('image/jpeg',0.85));
  }
  return out;
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
    <div class="btn-row" style="margin-top:.6rem">
      <button class="primary" onclick="saveLead()">Save Lead</button>
      <button class="ghost" onclick="go('dashboard')">Cancel</button>
    </div>
  </section>`;
  setTimeout(()=>{
    const ph = el('#l_phone');
    if(ph){
      ph.addEventListener('input', ()=>{
        const d=digitsOnly(ph.value).slice(0,10);
        let out='';
        if(d.length>0) out='('+d.slice(0,3);
        if(d.length>=4) out+=') '+d.slice(3,6);
        if(d.length>=7) out+='-'+d.slice(6,10);
        ph.value=out||d;
      });
    }
  }, 0);
}

async function saveLead(){
  const b = {
    type:'lead', date:new Date().toISOString().slice(0,10), time:new Date().toISOString(),
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
  if(!b.name){ showToast('Please enter the contact name.','error'); markInvalid(el('#l_name')); return; }
  const e164 = toE164(b.phone);
  if(!e164 || !validE164(e164)){ showToast('Enter a valid phone (US 10-digit or +country).','error'); markInvalid(el('#l_phone')); return; }
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
    S.queue.push(payload);
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
      <div>
        <label>Rep Name</label>
        <input id="s_rep" value="${S.rep||''}" placeholder="Your name">
      </div>
      <div>
        <label>Font Size</label>
        <select id="s_font">${[0.9,1,1.1,1.2,1.3,1.4,1.5].map(v=>`<option value="${v}" ${S.fontScale===v?'selected':''}>${Math.round(v*100)}%</option>`).join('')}</select>
      </div>
      <div>
        <label>Button Size</label>
        <select id="s_btn">${[0.9,1,1.1,1.2,1.3,1.4,1.5,1.6].map(v=>`<option value="${v}" ${S.btnScale===v?'selected':''}>${Math.round(v*100)}%</option>`).join('')}</select>
      </div>
    </div>
    <div class="btn-row" style="margin-top:.6rem">
      <button class="primary" onclick="savePrefs()">Save</button>
      <button class="ghost" onclick="downloadCSV('leads.csv', S.leadsLog)">Export Leads</button>
      <button class="ghost" onclick="refreshCache()">Refresh Offline Cache</button>
      <button class="ghost" onclick="retryQueue()">Retry Offline Queue (${S.queue.length})</button>
      <button class="ghost" onclick="toggleAdmin()">Admin</button>
    </div>
    <p class="mono" style="margin-top:.5rem;">Endpoint: ${S.endpoint||'(not loaded)'} • Email: ${S.emailNotifyTo||'—'}</p>

    <div id="admin" class="card" style="display:none;margin-top:1rem">
      <h3>Admin</h3>
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
        <button class="primary" onclick="saveAdmin()">Save Overrides</button>
        <button class="ghost" onclick="clearAdmin()">Clear Overrides</button>
        <button class="ghost" onclick="testPost()">Test POST</button>
      </div>
      <p class="mono" id="adm_msg"></p>
    </div>
  </section>`;
}
function toggleAdmin(){ const a = el('#admin'); if(a) a.style.display = a.style.display==='none'?'block':'none'; }
function savePrefs(){
  const rep=(el('#s_rep').value||'').trim(); if(rep){ S.rep=rep; localStorage.setItem('rep',rep); }
  S.fontScale=parseFloat(el('#s_font').value); S.btnScale=parseFloat(el('#s_btn').value);
  saveLS(); showToast('Preferences saved ✓','success'); go('dashboard');
}
async function refreshCache(){
  if('caches' in window){
    const ks = await caches.keys(); await Promise.all(ks.map(k=>caches.delete(k))); location.reload();
  }
}
async function retryQueue(){
  if(!S.queue.length) return;
  const q=[...S.queue]; S.queue=[]; saveLS();
  let sent=0, failed=0, lastErr='';
  for(const item of q){
    item.secret = S.secret; item.emailNotifyTo = S.emailNotifyTo;
    try{
      const r = await fetch(S.endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(item)});
      if(!r.ok){ failed++; lastErr = 'HTTP '+r.status; throw new Error(lastErr); }
      sent++;
    }catch(e){
      S.queue.push(item); lastErr = String(e?.message||e||'send failed');
    }
  }
  saveLS();
  if(sent) showToast(`Synced ${sent} ✓`,'success');
  if(failed) showToast(`${failed} still queued (${lastErr})`,'info');
}
function saveAdmin(){
  const s=(el('#adm_secret').value||'').trim();
  const e=(el('#adm_email').value||'').trim();
  if(s){ localStorage.setItem('secretOverride',s); S.secret=s; }
  if(e){ localStorage.setItem('emailOverride',e); S.emailNotifyTo=e; }
  saveLS(); el('#adm_msg').textContent='Overrides saved locally.';
}
function clearAdmin(){ localStorage.removeItem('secretOverride'); localStorage.removeItem('emailOverride'); el('#adm_msg').textContent='Overrides cleared.'; }
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

// Map / Turf
function renderMapView(){
  el('#view').innerHTML = `
  <section class="card">
    <h2>Map / Turf</h2>
    <div id="map" class="map"></div>
    <div class="fab-wrap">
      <button class="fab" title="Start Here" onclick="startHere()">📍</button>
      <button class="fab" title="Export Turf" onclick="exportGeoJSON()">⬆</button>
      <label class="fab" title="Import Turf" style="cursor:pointer">⬇
        <input id="gj_in" type="file" accept=".geojson,application/geo+json,application/json" style="display:none"/>
      </label>
    </div>
  </section>`;

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
  } else {
    S.map.invalidateSize();
  }

  const input = document.getElementById('gj_in');
  if(input){
    input.addEventListener('change', e=>{
      const f = e.target.files && e.target.files[0];
      if(!f) return;
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
  const gj = S.drawn ? S.drawn.toGeoJSON() : {type:'FeatureCollection',features:[]};
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(gj,null,2)], {type:'application/geo+json'}));
  a.download = 'turf.geojson'; a.click();
}
function startHere(){
  if(!navigator.geolocation){ alert('Geolocation not available'); return; }
  navigator.geolocation.getCurrentPosition(pos=>{
    const {latitude, longitude} = pos.coords;
    if(!S.map) renderMapView();
    S.map.setView([latitude, longitude], 16);
  }, ()=> alert('Location error'));
}
