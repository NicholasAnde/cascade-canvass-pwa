// v4.7.2-patch-010 — Address Lookup above actions; slide-to-save for logging & lead save;
// per-rep KPIs; always-capture GPS; map filters & auto-refresh; Sheets read+write.

window.S = window.S || {
  rep: localStorage.getItem('rep') || '',
  theme: localStorage.getItem('theme') || 'dark',
  endpoint: null, secret:'', emailNotifyTo:'',
  visitsLog: JSON.parse(localStorage.getItem('visitsLog') || '[]'),
  leadsLog:  JSON.parse(localStorage.getItem('leadsLog')  || '[]'),
  queue:     JSON.parse(localStorage.getItem('queue')     || '[]'),
  __lastGPS: null,
  __prefill: null
};
document.documentElement.dataset.theme = (S.theme === 'light') ? 'light' : '';

const LEAD_GOAL = 15;

(async function(){
  try{
    const cfg = await fetch('./app.settings.json').then(r=>r.json());
    S.endpoint      = cfg.sheetsEndpoint || null;
    S.secret        = cfg.sharedSecret   || '';
    S.emailNotifyTo = cfg.emailNotifyTo  || '';
  }catch(e){}
  window.addEventListener('online', retryQueue);
})();

const el = s => document.querySelector(s);
function saveLS(){ localStorage.setItem('rep',S.rep); localStorage.setItem('theme',S.theme);
  localStorage.setItem('visitsLog',JSON.stringify(S.visitsLog));
  localStorage.setItem('leadsLog', JSON.stringify(S.leadsLog));
  localStorage.setItem('queue',    JSON.stringify(S.queue)); }
function showToast(m,t='success'){ const root=el('#toast-root'); if(!root) return;
  const d=document.createElement('div'); d.className=`toast ${t}`; d.innerHTML=`<div>${m}</div><button class="close" aria-label="Close">×</button>`;
  root.appendChild(d); const close=()=>{ d.style.animation='toast-out .16s ease forwards'; setTimeout(()=>d.remove(),160); };
  d.querySelector('.close').onclick=close; setTimeout(close,t==='error'?2800:2000); }
async function sendToScript(payload){ if(!S.endpoint) throw new Error('No endpoint configured');
  const r=await fetch(S.endpoint,{method:'POST',body:JSON.stringify(payload)}); if(!r.ok) throw new Error('HTTP '+r.status); return r.text(); }

/* ===== Slide-to-save component ===== */
function makeSlide(el, label, onCommit){
  el.classList.add('slide');
  el.innerHTML = `
    <div class="slide-success"></div>
    <div class="slide-label">${label}</div>
    <div class="slide-track"></div>
    <div class="slide-knob">›</div>
  `;
  const knob = el.querySelector('.slide-knob');
  const track = el.querySelector('.slide-track');
  const success = el.querySelector('.slide-success');
  const maxX = () => el.clientWidth - knob.clientWidth - 6; // 3px margins both sides
  let startX=0, curX=0, dragging=false;

  function commit(){
    el.classList.add('done');
    success.style.opacity = '1';
    setTimeout(()=>{ success.style.opacity='0'; el.classList.remove('done'); reset(); }, 450);
    onCommit && onCommit();
  }
  function reset(){ curX=0; knob.style.left='3px'; }
  function onDown(e){ dragging=true; startX=(e.touches?e.touches[0].clientX:e.clientX) - curX; }
  function onMove(e){
    if(!dragging) return;
    const x=(e.touches?e.touches[0].clientX:e.clientX)-startX;
    curX=Math.max(0, Math.min(maxX(), x));
    knob.style.left=(3+curX)+'px';
  }
  function onUp(){
    if(!dragging) return;
    dragging=false;
    if(curX>maxX()*0.78){ commit(); } else { reset(); }
  }
  knob.addEventListener('mousedown',onDown); knob.addEventListener('touchstart',onDown,{passive:true});
  window.addEventListener('mousemove',onMove); window.addEventListener('touchmove',onMove,{passive:true});
  window.addEventListener('mouseup',onUp); window.addEventListener('touchend',onUp);
  // Accessible tap fallback (double-tap track)
  let lastTap=0; track.addEventListener('click',()=>{ const t=Date.now(); if(t-lastTap<350) commit(); lastTap=t; });
  reset();
}

