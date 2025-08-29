// Backend v2: sticky current door, clickable progress bar, skip door, lead tracker

const S = {
  rep: localStorage.getItem('rep') || '',
  theme: localStorage.getItem('theme') || 'dark',
  endpoint: null, secret:'', emailNotifyTo:'',
  visitsLog: JSON.parse(localStorage.getItem('visitsLog') || '[]'),
  leadsLog: JSON.parse(localStorage.getItem('leadsLog') || '[]'),
  queue: JSON.parse(localStorage.getItem('queue') || '[]'),
  turfList: JSON.parse(localStorage.getItem('turfList') || '[]'),
  turfPtr: parseInt(localStorage.getItem('turfPtr') || '0', 10),
  scriptStats: JSON.parse(localStorage.getItem('scriptStats') || '{}')
};

// Theme
document.documentElement.dataset.theme = (S.theme === 'light') ? 'light' : '';

// Config + online listener
(async function boot(){
  try{
    const cfg = await fetch('./app.settings.json').then(r=>r.json());
    S.endpoint = cfg.sheetsEndpoint || null;
    S.secret = cfg.sharedSecret || '';
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
  localStorage.setItem('turfList', JSON.stringify(S.turfList));
  localStorage.setItem('turfPtr', String(S.turfPtr));
  localStorage.setItem('scriptStats', JSON.stringify(S.scriptStats));
}
function showToast(message, type='success'){
  const root = el('#toast-root'); if(!root) return alert(message);
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  div.innerHTML = `<div>${message}</div><button class="close" aria-label="Close">×</button>`;
  root.appendChild(div);
  const close = ()=>{ div.style.animation = 'toast-out .16s ease forwards'; setTimeout(()=>div.remove(), 160); };
  div.querySelector('.close').onclick = close;
  setTimeout(close, type==='error' ? 4200 : 2400);
}

// Router
function go(tab){
  if(tab==='dashboard') return renderDashboard();
  if(tab==='knock') return renderKnock();
  if(tab==='lead') return renderLead();
  if(tab==='turf') return renderTurf();
  if(tab==='tracker') return renderTracker();
  if(tab==='scripts') return renderScripts();
  if(tab==='settings') return renderSettings();
  renderDashboard();
}

// Helpers
function currentDoor(){ return S.turfList[S.turfPtr] || '(No turf loaded)'; }
function progressMeta(){ const total=S.turfList.length; const idx=Math.min(S.turfPtr+1,total||1); return {idx,total}; }
function stripHTML(){
  const {idx,total} = progressMeta();
  const segs = total ? Array.from({length: total}, (_,i)=>`<span class="seg ${i<idx?'filled':''}" data-i="${i}" title="${i+1}/${total}"></span>`).join('') : '';
  return `<div class="strip"><div class="addr">${currentDoor()}</div><div class="meta">${idx} / ${total}</div><div class="progress">${segs}</div></div>`;
}
function bindProgressClicks(){
  document.querySelectorAll('.progress .seg').forEach(seg=>{
    seg.addEventListener('click', ()=>{
      const i = parseInt(seg.getAttribute('data-i'),10);
      if (isNaN(i)) return;
      S.turfPtr = i; saveLS();
      const h2 = el('#view > section.card > h2')?.textContent || '';
      if (h2.includes('Next Door')) renderKnock(); else if (h2.includes('Turf')) renderTurf(); else renderDashboard();
    });
  });
}

// CSV
function toCSV(rows){ const esc=v=>('"' + String(v??'').replace(/"/g,'""') + '"'); const keys=Object.keys(rows[0]||{}); return [keys.map(esc).join(','), ...rows.map(r=>keys.map(k=>esc(r[k])).join(','))].join('\n'); }
function downloadCSV(name, rows){ if(!rows.length){ showToast('No data to export','info'); return; } const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([toCSV(rows)], {type:'text/csv'})); a.download=name; a.click(); }

// Dashboard
function renderDashboard(){
  el('#view').innerHTML = `
  <section class="card">
    ${stripHTML()}
    <h2>Home</h2>
    <div class="tiles" style="margin-top:.6rem">
      <div class="tile" onclick="go('knock')"><div class="big">Next Door</div><div class="sub">${currentDoor()}</div></div>
      <div class="tile" onclick="go('lead')"><div class="big">New Lead</div><div class="sub">Details & photos</div></div>
      <div class="tile" onclick="go('turf')"><div class="big">Turf</div><div class="sub">Manage list</div></div>
      <div class="tile" onclick="go('tracker')"><div class="big">Lead Tracker</div><div class="sub">Status board</div></div>
      <div class="tile" onclick="go('scripts')"><div class="big">Scripts</div><div class="sub">Openers & rebuttals</div></div>
      <div class="tile" onclick="go('settings')"><div class="big">Settings</div><div class="sub">Prefs & exports</div></div>
    </div>
    <div class="btn-row" style="margin-top:1rem">
      <button class="ghost" onclick="downloadCSV('visits.csv', S.visitsLog)">Export Visits</button>
    </div>
  </section>`;
  bindProgressClicks();
}

// Turf
function renderTurf(){
  const list = S.turfList.join('\n');
  el('#view').innerHTML = `
  <section class="card">
    ${stripHTML()}
    <h2>Turf</h2>
    <div class="field"><label>Paste addresses (one per line)</label><textarea id="tf_text" rows="8" placeholder="1208 Maple St\n1210 Maple St\n...">${list}</textarea></div>
    <div class="btn-row">
      <button class="primary" onclick="saveTurf()">Save Turf</button>
      <button class="ghost" onclick="resetPtr()">Reset Pointer</button>
      <button class="ghost" onclick="advanceTurf()">Advance →</button>
    </div>
  </section>`;
  bindProgressClicks();
}
function saveTurf(){ const raw=(el('#tf_text').value||'').split('\n').map(s=>s.trim()).filter(Boolean); S.turfList=raw; if(S.turfPtr>=S.turfList.length) S.turfPtr=0; saveLS(); showToast('Turf list saved ✓','success'); renderTurf(); }
function resetPtr(){ S.turfPtr=0; saveLS(); renderTurf(); }
function advanceTurf(){ if(!S.turfList.length){ showToast('No turf loaded','info'); return; } S.turfPtr=Math.min(S.turfPtr+1,S.turfList.length-1); saveLS(); renderTurf(); }

// Next Door
function renderKnock(){
  el('#view').innerHTML = `
  <section class="card">
    ${stripHTML()}
    <h2>Next Door</h2>
    <div class="field"><label>Address*</label><input id="k_addr" placeholder="1208 Maple St" value="${currentDoor()}"></div>
    <div class="field"><label>Notes</label><input id="k_notes" placeholder="Optional"></div>
    <div class="btn-row" style="margin-top:.6rem">
      <button class="primary" onclick="postVisit('Lead')">Lead</button>
      <button class="ghost" onclick="postVisit('No Answer')">No Answer</button>
      <button class="ghost" onclick="postVisit('Left Literature')">Left Literature</button>
      <button class="ghost" onclick="postVisit('Skipped')">Skip Door</button>
      <button class="ghost" onclick="openObjection()">Objection</button>
      <button class="ghost" onclick="autoFillAddressFromGPS()">Use My Location</button>
      <button class="ghost" onclick="advanceAndFill()">Next in List →</button>
    </div>
  </section>`;
  bindProgressClicks();
}
function advanceAndFill(){ advanceTurf(); const inp=el('#k_addr'); if(inp) inp.value=currentDoor(); }

let _lastRG=0;
async function reverseGeocode(lat,lng){
  try{
    const now=Date.now(); if(now-_lastRG<1200) await new Promise(r=>setTimeout(r,1200-(now-_lastRG)));
    _lastRG=Date.now();
    const u=`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`;
    const j=await fetch(u,{headers:{'Accept':'application/json','User-Agent':'Cascade-Canvass-PWA'}}).then(r=>r.json());
    return j.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }catch(e){ return `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
}
function autoFillAddressFromGPS(){
  if(!navigator.geolocation){ showToast('Geolocation not available','error'); return; }
  navigator.geolocation.getCurrentPosition(async pos=>{
    const {latitude, longitude}=pos.coords;
    const addr = await reverseGeocode(latitude, longitude);
    const inp = el('#k_addr'); if(inp) inp.value = addr;
    showToast('Address filled from GPS','success');
  }, ()=> showToast('Location error','error'));
}
function openObjection(){
  const o = prompt('Objection: Renter / Already have someone / Too Busy / Cost / Later / Other','Renter');
  if(!o) return; postVisit('Objection', o);
}
async function postVisit(outcome, objection=''){
  const addr = (el('#k_addr').value||'').trim();
  const notes = (el('#k_notes').value||'').trim();
  if(!addr){ showToast('Address is required.','error'); el('#k_addr').focus(); return; }
  const item = {
    type: outcome==='Lead' ? 'lead' : 'visit',
    date: new Date().toISOString().slice(0,10),
    time: new Date().toISOString(),
    address: addr, name:'', phone:'', email:'',
    notes, rep:S.rep||'', source:'PWA',
    outcome: outcome==='Lead'? undefined : outcome,
    objection: objection||''
  };
  // Try POST if configured
  if (S.endpoint){
    const payload = {...item, secret:S.secret, emailNotifyTo:S.emailNotifyTo};
    try{
      const r=await fetch(S.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(!r.ok) throw new Error('HTTP '+r.status);
    }catch(e){ S.queue.push(payload); }
  }
  S.visitsLog.push(item); saveLS();
  showToast((outcome==='Lead'?'Lead':'Visit')+' saved ✓','success');
  if(outcome==='Skipped') { advanceTurf(); renderKnock(); }
  if(outcome==='Lead') go('lead');
}

// Lead (with Status) — returns to dashboard
function digitsOnly(s){ return String(s||'').replace(/\D/g,''); }
function toE164(phone){ const d=digitsOnly(phone); if(d.length===10) return '+1'+d; if(d.length>10&&d.length<=15) return '+'+d; return null; }
function validE164(p){ return /^\+[1-9]\d{7,14}$/.test(p); }
function readFilesAsBase64Limited(input, max=3, maxW=1280){
  const files = Array.from(input.files||[]).slice(0,max);
  const out = [];
  return new Promise(resolve=>{
    let i=0;
    const next=()=>{
      if(i>=files.length) return resolve(out);
      const file=files[i++];
      const fr=new FileReader();
      fr.onload=()=>{
        const img=new Image();
        img.onload=()=>{
          const scale=Math.min(1,maxW/img.naturalWidth);
          const w=Math.round(img.naturalWidth*scale),h=Math.round(img.naturalHeight*scale);
          const c=document.createElement('canvas'); c.width=w; c.height=h;
          c.getContext('2d').drawImage(img,0,0,w,h);
          out.push(c.toDataURL('image/jpeg',0.85));
          next();
        }; img.src=fr.result;
      }; fr.readAsDataURL(file);
    }; next();
  });
}
function renderLead(){
  el('#view').innerHTML = `
  <section class="card">
    ${stripHTML()}
    <h2>New Lead</h2>
    <div class="row">
      <div class="field"><label>Name*</label><input id="l_name"></div>
      <div class="field"><label>Phone*</label><input id="l_phone" placeholder="(###) ###-####"></div>
      <div class="field"><label>Email</label><input id="l_email"></div>
      <div class="field"><label>Address</label><input id="l_addr" placeholder="From knock"></div>
    </div>
    <div class="row">
      <div class="field"><label>Service</label><select id="l_service"><option>Removal</option><option>Trim</option><option>Storm Prep</option><option>Planting</option><option>Other</option></select></div>
      <div class="field"><label>Urgency</label><select id="l_urgency"><option>High</option><option>Medium</option><option>Low</option></select></div>
      <div class="field"><label>Timeline</label><select id="l_timeline"><option>This Week</option><option>This Month</option><option>Flexible</option></select></div>
      <div class="field"><label>Budget</label><select id="l_budget"><option>&lt;$500</option><option>$500+</option><option>$1k+</option></select></div>
    </div>
    <div class="field"><label>Status</label>
      <select id="l_status"><option>New</option><option>Contacted</option><option>Scheduled</option><option>Closed Won</option><option>Closed Lost</option></select>
    </div>
    <div class="field"><label>Notes</label><textarea id="l_notes" rows="4"></textarea></div>
    <div class="field"><label>Photos (up to 3)</label><input id="l_photos" type="file" accept="image/*" capture="environment" multiple /></div>
    <div class="btn-row" style="margin-top:.6rem">
      <button class="primary" onclick="saveLead()">Save Lead</button>
      <button class="ghost" onclick="go('dashboard')">Cancel</button>
    </div>
  </section>`;
}
async function saveLead(){
  const b={ type:'lead', date:new Date().toISOString().slice(0,10), time:new Date().toISOString(),
    address:(el('#l_addr').value||'').trim(), name:(el('#l_name').value||'').trim(), phone:(el('#l_phone').value||'').trim(),
    email:(el('#l_email').value||'').trim(), service:el('#l_service').value, urgency:el('#l_urgency').value,
    timeline:el('#l_timeline').value, budget:el('#l_budget').value, status:el('#l_status').value||'New',
    notes:(el('#l_notes').value||'').trim(), rep:S.rep||'', source:'PWA', photos:[] };
  if(!b.name){ showToast('Please enter the contact name.','error'); el('#l_name').focus(); return; }
  const d=String(b.phone||'').replace(/\\D/g,'');
  if(!(d.length===10 || (d.length>10 && d.length<=15))){ showToast('Enter a valid phone','error'); el('#l_phone').focus(); return; }
  const input=el('#l_photos');
  if(input && input.files && input.files.length){ try{ b.photos=await readFilesAsBase64Limited(input,3,1280);}catch(e){} }
  // Try POST if configured
  if (S.endpoint){
    const payload={...b, secret:S.secret, emailNotifyTo:S.emailNotifyTo};
    try{ const r=await fetch(S.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); if(!r.ok) throw new Error('HTTP '+r.status); }
    catch(e){ S.queue.push(payload); }
  }
  S.leadsLog.push(b); saveLS(); showToast('Lead saved ✓','success'); go('dashboard');
}

// Lead Tracker
function renderTracker(){
  el('#view').innerHTML = `
  <section class="card">
    ${stripHTML()}
    <h2>Lead Tracker</h2>
    <div class="field"><label>Filter</label>
      <select id="lt_filter">
        <option value="All">All</option>
        <option>New</option><option>Contacted</option><option>Scheduled</option><option>Closed Won</option><option>Closed Lost</option>
      </select>
    </div>
    <div id="lt_list"></div>
  </section>`;
  const renderList = ()=>{
    const f = el('#lt_filter').value || 'All';
    const list = S.leadsLog.filter(l => f==='All' || (l.status||'New')===f);
    el('#lt_list').innerHTML = list.map((l,i)=>`
      <div class="field">
        <label>${l.date} — ${l.name} <span style="color:var(--muted)">(${l.status||'New'})</span></label>
        <div class="row">
          <div><small>${l.address}</small></div>
          <div><small>${l.phone}</small></div>
        </div>
        <div class="btn-row" style="margin-top:.4rem">
          <select data-i="${i}" class="lt_status">
            ${['New','Contacted','Scheduled','Closed Won','Closed Lost'].map(s=>`<option ${ (l.status||'New')===s?'selected':'' }>${s}</option>`).join('')}
          </select>
          <button class="ghost" onclick="copyLead(${i})">Copy</button>
        </div>
      </div>`).join('') || '<div class="field"><label>No leads yet</label></div>';
    el('#lt_list').querySelectorAll('.lt_status').forEach(sel=>{
      sel.addEventListener('change', (e)=>{
        const i = parseInt(sel.getAttribute('data-i'),10);
        const lead = S.leadsLog[i];
        if (!lead) return;
        lead.status = sel.value;
        saveLS();
        showToast('Status updated ✓','success');
      });
    });
  };
  el('#lt_filter').addEventListener('change', renderList);
  renderList();
}
function copyLead(i){
  const l=S.leadsLog[i]; if(!l) return;
  const text = `${l.name} — ${l.phone}\n${l.address}\n${l.notes||''}`;
  navigator.clipboard?.writeText(text);
  showToast('Lead copied to clipboard ✓','success');
}

// Scripts
async function renderScripts(){
  const data=await fetch('assets/scripts.json').then(r=>r.json());
  const seasons=Object.keys(data.seasons), audiences=Object.keys(data.audience), locales=Object.keys(data.localCues);
  el('#view').innerHTML = `
  <section class="card">
    ${stripHTML()}
    <h2>Scripts</h2>
    <div class="row">
      <div class="field"><label>Season Cue</label><select id="sc_season">${seasons.map(s=>`<option>${s}</option>`).join('')}</select></div>
      <div class="field"><label>Audience Cue</label><select id="sc_aud">${audiences.map(s=>`<option>${s}</option>`).join('')}</select></div>
      <div class="field"><label>Local Cue</label><select id="sc_loc">${locales.map(s=>`<option>${s}</option>`).join('')}</select></div>
    </div>
    <div class="card" style="margin-top:.75rem">
      <p><b>Opener</b> — ${data.core.opener}</p>
      <p><b>Ask</b> — ${data.core.ask}</p>
      <p><b>Close</b> — ${data.core.close}</p>
      <p class="mono" id="sc_preview"></p>
    </div>
    <div class="card">
      <h3>Rebuttals (A/B)</h3>
      ${Object.entries(data.rebuttals).map(([k,v])=>`
        <div style="margin:.35rem 0">
          <b>${k}</b>
          <div class="btn-row" style="margin-top:.35rem">
            <button class="ghost" data-k="${k}" data-v="A">Use A</button>
            <span class="badge">A ${S.scriptStats[`${k}__A`]||0}</span>
            <button class="ghost" data-k="${k}" data-v="B">Use B</button>
            <span class="badge">B ${S.scriptStats[`${k}__B`]||0}</span>
          </div>
          <div class="mono" style="opacity:.8">A: ${v.A}<br/>B: ${v.B}</div>
        </div>`).join('')}
    </div>
  </section>`;
  function update(){ const s=el('#sc_season').value,a=el('#sc_aud').value,l=el('#sc_loc').value; el('#sc_preview').textContent=[data.seasons[s],data.audience[a],data.localCues[l]].filter(Boolean).join(' '); }
  ['sc_season','sc_aud','sc_loc'].forEach(id=>el('#'+id).addEventListener('change',update)); update();
  el('#view').querySelectorAll('button[data-k]').forEach(btn=>btn.addEventListener('click',()=>{const k=btn.getAttribute('data-k'),v=btn.getAttribute('data-v');const key=`${k}__${v}`;S.scriptStats[key]=(S.scriptStats[key]||0)+1; saveLS(); renderScripts();}));
}

// Settings + Admin + Queue
function renderSettings(){
  el('#view').innerHTML = `
  <section class="card">
    ${stripHTML()}
    <h2 id="settingsTitle" title="Press & hold for Admin">Settings</h2>
    <div class="row">
      <div class="field"><label>Rep Name</label><input id="s_rep" value="${S.rep||''}" placeholder="Your name"></div>
      <div class="field"><label>Theme</label>
        <select id="s_theme">
          <option value="dark" ${S.theme==='dark'?'selected':''}>Dark</option>
          <option value="light" ${S.theme==='light'?'selected':''}>Light (iOS)</option>
        </select>
      </div>
    </div>
    <div class="btn-row" style="margin-top:.6rem">
      <button class="primary" onclick="savePrefs()">Save</button>
      <button class="ghost" onclick="downloadCSV('leads.csv', S.leadsLog)">Export Leads</button>
      <button class="ghost" onclick="retryQueue()">Retry Queue (${S.queue.length})</button>
      <button class="ghost" onclick="clearQueue()">Clear Queue</button>
    </div>
    <div id="admin" class="card" style="display:none;margin-top:1rem">
      <h3>Admin</h3>
      <div class="row">
        <div class="field"><label>Shared Secret (override)</label><input id="adm_secret" value="${S.secret||''}" placeholder="CHANGE_ME"></div>
        <div class="field"><label>Lead Email To (override)</label><input id="adm_email" value="${S.emailNotifyTo||''}" placeholder="you@example.com"></div>
      </div>
      <div class="btn-row" style="margin-top:.6rem">
        <button class="primary" onclick="saveAdmin()">Save Overrides</button>
        <button class="ghost" onclick="clearAdmin()">Clear Overrides</button>
        <button class="ghost" onclick="testPost()">Test POST</button>
      </div>
      <p class="mono" id="adm_msg"></p>
    </div>
  </section>`;

  const ttl = el('#settingsTitle');
  let timer=null;
  ttl.addEventListener('mousedown', ()=>{ timer=setTimeout(()=>toggleAdmin(true),700); });
  ttl.addEventListener('mouseup', ()=> clearTimeout(timer));
  ttl.addEventListener('mouseleave', ()=> clearTimeout(timer));
  ttl.addEventListener('touchstart', ()=>{ timer=setTimeout(()=>toggleAdmin(true),700); }, {passive:true});
  ttl.addEventListener('touchend', ()=> clearTimeout(timer));

  function toggleAdmin(force){ const a=el('#admin'); if (!a) return; a.style.display = (force || a.style.display==='none') ? 'block':'none'; }
}
function savePrefs(){
  const rep=(el('#s_rep').value||'').trim();
  if(rep){ S.rep=rep; }
  S.theme = el('#s_theme').value;
  document.documentElement.dataset.theme = (S.theme==='light') ? 'light' : '';
  saveLS(); showToast('Preferences saved ✓','success'); go('dashboard');
}
function saveAdmin(){
  const s=(el('#adm_secret').value||'').trim();
  const e=(el('#adm_email').value||'').trim();
  if(s) S.secret=s;
  if(e) S.emailNotifyTo=e;
  saveLS(); el('#adm_msg').textContent='Overrides saved.'; showToast('Overrides saved ✓','success');
}
function clearAdmin(){
  S.secret=''; S.emailNotifyTo=''; saveLS();
  el('#adm_msg').textContent='Overrides cleared.'; showToast('Overrides cleared ✓','success');
}
async function testPost(){
  if(!S.endpoint){ el('#adm_msg').textContent='No endpoint in app.settings.json'; return; }
  const payload={ type:'visit', date:new Date().toISOString().slice(0,10), time:new Date().toISOString(),
    address:'TEST ADDRESS', notes:'(test payload)', outcome:'No Answer', rep:S.rep||'', source:'PWA', secret:S.secret||'', emailNotifyTo:S.emailNotifyTo||'' };
  try{
    const r=await fetch(S.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    el('#adm_msg').textContent = r.ok ? 'Test POST ok ✓' : ('HTTP '+r.status);
    showToast(r.ok?'Test POST ok ✓':'Test POST failed', r.ok?'success':'error');
  }catch(e){ el('#adm_msg').textContent=String(e); showToast('Test POST failed','error'); }
}
async function retryQueue(){
  if(!S.queue.length){ showToast('Queue empty','info'); return; }
  const q=[...S.queue]; S.queue=[]; saveLS();
  let sent=0, failed=0, lastErr='';
  for(const item of q){
    item.secret = S.secret; item.emailNotifyTo = S.emailNotifyTo;
    try{
      const r=await fetch(S.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item)});
      if(!r.ok){ failed++; lastErr='HTTP '+r.status; throw new Error(lastErr); }
      sent++;
    }catch(e){
      S.queue.push(item); lastErr=String(e?.message||e||'send failed');
    }
  }
  saveLS();
  if(sent) showToast(`Synced ${sent} ✓`,'success');
  if(failed) showToast(`${failed} still queued (${lastErr})`,'info');
}
function clearQueue(){
  const n=S.queue.length;
  if(!n){ showToast('Queue already empty','info'); return; }
  if(!confirm(`Discard ${n} queued item(s)?`)) return;
  S.queue=[]; saveLS(); showToast('Queue cleared ✓','success');
}
