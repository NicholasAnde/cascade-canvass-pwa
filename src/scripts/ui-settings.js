import { diagnostics, setSettingsURL, getSettingsURL } from './api.js';

export async function renderSettingsTab({ mountEl, getRep }){
  const diag = await safeDiag();
  mountEl.innerHTML = `<section class="card col">
    <strong>Settings & Diagnostics</strong>
    <label>Rep Name</label>
    <input class="input" id="rep" value="${getRep()}">
    <label>Apps Script Endpoint</label>
    <input class="input" id="url" value="${getSettingsURL()}">
    <div class="card col">
      <strong>Diagnostics</strong>
      <div>Build Version: v1.0.1</div>
      <div>Service Worker: ${navigator.serviceWorker?.controller?'Controlled':'Not active'}</div>
      <div>Endpoint Reachable: ${diag.ok? 'Yes':'No'}</div>
      <div>Server Time (UTC): ${diag.timeUTC||'—'}</div>
    </div>
    <div class="row" style="justify-content:flex-end">
      <button class="btn" id="save">Save</button>
    </div>
  </section>`;

  document.getElementById('save').addEventListener('click', ()=>{
    localStorage.setItem('repName', document.getElementById('rep').value.trim() || 'Rep');
    setSettingsURL(document.getElementById('url').value.trim());
    window.toast('Saved');
  });
}
async function safeDiag(){ try{ return await diagnostics(); }catch{ return { ok:false }; } }
