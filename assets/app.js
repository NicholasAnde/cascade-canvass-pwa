// Stripless + Read‑only Tracker Patch
// This file overrides two functions in the consolidated app:
// 1) stripGeoHTML() → returns empty (removes sticky current-door header & progress)
// 2) renderTracker() → read-only view (no status editing / copy)

(function(){
  // 1) Remove sticky strip/progress everywhere
  window.stripGeoHTML = function(){ return ""; };
  // Also neutralize progress click binding if present
  window.bindProgressClicks = function(){ /* no-op */ };

  // 2) Read-only Lead Tracker
  window.renderTracker = function(){
    const S = window.S || { leadsLog: [] };
    const el = s => document.querySelector(s);
    const htmlEsc = s => String(s||"").replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    const list = Array.isArray(S.leadsLog) ? S.leadsLog : [];
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
      const rows = list.filter(l => f==='All' || (l.status||'New')===f);
      const body = rows.map(l=>`
        <div class="field" style="cursor:default">
          <label>${htmlEsc(l.date||'')} — ${htmlEsc(l.name||'')} <span style="color:var(--muted)">(${htmlEsc(l.status||'New')})</span></label>
          <div class="row">
            <div><small>${htmlEsc(l.address||'')}</small></div>
            <div><small>${htmlEsc(l.phone||'')}</small></div>
          </div>
          ${l.notes? `<div style="margin-top:.3rem"><small>${htmlEsc(l.notes)}</small></div>`:''}
        </div>`).join('') || '<div class="field"><label>No leads yet</label></div>';
      el('#lt_list').innerHTML = body;
    };

    el('#lt_filter').addEventListener('change', renderList);
    renderList();
  };
})();
