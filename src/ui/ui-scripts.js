export function Scripts() {
  const el = document.createElement('div');
  el.className = 'panel';
  el.innerHTML = `
    <h2 style="margin:0 0 10px;">Door Script & Rebuttals</h2>
    <div id="scripts"></div>
  `;
  load();
  return el;

  async function load() {
    const res = await fetch('/src/data/scripts.json');
    const data = await res.json();
    const root = el.querySelector('#scripts');
    root.innerHTML = data.sections.map(sec => `
      <div class="card" style="margin:8px 0;">
        <h3>${sec.title}</h3>
        ${sec.lines.map(line => `<div style="padding:6px 0;"><strong>${line.speaker}:</strong> ${line.text}</div>`).join('')}
      </div>
    `).join('');
  }
}
