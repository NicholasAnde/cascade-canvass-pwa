// Hamburger + Frontend-only build (no backend; local saves + CSV export)

const S = {
  rep: localStorage.getItem('rep') || '',
  visitsLog: JSON.parse(localStorage.getItem('visitsLog') || '[]'),
  leadsLog: JSON.parse(localStorage.getItem('leadsLog') || '[]'),
  scriptStats: JSON.parse(localStorage.getItem('scriptStats') || '{}'),
  map:null, drawn:null, markers:[]
};

const el = s => document.querySelector(s);
function saveLS(){
  localStorage.setItem('visitsLog', JSON.stringify(S.visitsLog));
  localStorage.setItem('leadsLog', JSON.stringify(S.leadsLog));
  localStorage.setItem('scriptStats', JSON.stringify(S.scriptStats));
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
function go(tab){
  if(tab==='dashboard') return renderDashboard();
  if(tab==='knock') return renderKnock();
  if(tab==='lead') return renderLead();
  if(tab==='map') return renderMapView();
  if(tab==='scripts') return renderScripts();
  if(tab==='settings') return renderSettings();
  renderDashboard();
}

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

// Dashboard
function renderDashboard(){
  el('#view').innerHTML = `
  <section class="card">
    <h2>Home</h2>
    <div class="tiles" style="margin-top:.6rem">
      <div class="tile" onclick="go('knock')"><div class="big">Next Door</div><div class="sub">Knock & log quickly</div></div>
      <div class="tile" onclick="go('lead')"><div class="big">New Lead</div><div class="sub">Details & photos</div></div>
      <div class="tile" onclick="go('map')"><div class="big">Map / Turf</div><div class="sub">Plan & export</div></div>
      <div class="tile" onclick="go('scripts')"><div class="big">Scripts</div><div class="sub">Openers & rebuttals</div></div>
      <div class="tile" onclick="go('settings')"><div class="big">Settings</div><div class="sub">Prefs & exports</div></div>
    </div>
    <div class="btn-row" style="margin-top:1rem">
      <button class="ghost" onclick="downloadCSV('visits.csv', S.visitsLog)">Export Visits</button>
    </div>
  </section>`;
}

// Next Door (local save)
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
function postVisit(outcome, objection=''){
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
    objection: objection||''
  };
  S.visitsLog.push(item); saveLS();
  showToast((outcome==='Lead'?'Lead':'Visit')+' saved locally ✓','success');
  if(outcome==='Lead') go('lead');
}

// Lead (local save + photos)
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
    photos:[],
    rep:S.rep||'',
    source:'PWA'
  };
  if(!b.name){ showToast('Please enter the contact name.','error'); el('#l_name').focus(); return; }
  const e164 = toE164(b.phone);
  if(!e164 || !validE164(e164)){ showToast('Enter a valid phone','error'); el('#l_phone').focus(); return; }
  b.phone = e164;

  const input = el('#l_photos');
  if(input && input.files && input.files.length){
    try{ b.photos = await readFilesAsBase64Limited(input,3,1280); }catch(e){}
  }

  S.leadsLog.push(b); saveLS();
  showToast('Lead saved locally ✓','success');
}

// Settings (frontend only)
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
    </div>
  </section>`;
}
function savePrefs(){
  const rep = (el('#s_rep').value||'').trim();
  if(rep){ S.rep=rep; localStorage.setItem('rep', rep); }
  showToast('Preferences saved ✓','success');
}
async function refreshCache(){
  if('caches' in window){
    const ks = await caches.keys(); await Promise.all(ks.map(k=>caches.delete(k)));
    location.reload();
  }
}

// Scripts (cues + A/B counters, local only)
async function renderScripts(){
  const data = await fetch('assets/scripts.json').then(r=>r.json());
  const seasons = Object.keys(data.seasons);
  const audiences = Object.keys(data.audience);
  const locales = Object.keys(data.localCues);

  el('#view').innerHTML = `
    <section class="card">
      <h2>Scripts</h2>
      <div class="row">
        <div><label>Season Cue</label><select id="sc_season">${seasons.map(s=>`<option>${s}</option>`).join('')}</select></div>
        <div><label>Audience Cue</label><select id="sc_aud">${audiences.map(s=>`<option>${s}</option>`).join('')}</select></div>
        <div><label>Local Cue</label><select id="sc_loc">${locales.map(s=>`<option>${s}</option>`).join('')}</select></div>
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
              <button class="ghost" data-k="${k}" data-v="A">Use A</button>
              <span class="badge">A ${S.scriptStats[`${k}__A`]||0}</span>
              <button class="ghost" data-k="${k}" data-v="B">Use B</button>
              <span class="badge">B ${S.scriptStats[`${k}__B`]||0}</span>
            </div>
            <div class="mono" style="opacity:.8">A: ${v.A}<br/>B: ${v.B}</div>
          </div>`).join('')}
      </div>
    </section>
  `;

  function updatePreview(){
    const s = el('#sc_season').value, a = el('#sc_aud').value, l = el('#sc_loc').value;
    el('#sc_preview').textContent = [data.seasons[s], data.audience[a], data.localCues[l]].filter(Boolean).join(' ');
  }
  ['sc_season','sc_aud','sc_loc'].forEach(id => el('#'+id).addEventListener('change', updatePreview));
  updatePreview();

  el('#view').querySelectorAll('button[data-k]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const k = btn.getAttribute('data-k');
      const v = btn.getAttribute('data-v');
      const key = `${k}__${v}`;
      S.scriptStats[key] = (S.scriptStats[key]||0) + 1;
      saveLS();
      renderScripts();
    });
  });
}

