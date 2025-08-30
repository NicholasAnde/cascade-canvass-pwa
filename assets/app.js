// v4.6-full: pine tree icon, light mode, stacked buttons, confirms, queue + Test POST (frontend only)

window.S = window.S || {
  rep: localStorage.getItem('rep') || '',
  theme: localStorage.getItem('theme') || 'dark',
  endpoint: null, secret:'', emailNotifyTo:'',
  visitsLog: JSON.parse(localStorage.getItem('visitsLog') || '[]'),
  leadsLog: JSON.parse(localStorage.getItem('leadsLog') || '[]'),
  queue: JSON.parse(localStorage.getItem('queue') || '[]'),
  scriptStats: JSON.parse(localStorage.getItem('scriptStats') || '{}')
};
document.documentElement.dataset.theme = (S.theme === 'light') ? 'light' : '';

// Load config
(async function(){
  try{
    const cfg = await fetch('./app.settings.json').then(r=>r.json());
    S.endpoint      = cfg.sheetsEndpoint || null;
    S.secret        = cfg.sharedSecret || '';
    S.emailNotifyTo = cfg.emailNotifyTo || '';
  }catch(e){}
  window.addEventListener('online', retryQueue);
})();

const el = s => document.querySelector(s);
function saveLS(){
  localStorage.setItem('rep', S.rep);
  localStorage.setItem('theme', S.theme);
  localStorage.setItem('visitsLog', JSON.stringify(S.visitsLog));
  localStorage.setItem('leadsLog', JSON.stringify(S.leadsLog));
  localStorage.setItem('queue', JSON.stringify(S.queue));
  localStorage.setItem('scriptStats', JSON.stringify(S.scriptStats));
}
function showToast(m,t='success'){
  const root=el('#toast-root'); if(!root) return;
  const d=document.createElement('div'); d.className=`toast ${t}`; d.innerHTML=`<div>${m}</div><button class="close" aria-label="Close">×</button>`;
  root.appendChild(d); const close=()=>{ d.style.animation='toast-out .16s ease forwards'; setTimeout(()=>d.remove(),160); };
  d.querySelector('.close').onclick=close; setTimeout(close, t==='error'?2800:2000);
}
const todayISO = ()=> new Date().toISOString().slice(0,10);
const weekAgoISO = ()=> new Date(Date.now()-6*86400000).toISOString().slice(0,10);

// CORS-safe post (no headers)
async function sendToScript(payload){
  if(!S.endpoint) throw new Error('No endpoint configured');
  const r = await fetch(S.endpoint, { method:'POST', body: JSON.stringify(payload) });
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.text();
}

// Stats
function counts(){ const t=todayISO(), wk=weekAgoISO(); return {
  doorsToday:(S.visitsLog||[]).filter(v=>(v.date||'').slice(0,10)===t).length,
  leadsToday:(S.leadsLog||[]).filter(l=>(l.date||'').slice(0,10)===t).length,
  leadsWeek:(S.leadsLog||[]).filter(l=>(l.date||'')>=wk).length
};}
function statsBarHTML(){ const c=counts(); return `<div class="statsbar">
  <div class="stat"><small>Doors Today</small><b>${c.doorsToday}</b></div>
  <div class="stat"><small>Leads Today</small><b>${c.leadsToday}</b></div>
  <div class="stat"><small>Leads (7d)</small><b>${c.leadsWeek}</b></div>
</div>`; }

// Router
function go(tab){
  if(tab==='dashboard') return renderDashboard();
  if(tab==='knock') return renderKnock();
  if(tab==='lead') return renderLead();
  if(tab==='tracker') return renderTracker();
  if(tab==='scripts') return renderScripts();
  if(tab==='settings') return renderSettings();
  renderDashboard();
}

