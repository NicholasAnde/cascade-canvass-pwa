(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const state = {
    cfg: null,
    idb: null,
    backoffBase: 5000, // 5s initial
    backoffMax: 120000, // 2m
    maxPhotos: 5,
    maxDim: 1600,
    jpegQuality: 0.8,
  };

  // Load settings file
  async function loadConfig() {
    const res = await fetch('./app.settings.json', {cache: 'no-store'});
    const cfg = await res.json();
    state.cfg = cfg;
    return cfg;
  }

  // Simple router
  function show(view) {
    ['home','next','new','tracker','scripts','settings'].forEach(v => {
      const el = $('#view-' + v);
      if (el) el.classList.toggle('hidden', v !== view);
    });
    // Close queue panel if not needed
    $('#queuePanel').classList.add('hidden');
    window.scrollTo({top: 0, behavior: 'smooth'});
    if (view === 'tracker') refreshTracker();
    if (view === 'scripts') loadScripts();
    if (view === 'new') $('#leadConfirm').classList.add('hidden');
  }

  // Toasts
  let toastTimer = null;
  function toast(msg, type='info', t=2500) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast ' + type;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), t);
  }

  // Theme + settings
  function initSettingsUI() {
    const repInput = $('#settingsRep');
    repInput.value = localStorage.getItem('cc.rep') || '';
    repInput.addEventListener('input', () => localStorage.setItem('cc.rep', repInput.value || ''));

    const themeSel = $('#theme');
    const savedTheme = localStorage.getItem('cc.theme') || 'dark';
    themeSel.value = savedTheme;
    document.body.classList.toggle('light', savedTheme === 'light');
    document.body.classList.toggle('dark', savedTheme === 'dark');
    themeSel.addEventListener('change', () => {
      localStorage.setItem('cc.theme', themeSel.value);
      document.body.classList.toggle('light', themeSel.value === 'light');
      document.body.classList.toggle('dark', themeSel.value === 'dark');
    });
  }

  // Nav
  function initNav() {
    $$('#navMenu [data-nav]').forEach(a => {
      a.addEventListener('click', (e) => {
        const hash = (e.currentTarget.getAttribute('href') || '').replace('#','');
        if (hash) {
          e.preventDefault();
          show(hash);
          location.hash = '#' + hash;
        }
      });
    });
    $('#menuBtn').addEventListener('click', () => {
      $('#navMenu').classList.toggle('hidden');
    });
    // Restore hash
    const h = (location.hash || '#home').replace('#','');
    show(h);
  }

  // IndexedDB wrapper
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('ccQueue', 1);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        if (!db.objectStoreNames.contains('leads')) {
          const store = db.createObjectStore('leads', { keyPath: 'leadID' });
          store.createIndex('status', 'status');
          store.createIndex('nextAttempt', 'nextAttempt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function dbPut(item) {
    const tx = state.idb.transaction('leads', 'readwrite');
    await tx.objectStore('leads').put(item);
    return tx.complete;
  }
  async function dbGetAll() {
    return new Promise((resolve, reject) => {
      const tx = state.idb.transaction('leads', 'readonly');
      const req = tx.objectStore('leads').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  async function dbDelete(id) {
    const tx = state.idb.transaction('leads', 'readwrite');
    await tx.objectStore('leads').delete(id);
    return tx.complete;
  }

  // Badge + panel
  function setBadge(count) {
    const b = $('#syncBadge'), c = $('#syncCount');
    if (!b || !c) return;
    if (count > 0) {
      c.textContent = count;
      b.style.display = 'inline-flex';
    } else {
      b.style.display = 'none';
    }
  }
  async function refreshQueuePanel() {
    const items = await dbGetAll();
    const wrap = $('#queueItems');
    if (!wrap) return;
    wrap.innerHTML = '';
    items.forEach(it => {
      const div = document.createElement('div');
      div.className = 'queue-item';
      div.innerHTML = `
        <div>
          <div><b>${it.leadID}</b> — ${esc(it.name || '')}, ${esc((it.address||'').slice(0,32))}</div>
          <small>${(it.photos||[]).length} photo(s) • ${esc(it.status)} • next ${(it.nextAttempt? new Date(it.nextAttempt).toLocaleTimeString(): 'now')}</small>
        </div>
        <div class="actions">
          <button class="btn" data-retry="${it.leadID}">Retry</button>
          <button class="btn danger" data-del="${it.leadID}">Clear</button>
        </div>
      `;
      wrap.appendChild(div);
    });

    wrap.querySelectorAll('[data-retry]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-retry');
        await forceRetry(id);
      });
    });
    wrap.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-del');
        await dbDelete(id);
        refreshQueuePanel();
        updateQueueState();
      });
    });
  }

  async function forceRetry(leadID) {
    const items = await dbGetAll();
    const it = items.find(x => x.leadID === leadID);
    if (!it) return;
    it.nextAttempt = Date.now(); // now
    it.backoff = state.backoffBase;
    await dbPut(it);
    await trySync();
  }

  async function updateQueueState() {
    const items = await dbGetAll();
    setBadge(items.length);
  }

  // Utility
  function shortID() {
    return Math.random().toString(36).slice(2,6).toUpperCase();
  }
  function esc(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function safeSeg(s) {
    return (s||'').normalize('NFKD').replace(/[^\w\d]+/g,'').slice(0,30) || 'NA';
  }
  function dateParts(d = new Date()) {
    const pad = (n) => String(n).padStart(2,'0');
    const y = d.getFullYear();
    const m = pad(d.getMonth()+1);
    const da = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    return { y, m, da, hh, mm, iso: `${y}-${m}-${da}`, time24: `${hh}:${mm}` };
  }

  // Image compression
  async function compressImage(file, maxDim=1600, quality=0.8) {
    const img = await new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const i = new Image();
      i.onload = () => res({img:i, url});
      i.onerror = rej;
      i.src = url;
    });
    const {img: image, url} = img;
    const w = image.width, h = image.height;
    let nw = w, nh = h;
    if (Math.max(w,h) > maxDim) {
      if (w >= h) { nw = maxDim; nh = Math.round(h * (maxDim / w)); }
      else { nh = maxDim; nw = Math.round(w * (maxDim / h)); }
    }
    const canvas = document.createElement('canvas');
    canvas.width = nw; canvas.height = nh;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, nw, nh);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    URL.revokeObjectURL(url);
    return { base64: dataUrl.split(',')[1], mime: 'image/jpeg', width: nw, height: nh };
  }

  // Local tracker store
  function getLocalLeads() {
    try { return JSON.parse(localStorage.getItem('cc.leads') || '[]'); } catch(e) { return []; }
  }
  function setLocalLeads(arr) {
    localStorage.setItem('cc.leads', JSON.stringify(arr || []));
  }
  function addLocalLead(rec) {
    const arr = getLocalLeads();
    arr.unshift(rec);
    setLocalLeads(arr);
  }
  function delLocalLead(leadID) {
    const arr = getLocalLeads().filter(x => x.leadID !== leadID);
    setLocalLeads(arr);
  }
  function refreshTracker() {
    const list = $('#trackerList');
    const leads = getLocalLeads();
    if (!leads.length) { list.innerHTML = '<p style="color:var(--muted)">No local leads yet.</p>'; return; }
    list.innerHTML = '';
    leads.forEach(ld => {
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div><b>${esc(ld.name||'')}</b> — ${esc((ld.address||'').slice(0,48))}</div>
          <div style="color:var(--muted)">ID: ${esc(ld.leadID)}</div>
        </div>
        <div style="margin-top:6px">
          <small>${esc(ld.date)} ${esc(ld.time)} • Rep: ${esc(ld.rep||'')}</small>
        </div>
        <div class="actions" style="margin-top:8px">
          <button class="btn danger" data-del="${ld.leadID}">Delete (local)</button>
        </div>
      `;
      list.appendChild(div);
    });
    list.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-del');
        delLocalLead(id);
        refreshTracker();
      });
    });
  }

  // Build payload & enqueue
  async function handleLeadSubmit(ev) {
    ev.preventDefault();
    const now = new Date();
    const {iso, time24} = dateParts(now);

    const lead = {
      leadID: shortID(),
      date: iso,
      time: time24,
      name: $('#name').value.trim(),
      phone: $('#phone').value.trim(),
      email: $('#email').value.trim(),
      address: $('#address').value.trim(),
      urgency: $('#urgency').value,
      timeline: $('#timeline').value,
      budget: $('#budget').value.trim(),
      notes: $('#notes').value.trim(),
      rep: $('#rep').value.trim() || localStorage.getItem('cc.rep') || '',
      photos: []
    };

    // Save to local tracker immediately
    addLocalLead(lead);

    // Prepare photos
    const files = Array.from($('#photos').files || []).slice(0, state.maxPhotos);
    const nameSeg = safeSeg(lead.name);
    const addrSeg = safeSeg(lead.address);
    const repSeg = safeSeg(lead.rep);
    let idx = 1;
    for (const f of files) {
      try {
        const cmp = await compressImage(f, state.maxDim, state.jpegQuality);
        const fname = `${lead.date}_${repSeg}_${nameSeg}_${addrSeg}_ID-${lead.leadID}_${idx}.jpg`;
        lead.photos.push({ filename: fname, mime: cmp.mime, base64: cmp.base64, width: cmp.width, height: cmp.height });
        idx++;
      } catch (e) {
        console.error('Photo compress fail', e);
        toast('Photo compress failed (skipped)', 'err', 2000);
      }
    }

    // Enqueue to IDB
    const item = {
      ...lead,
      status: 'queued',
      nextAttempt: Date.now(),
      backoff: state.backoffBase,
      tries: 0
    };
    await dbPut(item);
    toast(`Lead [${lead.leadID}] queued`, 'info', 1800);
    updateQueueState();
    refreshQueuePanel();

    // Show confirmation
    const conf = $('#leadConfirm');
    conf.classList.remove('hidden');
    conf.innerHTML = `<b>Saved.</b> Lead ID: ${lead.leadID}. Will sync when online.`;

    // Clear form (but keep rep)
    $('#leadForm').reset();
    $('#rep').value = localStorage.getItem('cc.rep') || '';
  }

  // Try sync queue
  async function trySync() {
    if (!navigator.onLine) return;
    const items = await dbGetAll();
    if (!items.length) return;
    for (const it of items) {
      const now = Date.now();
      if (now < (it.nextAttempt || 0)) continue;
      try {
        await uploadLead(it);
        await dbDelete(it.leadID);
        toast(`Lead [${it.leadID}] synced`, 'ok', 2000);
      } catch (e) {
        console.warn('Sync failed:', e);
        it.tries = (it.tries || 0) + 1;
        it.backoff = Math.min((it.backoff || state.backoffBase) * 1.8, state.backoffMax);
        it.nextAttempt = Date.now() + it.backoff;
        it.status = 'error';
        await dbPut(it);
        toast('Network issue — retrying in ' + Math.round(it.backoff/1000) + 's', 'info', 2500);
      }
    }
    updateQueueState();
    refreshQueuePanel();
  }

  async function uploadLead(it) {
    // Build payload for Apps Script
    const payload = {
      leadID: it.leadID,
      date: it.date,
      time: it.time,
      name: it.name,
      phone: it.phone,
      email: it.email,
      address: it.address,
      serviceUrgency: it.urgency,
      timeline: it.timeline,
      budget: it.budget,
      notes: it.notes,
      rep: it.rep,
      photos: it.photos || [],
      emailNotifyTo: state.cfg.emailNotifyTo || '',
      meta: { app: 'Cascade Canvass PWA', version: 'v1.16-dev' }
    };
    const res = await fetch(state.cfg.sheetsEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shared-Secret': state.cfg.sharedSecret || ''
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json().catch(()=>({ok:true}));
    return data;
  }

  // Scripts (optional)
  async function loadScripts() {
    const el = $('#scriptsContainer');
    try {
      const res = await fetch('./assets/scripts.json', {cache:'no-store'});
      if (!res.ok) throw new Error('No scripts.json');
      const data = await res.json();
      el.innerHTML = '';
      (data?.items || []).forEach(it => {
        const c = document.createElement('div');
        c.className = 'card';
        c.innerHTML = `<b>${esc(it.title||'')}</b><div style="margin-top:6px;color:var(--muted)">${esc(it.body||'')}</div>`;
        el.appendChild(c);
      });
    } catch {
      el.innerHTML = '<p style="color:var(--muted)">No scripts available.</p>';
    }
  }

  // Events & init
  function bindEvents() {
    $('#leadForm').addEventListener('submit', handleLeadSubmit);
    $('#clearForm').addEventListener('click', () => {
      $('#leadForm').reset();
      $('#rep').value = localStorage.getItem('cc.rep') || '';
    });

    // Header badge click → open queue panel
    $('#syncBadge').addEventListener('click', async () => {
      await refreshQueuePanel();
      $('#queuePanel').classList.remove('hidden');
    });
    $('#closeQueue').addEventListener('click', () => $('#queuePanel').classList.add('hidden'));

    // Settings queue actions
    $('#retryQueue').addEventListener('click', trySync);
    $('#clearQueue').addEventListener('click', async () => {
      const items = await dbGetAll();
      for (const it of items) await dbDelete(it.leadID);
      updateQueueState();
      refreshQueuePanel();
      toast('Queue cleared', 'ok', 1500);
    });

    window.addEventListener('online', trySync);
    setInterval(trySync, 8000);
  }

  async function boot() {
    await loadConfig();
    initSettingsUI();
    initNav();
    state.idb = await openDB();
    updateQueueState();
    // Prefill rep into new lead form
    $('#rep').value = localStorage.getItem('cc.rep') || '';
  }

  // Start
  boot();
})();
