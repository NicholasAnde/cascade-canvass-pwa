export const Storage = {
  get(key, fallback=null) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch(e) { console.error('Storage.get', e); return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch(e) { console.error('Storage.set', e); }
  },
  push(key, item) {
    const arr = Storage.get(key, []); arr.push(item); Storage.set(key, arr); return arr;
  }
};

export function todayKey(date = new Date()) {
  return date.toISOString().slice(0,10);
}
