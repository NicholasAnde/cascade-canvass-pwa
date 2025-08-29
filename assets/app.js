// Fix Patch: Scripts view + Lead Tracker delete (local-only)
(function(){
  // --- Scripts view (full) ---
  window.renderScripts = async function(){
    const el = s => document.querySelector(s);
    const data = await fetch('assets/scripts.json').then(r=>r.json()).catch(()=>null);
    const safe = data || {seasons:{}, audience:{}, localCues:{}, core:{opener:'',ask:'',close:''}, rebuttals:{}};

    const seasons = Object.keys(safe.seasons||{});
    const audiences = Object.keys(safe.audience||{});
    const locales = Object.keys(safe.localCues||{});

    el('#view').innerHTML = `
      <section class="card">
        <h2>Scripts</h2>
        <div class="row">
          <div class="field"><label>Season Cue</label><select id="sc_season">${seasons.map(s=>`<option>${s}</option>`).join('')}</select></div>
          <div class="field"><label>Audience Cue</label><select id="sc_aud">${audiences.map(s=>`<option>${s}</option>`).join('')}</select></div>
          <div class="field"><label>Local Cue</label><select id="sc_loc">${locales.map(s=>`<option>${s}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Opener</label><input id="sc_open" value="${(safe.core?.opener||'').replace(/"/g,'&quot;')}" readonly/></div>
        <div class="field"><label>Ask</label><input id="sc_ask" value="${(safe.core?.ask||'').replace(/"/g,'&quot;')}" readonly/></div>
        <div class="field"><label>Close</label><input id="sc_close" value="${(safe.core?.close||'').replace(/"/g,'&quot;')}" readonly/></div>
        <div class="field"><label>Notes</label><textarea id="sc_preview" rows="3" readonly></textarea></div>
        <div id="rbx"></div>
      </section>`;

    function updatePreview(){
      const s = el('#sc_season')?.value || '';
      const a = el('#sc_aud')?.value || '';
      const l = el('#sc_loc')?.value || '';
      const hook = safe.seasons?.[s] || '';
      const tilt = safe.audience?.[a] || '';
      const local = safe.localCues?.[l] || '';
      el('#sc_preview').value = [hook, tilt, local].filter(Boolean).join(' • ');
    }
    ['sc_season','sc_aud','sc_loc'].forEach(id=> el('#'+id)?.addEventListener('change', updatePreview));
    updatePreview();

    // Rebuttals (read-only counts if S.scriptStats exists; no A/B increment unless you want it)
    const stats = (window.S && window.S.scriptStats) || {};
    const rebuttals = safe.rebuttals || {};
    const card = Object.keys(rebuttals).map(k=>{
      const A = stats[`${k}__A`]||0, B = stats[`${k}__B`]||0;
      return `<div class="field">
        <label>${k}</label>
        <div><small>A) ${rebuttals[k].A}</small></div>
        <div><small>B) ${rebuttals[k].B}</small></div>
        <div class="btn-row" style="margin-top:.35rem">
          <span class="badge">A ${A}</span>
          <span class="badge">B ${B}</span>
        </div>
      </div>`;
    }).join('');
    el('#rbx').innerHTML = card || '<div class="field"><label>No rebuttals</label></div>';
  };

  // --- Lead Tracker with delete (local-only) ---
  window.renderTracker = function(){
    const S = window.S || { leadsLog: [] };
    const el = s => document.querySelector(s);
    const esc = s => String(s||"").replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

    const filters = ['All','New','Contacted','Scheduled','Closed Won','Closed Lost'];
    el('#view').innerHTML = `
      <section class="card">
        <h2>Lead Tracker</h2>
        <div class="field"><label>Filter</label>
          <select id="lt_filter">${filters.map(f=>`<option value="${f}">${f}</option>`).join('')}</select>
        </div>
        <div id="lt_list"></div>
      </section>`;

    const renderList = ()=>{
      const f = el('#lt_filter').value || 'All';
      const list = (S.leadsLog||[]).filter(l => f==='All' || (l.status||'New')===f);
      el('#lt_list').innerHTML = list.map((l,i)=>`
        <div class="field">
          <label>${esc(l.date||'')} — ${esc(l.name||'')} <span style="color:var(--muted)">(${esc(l.status||'New')})</span></label>
          <div class="row">
            <div><small>${esc(l.address||'')}</small></div>
            <div><small>${esc(l.phone||'')}</small></div>
          </div>
          ${l.notes? `<div style="margin-top:.3rem"><small>${esc(l.notes)}</small></div>`:''}
          <div class="btn-row" style="margin-top:.4rem">
            <button class="ghost" data-del="${i}">❌ Delete</button>
          </div>
        </div>`).join('') || '<div class="field"><label>No leads yet</label></div>';

      el('#lt_list').querySelectorAll('button[data-del]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const idx = parseInt(btn.getAttribute('data-del'),10);
          const lead = (S.leadsLog||[])[idx];
          if (!lead) return;
          const name = lead?.name || '';
          if (!confirm(`Delete lead${name? ' "'+name+'"' : ''}?`)) return;
          const originalIndex = (S.leadsLog||[]).indexOf(lead);
          if (originalIndex >= 0) {
            S.leadsLog.splice(originalIndex,1);
            try{ localStorage.setItem('leadsLog', JSON.stringify(S.leadsLog)); }catch(_){}
            const r=document.querySelector('#toast-root'); if(r){ const d=document.createElement('div'); d.className='toast success'; d.innerHTML='<div>Lead deleted (local) ✓</div>'; r.appendChild(d); setTimeout(()=>d.remove(),1800); }
            renderList();
          }
        });
      });
    };
    el('#lt_filter').addEventListener('change', renderList);
    renderList();
  };
})();