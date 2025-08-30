// Consolidated v4: scripts auto-season (no season dropdown), lead form fields per request, Declined reason, stats bar

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

// Load config and set up retry
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
  const d=document.createElement('div'); d.className=`toast ${type}`; d.innerHTML=`<div>${message}</div><button class="close" aria-label="Close">×</button>`;
  root.appendChild(d);
  const close=()=>{ d.style.animation='toast-out .16s ease forwards'; setTimeout(()=>d.remove(),160); };
  d.querySelector('.close').onclick=close; setTimeout(close, type==='error'?4200:2400);
}
const daysSince = iso => Math.floor((Date.now() - new Date(iso).getTime())/86400000);
const todayISO = ()=> new Date().toISOString().slice(0,10);
const weekAgoISO = ()=> new Date(Date.now()-6*86400000).toISOString().slice(0,10);

// --- Stats bar ---
function counts(){
  const t = todayISO(); const wk = weekAgoISO();
  const doorsToday = (S.visitsLog||[]).filter(v => (v.date||'').slice(0,10) === t).length;
  const leadsToday = (S.leadsLog||[]).filter(l => (l.date||'').slice(0,10) === t).length;
  const leadsWeek  = (S.leadsLog||[]).filter(l => (l.date||'') >= wk).length;
  return {doorsToday, leadsToday, leadsWeek};
}
function statsBarHTML(){
  const c = counts();
  return `<div class="statsbar">
    <div class="stat"><small>Doors Today</small><b>${c.doorsToday}</b></div>
    <div class="stat"><small>Leads Today</small><b>${c.leadsToday}</b></div>
    <div class="stat"><small>Leads (7d)</small><b>${c.leadsWeek}</b></div>
  </div>`;
}

// --- Router ---
function go(tab){
  if(tab==='dashboard') return renderDashboard();
  if(tab==='knock') return renderKnock_geo();
  if(tab==='lead') return renderLead();
  if(tab==='tracker') return renderTracker();
  if(tab==='scripts') return renderScripts();
  if(tab==='settings') return renderSettings();
  renderDashboard();
}

// --- CSV ---
function toCSV(rows){ const esc=v=>('\"' + String(v??'').replace(/\"/g,'\"\"') + '\"'); const keys=Object.keys(rows[0]||{}); return [keys.map(esc).join(','), ...rows.map(r=>keys.map(k=>esc(r[k])).join(','))].join('\\n'); }
function downloadCSV(name, rows){ if(!rows.length){ showToast('No data to export','info'); return; } const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([toCSV(rows)],{type:'text/csv'})); a.download=name; a.click(); }

// --- Geocoder + cooldown ---
const KM = (a,b)=>{ const R=6371e3, toRad=x=>x*Math.PI/180; const dlat=toRad(b.lat-a.lat), dlon=toRad(b.lon-a.lon), la1=toRad(a.lat), la2=toRad(b.lat); const x=Math.sin(dlat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dlon/2)**2; return 2*R*Math.asin(Math.sqrt(x)); };
function fmtAddr(tags){ const num=tags['addr:housenumber']||'', street=tags['addr:street']||tags['name']||'', unit=tags['addr:unit']||'', city=tags['addr:city']||tags['addr:suburb']||''; return [num,street,unit?('#'+unit):'',city].filter(Boolean).join(' ').replace(/\\s+/g,' ').trim(); }
function lastIndex(){ return (S.visitsLog||[]).reduce((m,v)=>{const a=(v.address||'').trim(), t=v.time||v.date||''; if(!a||!t) return m; if(!m[a] || new Date(t)>new Date(m[a])) m[a]=t; return m;},{}); }
async function fetchNearby(lat,lon, radius=S.geoRadius, limit=S.geoLimit){
  const q=`[out:json][timeout:20];(node["addr:housenumber"]["addr:street"](around:${radius},${lat},${lon});way["addr:housenumber"]["addr:street"](around:${radius},${lat},${lon}););out center ${limit};`;
  const j = await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:q})}).then(r=>r.json());
  const uniq=new Map();
  for(const e of (j.elements||[])){ const tags=e.tags||{}; const addr=fmtAddr(tags); if(!addr) continue; const la=e.lat??e.center?.lat, lo=e.lon??e.center?.lon; if(la==null||lo==null) continue; if(!uniq.has(addr)) uniq.set(addr,{addr,lat:la,lon:lo}); }
  const here={lat,lon}, idx=lastIndex();
  const arr=Array.from(uniq.values()).map(o=>{ const dist=KM(here,{lat:o.lat,lon:o.lon}); const last=idx[o.addr]||null; const d=last?daysSince(last):Infinity; const eligible=(d===Infinity)||(d>=S.cooldownDays); return {...o, dist, last, days:(d===Infinity?null:d), eligible}; })
    .sort((a,b)=> a.eligible===b.eligible ? (a.dist-b.dist) : (a.eligible?-1:1)).slice(0, limit);
  return arr;
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
function nextEligiblePtr(start){ for(let i=start;i<S.geoList.length;i++){ if(S.geoList[i]?.eligible) return i; } return -1; }

