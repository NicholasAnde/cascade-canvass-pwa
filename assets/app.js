// v4.7.2 — full app: geocoder Next Door + cooldown, Map Today/7d, lead photos (gallery/camera) + preview + scaling, CORS-safe posts, stacked buttons, pine icon, Test POST, queue, light/dark.

window.S = window.S || {
  rep: localStorage.getItem('rep') || '',
  theme: localStorage.getItem('theme') || 'dark',
  endpoint: null, secret:'', emailNotifyTo:'',
  visitsLog: JSON.parse(localStorage.getItem('visitsLog') || '[]'),
  leadsLog: JSON.parse(localStorage.getItem('leadsLog') || '[]'),
  queue: JSON.parse(localStorage.getItem('queue') || '[]'),
  geoList: [], geoPtr: 0, geoRadius: 150, geoLimit: 25, cooldownDays: 90
, enableNextDoorLookup: (localStorage.getItem('enableNextDoorLookup')||'true')==='true'};
document.documentElement.dataset.theme = (S.theme === 'light') ? 'light' : '';

// Load config
(async function(){
  try{
    const cfg = await fetch('./app.settings.json').then(r=>r.json());
    S.endpoint      = cfg.sheetsEndpoint || null;
    S.secret        = cfg.sharedSecret || '';
    S.emailNotifyTo = cfg.emailNotifyTo || '';
    S.cooldownDays  = cfg.cooldownDays || S.cooldownDays;
    S.enableNextDoorLookup = (typeof cfg.enableNextDoorLookup==='boolean'? cfg.enableNextDoorLookup : true);
    try{ localStorage.setItem('enableNextDoorLookup', String(S.enableNextDoorLookup)); }catch(e){}
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
  if(tab==='knock') return renderKnock_geo();
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
const KM=(a,b)=>Infinity; // geocoding removed: distance disabled
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
    S.geoList = []; // geocoding removed const last=idx[o.addr]||null;
      const d=last?daysSince(last):Infinity; const eligible=(d===Infinity)||(d>=S.cooldownDays); return {...o,dist,last,days:(d===Infinity?null:d),eligible}; })
      .sort((a,b)=> a.eligible===b.eligible ? (a.dist-b.dist) : (a.eligible?-1:1)).slice(0,l);
    return S.geoList;
  } finally { _busy=false; }
}
async function refreshGeoList(){
  if(!navigator.geolocation){ showToast('Geolocation not available','error'); return false; }
  return new Promise(res=>{
    /* geolocation removed */; S.geoPtr = 0; // geocoding removed showToast('Nearby loaded ✓','success'); res(true); }
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

async function renderKnock_geo(){
  if(!S.geoList.length){ const ok=await refreshGeoList(); if(!ok){
    el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>Next Door</h2>
      <div class="field"><label>Address*</label><input id="k_addr" placeholder="1208 Maple St" autocomplete="street-address"></div>
      <div class="field"><label>Notes</label><input id="k_notes" placeholder="Optional" enterkeyhint="done"></div>
      <div class="btn-row">
        <button class="primary" onclick="confirmVisit('Lead')">Lead</button>
        <button onclick="confirmVisit('No Answer')">No Answer</button>
        <button onclick="confirmVisit('Left Literature')">Left Literature</button>
        <button onclick="confirmVisit('Declined')">Declined</button>
        <button onclick="confirmEnd()">End / Skip</button>
      </div>
    </section>`; return; } }
  if(!S.geoList[S.geoPtr]?.eligible){ const n=nextEligiblePtr(S.geoPtr); if(n>=0) S.geoPtr = 0; // geocoding removed }
  const cur=S.geoList[S.geoPtr]||{};
  el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>Next Door</h2>
    <div class="field"><label>Address*</label><input id="k_addr" autocomplete="street-address" value="${(cur.addr||'').replace(/"/g,'&quot;')}"></div>
    <div class="field"><label>Notes</label><input id="k_notes" enterkeyhint="done" placeholder="Optional"></div>
    <div class="btn-row">
      <button class="primary" ${cur.eligible?'':'disabled'} onclick="confirmVisit('Lead')">Lead</button>
      <button ${cur.eligible?'':'disabled'} onclick="confirmVisit('No Answer')">No Answer</button>
      <button ${cur.eligible?'':'disabled'} onclick="confirmVisit('Left Literature')">Left Literature</button>
      <button onclick="confirmVisit('Declined')">Declined</button>
      <button onclick="confirmEnd()">End / Skip</button>
      <button onclick="advanceGeo()">Next Closest →</button>
      <button onclick="refreshGeoList()">Reload Nearby</button>
    </div>
  </section>`;
}
function confirmEnd(){ if(confirm('End this door and go to next?')) advanceGeo(); }
function confirmVisit(outcome){
  const addr=(el('#k_addr')?.value||'').trim(); if(!addr){ showToast('Address required','error'); el('#k_addr')?.focus(); return; }
  if(!confirm(`Log "${outcome}" at:\\n${addr}?`)) return; postVisit_geo(outcome);
}
function advanceGeo(){ if(!S.geoList.length) return; const n=nextEligiblePtr(S.geoPtr+1); S.geoPtr = 0; // geocoding removed renderKnock_geo(); }
async function postVisit_geo(outcome){
  const addr=(el('#k_addr')?.value||'').trim(); const notes=(el('#k_notes')?.value||'').trim();
  if(!addr){ showToast('Address required','error'); el('#k_addr')?.focus(); return; }
  let objection=''; if(outcome==='Declined') objection=prompt('Reason for decline? (optional)','')||'';
  const cur=S.geoList[S.geoPtr]||{};
  const item={ type: outcome==='Lead'?'lead':'visit', date:todayISO(), time:new Date().toISOString(),
    address:addr, name:'', phone:'', email:'', notes, rep:S.rep||'', source:'PWA', outcome: outcome==='Lead'? undefined : outcome, objection,
    lat:(typeof cur.lat==='number')?cur.lat:null, lon:(typeof cur.lon==='number')?cur.lon:null };
  try{ await sendToScript({ ...item, secret:S.secret, emailNotifyTo:S.emailNotifyTo }); }
  catch(e){ S.queue.push({ ...item, secret:S.secret, emailNotifyTo:S.emailNotifyTo }); }
  S.visitsLog.push(item); saveLS(); showToast((outcome==='Lead'?'Lead':'Visit')+' saved ✓','success'); if(outcome==='Lead') go('lead'); else advanceGeo();
}

// Lead + photos
function renderLead(){
  el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>New Lead</h2>
    <div class="field"><label>Name*</label><input id="l_name" autocomplete="name"></div>
    <div class="field"><label>Phone*</label><input id="l_phone" inputmode="tel" autocomplete="tel" placeholder="(###) ###-####"></div>
    <div class="field"><label>Email</label><input id="l_email" inputmode="email" autocomplete="email"></div>
    <div class="field"><label>Address</label><input id="l_addr" autocomplete="street-address" value="${S.geoList[S.geoPtr]?.addr||''}"></div>
    <div class="field"><label>Service</label><select id="l_service"><option>Removal</option><option>Trim</option><option>Storm Prep</option><option>Planting</option><option>Other</option></select></div>
    <div class="field"><label>Urgency</label><select id="l_urgency"><option>High</option><option>Medium</option><option>Low</option></select></div>
    <div class="field"><label>Budget</label><select id="l_budget"><option>&lt;$500</option><option>$500+</option><option>$1k+</option></select></div>
    <div class="field"><label>Notes</label><textarea id="l_notes" rows="4" enterkeyhint="done"></textarea></div>
    <div class="field"><label>Photos (up to 3)</label><input id="l_photos" type="file" accept="image/*" multiple><div id="l_preview" class="btn-row" style="margin-top:.4rem"></div></div>
    <div class="btn-row"><button class="primary" onclick="confirmLead()">Save Lead</button><button onclick="go('dashboard')">Cancel</button></div>
  </section>`;
  bindPhotoPreview();
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
    budget:el('#l_budget').value, notes:(el('#l_notes').value||'').trim(), rep:S.rep||'', source:'PWA',
    photosBase64:photos, photosCount:photos.length };
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
  </section>`;
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


/*NEXT_DOOR_FEATURE*/
(() => {
  // Guard & settings
  const LS = {
    get(key, def){ try{ const v = localStorage.getItem(key); return v==null? def : (v==='true'? true : (v==='false'? false : v)); }catch(_){ return def; } },
    set(key, val){ try{ localStorage.setItem(key, String(val)); }catch(_){} }
  };
  if (typeof window.S === 'undefined') window.S = {};
  if (typeof S.enableNextDoorLookup === 'undefined') S.enableNextDoorLookup = LS.get('enableNextDoorLookup', true);

  // Small helpers
  function $(sel,root=document){ return root.querySelector(sel); }
  function $all(sel,root=document){ return Array.from(root.querySelectorAll(sel)); }
  function toast(msg){ try{ if(window.showToast) return showToast(msg,'info'); }catch(_){} alert(msg); }
  function bestAddressFrom(data){
    const addr = (data && data.address) || {};
    const parts = [];
    const hn = addr.house_number || "";
    const road = addr.road || addr.pedestrian || addr.footway || addr.path || "";
    const line1 = [hn, road].filter(Boolean).join(" ").trim();
    if(line1) parts.push(line1);
    const city = addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || "";
    const state = addr.state || "";
    const pc = addr.postcode || "";
    const cityStateZip = [city, [state, pc].filter(Boolean).join(" ")].filter(Boolean).join(", ").trim();
    if(cityStateZip) parts.push(cityStateZip);
    return parts.join(", ");
  }

  // Inject button next to likely address inputs (id contains address/addr/street)
  function findAddressInputs(){
    const candidates = $all('input[id*=\"address\" i], input[id*=\"addr\" i], input[id*=\"street\" i]');
    // De-dup by element
    return candidates.filter((el, i, a) => a.indexOf(el)===i);
  }

  function ensureButtonFor(input){
    if (!input) return;
    if (input.dataset.nextDoorBound === '1') return;
    input.dataset.nextDoorBound = '1';
    // Make a small button element
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn next-door-btn';
    btn.title = 'Use your current location once to fill the address';
    btn.textContent = 'Next Door';
    btn.style.marginLeft = '8px';
    // Fallback link area
    const fx = document.createElement('span');
    fx.className = 'next-door-fallback';
    fx.style.marginLeft = '8px';

    // Insert after input
    input.insertAdjacentElement('afterend', fx);
    input.insertAdjacentElement('afterend', btn);

    btn.addEventListener('click', async () => {
      if (!S.enableNextDoorLookup) { toast('Next Door is disabled in Settings.'); return; }
      if (!('geolocation' in navigator)) { toast('Geolocation not available on this device.'); return; }
      // One-time geolocation
      const pos = await new Promise((resolve, reject) => {
        let done = false;
        const id = navigator.geolocation.getCurrentPosition(
          p => { if(done) return; done=true; resolve(p); },
          e => { if(done) return; done=true; reject(e); },
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 0 }
        );
        setTimeout(()=>{ if(!done){ done=true; reject(new Error('timeout')); } }, 6000);
      }).catch(err => { toast('Couldn\\'t get your location.'); return null; });
      if (!pos) return;

      const lat = pos.coords.latitude, lon = pos.coords.longitude;

      // Reverse geocode via Nominatim (text-only extraction)
      let data = null;
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&addressdetails=1&email=${encodeURIComponent('nicholasande@gmail.com')}`;
        const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if(!r.ok) throw new Error('HTTP '+r.status);
        data = await r.json();
      } catch(e){
        toast('Lookup failed — try again or type your address.');
        return;
      }
      if(!data) return;
      const parsed = bestAddressFrom(data);
      const fullText = data.display_name || '';

      if (parsed){
        input.value = parsed;
        input.dispatchEvent(new Event('input', {bubbles:true}));
        toast('Address filled. Review and edit if needed.');
      } else if (fullText){
        input.value = fullText;
        input.dispatchEvent(new Event('input', {bubbles:true}));
        toast('Used full address text. Review and edit if needed.');
      } else {
        toast('No address found — please type it.');
      }

      // Offer a fallback: if parsed and fullText differ, provide a quick insert link
      fx.innerHTML = '';
      if (fullText && parsed && fullText !== parsed){
        const a = document.createElement('button');
        a.type = 'button';
        a.className = 'linklike';
        a.textContent = 'Use full text instead';
        a.addEventListener('click', () => {
          input.value = fullText;
          input.dispatchEvent(new Event('input', {bubbles:true}));
          toast('Used full address text.');
          fx.innerHTML='';
        });
        fx.appendChild(a);
      }
    });
  }

  function scanAndAttach(){
    findAddressInputs().forEach(ensureButtonFor);
  }

  // Re-scan on renders
  document.addEventListener('DOMContentLoaded', scanAndAttach);
  window.addEventListener('hashchange', () => setTimeout(scanAndAttach, 0));
  window.addEventListener('popstate', () => setTimeout(scanAndAttach, 0));
  // In case app re-renders main view without navigation:
  setInterval(scanAndAttach, 1000);

  // Minimal styles (inline) — safe, tiny.
  const style = document.createElement('style');
  style.textContent = `.next-door-btn{font-size:.875rem; padding:.35rem .6rem; border-radius:.5rem; border:1px solid var(--fg-2, #aaa); background:transparent; cursor:pointer}
  .next-door-btn:hover{opacity:.9}
  .next-door-fallback .linklike{font-size:.825rem; text-decoration:underline; background:none; border:none; cursor:pointer; padding:0; margin:0;}`;
  document.head.appendChild(style);
})();



/*NEXT_DOOR_SETTINGS*/
(() => {
  function injectToggle(){
    const view = document.getElementById('view');
    if(!view) return;
    if(view.dataset.nextDoorSettings==='1') return;
    // Look for Settings heading
    const h2 = view.querySelector('h2');
    if(!h2 || !/Settings/i.test(h2.textContent||'')) return;
    // Create field
    const wrap = document.createElement('div');
    wrap.className = 'field';
    wrap.innerHTML = `<label>Enable Next Door lookup</label>
      <select id="s_nextdoor">
        <option value="true"${S.enableNextDoorLookup?' selected':''}>On</option>
        <option value="false"${!S.enableNextDoorLookup?' selected':''}>Off</option>
      </select>`;
    h2.insertAdjacentElement('afterend', wrap);
    view.dataset.nextDoorSettings='1';
    // Hook into existing save button if present
    const saveBtn = view.querySelector('button.primary');
    if (saveBtn){
      const orig = saveBtn.onclick;
      saveBtn.onclick = function(ev){
        const val = (document.getElementById('s_nextdoor')||{}).value;
        if (val!=null){
          S.enableNextDoorLookup = String(val)==='true';
          try{ localStorage.setItem('enableNextDoorLookup', String(S.enableNextDoorLookup)); }catch(e){}
        }
        if (orig) return orig.call(this, ev);
      };
    }
  }
  document.addEventListener('DOMContentLoaded', injectToggle);
  setInterval(injectToggle, 1000);
})();

