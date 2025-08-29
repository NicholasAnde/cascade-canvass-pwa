// Recovery full app.js — restores routes + buttons. Minimal but working.

// --- State ---
window.S = window.S || {
  rep: localStorage.getItem('rep') || '',
  theme: localStorage.getItem('theme') || 'dark',
  endpoint: null, secret:'', emailNotifyTo:'',
  visitsLog: JSON.parse(localStorage.getItem('visitsLog') || '[]'),
  leadsLog: JSON.parse(localStorage.getItem('leadsLog') || '[]'),
  queue: JSON.parse(localStorage.getItem('queue') || '[]'),
  geoList: [], geoPtr: 0, geoRadius: 150, geoLimit: 25, cooldownDays: 90,
  scriptStats: JSON.parse(localStorage.getItem('scriptStats') || '{}')
};
document.documentElement.dataset.theme = (S.theme === 'light') ? 'light' : '';

// Load config
(async function(){
  try{
    const cfg = await fetch('./app.settings.json').then(r=>r.json());
    S.endpoint = cfg.sheetsEndpoint || null;
    S.secret = cfg.sharedSecret || '';
    S.emailNotifyTo = cfg.emailNotifyTo || '';
    S.cooldownDays = cfg.cooldownDays || S.cooldownDays;
  }catch(e){}
  window.addEventListener('online', retryQueue);
})();

// --- Utils ---
const el = s => document.querySelector(s);
function saveLS(){
  localStorage.setItem('rep', S.rep);
  localStorage.setItem('theme', S.theme);
  localStorage.setItem('visitsLog', JSON.stringify(S.visitsLog));
  localStorage.setItem('leadsLog', JSON.stringify(S.leadsLog));
  localStorage.setItem('queue', JSON.stringify(S.queue));
  localStorage.setItem('scriptStats', JSON.stringify(S.scriptStats));
}
function showToast(message, type='success'){
  const root = el('#toast-root'); if(!root) return;
  const d=document.createElement('div'); d.className=`toast ${type}`; d.innerHTML=`<div>${message}</div><button class="close">×</button>`;
  root.appendChild(d);
  const close=()=>{ d.style.animation='toast-out .16s ease forwards'; setTimeout(()=>d.remove(),160); };
  d.querySelector('.close').onclick=close; setTimeout(close, type==='error'?4200:2400);
}
const daysSince = iso => Math.floor((Date.now() - new Date(iso).getTime())/86400000);

// --- Router ---
function go(tab){
  try{
    if(tab==='dashboard') return renderDashboard();
    if(tab==='knock') return renderKnock_geo();
    if(tab==='lead') return renderLead();
    if(tab==='tracker') return renderTracker();
    if(tab==='scripts') return renderScripts();
    if(tab==='settings') return renderSettings();
    renderDashboard();
  }catch(e){ const err=el('#err'); err.style.display='block'; err.textContent='Route error: '+e; }
}

// --- Geocoder basics ---
const KM = (a,b)=>{ const R=6371e3, toRad=x=>x*Math.PI/180;
  const dlat=toRad(b.lat-a.lat), dlon=toRad(b.lon-a.lon), la1=toRad(a.lat), la2=toRad(b.lat);
  const x=Math.sin(dlat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dlon/2)**2; return 2*R*Math.asin(Math.sqrt(x)); };
function fmtAddr(tags){ const num=tags['addr:housenumber']||'', street=tags['addr:street']||tags['name']||'', unit=tags['addr:unit']||'', city=tags['addr:city']||tags['addr:suburb']||''; return [num,street,unit?('#'+unit):'',city].filter(Boolean).join(' ').replace(/\s+/g,' ').trim(); }
async function fetchNearby(lat,lon, radius=S.geoRadius, limit=S.geoLimit){
  const q = `[out:json][timeout:20];(node["addr:housenumber"]["addr:street"](around:${radius},${lat},${lon});way["addr:housenumber"]["addr:street"](around:${radius},${lat},${lon}););out center ${limit};`;
  const r = await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:q})});
  const j = await r.json(); const uniq=new Map();
  for(const e of (j.elements||[])){ const tags=e.tags||{}; const addr=fmtAddr(tags); if(!addr) continue; const la=e.lat??e.center?.lat, lo=e.lon??e.center?.lon; if(la==null||lo==null) continue; if(!uniq.has(addr)) uniq.set(addr,{addr,lat:la,lon:lo}); }
  const here={lat,lon}; const idx=(S.visitsLog||[]).reduce((m,v)=>{const a=(v.address||'').trim();const t=v.time||v.date||'';if(!a||!t)return m; if(!m[a] || new Date(t)>new Date(m[a])) m[a]=t; return m;},{});
  return Array.from(uniq.values()).map(o=>{ const dist=KM(here,{lat:o.lat,lon:o.lon}); const last=idx[o.addr]||null; const d=last?daysSince(last):Infinity; const eligible=(d===Infinity)||(d>=S.cooldownDays); return {...o,dist,last,days:(d===Infinity?null:d), eligible}; })
    .sort((a,b)=> a.eligible===b.eligible ? (a.dist-b.dist) : (a.eligible?-1:1)).slice(0, limit);
}
async function refreshGeoList(){
  if(!navigator.geolocation){ showToast('Geolocation not available','error'); return false; }
  return new Promise(resolve=>{
    navigator.geolocation.getCurrentPosition(async pos=>{
      try{ S.geoList = await fetchNearby(pos.coords.latitude, pos.coords.longitude); S.geoPtr=0; showToast('Nearby loaded ✓','success'); resolve(true); }
      catch(e){ showToast('Geocoder error','error'); resolve(false); }
    }, ()=>{ showToast('Location error','error'); resolve(false); });
  });
}

