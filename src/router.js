import { Dashboard } from './ui/ui-dashboard.js';
import { NextDoor } from './ui/ui-nextdoor.js';
import { Lead } from './ui/ui-lead.js';
import { MapView } from './ui/ui-map.js';
import { Scripts } from './ui/ui-scripts.js';
import { Settings } from './ui/ui-settings.js';
import { QueueView } from './ui/ui-queue.js';

const routes = {
  '/dashboard': Dashboard,
  '/nextdoor': NextDoor,
  '/map': MapView,
  '/lead': Lead,
  '/scripts': Scripts,
  '/settings': Settings,
  '/queue': QueueView
};

export function startRouter() {
  function render() {
    const prev = document.querySelectorAll('.nav-item.active'); prev.forEach(n=>n.classList.remove('active'));
    const hash = location.hash || '#/dashboard';
    const path = hash.replace(/^#/, '');
    const View = routes[path] || Dashboard;
    const active = document.querySelector(`a.nav-item[href='#${path}']`);
    if (active) active.classList.add('active');
    const root = document.getElementById('app');
    root.innerHTML = '';
    const node = View();
    root.appendChild(node);
  }
  window.addEventListener('hashchange', render);
  render();
}
