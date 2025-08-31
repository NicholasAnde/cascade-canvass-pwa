import { reverseLookup, logVisit } from './api.js';

export async function renderNextDoorTab({ mountEl, getRep }) {
  mountEl.innerHTML = `
    <section class="card col">
      <strong>Next Door</strong>
      <div class="row">
        <button class="btn" id="match">📍 Match Current Door</button>
      </div>

      <label>Address</label>
      <input class="input" id="addr" placeholder="123 Oak St, Vancouver, WA">

      <label>Outcome</label>
      <div class="row">
        <label><input type="radio" name="outc" value="Lead"> Lead</label>
        <label><input type="radio" name="outc" value="Left Literature" checked> Left Lit</label>
        <label><input type="radio" name="outc" value="Declined"> Declined</label>
      </div>

      <label class="row" style="gap:6px;align-items:center;">
        <input type="checkbox" id="mk"> <span>🏷 Add Marketing Tag</span>
      </label>

      <label>Notes</label>
      <textarea class="input" id="notes" placeholder="Short note (optional)"></textarea>

      <div class="row" style="justify-content:flex-end; gap:8px;">
        <button class="btn" id="save">Save</button>
      </div>
      <small class="muted">Saves to Visits; Map updates immediately.</small>
    </section>
  `;

  document.getElementById('match').addEventListener('click', () => {
    if (!navigator.geolocation) return window.toast('Location unsupported');
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      try {
        const res = await reverseLookup(lat, lon);
        if (res && res.ok) document.getElementById('addr').value = res.address;
      } catch {}
    });
  });

  document.getElementById('save').addEventListener('click', async () => {
    const address = val('addr');
    if (!address) return window.toast('Address required');

    const outcome = [...document.querySelectorAll('input[name="outc"]')]
      .find(r => r.checked)?.value || 'Left Literature';
    const marketing = document.getElementById('mk').checked;
    const notes = val('notes');

    let lat = '', lon = '';
    try {
      await new Promise(resolve => {
        if (!navigator.geolocation) return resolve();
        navigator.geolocation.getCurrentPosition(p => {
          lat = p.coords.latitude; lon = p.coords.longitude; resolve();
        }, () => resolve(), { maximumAge:15000, timeout:2000 });
      });
    } catch {}

    try {
      const payload = { rep:getRep(), outcome, address, notes, lat, lon, source:'pwa', marketing };
      const res = await logVisit(payload);
      window.toast(res?.ok ? 'Saved' : 'Queued');
      window.dispatchEvent(new CustomEvent('visit:logged', { detail:{ address, lat, lon, outcome } }));
      if (outcome === 'Lead') {
        localStorage.setItem('prefillAddress', address);
        location.hash = '#lead';
      } else {
        location.hash = '#map';
      }
    } catch {
      window.toast('Saved offline');
      location.hash = '#map';
    }
  });
}
function val(id){ return (document.getElementById(id).value || '').trim(); }
