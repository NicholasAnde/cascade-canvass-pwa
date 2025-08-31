// v4.7.2 — full app: geocoder Next Door + cooldown, Map Today/7...posts, stacked buttons, pine icon, Test POST, queue, light/dark.

window.S = window.S || {
  rep: localStorage.getItem('rep') || '',
  theme: localStorage.getItem('theme') || 'dark',
  endpoint: null, secret:'', emailNotifyTo:'',
  visitsLog: JSON.parse(localStorage.getItem('visitsLog') || '[]'),
  leadsLog: JSON.parse(localStorage.getItem('leadsLog') || '[]'),
  queue: JSON.parse(localStorage.getItem('queue') || '[]'),
  geoList: [], geoPtr: 0, geoRadius: 150, geoLimit: 25, cooldownDays: 90,
  enableNextDoorLookup: (localStorage.getItem('enableNextDoorLookup')||'true')==='true'
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
async function sendToScript(payload){ if(!S.endpoint) throw new Error('No endpoint configured');
  const r=await fetch(S.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!r.ok) throw new Error('HTTP '+r.status); return r.text(); }

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

// -------- map + geocoder helpers (distance disabled) --------
const KM=(a,b)=>Infinity; // distance disabled
function fmtAddr(tags){ const num=tags['addr:housenumber']||'', street=tags['addr:street']||tags['name']||'', unit=tags['addr:unit']||'', city=tags['addr:city']||tags['addr:suburb']||'';
  return [num,street,unit?('#'+unit):'',city].filter(Boolean).join(' ').replace(/\s+/g,' ').trim(); }
function lastIndex(){ return (S.visitsLog||[]).reduce((m,v)=>{ const a=(v.address||'').trim(), t=v.time||v.date||'';
  if(!a||!t) return m; if(!m[a]||new Date(t)>new Date(m[a])) m[a]=t; return m; },{}); }
let _busy=false;
async function fetchNearby(lat,lon,r=S.geoRadius,l=S.geoLimit){ return []; }
async function refreshGeoList(){ return false; }
function nextEligiblePtr(start){ for(let i=start;i<S.geoList.length;i++){ if(S.geoList[i]?.eligible) return i; } return -1; }

// -------- views --------
function renderDashboard(){
  el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>Dashboard</h2>
    <div class="btn-row">
      <button class="primary" onclick="go('knock')">Start Knocking</button>
      <button onclick="go('lead')">New Lead</button>
      <button onclick="go('tracker')">Lead Tracker</button>
      <button onclick="go('maptoday')">Map Today</button>
      <button onclick="go('scripts')">Scripts</button>
      <button onclick="go('settings')">Settings</button>
    </div>
  </section>`;
}

async function renderKnock_geo(){
  const last=lastIndex();
  el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>Knock</h2>
    <div class="grid">
      <div class="field"><label>Address</label><input id="k_addr" autocomplete="street-address" placeholder="123 Main St, City ST 00000"></div>
      <div class="field"><label>Notes</label><textarea id="k_notes" rows="3" enterkeyhint="done"></textarea></div>
    </div>
    <div class="btn-row">
      <button class="primary" onclick="postVisit_geo('Contacted')">Contacted</button>
      <button onclick="postVisit_geo('No Answer')">No Answer</button>
      <button onclick="postVisit_geo('Declined')">Declined</button>
      <button onclick="postVisit_geo('Lead')">Lead</button>
    </div>
    <details style="margin-top:.5rem"><summary>Recent Visits Index</summary>
      <div style="max-height:160px; overflow:auto; font-size:.85rem">
        ${Object.entries(last).sort((a,b)=>new Date(b[1])-new Date(a[1])).slice(0,30).map(([a,t])=>`<div>${a}<small style="opacity:.65"> — ${new Date(t).toLocaleString()}</small></div>`).join('')}
      </div>
    </details>
  </section>`;
}

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
  S.visitsLog.push(item); saveLS(); showToast((outcome==='Lead'?'Lead captured ✓':'Visit saved ✓'),'success'); if(outcome==='Lead') go('lead'); else advanceGeo();
}

function advanceGeo(){ const n=nextEligiblePtr(S.geoPtr+1); S.geoPtr = n<0?0:n; renderKnock_geo(); }

