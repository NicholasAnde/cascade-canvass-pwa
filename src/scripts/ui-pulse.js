import { listLeadsToday, weeklyLeadCount, voidLead, restoreLead } from './api.js';

export async function renderPulseTab({ mountEl, getRep }){
  const { startISO, endISO, label } = weekWindowPT();
  const [week, today] = await Promise.all([ weeklyLeadCount(startISO, endISO), listLeadsToday() ]);

  mountEl.innerHTML = `<section class="pulse-head">
      <div class="goal-row">
        <div class="goal-label">Goal: 15 / week</div>
        <div class="goal-bar"><div class="goal-fill" style="width:${pct(week.count, week.goal)}%"></div></div>
        <div class="goal-meta">${week.count}/${week.goal} (${Math.round(pct(week.count, week.goal))}%)</div>
      </div>
      <div class="goal-range">${label}</div>
    </section>
    <section class="pulse-list">
      <div class="list-head">Today (${today.rows.length})</div>
      <ul class="lead-list">
        ${today.rows.map(rowHtml).join('') || '<li class="empty">No leads yet today.</li>'}
      </ul>
    </section>
    <div class="footnote">Deletions are undoable for 10 minutes.</div>`;

  mountEl.querySelectorAll('.lead-del').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id;
      await voidLead(id, getRep(), 'Accidental');
      toastUndo('Lead removed • Undo?', 600000, async ()=>{
        await restoreLead(id, getRep());
        renderPulseTab({ mountEl, getRep });
      });
      renderPulseTab({ mountEl, getRep });
    });
  });
}

function rowHtml(r){
  const photos = r.photos ? ` (📷${r.photos})` : '';
  return `<li class="lead-row">
    <div class="lead-main">
      <div class="lead-name">${esc(r.name)}</div>
      <div class="lead-sub">${esc(cityFrom(r.address))} • ${esc(r.leadTimePT)}${photos} • Rep: ${esc(r.rep||'')}</div>
    </div>
    <button class="lead-del" data-id="${esc(r.leadId)}" title="Delete">🗑</button>
  </li>`;
}
function pct(n,d){ return Math.min(100, (d ? (n/d*100) : 0)); }
function esc(s){ return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
function cityFrom(addr){ return (addr||'').split(',')[1]?.trim() || ''; }
function weekWindowPT(){
  const now = new Date(); const day = now.getDay();
  const monday = new Date(now); monday.setDate(now.getDate() - ((day+6)%7));
  const sunday = new Date(monday); sunday.setDate(monday.getDate()+6);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const lbl = d => `${d.toLocaleString('en-US',{month:'short'})} ${d.getDate()}`;
  return { startISO: iso(monday), endISO: iso(sunday), label: `${lbl(monday)}–${lbl(sunday)}` };
}
function toastUndo(msg, ms, onUndo){
  const el = document.createElement('div'); el.className='toast';
  el.innerHTML = `${esc(msg)} <button class="undo">Undo</button>`;
  document.body.appendChild(el);
  const timer = setTimeout(()=> el.remove(), ms);
  el.querySelector('.undo').addEventListener('click', ()=>{
    clearTimeout(timer); el.remove(); onUndo && onUndo();
  });
  return el;
}
