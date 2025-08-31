export async function renderScriptsTab({ mountEl, repName }){
  const res = await fetch('/src/scripts/scripts.json', { cache:'no-store' });
  const cfg = await res.json();
  const v = { ...(cfg.variables||{}), repName, dayPeriod: dayPeriod() };
  function sub(s){ return String(s).replace(/\{\{(\w+)\}\}/g, (_,k)=> v[k] ?? ''); }
  function sectionHtml(s){
    if (s.rebuttals){
      return `<section class="card"><h3 class="collapsible">${s.icon||''} ${s.title}</h3><div class="content">${
        s.rebuttals.map(r=>`<div class="rebuttal"><div class="obj">• ${r.objection}</div><div class="resp">→ ${r.response}</div></div>`).join('')
      }</div></section>`;
    }
    return `<section class="card"><h3 class="collapsible">${s.icon||''} ${s.title}</h3><div class="content">${
      (s.lines||[]).map(l=>`<div class="line">• ${sub(l)}</div>`).join('')
    }${s.notes?`<div class="notes">${s.notes}</div>`:''}</div></section>`;
  }
  mountEl.innerHTML = cfg.sections.map(sectionHtml).join('') + `<div class="footnote">Reference only • Cached offline</div>`;
  mountEl.querySelectorAll('.collapsible').forEach(h=> h.addEventListener('click', ()=> h.nextElementSibling.classList.toggle('open')));
}
function dayPeriod(){ const h=new Date().getHours(); if(h<12)return 'morning'; if(h<18)return 'afternoon'; return 'evening'; }
