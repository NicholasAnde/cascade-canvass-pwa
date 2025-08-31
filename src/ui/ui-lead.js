import { Storage, todayKey } from '../storage.js';
import { Queue } from '../queue.js';
import { toast } from '../components/toast.js';

export function Lead() {
  const el = document.createElement('div');
  el.className = 'panel';
  el.innerHTML = `
    <h2 style="margin:0 0 10px;">New Lead</h2>
    <form id="leadForm">
      <div class="field"><label>Name</label><input name="name" class="input" required></div>
      <div class="field"><label>Phone</label><input name="phone" class="input"></div>
      <div class="field"><label>Email</label><input name="email" class="input"></div>
      <div class="field"><label>Address</label><input name="address" class="input"></div>
      <div class="field"><label>Notes</label><textarea name="notes" class="input"></textarea></div>
      <div class="row">
        <button class="btn primary" type="submit">Save Lead</button>
        <a href="#/dashboard" class="btn">Back</a>
      </div>
    </form>
  `;

  el.querySelector('#leadForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const now = new Date();
    const lead = {
      id: crypto.randomUUID(),
      timestamp: now.toISOString(),
      dateKey: todayKey(now),
      name: fd.get('name')?.toString() || '',
      phone: fd.get('phone')?.toString() || '',
      email: fd.get('email')?.toString() || '',
      address: fd.get('address')?.toString() || '',
      notes: fd.get('notes')?.toString() || ''
    };
    const arr = Storage.get('leads', []); arr.push(lead); Storage.set('leads', arr);
    Queue.add({ id: lead.id, type: 'lead', payload: lead });
    toast('Lead saved');
    form.reset();
  });

  return el;
}