// --- Views ---
function renderDashboard(){
  const addr = S.geoList[S.geoPtr]?.addr || '(tap Next Door to load nearby)';
  el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>Home</h2>
    <div class="btn-row">
      <button class="primary" onclick="go('knock')">Next Door</button>
      <button onclick="go('lead')">New Lead</button>
      <button onclick="go('tracker')">Lead Tracker</button>
      <button onclick="go('scripts')">Scripts</button>
      <button onclick="go('settings')">Settings</button>
    </div>
    <div class="field"><label>Current suggestion</label><input value="${addr}" readonly/></div>
    <div class="btn-row" style="margin-top:.6rem"><button class="ghost" onclick="downloadCSV('visits.csv', S.visitsLog)">Export Visits</button></div>
  </section>`;
}

async function renderKnock_geo(){
  if(!S.geoList.length){ const ok=await refreshGeoList(); if(!ok){ el('#view').innerHTML=`<section class="card">${statsBarHTML()}<h2>Next Door</h2>
    <div class="field"><label>Address*</label><input id="k_addr" placeholder="1208 Maple St"></div>
    <div class="field"><label>Notes</label><input id="k_notes" placeholder="Optional"></div>
    <div class="btn-row"><button class="primary" onclick="postVisit_geo('Lead')">Lead</button></div></section>`; return; } }
  if(!S.geoList[S.geoPtr]?.eligible){ const n=nextEligiblePtr(S.geoPtr); if(n>=0) S.geoPtr=n; }
  const cur=S.geoList[S.geoPtr]||{};
  el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>Next Door</h2>
    <div class="field"><label>Address*</label><input id="k_addr" value="${(cur.addr||'').replace(/"/g,'&quot;')}"></div>
    <div class="field"><label>Notes</label><input id="k_notes" placeholder="Optional"></div>
    <div class="btn-row">
      <button class="primary" ${cur.eligible?'':'disabled'} onclick="postVisit_geo('Lead')">Lead</button>
      <button ${cur.eligible?'':'disabled'} onclick="postVisit_geo('No Answer')">No Answer</button>
      <button ${cur.eligible?'':'disabled'} onclick="postVisit_geo('Left Literature')">Left Literature</button>
      <button onclick="postVisit_geo('Declined')">Declined</button>
      <button onclick="postVisit_geo('Skipped')">Skip</button>
      <button onclick="advanceGeo()">Next Closest →</button>
      <button onclick="refreshGeoList()">Reload Nearby</button>
    </div>
    <div class="field"><label>Status</label><input value="${cur.eligible?'Eligible':('Cooling '+Math.max(0,S.cooldownDays - (cur.days||0))+'d')}" readonly/></div>
  </section>`;
}
function advanceGeo(){ if(!S.geoList.length) return; const n=nextEligiblePtr(S.geoPtr+1); S.geoPtr=(n>=0)?n:Math.min(S.geoPtr+1,S.geoList.length-1); renderKnock_geo(); }

