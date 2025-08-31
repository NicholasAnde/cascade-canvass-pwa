// v4.7.2 — full app: geocoder Next Door + cooldown, Map Today/7d, lead photos (gallery/camera) + preview + scaling, CORS-safe posts, stacked buttons, pine icon, Test POST, queue, light/dark.

window.S = window.S || {
  rep: localStorage.getItem('rep') || '',
  theme: localStorage.getItem('theme') || 'dark',
  endpoint: null, secret:'', emailNotifyTo:'',
  visitsLog: JSON.parse(localStorage.getItem('visitsLog') || '[]'),
  leadsLog: JSON.parse(localStorage.getItem('leadsLog') || '[]'),
  queue: JSON.parse(localStorage.getItem('queue') || '[]'),
  geoList: [], geoPtr: 0, geoRadius: 150, geoLimit: 25, cooldownDays: 90
};
document.documentElement.dataset.theme = (S.theme === 'light') ? 'light' : '';

// Load config
(async function(){
  try{
    const cfg = await fetch('./app.settings.json').then(r=>r.json());
    S.endpoint      = cfg.sheetsEndpoint || null;
    S.secret        = cfg.sharedSecret || '';
    S.emailNotifyTo = cfg.emailNotifyTo || '';
    S.cooldownDays  = cfg.cooldownDays || S.cooldownDays;
  }catch(e){}
  window.addEventListener('online', retryQueue);
})();

// -------- utils --------
const el = s => document.querySelector(s);
function saveLS(){ localStorage.setItem('rep',S.rep); localStorage.setItem('theme',S.theme);
  localStorage.setItem('visitsLog',JSON.stringify(S.visitsLog)); localStorage.setItem('leadsLog',JSON.stringify(S.leadsLog));
  localStorage.setItem('queue',JSON.stringify(S.queue)); }
function showToast(m,t='success'){ const root=el('#toast-root'); if(!root) return; const d=document.createElement('div');
  d.className=`toast ${t}`; d.innerHTML=`<div>${m}</div><button class="close" aria-label="Close">×</button>`; root.appendChild(d);
  const close=()=>{ d.style.animation='toast-out .16s ease forwards'; setTimeout(()=>d.remove(),160); }; d.querySelector('.close').onclick=close;
  setTimeout(close,t==='error'?2800:2000); }
const todayISO=()=>new Date().toISOString().slice(0,10); const weekAgoISO=()=>new Date(Date.now()-6*86400000).toISOString().slice(0,10);
const daysSince=iso=>Math.floor((Date.now()-new Date(iso||0).getTime())/86400000);
async function sendToScript(payload){ if(!S.endpoint) throw new Error('No endpoint configured'); const r=await fetch(S.endpoint,{method:'POST',body:JSON.stringify(payload)}); if(!r.ok) throw new Error('HTTP '+r.status); return r.text(); }

// -------- stats --------
function counts(){ const t=todayISO(), wk=weekAgoISO(); return {
  doorsToday:(S.visitsLog||[]).filter(v=>(v.date||'').slice(0,10)===t).length,
  leadsToday:(S.leadsLog||[]).filter(l=>(l.date||'').slice(0,10)===t).length,
  leadsWeek:(S.leadsLog||[]).filter(l=>(l.date||'')>=wk).length }; }
function statsBarHTML(){ const c=counts(); return `<div class="statsbar">
  <div class="stat"><small>Doors Today</small><b>${c.doorsToday}</b></div>
  <div class="stat"><small>Leads Today</small><b>${c.leadsToday}</b></div>
  <div class="stat"><small>Leads (7d)</small><b>${c.leadsWeek}</b></div></div>`; }

// -------- router --------
function go(tab){
  if(tab==='dashboard') return renderDashboard();
  if(tab==='knock') return renderNextDoor();
  if(tab==='lead') return renderLead();
  if(tab==='tracker') return renderTracker();
  if(tab==='maptoday') return renderMapToday();
  if(tab==='scripts') return renderScripts();
  if(tab==='settings') return renderSettings();
  renderDashboard();
}

