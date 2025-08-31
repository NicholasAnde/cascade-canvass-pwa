import { Queue } from '../queue.js';

export function QueueView() {
  const el = document.createElement('div');
  el.className = 'panel';
  el.innerHTML = `
    <h2 style="margin:0 0 10px;">Sync Queue</h2>
    <div class="row"><button id="flush" class="btn primary">Sync Now</button></div>
    <div id="list" style="margin-top:8px;"></div>
  `;
  const list = el.querySelector('#list');
  render();

  el.querySelector('#flush').addEventListener('click', async () => {
    const ev = new CustomEvent('queue:flush');
    window.dispatchEvent(ev); // app.js listens via setInterval/ononline
    setTimeout(render, 500);
  });

  function render() {
    const q = Queue.all();
    if (!q.length) { list.innerHTML = '<div class="muted">No pending items</div>'; return; }
    list.innerHTML = `
      <table class="table">
        <thead><tr><th>Type</th><th>ID</th></tr></thead>
        <tbody>
          ${q.map(i => `<tr><td>${i.type}</td><td style="font-family:monospace">${i.id}</td></tr>`).join('')}
        </tbody>
      </table>
    `;
  }
  return el;
}
