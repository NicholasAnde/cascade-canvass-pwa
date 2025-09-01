// v4.7.2-patch-002 — Manual reverse lookup; Next Door (Lead / Left Literature / Declined / Skip);
// photos removed; Sheets read+write; Map shows color-coded history (Today, 1–7d, 8–29d, 30–89d, 90+).

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
function saveLS(){
  localStorage.setItem('rep',S.rep); localStorage.setItem('theme',S.theme);
  localStorage.setItem('visitsLog',JSON.stringify(S.visitsLog));
  localStorage.setItem('leadsLog', JSON.stringify(S.leadsLog));
  localStorage.setItem('queue',    JSON.stringify(S.queue));
}
function showToast(m,t='success'){
  const root=el('#toast-root'); if(!root) return;
  const d=document.createElement('div'); d.className=`toast ${t}`; d.innerHTML=`<div>${m}</div><button class="close" aria-label="Close">×</button>`;
  root.appendChild(d);
  const close=()=>{ d.style.animation='toast-out .16s ease forwards'; setTimeout(()=>d.remove(),160); };
  d.querySelector('.close').onclick=close; setTimeout(close,t==='error'?2800:2000);
}
async function sendToScript(payload){
  if(!S.endpoint) throw new Error('No endpoint configured');
  const r=await fetch(S.endpoint,{method:'POST',body:JSON.stringify(payload)});
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.text();
}

/* Router */
function go(tab){
  if(tab==='dashboard') return renderDashboard();
  if(tab==='knock')     return renderKnock();
  if(tab==='map')       return renderMap();
  if(tab==='lead')      return renderLead();
  if(tab==='tracker')   return renderTracker();
  if(tab==='scripts')   return renderScripts();
  if(tab==='settings')  return renderSettings();
  renderDashboard();
}
window.go = go;

/* Dashboard */
function renderDashboard(){
  el('#view').innerHTML = `<section class="card"><h2>Home</h2>
    <div class="btn-row">
      <button class="primary" onclick="go('knock')">Next Door</button>
      <button onclick="go('map')">Map</button>
      <button onclick="go('lead')">New Lead</button>
      <button onclick="go('tracker')">Lead Tracker</button>
      <button onclick="go('scripts')">Scripts</button>
      <button onclick="go('settings')">Settings</button>
    </div>
  </section>`;
}

