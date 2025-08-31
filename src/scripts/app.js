import { renderMapTab } from './ui-map.js';
import { renderLeadTab } from './ui-lead.js';
import { renderPulseTab } from './ui-pulse.js';
import { renderSettingsTab } from './ui-settings.js';
import { renderScriptsTab } from './ui-scripts.js';
import { drainQueue } from './queue.js';

function getRep(){ return localStorage.getItem('repName') || 'Rep'; }

async function route(){
  const hash = (location.hash || '#map').toLowerCase();
  const view = document.getElementById('view');
  if (hash === '#lead') return renderLeadTab({ mountEl:view, getRep });
  if (hash === '#pulse') return renderPulseTab({ mountEl:view, getRep });
  if (hash === '#settings') return renderSettingsTab({ mountEl:view, getRep });
  if (hash === '#scripts') return renderScriptsTab({ mountEl:view, repName:getRep() });
  return renderMapTab({ mountEl:view, getRep });
}

function toast(msg){
  const t = document.createElement('div');
  t.className='toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=> t.remove(), 2400);
}
window.toast = toast;

window.addEventListener('hashchange', route);
window.addEventListener('load', async () => {
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('/src/sw.js'); } catch(e){}
  }
  try{ await drainQueue(()=>Promise.resolve()); }catch{}
  route();
});
