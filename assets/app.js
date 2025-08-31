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
// removed unused geocoder function

// removed unused geocoder function

// refreshGeoList removed (no longer used)

// nextEligiblePtr removed (no longer used)





async function renderKnock_geo(){
  // Manual Next Door — no geocoding; lat,lon only
  el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>Next Door</h2>
    <div class="field">
      <label for="k_addr">Address*</label>
      <input id="k_addr" placeholder="1208 Maple St" autocomplete="street-address" enterkeyhint="next">
    </div>
    <div class="addr-row" style="margin-top:.5rem">
      <button id="nd-locate" class="iconbtn locate" type="button" aria-label="Use My Location" title="Use My Location">
        <span id="nd-locate-label">📍 Use My Location</span>
      </button>
    </div>
    <small id="nd-locate-status" class="muted" role="status" aria-live="polite" style="display:none;margin-top:.25rem"></small>
    <div class="field">
      <label for="k_notes">Notes</label>
      <input id="k_notes" placeholder="Optional" enterkeyhint="done">
    </div>
    <div class="btn-row">
      <button class="primary" onclick="confirmVisit('Lead')">Lead</button>
      <button onclick="confirmVisit('Left Literature')">Left Literature</button>
      <button onclick="confirmVisit('Declined')">Declined</button>
      <button onclick="confirmEnd()">End / Skip</button>
    </div>
  </section>`;

  const btn  = el('#nd-locate');
  const note = el('#nd-locate-status');
  const input= el('#k_addr');
  const label= el('#nd-locate-label');

  function setStatus(msg){
    if(!note) return;
    note.textContent = msg || '';
    note.style.display = msg ? 'block' : 'none';
  }
  function setBusy(b){
    if(!btn) return;
    btn.disabled = !!b;
    btn.setAttribute('aria-busy', b ? 'true' : 'false');
    if(label){
      label.textContent = b ? '⏳ Locating…' : '📍 Use My Location';
    }
  }

  if(btn && input){
    btn.addEventListener('click', ()=>{
      if(!('geolocation' in navigator)){ setStatus('Location not supported.'); return; }
      setBusy(true); setStatus('Getting location…');
      navigator.geolocation.getCurrentPosition(pos=>{
        const { latitude: lat, longitude: lon, accuracy } = pos.coords;
        input.value = lat.toFixed(6) + ', ' + lon.toFixed(6);
        input.dispatchEvent(new Event('input', {bubbles:true}));
        input.dispatchEvent(new Event('change', {bubbles:true}));
        setStatus('Coordinates filled (±'+Math.round(accuracy)+'m).');
        setBusy(false);
      }, err=>{
        const map={1:'Permission denied.',2:'Location unavailable.',3:'Timed out.'};
        setStatus(map[err.code] || 'Location error.');
        setBusy(false);
      }, { enableHighAccuracy:true, timeout:15000, maximumAge:0 });
    });
  }
}

function confirmEnd(){ if(confirm('End this door and go to next?')) go('dashboard'); }
function confirmVisit(outcome){
  const addr=(el('#k_addr')?.value||'').trim(); if(!addr){ showToast('Address required','error'); el('#k_addr')?.focus(); return; }
  if(!confirm(`Log "${outcome}" at:\\n${addr}?`)) return; postVisit_geo(outcome);
}
// advanceGeo removed (no longer used)


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
  const payload={ type:'visit', date:todayISO(), time:new Date().toISOString(), address:'TEST ADDRESS', notes:'(test payload)', outcome:'Test', rep:S.rep||'', source:'PWA', secret:S.secret||'', emailNotifyTo:S.emailNotifyTo||'' };
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