// CSV
function toCSV(rows){ const esc=v=>('\"' + String(v??'').replace(/\"/g,'\"\"') + '\"'); const keys=Object.keys(rows[0]||{}); return [keys.map(esc).join(','), ...rows.map(r=>keys.map(k=>esc(r[k])).join(','))].join('\\n'); }
function downloadCSV(name, rows){ if(!rows.length){ showToast('No data to export','info'); return; } const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([toCSV(rows)],{type:'text/csv'})); a.download=name; a.click(); }

// Views
function renderDashboard(){
  el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>Home</h2>
    <div class="btn-row">
      <button class="primary" onclick="go('knock')">Next Door</button>
      <button onclick="go('lead')">New Lead</button>
      <button onclick="go('tracker')">Lead Tracker</button>
      <button onclick="go('scripts')">Scripts</button>
      <button onclick="go('settings')">Settings</button>
    </div>
    <div class="btn-row" style="margin-top:.6rem"><button onclick="downloadCSV('visits.csv', S.visitsLog)">Export Visits</button></div>
  </section>`;
}

function renderKnock(){
  el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>Next Door</h2>
    <div class="field"><label>Address*</label><input id="k_addr" placeholder="1208 Maple St" inputmode="text" autocomplete="street-address"></div>
    <div class="field"><label>Notes</label><input id="k_notes" placeholder="Optional" enterkeyhint="done"></div>
    <div class="btn-row">
      <button class="primary" onclick="confirmVisit('Lead')">Lead</button>
      <button onclick="confirmVisit('No Answer')">No Answer</button>
      <button onclick="confirmVisit('Left Literature')">Left Literature</button>
      <button onclick="confirmVisit('Declined')">Declined</button>
      <button onclick="confirmEnd()">End / Skip</button>
    </div>
  </section>`;
}
function confirmEnd(){
  if(confirm('End this door and go to next?')) showToast('Ready for next door', 'success');
}
function confirmVisit(outcome){
  const addr=(el('#k_addr')?.value||'').trim(); if(!addr){ showToast('Address required','error'); el('#k_addr')?.focus(); return; }
  const ok = confirm(`Log "${outcome}" at:\n${addr}?`);
  if(!ok) return; postVisit(outcome);
}
async function postVisit(outcome){
  const addr=(el('#k_addr').value||'').trim(); const notes=(el('#k_notes').value||'').trim();
  let objection=''; if(outcome==='Declined') objection = prompt('Reason for decline? (optional)','')||'';
  const item={ type: outcome==='Lead'?'lead':'visit', date:todayISO(), time:new Date().toISOString(),
    address:addr, name:'', phone:'', email:'', notes, rep:S.rep||'', source:'PWA',
    outcome: outcome==='Lead'? undefined : outcome, objection };
  try{ await sendToScript({ ...item, secret:S.secret, emailNotifyTo:S.emailNotifyTo }); }
  catch(e){ S.queue.push({ ...item, secret:S.secret, emailNotifyTo:S.emailNotifyTo }); }
  S.visitsLog.push(item); saveLS(); showToast((outcome==='Lead'?'Lead':'Visit')+' saved ✓','success');
  if(outcome==='Lead') go('lead'); else renderKnock();
}

// Lead form + confirm
function renderLead(){ el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>New Lead</h2>
  <div class="field"><label>Name*</label><input id="l_name" autocomplete="name"></div>
  <div class="field"><label>Phone*</label><input id="l_phone" inputmode="tel" autocomplete="tel" placeholder="(###) ###-####"></div>
  <div class="field"><label>Email</label><input id="l_email" inputmode="email" autocomplete="email"></div>
  <div class="field"><label>Address</label><input id="l_addr" inputmode="text" autocomplete="street-address"></div>
  <div class="field"><label>Service</label><select id="l_service"><option>Removal</option><option>Trim</option><option>Storm Prep</option><option>Planting</option><option>Other</option></select></div>
  <div class="field"><label>Urgency</label><select id="l_urgency"><option>High</option><option>Medium</option><option>Low</option></select></div>
  <div class="field"><label>Budget</label><select id="l_budget"><option>&lt;$500</option><option>$500+</option><option>$1k+</option></select></div>
  <div class="field"><label>Notes</label><textarea id="l_notes" rows="4" enterkeyhint="done"></textarea></div>
  <div class="btn-row"><button class="primary" onclick="confirmLead()">Save Lead</button><button onclick="go('dashboard')">Cancel</button></div>
</section>`; }
function confirmLead(){
  const name=(el('#l_name')?.value||'').trim(); const addr=(el('#l_addr')?.value||'').trim();
  if(!name){ showToast('Name required','error'); return; }
  if(!confirm(`Save lead for:\n${name}\n${addr||''}?`)) return;
  saveLead();
}
async function saveLead(){
  const b={ type:'lead', date:todayISO(), time:new Date().toISOString(),
    name:(el('#l_name').value||'').trim(), phone:(el('#l_phone').value||'').trim(), email:(el('#l_email').value||'').trim(),
    address:(el('#l_addr').value||'').trim(), service:el('#l_service').value, urgency:el('#l_urgency').value,
    budget:el('#l_budget').value, notes:(el('#l_notes').value||'').trim(), rep:S.rep||'', source:'PWA' };
  try{ await sendToScript({ ...b, secret:S.secret, emailNotifyTo:S.emailNotifyTo }); }
  catch(e){ S.queue.push({ ...b, secret:S.secret, emailNotifyTo:S.emailNotifyTo }); }
  S.leadsLog.push(b); saveLS(); showToast('Lead saved ✓','success'); go('dashboard');
}

// Lead Tracker
function renderTracker(){
  el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>Lead Tracker</h2><div id="lt_list"></div></section>`;
  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const list=(S.leadsLog||[]);
  el('#lt_list').innerHTML = list.map((l,i)=>`<div class="field" style="padding:.6rem .8rem">
    <label>${esc(l.date||'')} — ${esc(l.name||'')}</label>
    <div><small>${esc(l.address||'')}</small></div>
    <div class="btn-row" style="margin-top:.35rem"><button data-del="${i}">❌ Delete</button></div>
  </div>`).join('') || '<div class="field"><label>No leads yet</label></div>';
  el('#lt_list').querySelectorAll('button[data-del]').forEach(btn=>btn.addEventListener('click',()=>{
    const idx=parseInt(btn.getAttribute('data-del'),10); const lead=(S.leadsLog||[])[idx]; if(!lead) return;
    if(!confirm('Delete lead '+(lead.name||'')+'?')) return;
    const ix = (S.leadsLog||[]).indexOf(lead); if(ix>=0){ S.leadsLog.splice(ix,1); saveLS(); showToast('Lead deleted (local) ✓','success'); renderTracker(); }
  }));
}

// Scripts (reference)
async function renderScripts(){
  let data=null; try{ data=await fetch('assets/scripts.json').then(r=>r.json()); }catch(_){}
  data = data || {seasons:{},audience:{},core:{opener:'',ask:'',close:''},rebuttals:{}};
  const m=new Date().getMonth()+1; const season=(m>=3&&m<=5)?'Spring':(m>=6&&m<=8)?'Summer':(m>=9&&m<=11)?'Fall':'Winter';
  const audiences=Object.keys(data.audience||{});
  el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>Scripts</h2>
    <div class="field"><label>Season</label><input value="${season}" readonly/></div>
    <div class="field"><label>Audience Cue</label><select id="sc_aud">${audiences.map(s=>`<option>${s}</option>`).join('')}</select></div>
    <div class="field"><label>Opener</label><input value="${(data.core.opener||'').replace(/"/g,'&quot;')}" readonly/></div>
    <div class="field"><label>Ask</label><input value="${(data.core.ask||'').replace(/"/g,'&quot;')}" readonly/></div>
    <div class="field"><label>Close</label><input value="${(data.core.close||'').replace(/"/g,'&quot;')}" readonly/></div>
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