// -------- CSV --------
function toCSV(rows){ const esc=v=>('\"'+String(v??'').replace(/\"/g,'\"\"')+'\"'); const keys=Object.keys(rows[0]||{});
  return [keys.map(esc).join(','), ...rows.map(r=>keys.map(k=>esc(r[k])).join(','))].join('\\n'); }
function downloadCSV(name, rows){ if(!rows.length){ showToast('No data to export','info'); return; }
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([toCSV(rows)],{type:'text/csv'})); a.download=name; a.click(); }

// -------- geocoder + cooldown --------
const KM=(a,b)=>{ const R=6371e3, toRad=x=>x*Math.PI/180; const dlat=toRad(b.lat-a.lat), dlon=toRad(b.lon-a.lon);
  const la1=toRad(a.lat), la2=toRad(b.lat); const x=Math.sin(dlat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dlon/2)**2; return 2*R*Math.asin(Math.sqrt(x)); };
function fmtAddr(tags){ const num=tags['addr:housenumber']||'', street=tags['addr:street']||tags['name']||'', unit=tags['addr:unit']||'', city=tags['addr:city']||tags['addr:suburb']||'';
  return [num,street,unit?('#'+unit):'',city].filter(Boolean).join(' ').replace(/\\s+/g,' ').trim(); }
function lastIndex(){ return (S.visitsLog||[]).reduce((m,v)=>{ const a=(v.address||'').trim(), t=v.time||v.date||'';
  if(!a||!t) return m; if(!m[a]||new Date(t)>new Date(m[a])) m[a]=t; return m; },{}); }
let _busy=false;
async function fetchNearby(lat,lon,r=S.geoRadius,l=S.geoLimit){
  if(_busy) return S.geoList; _busy=true;
  try{
    const q=`[out:json][timeout:20];(node["addr:housenumber"]["addr:street"](around:${r},${lat},${lon});way["addr:housenumber"]["addr:street"](around:${r},${lat},${lon}););out center ${l};`;
    const j=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:q})}).then(r=>r.json());
    const uniq=new Map();
    for(const e of (j.elements||[])){ const tags=e.tags||{}; const addr=fmtAddr(tags); if(!addr) continue;
      const la=e.lat??e.center?.lat, lo=e.lon??e.center?.lon; if(la==null||lo==null) continue; if(!uniq.has(addr)) uniq.set(addr,{addr,lat:la,lon:lo}); }
    const here={lat,lon}, idx=lastIndex();
    S.geoList = Array.from(uniq.values()).map(o=>{ const dist=KM(here,{lat:o.lat,lon:o.lon}); const last=idx[o.addr]||null;
      const d=last?daysSince(last):Infinity; const eligible=(d===Infinity)||(d>=S.cooldownDays); return {...o,dist,last,days:(d===Infinity?null:d),eligible}; })
      .sort((a,b)=> a.eligible===b.eligible ? (a.dist-b.dist) : (a.eligible?-1:1)).slice(0,l);
    return S.geoList;
  } finally { _busy=false; }
}
async function refreshGeoList(){
  if(!navigator.geolocation){ showToast('Geolocation not available','error'); return false; }
  return new Promise(res=>{
    navigator.geolocation.getCurrentPosition(async p=>{
      try{ await fetchNearby(p.coords.latitude,p.coords.longitude); S.geoPtr=0; showToast('Nearby loaded ✓','success'); res(true); }
      catch(e){ showToast('Geocoder error','error'); res(false); }
    }, ()=>{ showToast('Location error','error'); res(false); });
  });
}
function nextEligiblePtr(start){ for(let i=start;i<S.geoList.length;i++){ if(S.geoList[i]?.eligible) return i; } return -1; }