/* ===== Date/KPI helpers (per rep) ===== */
const d0=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
const today=()=>d0(new Date());
const iso=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString();
function startOfWeek(d,weekStartsOn=1){const t=d0(d),wd=t.getDay();const diff=(wd>=weekStartsOn)?wd-weekStartsOn:7-(weekStartsOn-wd);return new Date(t.getFullYear(),t.getMonth(),t.getDate()-diff);}
function isSameWeek(a,b){const sa=startOfWeek(a),sb=startOfWeek(b);return sa.getFullYear()===sb.getFullYear()&&sa.getMonth()===sb.getMonth()&&sa.getDate()===sb.getDate();}
const repEquals=x=>String(x||'').trim().toLowerCase()===String(S.rep||'').trim().toLowerCase();
function uniqueByDateAddress(items){const set=new Set(),out=[];for(const it of items){if(!repEquals(it.rep))continue;const day=(it.date||(it.time||'').slice(0,10)||'').slice(0,10);const addr=(it.address||'').trim();if(!day||!addr)continue;const key=day+'|'+addr;if(!set.has(key)){set.add(key);out.push({day,addr});}}return out;}
function computeKpis(){const tISO=iso(today()).slice(0,10);const doorsToday=uniqueByDateAddress((S.visitsLog||[]).filter(v=>repEquals(v.rep)&&(v.date||'').slice(0,10)===tISO)).length;const weekLeads=(S.leadsLog||[]).filter(l=>repEquals(l.rep)&&isSameWeek(new Date(l.date||l.time||0),new Date())).length;const counts=new Map();for(const l of (S.leadsLog||[])){if(!repEquals(l.rep))continue;const wk=startOfWeek(new Date(l.date||l.time||0)).toISOString().slice(0,10);counts.set(wk,(counts.get(wk)||0)+1);}let streak=0,c=startOfWeek(new Date());for(let i=0;i<52;i++){const k=c.toISOString().slice(0,10);if((counts.get(k)||0)>=LEAD_GOAL)streak++;else break;c=new Date(c.getFullYear(),c.getMonth(),c.getDate()-7);}return{doorsToday,weekLeads,streak,goal:LEAD_GOAL};}

/* ===== Router ===== */
function go(tab){ if(tab==='dashboard')return renderDashboard(); if(tab==='knock')return renderKnock(); if(tab==='map')return renderMap(); if(tab==='lead')return renderLead(); if(tab==='tracker')return renderTracker(); if(tab==='scripts')return renderScripts(); if(tab==='settings')return renderSettings(); renderDashboard(); }
window.go=go;

