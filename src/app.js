import { startRouter } from './router.js';
import { initDrawer } from './components/drawer.js';
import { Queue, updatePill } from './queue.js';
import { postKnock, postLead, loadRemoteSettings } from './api.js';

window.App = {
  async init() {
    initDrawer();
    startRouter();
    updatePill();
    try { await loadRemoteSettings(); } catch {}
    // Attempt to flush queue when online
    async function sender(item) {
      if (item.type === 'door_knock') return postKnock(item.payload);
      if (item.type === 'lead') return postLead(item.payload);
      throw new Error('Unknown queue item type');
    }
    const doFlush = () => Queue.flush(sender).catch(() => {});
    window.addEventListener('online', doFlush);
    setInterval(doFlush, 20_000);
  }
};

window.addEventListener('DOMContentLoaded', () => App.init());
