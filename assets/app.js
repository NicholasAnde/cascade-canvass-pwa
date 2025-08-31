// v4.7.2-patch — Manual reverse lookup; no auto-geocoding; Next Door = Lead / Left Lit / Declined / Skip;
// photos removed; add Pull from Sheets (read) + existing send to Sheets.

window.S = window.S || {
  rep: localStorage.getItem('rep') || '',
  theme: localStorage.getItem('theme') || 'dark',
  endpoint: null, secret:'', emailNotifyTo:'',
  visitsLog: JSON.parse(localStorage.getItem('visitsLog') || '[]'),
  leadsLog:  JSON.parse(localStorage.getItem('leadsLog')  || '[]'),
  queue:     JSON.parse(localStorage.getItem('queue')     || '[]')
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
function saveLS(){ localStorage.setItem('rep',S.rep); localStorage.setItem('theme',S.theme);
  localStorage.setItem('visitsLog',JSON.stringify(S.visitsLog)); localStorage.setItem('leadsLog',JSON.stringify(S.leadsLog));
  localStorage.setItem('queue',JSON.stringify(S.queue)); }
function showToast(m,t='success'){ const root=el('#toast-root'); if(!root) return;
  const d=document.createElement('div'); d.className=`toast ${t}`;
  d.innerHTML=`<div>${m}</div><button class="close" aria-label="Close">×</button>`;
  root.appendChild(d);
  const close=()=>{ d.style.animation='toast-out .16s ease forwards'; setTimeout(()=>d.remove(),160); };
  d.querySelector('.close').onclick=close; setTimeout(close,t==='error'?2800:2000);
}
async function sendToScript(payload){ if(!S.endpoint) throw new Error('No endpoint configured');
  const r=await fetch(S.endpoint,{method:'POST',body:JSON.stringify(payload)});
  if(!r.ok) throw new Error('HTTP '+r.status); return r.text();
}

/* Router */
function go(tab){
  if(tab==='dashboard') return renderDashboard();
  if(tab==='knock')     return renderKnock();      // simplified Next Door
  if(tab==='lead')      return renderLead();
  if(tab==='tracker')   return renderTracker();
  if(tab==='scripts')   return renderScripts();
  if(tab==='settings')  return renderSettings();
  renderDashboard();
}

/* Dashboard */
function renderDashboard(){
  el('#view').innerHTML = `<section class="card"><h2>Home</h2>
    <div class="btn-row">
      <button class="primary" onclick="go('knock')">Next Door</button>
      <button onclick="go('lead')">New Lead</button>
      <button onclick="go('tracker')">Lead Tracker</button>
      <button onclick="go('scripts')">Scripts</button>
      <button onclick="go('settings')">Settings</button>
    </div>
  </section>`;
}

/* Next Door (manual reverse lookup, no auto geocoding) */
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
    }catch(e){
      el('#k_addr').value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    }
  }, ()=> showToast('Location error','error'));
}
async function knockOutcome(outcome){
  const addr=(el('#k_addr')?.value||'').trim();
  const notes=(el('#k_notes')?.value||'').trim();
  if(!addr){ showToast('Address required','error'); el('#k_addr')?.focus(); return; }
  const item={ type: outcome==='Lead'?'lead':'visit', date:new Date().toISOString().slice(0,10), time:new Date().toISOString(),
    address:addr, name:'', phone:'', email:'', notes, rep:S.rep||'', source:'PWA',
    outcome: outcome==='Lead'? undefined : outcome, objection:'', lat:null, lon:null };
  try{ await sendToScript({ ...item, secret:S.secret, emailNotifyTo:S.emailNotifyTo }); }
  catch(e){ S.queue.push({ ...item, secret:S.secret, emailNotifyTo:S.emailNotifyTo }); }
  S.visitsLog.push(item); saveLS(); showToast((outcome==='Lead'?'Lead':'Visit')+' saved ✓','success');
  if(outcome==='Lead'){ S.__prefill={ address:addr }; go('lead'); } else { el('#k_addr').value=''; el('#k_notes').value=''; }
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
    budget:el('#l_budget').value, notes:(el('#l_notes').value||'').trim(), rep:S.rep||'', source:'PWA' };
  if(!b.name){ showToast('Name required','error'); return; }
  try{ await sendToScript({ ...b, secret:S.secret, emailNotifyTo:S.emailNotifyTo }); }
  catch(e){ S.queue.push({ ...b, secret:S.secret, emailNotifyTo:S.emailNotifyTo }); }
  S.leadsLog.push(b); saveLS(); showToast('Lead saved ✓','success'); go('dashboard');
}