// --- Views ---
function renderDashboard(){
  const addr = S.geoList[S.geoPtr]?.addr || '(tap Next Door to load nearby)';
  el('#view').innerHTML = `<section class="card"><h2>Home</h2>
    <div class="btn-row"><button class="primary" onclick="go('knock')">Next Door</button><button onclick="go('lead')">New Lead</button><button onclick="go('tracker')">Lead Tracker</button><button onclick="go('scripts')">Scripts</button><button onclick="go('settings')">Settings</button></div>
    <div class="field"><label>Current suggestion</label><input value="${addr}" readonly/></div>
    <div class="btn-row" style="margin-top:.6rem"><button class="ghost" onclick="downloadCSV('visits.csv', S.visitsLog)">Export Visits</button></div>
  </section>`;
}

async function renderKnock_geo(){
  if(!S.geoList.length){ const ok=await refreshGeoList(); if(!ok){ el('#view').innerHTML=`<section class="card"><h2>Next Door</h2>
    <div class="field"><label>Address*</label><input id="k_addr" placeholder="1208 Maple St"></div>
    <div class="field"><label>Notes</label><input id="k_notes" placeholder="Optional"></div>
    <div class="btn-row"><button class="primary" onclick="postVisit_geo('Lead')">Lead</button></div></section>`; return; } }
  const cur=S.geoList[S.geoPtr]||{};
  el('#view').innerHTML = `<section class="card"><h2>Next Door</h2>
    <div class="field"><label>Address*</label><input id="k_addr" value="${(cur.addr||'').replace(/"/g,'&quot;')}"></div>
    <div class="field"><label>Notes</label><input id="k_notes" placeholder="Optional"></div>
    <div class="btn-row"><button class="primary" ${cur.eligible?'':'disabled'} onclick="postVisit_geo('Lead')">Lead</button>
      <button ${cur.eligible?'':'disabled'} onclick="postVisit_geo('No Answer')">No Answer</button>
      <button ${cur.eligible?'':'disabled'} onclick="postVisit_geo('Left Literature')">Left Literature</button>
      <button onclick="postVisit_geo('Skipped')">Skip</button>
      <button onclick="advanceGeo()">Next Closest →</button>
      <button onclick="refreshGeoList()">Reload Nearby</button></div>
    <div class="field"><label>Status</label><input value="${cur.eligible?'Eligible':('Cooling '+Math.max(0,S.cooldownDays - (cur.days||0))+'d')}" readonly/></div>
  </section>`;
}
function advanceGeo(){ if(!S.geoList.length) return; const n=S.geoList.findIndex((x,i)=> i>S.geoPtr && x.eligible); S.geoPtr = (n>=0)? n : Math.min(S.geoPtr+1, S.geoList.length-1); renderKnock_geo(); }

async function postVisit_geo(outcome){
  const addr=(el('#k_addr')?.value||'').trim(); const notes=(el('#k_notes')?.value||'').trim();
  if(!addr){ showToast('Address required','error'); el('#k_addr')?.focus(); return; }
  const item={ type: outcome==='Lead'?'lead':'visit', date:new Date().toISOString().slice(0,10), time:new Date().toISOString(), address:addr, name:'', phone:'', email:'', notes, rep:S.rep||'', source:'PWA', outcome: outcome==='Lead'? undefined : outcome, objection:'' };
  if(S.endpoint){ const payload={...item, secret:S.secret, emailNotifyTo:S.emailNotifyTo}; try{ const r=await fetch(S.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); if(!r.ok) throw new Error('HTTP '+r.status);} catch(e){ S.queue.push(payload); saveLS(); } }
  S.visitsLog.push(item); saveLS(); showToast((outcome==='Lead'?'Lead':'Visit')+' saved ✓','success'); if(outcome==='Lead') go('lead'); else advanceGeo();
}

