import { getSettings, setSettings, loadRemoteSettings } from '../api.js';
import { toast } from '../components/toast.js';

export function Settings() {
  const el = document.createElement('div');
  el.className = 'panel';
  const s = getSettings();
  el.innerHTML = `
    <h2 style="margin:0 0 10px;">Settings</h2>
    <form id="form">
      <div class="field"><label>Remote Settings URL</label><input name="remoteSettingsUrl" class="input" value="${s.remoteSettingsUrl || ''}"></div>
      <div class="field"><label>POST Endpoint (Apps Script)</label><input name="postUrl" class="input" value="${s.postUrl || ''}" placeholder="https://script.google.com/.../exec"></div>
      <div class="field"><label>GET Recent Endpoint (Apps Script)</label><input name="getRecentUrl" class="input" value="${s.getRecentUrl || ''}"></div>
      <div class="field"><label>Recent Days</label><input name="recentDays" class="input" value="${s.recentDays || 90}" type="number" min="1" max="365"></div>
      <div class="row">
        <button class="btn primary" type="submit">Save</button>
        <button class="btn" type="button" id="btnPull">Pull Remote</button>
      </div>
    </form>
  `;

  el.querySelector('#form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSettings({
      remoteSettingsUrl: fd.get('remoteSettingsUrl')?.toString() || '',
      postUrl: fd.get('postUrl')?.toString() || '',
      getRecentUrl: fd.get('getRecentUrl')?.toString() || '',
      recentDays: parseInt(fd.get('recentDays')?.toString() || '90', 10)
    });
    toast('Settings saved');
  });

  el.querySelector('#btnPull').addEventListener('click', async () => {
    try { await loadRemoteSettings(); toast('Remote settings applied'); }
    catch(e) { toast('Failed to pull remote'); }
  });

  return el;
}
