// PATCH: add Scripts screen (cues + A/B counters).
// Paste/replace into your existing consolidated assets/app.js, or drop-in if using the full patch.

// Extend S + saveLS if not already present
if (typeof S === 'undefined') window.S = {};
if (!('scriptStats' in S)) S.scriptStats = JSON.parse(localStorage.getItem('scriptStats') || '{}');
const _saveLS_prev = typeof saveLS === 'function' ? saveLS : ()=>{};
function saveLS(){
  if (typeof _saveLS_prev === 'function') _saveLS_prev();
  localStorage.setItem('scriptStats', JSON.stringify(S.scriptStats));
}

// Wire route
const _go_prev = typeof go === 'function' ? go : ()=>{};
window.go = function(tab){
  if (tab === 'scripts') return renderScripts();
  return _go_prev(tab);
};

async function renderScripts(){
  const data = await fetch('assets/scripts.json').then(r=>r.json());
  const seasons = Object.keys(data.seasons);
  const audiences = Object.keys(data.audience);
  const locales = Object.keys(data.localCues);

  el('#view').innerHTML = `
    <section class="card">
      <h2>Scripts</h2>
      <div class="row">
        <div><label>Season Cue</label><select id="sc_season">${seasons.map(s=>`<option>${s}</option>`).join('')}</select></div>
        <div><label>Audience Cue</label><select id="sc_aud">${audiences.map(s=>`<option>${s}</option>`).join('')}</select></div>
        <div><label>Local Cue</label><select id="sc_loc">${locales.map(s=>`<option>${s}</option>`).join('')}</select></div>
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
    </section>
  `;

  function updatePreview(){
    const s = el('#sc_season').value;
    const a = el('#sc_aud').value;
    const l = el('#sc_loc').value;
    el('#sc_preview').textContent = [data.seasons[s], data.audience[a], data.localCues[l]].filter(Boolean).join(' ');
  }
  ['sc_season','sc_aud','sc_loc'].forEach(id => el('#'+id).addEventListener('change', updatePreview));
  updatePreview();

  // Bind A/B buttons
  el('#view').querySelectorAll('button[data-k]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const k = btn.getAttribute('data-k');
      const v = btn.getAttribute('data-v');
      const key = `${k}__${v}`;
      S.scriptStats[key] = (S.scriptStats[key]||0) + 1;
      saveLS();
      renderScripts();
    });
  });
}