// Lead + photos
function renderLead(){
  el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>New Lead</h2>
    <div class="field"><label>Name*</label><input id="l_name" autocomplete="name"></div>
    <div class="field"><label>Phone*</label><input id="l_phone" inputmode="tel" autocomplete="tel" placeholder="(###) ###-####"></div>
    <div class="field"><label>Email</label><input id="l_email" inputmode="email" autocomplete="email"></div>
    <div class="field"><label>Address</label><input id="l_address" autocomplete="street-address" value="${S.geoList[S.geoPtr]?.addr||''}"></div>
    <div class="field"><label>Service</label><select id="l_service"><option>Removal</option><option>Pruning</option><option>Stump</option><option>Planting</option><option>Other</option></select></div>
    <div class="field"><label>Urgency</label><select id="l_urgency"><option>High</option><option>Medium</option><option>Low</option></select></div>
    <div class="field"><label>Budget</label><select id="l_budget"><option>$0–$250</option><option>$250–$500</option><option>$500+</option><option>$1k+</option></select></div>
    <div class="field"><label>Notes</label><textarea id="l_notes" rows="4" enterkeyhint="done"></textarea></div>
    <div class="field"><label>Photos (up to 3)</label><input id="l_photos" type="file" accept="image/*" multiple capture="environment"><div id="l_preview" class="btn-row" style="margin-top:.4rem"></div></div>
    <div class="btn-row"><button class="primary" onclick="confirmLead()">Save Lead</button><button onclick="go('dashboard')">Cancel</button></div>
  </section>`;
  bindPhotoPreview();
}
function confirmLead(){
  const req = (id,label)=>{ const v=(el(id)?.value||'').trim(); if(!v){ showToast(label+' required','error'); el(id)?.focus(); } return v; };
  const name=req('#l_name','Name'); if(!name) return;
  const phone=req('#l_phone','Phone'); if(!phone) return;
  const address=(el('#l_address')?.value||'').trim();
  const photosInput=el('#l_photos'); const files=[...(photosInput?.files||[])].slice(0,3);
  const filesToDataURLs=fs=>Promise.all(fs.map(f=>new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(String(r.result)); r.readAsDataURL(f); })));
  filesToDataURLs(files).then(photos=>sendLead(name,phone,address,photos));
}
async function sendLead(name,phone,address,photos){
  const b={ type:'lead', date:todayISO(), time:new Date().toISOString(),
    name, phone, email:(el('#l_email').value||'').trim(), address, service:el('#l_service').value, urgency:el('#l_urgency').value,
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
    <div class="btn-row" style="margin-top:.4rem">
      <button onclick="copyLead(${i})">Copy</button>
      <button onclick="deleteLead(${i})">Delete</button>
    </div>
  </div>`).join('') + (list.length?`<div class="btn-row" style="margin-top:.8rem"><button onclick="downloadCSV('leads.csv',S.leadsLog)">Export CSV</button></div>`:`<div class="field"><small>No leads yet.</small></div>`);
}
function copyLead(i){ const l=S.leadsLog[i]; if(!l) return; navigator.clipboard?.writeText(`${l.name} — ${l.phone} — ${l.address}`); showToast('Copied'); }
function deleteLead(i){ if(!confirm('Delete this lead?')) return; S.leadsLog.splice(i,1); saveLS(); renderTracker(); }

// Map Today (kept; will show markers only if entries have coords)
function renderMapToday(){
  el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>Map Today</h2>
    <div id="map" style="height:360px;border-radius:12px;overflow:hidden"></div>
    <div class="btn-row" style="margin-top:.6rem">
      <button onclick="downloadCSV('visits.csv',S.visitsLog)">Export Visits</button>
      <button onclick="downloadCSV('leads.csv',S.leadsLog)">Export Leads</button>
    </div>
  </section>`;
  const Lwin=window.L; if(!Lwin || !Lwin.map){ el('#map').innerHTML='<div style="padding:1rem">Map library not loaded.</div>'; return; }
  const map=L.map('map'); try{ map.setView([45.637,-122.661], 11); }catch(e){}
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
  const add=arr=>arr.forEach(v=>{ if(typeof v.lat==='number'&&typeof v.lon==='number'){
    const m=L.marker([v.lat,v.lon]).addTo(map); m.bindPopup((v.type==='lead'?'Lead: ':'Visit: ')+(v.address||'')).openPopup(); }});
  add(S.visitsLog||[]); add(S.leadsLog||[]);
}

// Scripts page
function renderScripts(){
  el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>Scripts</h2>
    <div id="sc_list" class="grid"></div>
  </section>`;
  fetch('./assets/scripts.json').then(r=>r.json()).then(js=>{
    const list = Object.entries(js||{}).map(([k,v])=>`<div class="field"><label>${k}</label><div><small>${String(v||'')}</small></div></div>`).join('');
    el('#sc_list').innerHTML=list||'<div class="field"><small>No scripts loaded.</small></div>';
  }).catch(()=>{ el('#sc_list').innerHTML='<div class="field"><small>Unable to load scripts.</small></div>'; });
}