// -------- views --------
function renderDashboard(){
  el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>Home</h2>
    <div class="btn-row">
      <button class="primary" onclick="go('knock')">Next Door</button>
      <button onclick="go('lead')">New Lead</button>
      <button onclick="go('tracker')">Lead Tracker</button>
      <button onclick="go('maptoday')">Map</button>
      <button onclick="go('scripts')">Scripts</button>
      <button onclick="go('settings')">Settings</button>
    </div>
  </section>`;
}

async 
// === v4.8-nd: Next Door card (reverse lookup) ===
function renderNextDoor(){
  el('#view').innerHTML = `<section class="card">
    <h2>Next Door</h2>
    <div class="field"><label>Address*</label>
      <input id="nd_addr" placeholder="Fetching current address…" autocomplete="street-address"/>
    </div>
    <div class="field"><label>Notes</label>
      <input id="nd_note" placeholder="Optional"/>
    </div>
    <div class="btn-col">
      <button class="primary" id="nd_lead">Lead</button>
      <div class="row">
        <button id="nd_lit">Left Literature</button>
        <div class="dropdown">
          <button id="nd_decline_btn">Declined ▾</button>
          <div class="menu" id="nd_decline_menu" hidden>
            <button data-reason="No Need">No Need</button>
            <button data-reason="Cost">Cost</button>
            <button data-reason="Maybe Later">Maybe Later</button>
            <button data-reason="Didn't Say">Didn't Say</button>
            <button data-reason="Already Have Someone">Already Have Someone</button>
          </div>
        </div>
        <button id="nd_skip">Skip</button>
      </div>
      <button id="nd_update" class="ghost">Update Address</button>
    </div>
  </section>`;

  bindNextDoorHandlers();
  nd_updateAddress(); // initial reverse lookup from current position
}

function bindNextDoorHandlers(){
  // Dropdown toggle
  el('#nd_decline_btn').onclick = () => {
    const m = el('#nd_decline_menu');
    m.hidden = !m.hidden;
  };
  el('#nd_decline_menu').onclick = (e) => {
    const btn = e.target.closest('button[data-reason]'); if(!btn) return;
    const reason = btn.getAttribute('data-reason');
    nd_logOutcome('Declined', reason);
    el('#nd_decline_menu').hidden = true;
  };
  // Lead -> go to lead form with address prefill
  el('#nd_lead').onclick = () => {
    const addr = el('#nd_addr').value || '';
    window.prefillAddress = addr;
    go('lead');
  };
  // Left Literature
  el('#nd_lit').onclick = () => nd_logOutcome('Left Literature', null);
  // Skip
  el('#nd_skip').onclick = () => nd_logOutcome('Skip', null);
  // Update Address
  el('#nd_update').onclick = nd_updateAddress;
}

async function nd_logOutcome(outcome, reason){
  const addr = el('#nd_addr').value || '';
  const note = el('#nd_note').value || '';
  const payload = {
    type:'visit',
    Outcome: outcome,
    Objection: reason || '',
    Address: addr,
    Notes: note,
    Source: 'NextDoor',
    Timestamp: new Date().toISOString()
  };
  try{
    const r = await tryPostOrQueue(payload);
    toast((r.queued?'Queued: ':'Logged: ')+ outcome + (reason? (' — '+reason):''));
  }catch(e){
    queueAdd(payload);
    toast('Queued: '+ outcome + (reason? (' — '+reason):''));
  }
}

async function nd_updateAddress(){
  // Attempt geolocation then reverse-lookup via Apps Script passthrough (optional) or fallback to no-op
  el('#nd_addr').placeholder = 'Locating…';
  try{
    const pos = await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy:true, timeout:10000 }));
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    const addr = await reverseLookup(lat, lon);
    if (addr) el('#nd_addr').value = addr;
    el('#nd_addr').placeholder = addr ? 'Address found' : 'Enter address';
  }catch(e){
    el('#nd_addr').placeholder = 'Enter address';
  }
}

// Reverse lookup through Apps Script passthrough; expects JSON {address:"..."}
// Define APPS_SCRIPT_LOOKUP_URL externally if different from submit endpoint.
async function reverseLookup(lat, lon){
  try{
    const url = (typeof APPS_SCRIPT_LOOKUP_URL!=='undefined' && APPS_SCRIPT_LOOKUP_URL) 
      ? APPS_SCRIPT_LOOKUP_URL + '?lat='+lat+'&lon='+lon 
      : (APPS_SCRIPT_URL + '?action=reverse&lat='+lat+'&lon='+lon);
    const res = await fetch(url, {method:'GET'});
    if(!res.ok) throw 0;
    const data = await res.json();
    return data && (data.address || data.formatted_address || data.display_name) || null;
  }catch(e){ return null; }
}

function confirmLead(){
  const name=(el('#l_name')?.value||'').trim(); const addr=(el('#l_addr')?.value||'').trim();
  if(!name){ showToast('Name required','error'); return; }
  if(!confirm(`Save lead for:\\n${name}\\n${addr||''}?`)) return; saveLead();
}
async function readAsDataURL(file){ return new Promise((res,rej)=>{ const fr=new FileReader(); fr.onerror=()=>rej(fr.error); fr.onload=()=>res(fr.result); fr.readAsDataURL(file); }); }
async function scaleDataUrl(dataUrl,maxW=1280,q=0.85){ return new Promise((resolve)=>{ const img=new Image(); img.onload=()=>{ const w=img.naturalWidth||maxW, h=img.naturalHeight||maxW; const s=Math.min(1,maxW/w); const W=Math.round(w*s), H=Math.round(h*s); const c=document.createElement('canvas'); c.width=W; c.height=H; c.getContext('2d').drawImage(img,0,0,W,H); resolve(c.toDataURL('image/jpeg',q)); }; img.src=dataUrl; }); }
async function getScaledPhotosFromInput(input,max=3,maxW=1280){ const files=Array.from(input.files||[]).slice(0,max); const out=[]; for(const f of files){ const raw=await readAsDataURL(f); const jpeg=await scaleDataUrl(raw,maxW,0.85); out.push(jpeg); } return out; }
function bindPhotoPreview(){ const input=el('#l_photos'), tray=el('#l_preview'); if(!input||!tray) return;
  input.addEventListener('change',()=>{ tray.innerHTML=''; const files=Array.from(input.files||[]).slice(0,3);
    for(const f of files){ const url=URL.createObjectURL(f); const img=document.createElement('img');
      img.src=url; img.alt=f.name; img.style.cssText='width:72px;height:72px;object-fit:cover;border:1px solid var(--line);border-radius:10px;';
      tray.appendChild(img); img.onload=()=>URL.revokeObjectURL(url); }
    if(files.length){ const badge=document.createElement('small'); badge.textContent=`Selected ${files.length} / 3`; badge.style.cssText='opacity:.75;margin-top:.25rem;display:block;'; tray.appendChild(badge); }
  });
}
async function saveLead(){
  const input=el('#l_photos');
  const photos = (input && input.files && input.files.length) ? await getScaledPhotosFromInput(input,3,1280) : [];
  const b={ type:'lead', date:todayISO(), time:new Date().toISOString(),
    name:(el('#l_name').value||'').trim(), phone:(el('#l_phone').value||'').trim(), email:(el('#l_email').value||'').trim(),
    address:(el('#l_addr').value||'').trim(), service:el('#l_service').value, urgency:el('#l_urgency').value,
    budget:el('#l_budget').value, notes:(el('#l_notes').value||'').trim(), rep:S.rep||'', source:'PWA'};
  try{ await sendToScript({ ...b, secret:S.secret, emailNotifyTo:S.emailNotifyTo }); }
  catch(e){ S.queue.push({ ...b, secret:S.secret, emailNotifyTo:S.emailNotifyTo }); }
  S.leadsLog.push(b); saveLS(); showToast('Lead saved ✓','success'); go('dashboard');
}

// Lead tracker
function renderTracker(){
  el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>Lead Tracker</h2><div id="lt_list"></div></section>`;
  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const list=S.leadsLog||[];
  el('#lt_list').innerHTML = list.map((l,i)=>`<div class="field" style="padding:.6rem .8rem">
    <label>${esc(l.date||'')} — ${esc(l.name||'')}</label>
    <div><small>${esc(l.address||'')}</small></div>
    <div class="btn-row" style="margin-top:.35rem"><button data-del="${i}">❌ Delete</button></div>
  </div>`).join('') || '<div class="field"><label>No leads yet</label></div>';
  el('#lt_list').querySelectorAll('button[data-del]').forEach(btn=>btn.addEventListener('click',()=>{
    const idx=parseInt(btn.getAttribute('data-del'),10); const lead=(S.leadsLog||[])[idx]; if(!lead) return;
    if(!confirm('Delete lead '+(lead.name||'')+'?')) return;
    const ix=(S.leadsLog||[]).indexOf(lead); if(ix>=0){ S.leadsLog.splice(ix,1); saveLS(); showToast('Lead deleted (local) ✓','success'); renderTracker(); }
  }));
}