// Map / Turf (loop + quick-log) — local only
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
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'© OpenStreetMap'}).addTo(S.map);
    S.drawn = new L.FeatureGroup(); S.map.addLayer(S.drawn);
    const draw = new L.Control.Draw({ edit:{featureGroup:S.drawn}, draw:{ circle:false, circlemarker:false } });
    S.map.addControl(draw);
    S.map.on(L.Draw.Event.CREATED, e=>{ const layer=e.layer; layer.options.color='#6cb3ff'; S.drawn.addLayer(layer); });
  } else { S.map.invalidateSize(); }

  const input=document.getElementById('gj_in');
  if(input){
    input.addEventListener('change', e=>{
      const f=e.target.files && e.target.files[0]; if(!f) return;
      const r=new FileReader();
      r.onload=()=>{ try{ const gj=JSON.parse(r.result); const layer=L.geoJSON(gj,{style:{color:'#6cb3ff'}}); S.drawn.addLayer(layer); S.map.fitBounds(layer.getBounds(),{padding:[20,20]}); }catch(_){ alert('Invalid GeoJSON'); } e.target.value=''; };
      r.readAsText(f);
    });
  }
}
function exportGeoJSON(){
  const gj = S.drawn ? S.drawn.toGeoJSON() : {type:'FeatureCollection',features:[]};
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(gj,null,2)],{type:'application/geo+json'})); a.download='turf.geojson'; a.click();
}
function startHere(){
  if(!navigator.geolocation){ showToast('Geolocation not available','error'); return; }
  navigator.geolocation.getCurrentPosition(pos=>{ const {latitude,longitude}=pos.coords; if(!S.map) renderMapView(); S.map.setView([latitude,longitude], 16); }, ()=> showToast('Location error','error'));
}
function clearMarkers(){ S.markers.forEach(m=> S.map.removeLayer(m)); S.markers=[]; }
function createMarker(lat,lng){
  const m = L.marker([lat,lng]).addTo(S.map);
  m.on('click', async ()=>{
    const addr = await reverseGeocode(lat,lng);
    const popup=document.createElement('div');
    popup.innerHTML=`<div class="mono" style="max-width:240px">${addr}</div>
      <div class="btn-row" style="margin-top:.4rem">
        <button class="primary" id="ql_lead">Lead</button>
        <button class="ghost" id="ql_no">No Answer</button>
        <button class="ghost" id="ql_lit">Left Lit</button>
        <button class="ghost" id="ql_obj">Objection</button>
      </div>`;
    const p=L.popup({maxWidth:260}).setLatLng([lat,lng]).setContent(popup); S.map.openPopup(p);
    setTimeout(()=>{
      const post = (outcome, objection='')=>{
        const item={ type: outcome==='Lead'?'lead':'visit', date:new Date().toISOString().slice(0,10), time:new Date().toISOString(),
          address: addr, notes:'(map quick-log)', outcome: outcome==='Lead'? undefined : outcome, objection, rep:S.rep||'', source:'PWA' };
        S.visitsLog.push(item); saveLS();
        showToast((outcome==='Lead'?'Lead':'Visit')+' saved locally ✓','success');
        if(outcome==='Lead') go('lead');
      };
      popup.querySelector('#ql_lead')?.addEventListener('click', ()=> post('Lead'));
      popup.querySelector('#ql_no')?.addEventListener('click', ()=> post('No Answer'));
      popup.querySelector('#ql_lit')?.addEventListener('click', ()=> post('Left Literature'));
      popup.querySelector('#ql_obj')?.addEventListener('click', ()=>{ const o=prompt('Objection?','Renter'); if(o) post('Objection', o); });
    },0);
  });
  S.markers.push(m); return m;
}
async function generateDoorLoop(n=20, radius=0.0015){
  if(!navigator.geolocation){ showToast('Geolocation not available','error'); return; }
  navigator.geolocation.getCurrentPosition(async pos=>{
    const {latitude, longitude}=pos.coords; clearMarkers();
    for(let i=0;i<n;i++){ const ang=(i/n)*Math.PI*2; createMarker(latitude + radius*Math.cos(ang), longitude + radius*Math.sin(ang)); }
    S.map.setView([latitude, longitude], 16);
    showToast(`Generated ~${n} markers around you`,'success');
  }, ()=> showToast('Location error','error'));
}