// Settings
function renderSettings(){
  el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>Settings</h2>
    <div class="field"><label>Rep Name</label><input id="s_rep" value="${S.rep||''}" autocomplete="name"></div>
    <div class="field"><label>Theme</label><select id="s_theme">
      <option value="dark"${S.theme!=='light'?' selected':''}>Dark</option>
      <option value="light"${S.theme==='light'?' selected':''}>Light (iOS)</option>
    </select></div>
    <div class="btn-row"><button class="primary" onclick="savePrefs()">Save</button><button onclick="testPost()">Test POST</button></div>
    <div class="field"><label>Test Result</label><textarea id="adm_msg" rows="4" readonly placeholder="Run Test POST to see result"></textarea></div>
  </section>`;
}
function savePrefs(){
  S.rep=(el('#s_rep').value||'').trim();
  S.theme=el('#s_theme').value==='light'?'light':'dark';
  document.documentElement.dataset.theme=(S.theme==='light')?'light':'';
  saveLS(); showToast('Preferences saved ✓','success'); go('dashboard');
}
async function testPost(){
  const box=el('#adm_msg'); if(!S.endpoint){ box.value='No endpoint configured'; return; }
  const payload={ type:'visit', date:todayISO(), time:new Date().toISOString(),
    address:'123 Sample St, Vancouver WA', name:'', phone:'', email:'', notes:'Test from Settings → Test POST', rep:S.rep||'', source:'PWA', secret:S.secret||'', emailNotifyTo:S.emailNotifyTo||'' };
  try{ const text=await sendToScript(payload); box.value=text||'OK'; }
  catch(e){ box.value='Error → queued locally: '+(e&&e.message||e); S.queue.push(payload); saveLS(); }
}

// -------- CSV --------
function toCSV(rows){ const esc=v=>('"' + String(v??'').replace(/"/g,'""') + '"'); const keys=Object.keys(rows[0]||{});
  return [keys.map(esc).join(','), ...rows.map(r=>keys.map(k=>esc(r[k])).join(','))].join('\n'); }
function downloadCSV(name, rows){ if(!rows.length){ showToast('No data to export','info'); return; }
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([toCSV(rows)],{type:'text/csv'})); a.download=name; a.click(); }

// -------- photos --------
function bindPhotoPreview(){
  const input=el('#l_photos'), out=el('#l_preview'); if(!input||!out) return;
  out.innerHTML=''; const files=[...(input.files||[])].slice(0,3);
  files.forEach((f,i)=>{ const r=new FileReader(); r.onload=()=>{ const img=new Image(); img.src=r.result; img.style.maxHeight='80px';
    img.style.borderRadius='8px'; img.style.marginRight='.4rem'; out.appendChild(img); }; r.readAsDataURL(f); });
}

// -------- queue retry --------
async function retryQueue(){
  if(_busy) return; _busy=true;
  const q=[...(S.queue||[])]; S.queue=[]; for(const p of q){
    try{ await sendToScript(p); }catch(e){ S.queue.push(p); }
  }
  _busy=false; saveLS();
}

// -------- init --------
document.addEventListener('DOMContentLoaded', ()=> window.go ? go('dashboard') : (el('#view').innerHTML='<section class="card"><h2>Loading…</h2></section>'));

// ===== NEXT DOOR FEATURE (on-demand reverse geocoding, no storage) =====
/* NEXT DOOR reverse lookup (on-demand, no storage) */
(() => {
  const LS = {
    get(k,d){ try{ const v=localStorage.getItem(k); return v==null?d:(v==='true'?true:v==='false'?false:v);}catch(_){return d;} },
    set(k,v){ try{ localStorage.setItem(k,String(v)); }catch(_){} }
  };
  if(typeof window.S==='undefined') window.S={};
  if(typeof S.enableNextDoorLookup==='undefined') S.enableNextDoorLookup=LS.get('enableNextDoorLookup',true);

  function $(s,r=document){ return r.querySelector(s); }
  function $all(s,r=document){ return Array.from(r.querySelectorAll(s)); }
  function toast(m){ try{ if(window.showToast) return showToast(m,'info'); }catch(_){} }

  function findAddressInputs(){
    return $all('input[id*="address" i],input[id*="addr" i],input[id*="street" i]');
  }
  function bestAddressFrom(data){
    const a=(data&&data.address)||{};
    const hn=a.house_number||"";
    const road=a.road||a.pedestrian||a.footway||a.path||"";
    const city=a.city||a.town||a.village||a.hamlet||a.suburb||"";
    const st=a.state||""; const pc=a.postcode||"";
    const line1=[hn,road].filter(Boolean).join(" ").trim();
    const line2=[city,[st,pc].filter(Boolean).join(" ")].filter(Boolean).join(", ").trim();
    return [line1,line2].filter(Boolean).join(", ");
  }
  function ensureButtonFor(input){
    if(!input||input.dataset.nextDoorBound==='1') return;
    input.dataset.nextDoorBound='1';
    const btn=document.createElement('button'); btn.type='button'; btn.className='btn next-door-btn'; btn.textContent='Next Door';
    btn.title='Use your current location once to fill the address'; btn.style.marginLeft='8px';
    const fx=document.createElement('span'); fx.className='next-door-fallback'; fx.style.marginLeft='8px';
    input.insertAdjacentElement('afterend', fx);
    input.insertAdjacentElement('afterend', btn);
    btn.addEventListener('click', async ()=>{
      if(!S.enableNextDoorLookup){ toast('Next Door is disabled in Settings.'); return; }
      if(!('geolocation' in navigator)){ toast('Geolocation not available'); return; }
      let pos=null;
      try{
        pos = await new Promise((resolve,reject)=>{
          let done=false;
          navigator.geolocation.getCurrentPosition(
            p=>{ if(done) return; done=true; resolve(p); },
            e=>{ if(done) return; done=true; reject(e); },
            { enableHighAccuracy:false, timeout:5000, maximumAge:0 }
          );
          setTimeout(()=>{ if(!done){ done=true; reject(new Error('timeout')); } }, 6000);
        });
      }catch(_){ toast('Couldn\'t get your location'); return; }
      if(!pos) return;
      const lat=pos.coords.latitude, lon=pos.coords.longitude;
      let data=null;
      try{
        const url=`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&addressdetails=1&email=${encodeURIComponent('nicholasande@gmail.com')}`;
        const r=await fetch(url,{headers:{'Accept':'application/json'}}); if(!r.ok) throw new Error('HTTP '+r.status); data=await r.json();
      }catch(_){ toast('Lookup failed — type your address'); return; }
      const parsed=bestAddressFrom(data); const full=data&&data.display_name||'';
      if(parsed){ input.value=parsed; input.dispatchEvent(new Event('input',{bubbles:true})); toast && toast('Address filled — review it'); }
      else if(full){ input.value=full; input.dispatchEvent(new Event('input',{bubbles:true})); toast && toast('Used full address text — review it'); }
      else { toast && toast('No address found — type it'); }
      fx.innerHTML='';
      if(full && parsed && full!==parsed){
        const a=document.createElement('button'); a.type='button'; a.className='linklike'; a.textContent='Use full text instead';
        a.addEventListener('click', ()=>{ input.value=full; input.dispatchEvent(new Event('input',{bubbles:true})); fx.innerHTML=''; });
        fx.appendChild(a);
      }
    });
  }
  function scan(){ findAddressInputs().forEach(ensureButtonFor); }
  document.addEventListener('DOMContentLoaded', scan);
  window.addEventListener('hashchange', ()=>setTimeout(scan,0));
  window.addEventListener('popstate', ()=>setTimeout(scan,0));
  setInterval(scan, 1000);

  const style=document.createElement('style');
  style.textContent=`.next-door-btn{font-size:.875rem;padding:.35rem .6rem;border-radius:.5rem;border:1px solid var(--fg-2,#aaa);background:transparent;cursor:pointer}
.next-door-btn:hover{opacity:.9}.next-door-fallback .linklike{font-size:.825rem;text-decoration:underline;background:none;border:none;cursor:pointer;padding:0;margin:0}`;
  document.head.appendChild(style);
})();

/* NEXT DOOR Settings toggle injection */
(() => {
  function injectToggle(){
    const view=document.getElementById('view'); if(!view) return;
    if(view.dataset.nextDoorSettings==='1') return;
    const h2=view.querySelector('h2'); if(!h2 || !/Settings/i.test(h2.textContent||'')) return;
    const wrap=document.createElement('div'); wrap.className='field';
    wrap.innerHTML=`<label>Enable Next Door lookup</label>
      <select id="s_nextdoor"><option value="true"${S.enableNextDoorLookup?' selected':''}>On</option>
      <option value="false"${!S.enableNextDoorLookup?' selected':''}>Off</option></select>`;
    h2.insertAdjacentElement('afterend', wrap);
    view.dataset.nextDoorSettings='1';
    const saveBtn=view.querySelector('button.primary');
    if(saveBtn){
      const orig=saveBtn.onclick;
      saveBtn.onclick=function(ev){
        const v=(document.getElementById('s_nextdoor')||{}).value;
        if(v!=null){ S.enableNextDoorLookup=String(v)==='true'; try{ localStorage.setItem('enableNextDoorLookup', String(S.enableNextDoorLookup)); }catch(e){} }
        if(orig) return orig.call(this, ev);
      };
    }
  }
  document.addEventListener('DOMContentLoaded', injectToggle);
  setInterval(injectToggle, 1000);
})();