/* Lead tracker (unchanged from 4.7.x) */
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

/* Scripts (reference) */
function renderScripts(){
  el('#view').innerHTML = `<section class="card"><h2>Scripts</h2>
    <div class="field"><label>Season</label><input value="${['Winter','Spring','Summer','Fall'][Math.floor(((new Date().getMonth()+1)%12)/3)]}" readonly/></div>
    <div class="field"><label>Audience Cue</label><select><option>General</option><option>Pros</option><option>Retirees</option></select></div>
  </section>`;
}

/* Settings (add Pull from Sheets) */
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
function savePrefs(){ const rep=(el('#s_rep').value||'').trim(); if(rep) S.rep=rep; S.theme=el('#s_theme').value;
  document.documentElement.dataset.theme=(S.theme==='light')?'light':''; saveLS(); showToast('Preferences saved ✓','success'); go('dashboard'); }
async function testPost(){ const box=el('#adm_msg'); if(!S.endpoint){ box.value='No endpoint configured'; return; }
  const payload={ type:'visit', date:new Date().toISOString().slice(0,10), time:new Date().toISOString(), address:'TEST ADDRESS', notes:'(test payload)',
    outcome:'Left Literature', rep:S.rep||'', source:'PWA', secret:S.secret||'', emailNotifyTo:S.emailNotifyTo||'' };
  try{ const text=await sendToScript(payload); box.value='HTTP 200\\n'+text; showToast('Test POST ok ✓'); }catch(e){ box.value=String(e); showToast('Test POST failed','error'); }
}

/* Pull from Sheets (read) */
async function pullFromSheets(){
  const box=el('#adm_msg'); if(!S.endpoint){ box.value='No endpoint configured'; return; }
  try{
    const url = S.endpoint + '?read=1&secret=' + encodeURIComponent(S.secret||'');
    const j = await fetch(url, { method:'GET' }).then(r=>r.json());
    if(j && Array.isArray(j.visits) && Array.isArray(j.leads)){
      // Simple merge (append; no dedupe beyond exact object string)
      j.visits.forEach(v=> S.visitsLog.push(v));
      j.leads.forEach(l=>  S.leadsLog.push(l));
      saveLS(); showToast('Pulled from Sheets ✓'); box.value='Pulled '+j.visits.length+' visits & '+j.leads.length+' leads';
    }else{
      box.value='Unexpected response'; showToast('Pull failed','error');
    }
  }catch(e){ box.value=String(e); showToast('Pull failed','error'); }
}

/* Queue helpers */
async function retryQueue(){ if(!S.queue.length){ showToast('Queue empty','info'); return; }
  const q=[...S.queue]; S.queue=[]; saveLS(); let sent=0,failed=0,last='';
  for(const p of q){ try{ await sendToScript(p); sent++; }catch(e){ S.queue.push(p); failed++; last=String(e); } }
  saveLS(); if(sent) showToast(`Synced ${sent} ✓`,'success'); if(failed) showToast(`${failed} still queued${last? ' ('+last+')':''}`,'info'); }
function clearQueue(){ if(!S.queue.length){ showToast('Queue already empty','info'); return; } if(!confirm(`Discard ${S.queue.length} queued item(s)?`)) return;
  S.queue=[]; saveLS(); showToast('Queue cleared ✓','success'); }

/* expose router globally */
window.go = go;
