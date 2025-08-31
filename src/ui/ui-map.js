import { Storage } from '../storage.js';
import { fetchRecentDoors } from '../api.js';
import { toast } from '../components/toast.js';

export function MapView() {
  const el = document.createElement('div');
  el.className = 'grid';
  el.innerHTML = `
    <section class="panel">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <h2 style="margin:0;">Map</h2>
        <div class="row">
          <button id="btnMe" class="btn">📍 Me</button>
          <button id="btnRecent" class="btn">↻ Load Last 90 Days</button>
        </div>
      </div>
      <div id="map" style="margin-top:8px;" class="leaflet-container"></div>
    </section>
  `;

  setTimeout(initMap, 50);
  return el;

  async function initMap() {
    const map = L.map('map');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    // Start view
    map.setView([45.63, -122.67], 12); // Vancouver, WA area default

    // My position
    document.getElementById('btnMe').addEventListener('click', () => {
      if (!navigator.geolocation) return toast('Geolocation unavailable');
      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        map.setView([latitude, longitude], 16);
        L.marker([latitude, longitude], { title: 'You' }).addTo(map);
      }, () => toast('Unable to fetch location'), { enableHighAccuracy: true });
    });

    // Local knocks (device)
    const local = Storage.get('doorKnocks', []);
    for (const k of local) {
      if (k.lat && k.lng) L.circleMarker([k.lat, k.lng], { radius: 6 }).addTo(map).bindPopup(`${k.outcome} — ${k.address || ''}`);
    }

    // Remote recent
    document.getElementById('btnRecent').addEventListener('click', async () => {
      try {
        const recents = await fetchRecentDoors();
        let plotted = 0;
        for (const r of recents) {
          if (r.lat && r.lng) {
            L.circleMarker([r.lat, r.lng], { radius: 5 }).addTo(map).bindPopup(`${r.outcome || 'knock'} — ${r.address || ''}`);
            plotted++;
          }
        }
        toast(`Loaded ${plotted} recent knocks`);
      } catch(e) {
        console.warn(e); toast('Failed to load recent');
      }
    });
  }
}