// Settings + Test POST
function renderSettings(){ el('#view').innerHTML = `<section class="card">${statsBarHTML()}<h2>Settings</h2>
  <div class="field"><label>Rep Name</label><input id="s_rep" value="${S.rep||''}" autocomplete="name"></div>
  <div class="field"><label>Theme</label><select id="s_theme"><option value="dark" ${S.theme==='dark'?'selected':''}>Dark</option><option value="light" ${S.theme==='light'?'selected':''}>Light (iOS)</option></select></div>
  <div class="btn-row">
    <button class="primary" onclick="savePrefs()">Save</button>
    <button onclick="retryQueue()">Retry Queue (${S.queue.length})</button>
    <button onclick="clearQueue()">Clear Queue</button>
    <button onclick="testPost()">Test POST</button>
  </div>
  <div class="field"><label>Test Result</label><textarea id="adm_msg" rows="3" readonly placeholder="Run Test POST to see result"></textarea></div>
</section>`; }
function savePrefs(){ const rep=(el('#s_rep').value||'').trim(); if(rep) S.rep=rep; S.theme=el('#s_theme').value; document.documentElement.dataset.theme=(S.theme==='light')?'light':''; saveLS(); showToast('Preferences saved ✓','success'); go('dashboard'); }
async function testPost(){
  const box=el('#adm_msg'); if(!S.endpoint){ box.value='No endpoint configured (app.settings.json)'; showToast('No endpoint','error'); return; }
  const payload={ type:'visit', date:todayISO(), time:new Date().toISOString(),
    address:'TEST ADDRESS', notes:'(test payload)', outcome:'No Answer', rep:S.rep||'', source:'PWA',
    secret:S.secret||'', emailNotifyTo:S.emailNotifyTo||'' };
  try{ const text=await sendToScript(payload); box.value='HTTP 200\\n'+text; showToast('Test POST ok ✓'); }
  catch(e){ box.value=String(e); showToast('Test POST failed','error'); }
}

// Queue
async function retryQueue(){
  if(!S.queue.length){ showToast('Queue empty','info'); return; }
  const q=[...S.queue]; S.queue=[]; saveLS();
  let sent=0, failed=0, last='';
  for(const p of q){
    try{ await sendToScript(p); sent++; }
    catch(e){ S.queue.push(p); failed++; last=String(e); }
  }
  saveLS();
  if(sent) showToast(`Synced ${sent} ✓`,'success');
  if(failed) showToast(`${failed} still queued${last? ' ('+last+')':''}`,'info');
}
function clearQueue(){ if(!S.queue.length){ showToast('Queue already empty','info'); return; } if(!confirm(`Discard ${S.queue.length} queued item(s)?`)) return; S.queue=[]; saveLS(); showToast('Queue cleared ✓','success'); }

// Boot
document.addEventListener('DOMContentLoaded', ()=> go('dashboard'));