async function postVisit_geo(outcome){
  const addr=(el('#k_addr')?.value||'').trim(); const notes=(el('#k_notes')?.value||'').trim();
  if(!addr){ showToast('Address required','error'); el('#k_addr')?.focus(); return; }
  let objection='';
  if(outcome==='Declined'){ objection = prompt('Reason for decline? (optional)', '') || ''; }
  const item={ type: outcome==='Lead'?'lead':'visit', date:new Date().toISOString().slice(0,10), time:new Date().toISOString(),
    address:addr, name:'', phone:'', email:'', notes, rep:S.rep||'', source:'PWA', outcome: outcome==='Lead'? undefined : outcome, objection };
  if(S.endpoint){ const payload={...item, secret:S.secret, emailNotifyTo:S.emailNotifyTo}; try{ const r=await fetch(S.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); if(!r.ok) throw new Error('HTTP '+r.status);} catch(e){ S.queue.push(payload); saveLS(); } }
  S.visitsLog.push(item); saveLS(); showToast((outcome==='Lead'?'Lead':'Visit')+' saved ✓','success'); if(outcome==='Lead') go('lead'); else advanceGeo();
}

// Lead form — fields requested only
function renderLead(){ el('#view').innerHTML=`<section class="card">${statsBarHTML()}<h2>New Lead</h2>
  <div class="field"><label>Name*</label><input id="l_name"></div>
  <div class="field"><label>Phone*</label><input id="l_phone" placeholder="(###) ###-####"></div>
  <div class="field"><label>Email</label><input id="l_email"></div>
  <div class="field"><label>Address</label><input id="l_addr" value="${S.geoList[S.geoPtr]?.addr||''}"></div>
  <div class="row">
    <div class="field"><label>Service</label><select id="l_service"><option>Removal</option><option>Trim</option><option>Storm Prep</option><option>Planting</option><option>Other</option></select></div>
    <div class="field"><label>Urgency</label><select id="l_urgency"><option>High</option><option>Medium</option><option>Low</option></select></div>
    <div class="field"><label>Budget</label><select id="l_budget"><option>&lt;$500</option><option>$500+</option><option>$1k+</option></select></div>
  </div>
  <div class="field"><label>Notes</label><textarea id="l_notes" rows="4"></textarea></div>
  <div class="btn-row"><button class="primary" onclick="saveLead()">Save Lead</button><button class="ghost" onclick="go('dashboard')">Cancel</button></div>
</section>`; }
async function saveLead(){
  const b={
    type:'lead', date: new Date().toISOString().slice(0,10), time: new Date().toISOString(),
    name:(el('#l_name').value||'').trim(), phone:(el('#l_phone').value||'').trim(), email:(el('#l_email').value||'').trim(),
    address:(el('#l_addr').value||'').trim(), service: el('#l_service').value, urgency: el('#l_urgency').value,
    budget: el('#l_budget').value, notes:(el('#l_notes').value||'').trim(), rep:S.rep||'', source:'PWA'
  };
  if(!b.name){ showToast('Name required','error'); return; }
  if(S.endpoint){ const payload={...b, secret:S.secret, emailNotifyTo:S.emailNotifyTo}; try{ const r=await fetch(S.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); if(!r.ok) throw new Error('HTTP '+r.status);} catch(e){ S.queue.push(payload); saveLS(); } }
  S.leadsLog.push(b); saveLS(); showToast('Lead saved ✓','success'); go('dashboard');
}