// Scripts reference
async function renderScripts(){
  let data=null; try{ data=await fetch('assets/scripts.json').then(r=>r.json()); }catch(_){}
  data=data||{seasons:{},audience:{},core:{},rebuttals:{}};
  const m=new Date().getMonth()+1; const season=(m>=3&&m<=5)?'Spring':(m>=6&&m<=8)?'Summer':(m>=9&&m<=11)?'Fall':'Winter';
  const audiences=Object.keys(data.audience||{});
  el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>Scripts</h2>
    <div class="field"><label>Season</label><input value="${season}" readonly/></div>
    <div class="field"><label>Audience Cue</label><select id="sc_aud">${audiences.map(s=>`<option>${s}</option>`).join('')}</select></div>
    <div class="field"><label>Opener</label><input value="${(data.core.opener||'')}" readonly/></div>
    <div class="field"><label>Ask</label><input value="${(data.core.ask||'')}" readonly/></div>
    <div class="field"><label>Close</label><input value="${(data.core.close||'')}" readonly/></div>
    <div class="field"><label>Notes</label><textarea id="sc_preview" rows="3" readonly></textarea></div>
    <div class="field"><label>Rebuttals (Reference)</label><div id="rbx"></div></div>
  </section>`;
  const update=()=>{ const a=el('#sc_aud').value||''; el('#sc_preview').value=[data.seasons?.[season]||'', data.audience?.[a]||''].filter(Boolean).join(' • '); };
  el('#sc_aud').addEventListener('change', update); update();
  const r=data.rebuttals||{};
  el('#rbx').innerHTML = Object.keys(r).map(k=>`
    <div style="margin:.5rem 0;padding:.6rem;border:1px solid var(--line);border-radius:10px;background:var(--field-bg);">
      <b>${k}</b>
      <div style="margin-top:.3rem"><small><b>A</b>) ${r[k].A}</small></div>
      <div style="margin-top:.1rem"><small><b>B</b>) ${r[k].B}</small></div>
    </div>`).join('') || '<small>No rebuttals</small>';
}

// Map Today / 7d (Leaflet)
function renderMapToday(){
  const t=todayISO(), wk=weekAgoISO();
  el('#view').innerHTML = `<section class="card"><h2>Map</h2>
    <div class="field"><label>Range</label><div class="pills"><span class="pill active" data-range="today">Today</span><span class="pill" data-range="7d">7 days</span></div></div>
    <div id="map" class="map"></div></section>`;
  let range='today';
  document.querySelectorAll('.pill').forEach(p=>p.addEventListener('click',()=>{
    document.querySelectorAll('.pill').forEach(x=>x.classList.remove('active')); p.classList.add('active'); range=p.getAttribute('data-range'); draw();
  }));
  function getPts(){ const all=(S.visitsLog||[]).filter(v=>typeof v.lat==='number'&&typeof v.lon==='number');
    return range==='today'?all.filter(v=>(v.date||'').slice(0,10)===t):all.filter(v=>(v.date||'')>=wk); }
  function draw(){ const pts=getPts(); if(!window.L){ showToast('Map lib missing','error'); return; }
    const map=L.map('map', {zoomControl:true}); const start=pts[0]?[pts[0].lat,pts[0].lon]:[45.64,-122.67];
    map.setView(start, pts[0]?16:12); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
    if(pts.length){ const bounds=[]; pts.forEach(p=>{ const m=L.marker([p.lat,p.lon]).addTo(map);
      const title = `${p.address||''}`; const subtitle = `${p.outcome||'Visit'} • ${new Date(p.time||'').toLocaleTimeString()}`;
      m.bindPopup(`<b>${title}</b><br/><small>${subtitle}</small>`); bounds.push([p.lat,p.lon]); });
      if(bounds.length>1) map.fitBounds(bounds,{padding:[20,20]}); } }
  setTimeout(draw,0);
}

// Settings + Test POST
function renderSettings(){
  el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>Settings</h2>
    <div class="field"><label>Rep Name</label><input id="s_rep" value="${S.rep||''}" autocomplete="name"></div>
    <div class="field"><label>Theme</label><select id="s_theme"><option value="dark" ${S.theme==='dark'?'selected':''}>Dark</option><option value="light" ${S.theme==='light'?'selected':''}>Light (iOS)</option></select></div>
    <div class="btn-row"><button class="primary" onclick="savePrefs()">Save</button><button onclick="retryQueue()">Retry Queue (${S.queue.length})</button><button onclick="clearQueue()">Clear Queue</button><button onclick="testPost()">Test POST</button></div>
    <div class="field"><label>Test Result</label><textarea id="adm_msg" rows="3" readonly placeholder="Run Test POST to see result"></textarea></div>
  </section><div id="diag-row" class="diag-row" hidden>
  <div class="diag-main">
    <div class="diag-line"><strong>Endpoint:</strong> <span id="diag-endpoint">—</span> <span id="diag-reach" class="pill">checking…</span></div>
    <div class="diag-line"><strong>Sheets:</strong> <span id="diag-tabs">—</span> <span id="diag-tabs-status" class="pill">checking…</span></div>
  </div>
  <button id="diag-toggle" class="ghost small">Show details</button>
</div>
`;
  renderSettingsDiagnostics();

}
function savePrefs(){ const rep=(el('#s_rep').value||'').trim(); if(rep) S.rep=rep; S.theme=el('#s_theme').value; document.documentElement.dataset.theme=(S.theme==='light')?'light':''; saveLS(); showToast('Preferences saved ✓','success'); go('dashboard'); }
async function testPost(){
  const box=el('#adm_msg'); if(!S.endpoint){ box.value='No endpoint configured'; return; }
  const payload={ type:'visit', date:todayISO(), time:new Date().toISOString(), address:'TEST ADDRESS', notes:'(test payload)', outcome:'No Answer', rep:S.rep||'', source:'PWA', secret:S.secret||'', emailNotifyTo:S.emailNotifyTo||'' };
  try{ const text=await sendToScript(payload); box.value='HTTP 200\\n'+text; showToast('Test POST ok ✓'); }catch(e){ box.value=String(e); showToast('Test POST failed','error'); }
}

