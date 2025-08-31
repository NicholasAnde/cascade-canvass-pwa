import { Storage } from './storage.js';

const DEFAULT_REMOTE_SETTINGS_URL = "https://script.google.com/macros/s/AKfycbwPEUITyVd3jaSywdjO1dKiBt3M5Mn_yRt4g9UaR3be1_1HAUN0aHicGTLH12XULnANoQ/exec";

export function getSettings() {
  return Object.assign({
    remoteSettingsUrl: DEFAULT_REMOTE_SETTINGS_URL,
    postUrl: "",          // Your Apps Script endpoint for POSTs
    getRecentUrl: "",     // Your Apps Script endpoint for GET recent doors
    recentDays: 90
  }, Storage.get('settings', {}));
}
export function setSettings(patch) {
  const next = Object.assign(getSettings(), patch);
  Storage.set('settings', next);
  return next;
}

export async function loadRemoteSettings() {
  const url = getSettings().remoteSettingsUrl;
  if (!url) return {};
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error('Remote settings fetch failed');
  const json = await res.json();
  // Optionally merge keys if present
  const allowed = ['postUrl','getRecentUrl','recentDays'];
  const patch = {};
  for (const k of allowed) if (json[k]) patch[k] = json[k];
  if (Object.keys(patch).length) setSettings(patch);
  return patch;
}

export async function postKnock(data) {
  const s = getSettings();
  if (!s.postUrl) throw new Error('postUrl not set in settings');
  const res = await fetch(s.postUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'door_knock', payload: data })
  });
  if (!res.ok) throw new Error('postKnock failed');
  return res.json().catch(() => ({}));
}

export async function postLead(data) {
  const s = getSettings();
  if (!s.postUrl) throw new Error('postUrl not set in settings');
  const res = await fetch(s.postUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'lead', payload: data })
  });
  if (!res.ok) throw new Error('postLead failed');
  return res.json().catch(() => ({}));
}

export async function fetchRecentDoors(days = null) {
  const s = getSettings();
  const d = days ?? s.recentDays;
  if (!s.getRecentUrl) throw new Error('getRecentUrl not set in settings');
  const url = new URL(s.getRecentUrl);
  url.searchParams.set('days', String(d));
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error('fetchRecentDoors failed');
  return res.json();
}

export async function reverseGeocode(lat, lng) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('zoom', '18');
  url.searchParams.set('addressdetails', '1');
  const res = await fetch(url.toString(), { headers: { 'Accept': 'application/json' }});
  if (!res.ok) throw new Error('reverseGeocode failed');
  const json = await res.json();
  return json.display_name || '';
}