/* ===== Dashboard (per-rep KPIs) ===== */
function renderDashboard(){
  const k=computeKpis(), needRep=!String(S.rep||'').trim();
  el('#view').innerHTML=`
    ${needRep?`<section class="card"><div class="field" style="border-left:4px solid #f59e0b"><label>Heads up</label><div>Set your <b>Rep Name</b> in <a href="#" onclick="go('settings')">Settings</a> to see your personal KPIs.</div></div></section>`:''}
    <section class="card">
      <div class="kpis">
        <div class="kpi"><div class="kpi-top">📅 Today</div><div class="kpi-value">${k.doorsToday}</div><div class="kpi-sub">Doors knocked (${S.rep||'—'})</div></div>
        <div class="kpi"><div class="kpi-top">📊 This Week</div><div class="kpi-value">${k.weekLeads} / ${k.goal}</div><div class="kpi-sub">Leads toward goal (${S.rep||'—'})</div></div>
        <div class="kpi"><div class="kpi-top">🔥 Streak</div><div class="kpi-value">${k.streak} wks</div><div class="kpi-sub">Weeks ≥ ${k.goal} leads</div></div>
      </div>
    </section>
    <section class="card">
      <h2>Home</h2>
      <div class="btn-row">
        <button class="primary" onclick="go('knock')">Next Door</button>
        <button onclick="go('map')">Map</button>
        <button onclick="go('lead')">New Lead</button>
        <button onclick="go('tracker')">Lead Tracker</button>
        <button onclick="go('scripts')">Scripts</button>
        <button onclick="go('settings')">Settings</button>
      </div>
    </section>`;
  if(!window.__dashKpiListener){ window.__dashKpiListener=()=>{const k2=computeKpis();const root=el('.kpis');if(!root)return;root.querySelectorAll('.kpi .kpi-value')[0].textContent=k2.doorsToday;root.querySelectorAll('.kpi .kpi-value')[1].textContent=`${k2.weekLeads} / ${k2.goal}`;root.querySelectorAll('.kpi .kpi-value')[2].textContent=`${k2.streak} wks`;}; window.addEventListener('knock:logged',window.__dashKpiListener); }
}

/* ===== Next Door ===== */
function renderKnock(){
  el('#view').innerHTML = `<section class="card"><h2>Next Door</h2>

    <!-- Address Lookup moved above actions -->
    <div class="btn-row">
      <button onclick="addressLookup()">Address Lookup (GPS → Address)</button>
    </div>

    <div class="field"><label>Address*</label><input id="k_addr" placeholder="1208 Maple St" autocomplete="street-address"></div>
    <div class="field"><label>Notes</label><input id="k_notes" placeholder="Optional" enterkeyhint="done"></div>

    <!-- Slide-to-save actions -->
    <div class="btn-row">
      <div id="slide-lit"></div>
      <div id="slide-dec"></div>
      <div id="slide-lead"></div>
      <button onclick="skipDoor()">Skip</button>
    </div>
  </section>`;

  makeSlide(document.getElementById('slide-lit'),  'Slide → Left Literature', ()=>knockOutcome('Left Literature'));
  makeSlide(document.getElementById('slide-dec'),  'Slide → Declined',        ()=>knockOutcome('Declined'));
  makeSlide(document.getElementById('slide-lead'), 'Slide → New Lead',         ()=>knockOutcome('Lead'));
}

function skipDoor(){ showToast('Skipped','info'); el('#k_addr').value=''; el('#k_notes').value=''; }

async function addressLookup(){ // (renamed from reverseLookup)
  if(!navigator.geolocation){ showToast('Geolocation not available','error'); return; }
  navigator.geolocation.getCurrentPosition(async pos=>{
    const { latitude:lat, longitude:lon } = pos.coords;
    try{
      const u=`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=en`;
      const j=await fetch(u,{headers:{'Accept':'application/json'}}).then(r=>r.json());
      el('#k_addr').value = j.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      S.__lastGPS = { lat, lon };
    }catch(e){
      el('#k_addr').value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      S.__lastGPS = { lat, lon };
    }
  }, ()=> showToast('Location error','error'));
}

/* ALWAYS capture GPS; emit 'knock:logged' so Map & KPIs update */
async function knockOutcome(outcome){
  const addr=(el('#k_addr')?.value||'').trim();
  const notes=(el('#k_notes')?.value||'').trim();
  if(!addr){ showToast('Address required','error'); el('#k_addr')?.focus(); return; }

  let lat=null, lon=null;
  if(navigator.geolocation){
    try{ const pos=await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:false,timeout:4000}));
      lat=pos.coords.latitude; lon=pos.coords.longitude; }catch(_){}
  }
  if(S.__lastGPS){ lat=S.__lastGPS.lat; lon=S.__lastGPS.lon; S.__lastGPS=null; }

  const item={ type: outcome==='Lead'?'lead':'visit',
    date:new Date().toISOString().slice(0,10), time:new Date().toISOString(),
    address:addr, name:'', phone:'', email:'', notes, rep:S.rep||'', source:'PWA',
    outcome: outcome==='Lead'? undefined : outcome, objection:'',
    lat, lon };

  try{ await sendToScript({ ...item, secret:S.secret, emailNotifyTo:S.emailNotifyTo }); }
  catch(e){ S.queue.push({ ...item, secret:S.secret, emailNotifyTo:S.emailNotifyTo }); }

  S.visitsLog.push(item); saveLS(); showToast((outcome==='Lead'?'Lead':'Visit')+' saved ✓','success');
  window.dispatchEvent(new CustomEvent('knock:logged', { detail: item }));

  if(outcome==='Lead'){ S.__prefill={ address:addr, lat, lon }; go('lead'); }
  else { el('#k_addr').value=''; el('#k_notes').value=''; }
}

