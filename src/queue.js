import { Storage } from './storage.js';
import { toast } from './components/toast.js';

const KEY = 'outbox';

export const Queue = {
  all() { return Storage.get(KEY, []); },
  add(task) { const q = Storage.push(KEY, task); updatePill(); return q; },
  removeById(id) {
    const q = Queue.all().filter(x => x.id !== id);
    Storage.set(KEY, q); updatePill();
  },
  async flush(sender) {
    const q = Queue.all();
    if (!q.length) return 0;
    let sent = 0;
    setPill('sync');
    for (const item of q) {
      try {
        await sender(item);
        Queue.removeById(item.id);
        sent++;
      } catch (e) {
        console.warn('Queue flush failed for item', item, e);
      }
    }
    setPill(sent ? 'ok' : 'idle');
    if (sent) toast(`Synced ${sent} item(s)`);
    return sent;
  }
};

function setPill(mode) {
  const pill = document.getElementById('sync-pill');
  if (!pill) return;
  pill.className = 'pill ' + ({
    idle: 'pill-idle',
    sync: 'pill-sync',
    ok: 'pill-ok',
    err: 'pill-err'
  }[mode] || 'pill-idle');
  pill.textContent = mode === 'sync' ? 'Syncing…' : (mode === 'ok' ? 'Synced' : (mode === 'err' ? 'Error' : 'Idle'));
}
export function updatePill() {
  const has = Queue.all().length > 0;
  const pill = document.getElementById('sync-pill');
  if (pill) { pill.textContent = has ? 'Pending' : 'Idle'; pill.className = 'pill ' + (has ? 'pill-warn' : 'pill-idle'); }
}
