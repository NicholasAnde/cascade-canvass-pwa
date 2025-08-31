import { Storage, todayKey } from '../storage.js';

function statCounts(dateKey) {
  const knocks = Storage.get('doorKnocks', []);
  const leads = Storage.get('leads', []);
  const todayKnocks = knocks.filter(k => (k.dateKey || k.timestamp?.slice(0,10)) === dateKey);
  const todayLeads = leads.filter(l => (l.dateKey || l.timestamp?.slice(0,10)) === dateKey);
  const leftLit = todayKnocks.filter(k => k.outcome === 'left_lit').length;
  const declined = todayKnocks.filter(k => k.outcome === 'declined').length;
  const answered = todayKnocks.filter(k => k.outcome === 'answered').length;
  const leadCount = todayLeads.length;
  return { todayKnocks: todayKnocks.length, answered, leftLit, declined, leadCount };
}

export function Dashboard() {
  const el = document.createElement('div');
  el.className = 'grid';
  const dk = todayKey();
  const s = statCounts(dk);

  el.innerHTML = `
    <section class="grid cards">
      <div class="card"><h3>Doors (Today)</h3><div class="big">${s.todayKnocks}</div></div>
      <div class="card"><h3>Answered</h3><div class="big">${s.answered}</div></div>
      <div class="card"><h3>Left Lit</h3><div class="big">${s.leftLit}</div></div>
      <div class="card"><h3>Declined</h3><div class="big">${s.declined}</div></div>
      <div class="card"><h3>Leads (Today)</h3><div class="big">${s.leadCount}</div></div>
    </section>

    <section class="panel">
      <div class="row">
        <a href="#/nextdoor" class="btn primary">🚪 Next Door</a>
        <a href="#/lead" class="btn">📝 New Lead</a>
        <a href="#/map" class="btn">🗺️ Map</a>
        <a href="#/queue" class="btn">📡 Sync Queue</a>
        <a href="#/scripts" class="btn">📜 Scripts</a>
        <a href="#/settings" class="btn">⚙️ Settings</a>
      </div>
    </section>

    <section class="panel">
      <h3 style="margin:0 0 8px;color:var(--muted)">Recent Activity</h3>
      <div id="activity"></div>
    </section>
  `;

  const activity = el.querySelector('#activity');
  const knocks = Storage.get('doorKnocks', []).slice(-10).reverse();
  if (!knocks.length) {
    activity.innerHTML = '<div class="muted">No recent knocks</div>';
  } else {
    activity.innerHTML = `
      <table class="table">
        <thead><tr><th>Time</th><th>Outcome</th><th>Address</th></tr></thead>
        <tbody>
        ${knocks.map(k => `
          <tr>
            <td>${new Date(k.timestamp).toLocaleTimeString()}</td>
            <td>${k.outcome}</td>
            <td>${k.address || ''}</td>
          </tr>
        `).join('')}
        </tbody>
      </table>
    `;
  }

  return el;
}
