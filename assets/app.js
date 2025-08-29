// Patch: Lead Tracker delete (local only). Safe to drop-in on top of current build.
(function(){
  function ensure(){ if(!window.S){ window.S={leadsLog:[]}; } }
  function saveLS(){ try{ localStorage.setItem('leadsLog', JSON.stringify(S.leadsLog||[])); }catch(_){ } }
  function showToast(m,t){ const r=document.querySelector('#toast-root'); if(!r)return; const d=document.createElement('div'); d.className=`toast ${t||'success'}`; d.innerHTML=`<div>${m}</div><button class="close" aria-label="Close">×</button>`; r.appendChild(d); const c=()=>{d.style.animation='toast-out .16s ease forwards'; setTimeout(()=>d.remove(),160)}; d.querySelector('.close').onclick=c; setTimeout(c,2400); }

  // Replace renderTracker with read + delete capability
  window.renderTracker = function(){
    ensure();
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

      // Bind deletes (local only)
      el('#lt_list').querySelectorAll('button[data-del]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const idx = parseInt(btn.getAttribute('data-del'),10);
          if (isNaN(idx)) return;
          const lead = (S.leadsLog||[])[idx];
          const name = lead?.name || '';
          if (!confirm(`Delete lead${name? ' "'+name+'"' : ''}?`)) return;
          // Remove by index in the filtered view: find same object in S.leadsLog
          const originalIndex = (S.leadsLog||[]).indexOf(lead);
          if (originalIndex >= 0) {
            S.leadsLog.splice(originalIndex,1);
            saveLS();
            showToast('Lead deleted (local) ✓','success');
            renderList();
          }
        });
      });
    };

    el('#lt_filter').addEventListener('change', renderList);
    renderList();
  };
})();