import { Storage, todayKey } from '../storage.js';
import { reverseGeocode } from '../api.js';
import { toast } from '../components/toast.js';
import { Queue } from '../queue.js';

export function NextDoor() {
  const el = document.createElement('div');
  el.className = 'grid';
  el.innerHTML = `
    <section class="panel">
      <h2 style="margin:0 0 10px;">Next Door</h2>
      <div class="field">
        <label>Address</label>
        <input id="addr" class="input" placeholder="Auto-filled from GPS"/>
      </div>
      <div class="row">
        <button id="btnLocate" class="btn">📍 Update Address</button>
        <button data-outcome="answered" class="btn good">✅ Answered</button>
        <button data-outcome="left_lit" class="btn warn">🟨 Left Lit</button>
        <button data-outcome="declined" class="btn danger">⛔ Declined</button>
        <a href="#/lead" class="btn">📝 Lead</a>
      </div>
    </section>
  `;

  const addr = el.querySelector('#addr');
  const locateBtn = el.querySelector('#btnLocate');
  locateBtn.addEventListener('click', async () => {
    try {
      const { coords } = await getPos();
      const text = await reverseGeocode(coords.latitude, coords.longitude).catch(() => '');
      addr.value = text || `Lat ${coords.latitude.toFixed(5)}, Lng ${coords.longitude.toFixed(5)}`;
      addr.dataset.lat = String(coords.latitude);
      addr.dataset.lng = String(coords.longitude);
      toast('Location updated');
    } catch(e) {
      toast('Unable to get location'); console.warn(e);
    }
  });

  el.querySelectorAll('button[data-outcome]').forEach(btn => {
    btn.addEventListener('click', () => saveOutcome(btn.getAttribute('data-outcome')));
  });

  async function saveOutcome(outcome) {
    const now = new Date();
    const record = {
      id: crypto.randomUUID(),
      timestamp: now.toISOString(),
      dateKey: todayKey(now),
      outcome,
      address: addr.value || '',
      lat: addr.dataset.lat ? parseFloat(addr.dataset.lat) : null,
      lng: addr.dataset.lng ? parseFloat(addr.dataset.lng) : null
    };
    const arr = Storage.get('doorKnocks', []); arr.push(record); Storage.set('doorKnocks', arr);
    // queue to sync
    Queue.add({ id: record.id, type: 'door_knock', payload: record });
    toast('Saved');
  }

  // auto locate once
  setTimeout(() => locateBtn.click(), 300);

  return el;
}

function getPos() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
  });
}
