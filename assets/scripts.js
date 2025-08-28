let CFG = { endpoint:null, cooldownDays:90 };
let STATE = {
  rep: localStorage.getItem('rep') || '',
  stats: JSON.parse(localStorage.getItem('scriptStats')||'{}') // {rebuttalKey:{used:0,won:0}}
};

function saveStats(){ localStorage.setItem('scriptStats', JSON.stringify(STATE.stats)); }

async function loadCfg(){
  const j = await fetch('./app.settings.json').then(r=>r.json());
  CFG = { endpoint:j.sheetsEndpoint, cooldownDays:j.cooldownDays||90 };
  document.getElementById('ep').textContent = CFG.endpoint;
}

async function tab(t){
  if(t==='dashboard') return renderDashboard();
  if(t==='knock') return renderKnock();
  if(t==='lead') return renderLead();
  if(t==='settings') return renderSettings();
  if(t==='scripts') return renderScripts();
}

// -------- Dashboard (shortcut) --------
function renderDashboard(){
  document.getElementById('view').innerHTML = `
  <h2>Dashboard</h2>
  <p class="muted">Use tabs above. Scripts now included with seasonal + audience tilt and rebuttal A/B tracking.</p>
  <div class="card">
    <button class="primary" onclick="tab('scripts')">Open Scripts</button>
    <button onclick="tab('knock')">Next Door</button>
    <button onclick="tab('lead')">New Lead</button>
    <button onclick="tab('settings')">Settings</button>
  </div>`;
}

// -------- Scripts UI --------
async function renderScripts(){
  const lib = await fetch('./assets/scripts.json').then(r=>r.json());
  const seasonOptions = Object.keys(lib.seasons).map(s=>`<option>${s}</option>`).join('');
  const audienceOptions = Object.keys(lib.audience).map(s=>`<option>${s}</option>`).join('');
  const localOptions = Object.keys(lib.localCues).map(s=>`<option>${s}</option>`).join('');
  const html = `
  <h2>Scripts & Rebuttals</h2>
  <div class="card">
    <div class="row">
      <div><label>Season</label><select id="s_season">${seasonOptions}</select></div>
      <div><label>Audience</label><select id="s_aud">${audienceOptions}</select></div>
      <div><label>Local Cue</label><select id="s_local">${localOptions}</select></div>
    </div>
    <div id="scriptBox" class="card"></div>
    <div class="card">
      <h3>Top Objections</h3>
      ${Object.keys(lib.rebuttals).map(k=>`
        <div class="card">
          <b>${k}</b><br/>
          A) ${lib.rebuttals[k].A}<br/>
          B) ${lib.rebuttals[k].B}<br/>
          <div style="margin-top:.5rem;display:flex;gap:.5rem;">
            <button onclick="markUsed('${k}','A')">Used A</button>
            <button onclick="markWon('${k}','A')">Won A</button>
            <button onclick="markUsed('${k}','B')">Used B</button>
            <button onclick="markWon('${k}','B')">Won B</button>
          </div>
          <small class="muted" id="stat_${k.replace(/\W+/g,'_')}"></small>
        </div>
      `).join('')}
    </div>
  </div>`;
  const v = document.getElementById('view'); v.innerHTML = html;

  // Set defaults to current season
  const month = new Date().getMonth()+1;
  let season = (month>=3 && month<=5)?'Spring':(month>=6 && month<=8)?'Summer':(month>=9 && month<=11)?'Fall':'Winter';
  document.getElementById('s_season').value = season;
  document.getElementById('s_aud').value = 'General';
  document.getElementById('s_local').value = 'Felida';

  const update = ()=>{
    const s = document.getElementById('s_season').value;
    const a = document.getElementById('s_aud').value;
    const l = document.getElementById('s_local').value;
    const hook = lib.seasons[s];
    const tilt = lib.audience[a] ? (' ' + lib.audience[a]) : '';
    const localCue = lib.localCues[l] ? (' ' + lib.localCues[l]) : '';
    const body = `
      <p><b>Hook:</b> ${hook}</p>
      <p><b>Opener:</b> ${lib.core.opener}</p>
      <p><b>Ask:</b> ${lib.core.ask}</p>
      <p><b>Close:</b> ${lib.core.close}</p>
      <p class="muted"><i>${tilt.trim()}${tilt && localCue ? ' • ' : ''}${localCue.trim()}</i></p>`;
    document.getElementById('scriptBox').innerHTML = body;
  };
  ['s_season','s_aud','s_local'].forEach(id=> document.getElementById(id).addEventListener('change', update));
  update();

  // Render live stats
  Object.keys(lib.rebuttals).forEach(k=>{
    const keyA = `${k}__A`, keyB = `${k}__B`;
    const A = STATE.stats[keyA]||{used:0,won:0}, B = STATE.stats[keyB]||{used:0,won:0};
    const rate = (o)=> o.used? Math.round((o.won/o.used)*100)+'%':'—';
    document.getElementById(`stat_${k.replace(/\W+/g,'_')}`).textContent =
      `A: ${A.won}/${A.used} (${rate(A)}) • B: ${B.won}/${B.used} (${rate(B)})`;
  });
}

function markUsed(k, variant){
  const key = `${k}__${variant}`;
  STATE.stats[key] = STATE.stats[key] || {used:0,won:0};
  STATE.stats[key].used++;
  saveStats(); renderScripts();
}
function markWon(k, variant){
  const key = `${k}__${variant}`;
  STATE.stats[key] = STATE.stats[key] || {used:0,won:0};
  STATE.stats[key].used++; STATE.stats[key].won++;
  saveStats(); renderScripts();
}

// -------- Minimal stubs for other tabs so the page renders --------
function renderKnock(){ document.getElementById('view').innerHTML = '<h2>Next Door</h2><p>Use your full PWA build for logging.</p>'; }
function renderLead(){ document.getElementById('view').innerHTML = '<h2>New Lead</h2><p>Use your full PWA build for capture.</p>'; }
function renderSettings(){
  document.getElementById('view').innerHTML = `
  <h2>Settings</h2>
  <label>Rep Name</label>
  <input id="rep" value="${STATE.rep||''}" placeholder="Your name">
  <div style="margin-top:.75rem"><button class="primary" onclick="saveRep()">Save</button></div>`;
}
function saveRep(){ const v=document.getElementById('rep').value.trim(); if(!v){alert('Enter name');return;} localStorage.setItem('rep',v); STATE.rep=v; alert('Saved'); }

// Boot
loadCfg().then(()=> tab('dashboard'));