// Queue
async function retryQueue(){ if(!S.queue.length){ showToast('Queue empty','info'); return; }
  const q=[...S.queue]; S.queue=[]; saveLS(); let sent=0,failed=0,last='';
  for(const p of q){ try{ await sendToScript(p); sent++; }catch(e){ S.queue.push(p); failed++; last=String(e); } }
  saveLS(); if(sent) showToast(`Synced ${sent} ✓`,'success'); if(failed) showToast(`${failed} still queued${last? ' ('+last+')':''}`,'info'); }
function clearQueue(){ if(!S.queue.length){ showToast('Queue already empty','info'); return; } if(!confirm(`Discard ${S.queue.length} queued item(s)?`)) return; S.queue=[]; saveLS(); showToast('Queue cleared ✓','success'); }

// Boot
document.addEventListener('DOMContentLoaded', ()=> go('dashboard'));


/* ==== Settings Diagnostics (endpoint + tabs) ==== */
async function diagPingEndpoint() {
  const url = (window.APPS_SCRIPT_URL || "").trim();
  if (!url) return { ok: false, status: "no-url" };
  try {
    let res = await fetch(url + (url.includes("?") ? "&" : "?") + "ping=1", { method: "GET", cache: "no-store" });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: "offline" };
  }
}
async function diagFetchTabs() {
  const url = (window.APPS_SCRIPT_URL || "").trim();
  if (!url) return { ok: false, tabs: [], status: "no-url" };
  try {
    const res = await fetch(url + (url.includes("?") ? "&" : "?") + "action=tabs", { method: "GET", cache: "no-store" });
    if (!res.ok) return { ok: false, tabs: [], status: res.status };
    const data = await res.json().catch(() => ({}));
    const tabs = Array.isArray(data.tabs) ? data.tabs : [];
    return { ok: tabs.length > 0, tabs, status: res.status };
  } catch (e) {
    return { ok: false, tabs: [], status: "offline" };
  }
}
async function renderSettingsDiagnostics() {
  const row = document.getElementById("diag-row");
  if (!row) return;
  const ep = (window.APPS_SCRIPT_URL || "—");
  const epEl = document.getElementById("diag-endpoint");
  if (epEl) epEl.textContent = ep;
  const ping = await diagPingEndpoint();
  const reach = document.getElementById("diag-reach");
  if (reach) {
    reach.textContent = ping.ok ? "reachable" : "unreachable";
    reach.classList.toggle("ok", !!ping.ok);
    reach.classList.toggle("bad", !ping.ok);
    reach.title = String(ping.status);
  }
  const tabs = await diagFetchTabs();
  const tabsText = tabs.tabs && tabs.tabs.length ? tabs.tabs.join(", ") : "—";
  const tabsEl = document.getElementById("diag-tabs");
  if (tabsEl) tabsEl.textContent = tabsText;
  const tstat = document.getElementById("diag-tabs-status");
  if (tstat) {
    tstat.textContent = tabs.ok ? "detected" : "not found";
    tstat.classList.toggle("ok", !!tabs.ok);
    tstat.classList.toggle("bad", !tabs.ok);
    tstat.title = String(tabs.status);
  }
  row.hidden = !ep || ep === "—";
  const btn = document.getElementById("diag-toggle");
  if (btn && !btn._wired) {
    btn._wired = true;
    btn.addEventListener("click", () => {
      const expanded = row.classList.toggle("expanded");
      btn.textContent = expanded ? "Hide details" : "Show details";
    });
  }
}