// Lead Tracker (no filter, with local delete)
function renderTracker(){
  el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>Lead Tracker</h2><div id="lt_list"></div></section>`;
  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const list=(S.leadsLog||[]);
  el('#lt_list').innerHTML = list.map((l,i)=>`<div class="field">
    <label>${esc(l.date||'')} — ${esc(l.name||'')} <span style="color:var(--muted)">(${esc(l.service||'')})</span></label>
    <div class="row"><div><small>${esc(l.address||'')}</small></div><div><small>${esc(l.phone||'')}</small></div></div>
    ${l.notes? `<div style="margin-top:.3rem"><small>${esc(l.notes)}</small></div>`:''}
    <div class="btn-row" style="margin-top:.4rem"><button class="ghost" data-del="${i}">❌ Delete</button></div>
  </div>`).join('') || '<div class="field"><label>No leads yet</label></div>';
  el('#lt_list').querySelectorAll('button[data-del]').forEach(btn=>btn.addEventListener('click',()=>{
    const idx=parseInt(btn.getAttribute('data-del'),10); const lead=(S.leadsLog||[])[idx]; if(!lead) return;
    if(!confirm('Delete lead '+(lead.name||'')+'?')) return;
    const ix = (S.leadsLog||[]).indexOf(lead); if(ix>=0){ S.leadsLog.splice(ix,1); saveLS(); showToast('Lead deleted (local) ✓','success'); renderTracker(); }
  }));
}

// Scripts: auto-season (no season dropdown), audience only
async function renderScripts(){
  let data=null; try{ data=await fetch('assets/scripts.json').then(r=>r.json()); }catch(_){}
  data = data || {seasons:{},audience:{},core:{opener:'',ask:'',close:''}};
  // Compute season from current month
  const m = new Date().getMonth()+1;
  const season = (m>=3&&m<=5)?'Spring':(m>=6&&m<=8)?'Summer':(m>=9&&m<=11)?'Fall':'Winter';
  const audiences=Object.keys(data.audience||{});
  el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>Scripts</h2>
    <div class="field"><label>Season</label><input value="${season}" readonly/></div>
    <div class="field"><label>Audience Cue</label><select id="sc_aud">${audiences.map(s=>`<option>${s}</option>`).join('')}</select></div>
    <div class="field"><label>Opener</label><input value="${(data.core.opener||'').replace(/"/g,'&quot;')}" readonly/></div>
    <div class="field"><label>Ask</label><input value="${(data.core.ask||'').replace(/"/g,'&quot;')}" readonly/></div>
    <div class="field"><label>Close</label><input value="${(data.core.close||'').replace(/"/g,'&quot;')}" readonly/></div>
    <div class="field"><label>Notes</label><textarea id="sc_preview" rows="3" readonly></textarea></div>
  </section>`;
  const update=()=>{ const a=el('#sc_aud').value||''; el('#sc_preview').value=[data.seasons?.[season]||'', data.audience?.[a]||''].filter(Boolean).join(' • '); };
  el('#sc_aud').addEventListener('change', update); update();
}

// Settings
function renderSettings(){ el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>Settings</h2>
  <div class="field"><label>Rep Name</label><input id="s_rep" value="${S.rep||''}" placeholder="Your name"></div>
  <div class="field"><label>Theme</label><select id="s_theme"><option value="dark" ${S.theme==='dark'?'selected':''}>Dark</option><option value="light" ${S.theme==='light'?'selected':''}>Light (iOS)</option></select></div>
  <div class="btn-row"><button class="primary" onclick="savePrefs()">Save</button><button class="ghost" onclick="retryQueue()">Retry Queue (${S.queue.length})</button><button class="ghost" onclick="clearQueue()">Clear Queue</button></div>
</section>`; }
function savePrefs(){ const rep=(el('#s_rep').value||'').trim(); if(rep) S.rep=rep; S.theme=el('#s_theme').value; document.documentElement.dataset.theme=(S.theme==='light')?'light':''; saveLS(); showToast('Preferences saved ✓','success'); go('dashboard'); }

// Queue helpers
async function retryQueue(){ if(!S.queue.length){ showToast('Queue empty','info'); return; } const q=[...S.queue]; S.queue=[]; saveLS(); let sent=0,failed=0,last=''; for(const p of q){ p.secret=S.secret; p.emailNotifyTo=S.emailNotifyTo; try{ const r=await fetch(S.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)}); if(!r.ok) throw new Error('HTTP '+r.status); sent++; }catch(e){ S.queue.push(p); failed++; last='send failed'; } } saveLS(); if(sent) showToast(`Synced %s ✓`%sent,'success'); if(failed) showToast(f'{failed} still queued','info'); }
function clearQueue(){ if(!S.queue.length){ showToast('Queue already empty','info'); return; } if(!confirm(`Discard ${S.queue.length} queued item(s)?`)) return; S.queue=[]; saveLS(); showToast('Queue cleared ✓','success'); }