/* Next Door (manual reverse lookup; no auto anything) */
function renderKnock(){
  el('#view').innerHTML = `<section class="card"><h2>Next Door</h2>
    <div class="field"><label>Address*</label><input id="k_addr" placeholder="1208 Maple St" autocomplete="street-address"></div>
    <div class="field"><label>Notes</label><input id="k_notes" placeholder="Optional" enterkeyhint="done"></div>
    <div class="btn-row">
      <button class="primary" onclick="knockOutcome('Lead')">New Lead</button>
      <button onclick="knockOutcome('Left Literature')">Left Literature</button>
      <button onclick="knockOutcome('Declined')">Declined</button>
      <button onclick="skipDoor()">Skip</button>
      <button onclick="reverseLookup()">Reverse Lookup (GPS → Address)</button>
    </div>
  </section>`;
}
function skipDoor(){ showToast('Skipped','info'); el('#k_addr').value=''; el('#k_notes').value=''; }
async function reverseLookup(){
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
async function knockOutcome(outcome){
  const addr=(el('#k_addr')?.value||'').trim();
  const notes=(el('#k_notes')?.value||'').trim();
  if(!addr){ showToast('Address required','error'); el('#k_addr')?.focus(); return; }
  const gps = S.__lastGPS || {};
  const item={ type: outcome==='Lead'?'lead':'visit', date:new Date().toISOString().slice(0,10), time:new Date().toISOString(),
    address:addr, name:'', phone:'', email:'', notes, rep:S.rep||'', source:'PWA',
    outcome: outcome==='Lead'? undefined : outcome, objection:'',
    lat: (typeof gps.lat==='number')?gps.lat:null, lon: (typeof gps.lon==='number')?gps.lon:null };
  S.__lastGPS = null;
  try{ await sendToScript({ ...item, secret:S.secret, emailNotifyTo:S.emailNotifyTo }); }
  catch(e){ S.queue.push({ ...item, secret:S.secret, emailNotifyTo:S.emailNotifyTo }); }
  S.visitsLog.push(item); saveLS(); showToast((outcome==='Lead'?'Lead':'Visit')+' saved ✓','success');
  if(outcome==='Lead'){ S.__prefill={ address:addr, lat:item.lat, lon:item.lon }; go('lead'); }
  else { el('#k_addr').value=''; el('#k_notes').value=''; }
}

/* Lead (no photos) */
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
    <div class="btn-row"><button class="primary" onclick="saveLead()">Save Lead</button><button onclick="go('dashboard')">Cancel</button></div>
  </section>`;
}
async function saveLead(){
  const b={ type:'lead', date:new Date().toISOString().slice(0,10), time:new Date().toISOString(),
    name:(el('#l_name').value||'').trim(), phone:(el('#l_phone').value||'').trim(), email:(el('#l_email').value||'').trim(),
    address:(el('#l_addr').value||'').trim(), service:el('#l_service').value, urgency:el('#l_urgency').value,
    budget:el('#l_budget').value, notes:(el('#l_notes').value||'').trim(), rep:S.rep||'', source:'PWA',
    lat:(S.__prefill&&typeof S.__prefill.lat==='number')?S.__prefill.lat:null,
    lon:(S.__prefill&&typeof S.__prefill.lon==='number')?S.__prefill.lon:null };
  if(!b.name){ showToast('Name required','error'); return; }
  try{ await sendToScript({ ...b, secret:S.secret, emailNotifyTo:S.emailNotifyTo }); }
  catch(e){ S.queue.push({ ...b, secret:S.secret, emailNotifyTo:S.emailNotifyTo }); }
  S.leadsLog.push(b); saveLS(); showToast('Lead saved ✓','success'); go('dashboard');
}

/* Map: color-coded history by age */
function renderMap(){
  el('#view').innerHTML = `
    <section class="card">
      <h2>Map — Knock History</h2>
      <div class="field"><label>Legend</label>
        <div id="legend" style="display:flex;gap:.6rem;flex-wrap:wrap"></div>
      </div>
      <div id="map" class="map"></div>
    </section>
  `;
  const COLORS = {
    today:  '#22c55e', // green
    d1_7:   '#3b82f6', // blue
    d8_29:  '#f59e0b', // amber
    d30_89: '#ef4444', // red
    d90p:   '#9ca3af'  // gray
  };
  el('#legend').innerHTML = [
    ['Today', COLORS.today],
    ['1–7d', COLORS.d1_7],
    ['8–29d', COLORS.d8_29],
    ['30–89d', COLORS.d30_89],
    ['90+ d', COLORS.d90p]
  ].map(([label,color]) => `
    <span style="display:inline-flex;align-items:center;gap:.4rem">
      <span style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #00000030"></span>
      <small>${label}</small>
    </span>
  `).join('');

  // Most recent per address with coords
  const lastByAddr = {};
  for (const v of (S.visitsLog || [])){
    const a=(v.address||'').trim(); if(!a) continue;
    const t=v.time||v.date||''; if(!lastByAddr[a] || new Date(t)>new Date(lastByAddr[a].time||lastByAddr[a].date||0)) lastByAddr[a]=v;
  }
  const points = Object.values(lastByAddr).filter(v => typeof v.lat==='number' && typeof v.lon==='number');

  if(!window.L){ showToast('Map library not loaded','error'); return; }
  const map = L.map('map', {zoomControl:true});
  const start = points[0] ? [points[0].lat, points[0].lon] : [45.64,-122.67];
  map.setView(start, points[0]?15:12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);

  const bounds=[];
  const daysSince = iso => Math.floor((Date.now() - new Date(iso).getTime())/86400000);
  for (const p of points){
    const lastIso=(p.time||p.date||'').slice(0,10);
    const age=lastIso?daysSince(lastIso):9999;
    let color = COLORS.d8_29;
    if (age===0)      color=COLORS.today;
    else if (age<=7)  color=COLORS.d1_7;
    else if (age>=90) color=COLORS.d90p;
    else if (age>=30) color=COLORS.d30_89;

    const icon = new L.DivIcon({className:'', html:`<div style="width:14px;height:14px;border-radius:50%;border:2px solid #000;background:${color}"></div>`});
    const m=L.marker([p.lat,p.lon],{icon}).addTo(map);
    m.bindPopup(`<b>${p.address||''}</b><br/><small>${(p.outcome||'Visit')} • ${new Date(p.time||p.date||'').toLocaleString()}</small>`);
    bounds.push([p.lat,p.lon]);
  }
  if(bounds.length>1) map.fitBounds(bounds,{padding:[20,20]});
}

/* Lead tracker (local) */
function renderTracker(){
  el('#view').innerHTML = `<section class="card"><h2>Lead Tracker</h2><div id="lt_list"></div></section>`;
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

/* Scripts */
async function renderScripts(){
  const SCRIPT_URL='assets/scripts.json?v=4722';
  let data=null; try{ data=await fetch(SCRIPT_URL,{cache:'no-store'}).then(r=>r.json()); }catch(_){ data=null; }
  data=data||{seasons:{},audience:{},core:{opener:'',ask:'',close:''},rebuttals:{}};
  const m=new Date().getMonth()+1; const season=(m>=3&&m<=5)?'Spring':(m>=6&&m<=8)?'Summer':(m>=9&&m<=11)?'Fall':'Winter';
  const audiences=Object.keys(data.audience||{}), rebuttals=data.rebuttals||{};
  el('#view').innerHTML=`<section class="card">
    <h2>Scripts</h2>
    <div class="field"><label>Season</label><input value="${season}" readonly/></div>
    <div class="field"><label>Audience Cue</label><select id="sc_aud">${audiences.map(a=>`<option>${a}</option>`).join('')}</select></div>
    <div class="field"><label>Opener</label><textarea rows="2" readonly>${data.core.opener||''}</textarea></div>
    <div class="field"><label>Ask</label><textarea rows="2" readonly>${data.core.ask||''}</textarea></div>
    <div class="field"><label>Close</label><textarea rows="2" readonly>${data.core.close||''}</textarea></div>
    <div class="field"><label>Notes (Season + Audience)</label><textarea id="sc_preview" rows="3" readonly></textarea></div>
    <div class="field"><label>Rebuttals</label><div id="rbx"></div></div>
  </section>`;
  const updateNotes=()=>{ const a=(el('#sc_aud')?.value||''); const sHook=(data.seasons?.[season]||''); const aCue=(data.audience?.[a]||''); el('#sc_preview').value=[sHook,aCue].filter(Boolean).join(' • '); };
  el('#sc_aud')?.addEventListener('change',updateNotes); updateNotes();
  el('#rbx').innerHTML = Object.keys(rebuttals).map(k=>{ const rb=rebuttals[k]||{}; return `<div class="field" style="margin-top:.4rem"><label>${k}</label><div><small><b>A)</b> ${rb.A||''}</small></div><div style="margin-top:.2rem"><small><b>B)</b> ${rb.B||''}</small></div></div>`; }).join('') || '<small>No rebuttals</small>';
}

/* Settings (read + write) */
function renderSettings(){
  el('#view').innerHTML = `<section class="card"><h2>Settings</h2>
    <div class="field"><label>Rep Name</label><input id="s_rep" value="${S.rep||''}" autocomplete="name"></div>
    <div class="field"><label>Theme</label><select id="s_theme"><option value="dark" ${S.theme==='dark'?'selected':''}>Dark</option><option value="light" ${S.theme==='light'?'selected':''}>Light (iOS)</option></select></div>
    <div class="btn-row">
      <button class="primary" onclick="savePrefs()">Save</button>
      <button onclick="retryQueue()">Retry Queue (${S.queue.length})</button>
      <button onclick="clearQueue()">Clear Queue</button>
      <button onclick="testPost()">Test POST</button>
      <button onclick="pullFromSheets()">Pull from Sheets</button>
    </div>
    <div class="field"><label>Test / Sync Result</label><textarea id="adm_msg" rows="3" readonly placeholder="Results appear here"></textarea></div>
  </section>`;
}
function savePrefs(){
  const rep=(el('#s_rep').value||'').trim(); if(rep) S.rep=rep;
  S.theme=el('#s_theme').value; document.documentElement.dataset.theme=(S.theme==='light')?'light':''; saveLS();
  showToast('Preferences saved ✓','success'); go('dashboard');
}
async function testPost(){
  const box=el('#adm_msg'); if(!S.endpoint){ box.value='No endpoint configured'; return; }
  const payload={ type:'visit', date:new Date().toISOString().slice(0,10), time:new Date().toISOString(),
    address:'TEST ADDRESS', notes:'(test payload)', outcome:'Left Literature', rep:S.rep||'', source:'PWA',
    secret:S.secret||'', emailNotifyTo:S.emailNotifyTo||'' };
  try{ const text=await sendToScript(payload); box.value='HTTP 200\n'+text; showToast('Test POST ok ✓'); }catch(e){ box.value=String(e); showToast('Test POST failed','error'); }
}
async function pullFromSheets(){
  const box=el('#adm_msg'); if(!S.endpoint){ box.value='No endpoint configured'; return; }
  try{
    const url=S.endpoint+'?read=1&secret='+encodeURIComponent(S.secret||'');
    const j=await fetch(url,{method:'GET'}).then(r=>r.json());
    if(j && Array.isArray(j.visits) && Array.isArray(j.leads)){
      j.visits.forEach(v=> S.visitsLog.push(v));
      j.leads.forEach(l=>  S.leadsLog.push(l));
      saveLS(); showToast('Pulled from Sheets ✓'); box.value='Pulled '+j.visits.length+' visits & '+j.leads.length+' leads';
    }else{ box.value='Unexpected response'; showToast('Pull failed','error'); }
  }catch(e){ box.value=String(e); showToast('Pull failed','error'); }
}

/* Queue helpers */
async function retryQueue(){
  if(!S.queue.length){ showToast('Queue empty','info'); return; }
  const q=[...S.queue]; S.queue=[]; saveLS(); let sent=0,failed=0,last='';
  for(const p of q){ try{ await sendToScript(p); sent++; }catch(e){ S.queue.push(p); failed++; last=String(e); } }
  saveLS(); if(sent) showToast(`Synced ${sent} ✓`,'success');
  if(failed) showToast(`${failed} still queued${last? ' ('+last+')':''}`,'info');
}
function clearQueue(){
  if(!S.queue.length){ showToast('Queue already empty','info'); return; }
  if(!confirm(`Discard ${S.queue.length} queued item(s)?`)) return;
  S.queue=[]; saveLS(); showToast('Queue cleared ✓','success');
}