// Lead / Tracker / Scripts / Settings (minimal but working)
function renderLead(){ el('#view').innerHTML=`<section class="card"><h2>New Lead</h2>
  <div class="field"><label>Name*</label><input id="l_name"></div>
  <div class="field"><label>Phone*</label><input id="l_phone" placeholder="(###) ###-####"></div>
  <div class="field"><label>Email</label><input id="l_email"></div>
  <div class="field"><label>Address</label><input id="l_addr" value="${S.geoList[S.geoPtr]?.addr||''}"></div>
  <div class="field"><label>Status</label><select id="l_status"><option>New</option><option>Contacted</option><option>Scheduled</option><option>Closed Won</option><option>Closed Lost</option></select></div>
  <div class="btn-row"><button class="primary" onclick="saveLead()">Save Lead</button><button class="ghost" onclick="go('dashboard')">Cancel</button></div>
</section>`; }
async function saveLead(){ const b={ type:'lead', date:new Date().toISOString().slice(0,10), time:new Date().toISOString(), address:(el('#l_addr').value||'').trim(), name:(el('#l_name').value||'').trim(), phone:(el('#l_phone').value||'').trim(), email:(el('#l_email').value||'').trim(), status:(el('#l_status').value||'New'), rep:S.rep||'', source:'PWA', photos:[] };
  if(!b.name){ showToast('Name required','error'); return; }
  if(S.endpoint){ const payload={...b, secret:S.secret, emailNotifyTo:S.emailNotifyTo}; try{ const r=await fetch(S.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); if(!r.ok) throw new Error('HTTP '+r.status);} catch(e){ S.queue.push(payload); saveLS(); } }
  S.leadsLog.push(b); saveLS(); showToast('Lead saved ✓','success'); go('dashboard'); }

function renderTracker(){ el('#view').innerHTML=`<section class="card"><h2>Lead Tracker</h2>
  <div id="lt_list"></div></section>`; const list=S.leadsLog||[]; el('#lt_list').innerHTML = list.map(l=>`<div class="field"><label>${l.date} — ${l.name} (${l.status||'New'})</label><div><small>${l.address||''}</small></div></div>`).join('') || '<div class="field"><label>No leads yet</label></div>'; }
async function renderScripts(){ el('#view').innerHTML=`<section class="card"><h2>Scripts</h2><div class="field"><label>Opener</label><input value="Hi, I’m Nick with Cascade Tree Works. Quick question—" readonly/></div></section>`; }
function renderSettings(){ el('#view').innerHTML=`<section class="card"><h2 id="settingsTitle">Settings</h2>
  <div class="field"><label>Rep Name</label><input id="s_rep" value="${S.rep||''}"></div>
  <div class="field"><label>Theme</label><select id="s_theme"><option value="dark" ${S.theme==='dark'?'selected':''}>Dark</option><option value="light" ${S.theme==='light'?'selected':''}>Light (iOS)</option></select></div>
  <div class="btn-row"><button class="primary" onclick="savePrefs()">Save</button><button class="ghost" onclick="retryQueue()">Retry Queue (${S.queue.length})</button><button class="ghost" onclick="clearQueue()">Clear Queue</button></div>
</section>`; }
function savePrefs(){ const rep=(el('#s_rep').value||'').trim(); if(rep) S.rep=rep; S.theme=el('#s_theme').value; document.documentElement.dataset.theme=(S.theme==='light')?'light':''; saveLS(); showToast('Preferences saved ✓','success'); go('dashboard'); }

async function retryQueue(){ if(!S.queue.length){ showToast('Queue empty','info'); return; } const q=[...S.queue]; S.queue=[]; saveLS(); let sent=0,failed=0,last=''; for(const p of q){ p.secret=S.secret; p.emailNotifyTo=S.emailNotifyTo; try{ const r=await fetch(S.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)}); if(!r.ok) throw new Error('HTTP '+r.status); sent++; }catch(e){ S.queue.push(p); failed++; last='send failed'; } } saveLS(); if(sent) showToast(`Synced ${sent} ✓`,'success'); if(failed) showToast(`${failed} still queued ${last?'('+last+')':''}`,'info'); }
function clearQueue(){ if(!S.queue.length){ showToast('Queue already empty','info'); return; } if(!confirm(`Discard ${S.queue.length} queued item(s)?`)) return; S.queue=[]; saveLS(); showToast('Queue cleared ✓','success'); }
