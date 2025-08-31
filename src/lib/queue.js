/* v4.9 queue (offline outbox + progressive background sync) */
import { put, all, clear } from './db.js';

const OUTBOX = 'outbox';

export async function enqueue(payload) {
  await put(OUTBOX, { ...payload, ts: Date.now(), status: 'queued' });
}

export async function flush(sendFn) {
  const items = await all(OUTBOX);
  let ok = 0;
  for (const it of items) {
    try {
      await sendFn(it);
      ok++;
    } catch (e) {
      // leave in outbox
    }
  }
  if (ok === items.length) await clear(OUTBOX);
  return ok;
}

export function setupAutoFlush(sendFn) {
  const tryFlush = () => flush(sendFn);
  window.addEventListener('online', tryFlush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && navigator.onLine) tryFlush(); });
}