/* ===== Lead (slide-to-save) ===== */
function renderLead(){
  const pf=S.__prefill||{}; delete S.__prefill;
  el('#view').innerHTML = `<section class="card"><h2>New Lead</h2>
    <div class="field"><label>Name*</label><input id="l_name" autocomplete="name"></div>
    <div class="field"><label>Phone*</label><input id="l_phone" inputmode="tel" autocomplete="tel" placeholder="(###) ###-####"></div>
    <div class="field"><label>Email</label><input id="l_email" inputmode="email" autocomplete="email"></div>
    <div class="field"><label>Address</label><input id="l_addr" autocomplete="street-address" value="${pf.address||''}"></div>
    <div class="field"><label>Service</label><select id="l_service"><option>Removal</option><option>Trim</option><option>Storm Prep</option><option>Planting</option><option>Other</option></select></div>
    <div class="field"><label>Urgency</label><select id="l_urgency"><option>High</option><option>Medium</option><option>Low</option></select></div>
    <div class="field"><label>Budget</label><select id="l_budget"><option>&lt;$500</option><option>$500+</option><option>$1k+</option></select></div>
    <div class="field"><label>Notes</label><textarea id="l_notes" rows="4" enterkeyhint="done"></textarea></div>

    <div class="btn-row">
      <div id="slide-save-lead"></div>
      <button onclick="go('dashboard')">Cancel</button>
    </div>
  </section>`;

  makeSlide(document.getElementById('slide-save-lead'), 'Slide → Save Lead', saveLead.bind(null));
}

async function saveLead(){
  const b={ type:'lead', date:new Date().toISOString().slice(0,10), time:new Date().toISOString(),
    name:(el('#l_name').value||'').trim(), phone:(el('#l_phone').value||'').trim(), email:(el('#l_email').value||'').trim(),
    address:(el('#l_addr').value||'').trim(), service:el('#l_service').value, urgency:el('#l_urgency').value,
    budget:el('#l_budget').value, notes:(el('#l_notes').value||'').trim(), rep:S.rep||'', source:'PWA',
    lat:null, lon:null };
  if(!b.name){ showToast('Name required','error'); return; }
  if(S.__prefill && typeof S.__prefill.lat==='number' && typeof S.__prefill.lon==='number'){ b.lat=S.__prefill.lat; b.lon=S.__prefill.lon; S.__prefill=null; }
  else if(navigator.geolocation){ try{ const pos=await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:false,timeout:4000})); b.lat=pos.coords.latitude; b.lon=pos.coords.longitude; }catch(_){ } }
  try{ await sendToScript({ ...b, secret:S.secret, emailNotifyTo:S.emailNotifyTo }); }catch(e){ S.queue.push({ ...b, secret:S.secret, emailNotifyTo:S.emailNotifyTo }); }
  S.leadsLog.push(b); saveLS(); showToast('Lead saved ✓','success'); window.dispatchEvent(new CustomEvent('knock:logged',{detail:b})); go('dashboard');
}

/* ===== Map, Scripts, Settings, Tracker ===== */
/* (Keep your previously working implementations; if you want me to paste those
   full functions again with the latest patches, say "renderMap full" or similar.) */