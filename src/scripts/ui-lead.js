import { newLead, reverseLookup } from './api.js';
import { processFiles } from './photos.js';
import { enqueue } from './queue.js';

export async function renderLeadTab({ mountEl, getRep }){
  mountEl.innerHTML = `<section class="card col">
    <strong>New Lead</strong>
    <div class="row"><button class="btn" id="match">📍 Match Current Door</button></div>
    <input class="input" id="addr" placeholder="Address">
    <input class="input" id="name" placeholder="Name*">
    <input class="input" id="phone" placeholder="Phone*">
    <input class="input" id="email" placeholder="Email (optional)">
    <div class="row">
      <select class="input" id="svc"><option>Removal</option><option>Pruning</option><option>Other</option></select>
      <select class="input" id="urg"><option>Low</option><option>Medium</option><option>High</option></select>
    </div>
    <div class="row">
      <textarea class="input" id="notes" placeholder="Notes"></textarea>
      <button class="btn" id="mic" title="Voice to text">🎤</button>
    </div>
    <label class="row" style="gap:6px; align-items:center;">
      <input type="checkbox" id="mk"> <span>🏷 Add Marketing Tag (Visits only)</span>
    </label>
    <div class="row" id="thumbs"></div>
    <input type="file" id="photos" accept="image/*" capture="environment" multiple style="display:none">
    <div class="row">
      <button class="btn" id="addp">📷 Add Photo</button>
      <div id="sizem" class="muted"></div>
    </div>
    <div class="row" style="justify-content:flex-end; gap:8px;">
      <button class="btn" id="cancel">Cancel</button>
      <button class="btn" id="save">Save Lead</button>
    </div>
  </section>`;

  const thumbs = document.getElementById('thumbs');
  const sizem  = document.getElementById('sizem');
  const input  = document.getElementById('photos');
  let bundle = []; let total = 0;

  document.getElementById('addp').addEventListener('click', ()=> input.click());
  input.addEventListener('change', async ()=>{
    bundle = await processFiles(input.files);
    thumbs.innerHTML = bundle.map((b,i)=> `<img src="${b}" style="height:64px;border-radius:8px;border:1px solid #333">`).join('');
    total = Math.round(bundle.reduce((n,b)=> n + (b.length*0.75), 0)/1024/1024*10)/10;
    sizem.textContent = `${total} MB / 9.5 MB`;
  });

  document.getElementById('save').addEventListener('click', async ()=>{
    const data = {
      name: v('name'), phonePretty: v('phone'), phoneE164: v('phone'), email: v('email'),
      address: v('addr'), service: v('svc'), urgency: v('urg'), notes: v('notes'),
      rep: getRep(), source:'pwa', lat:'', lon:'', marketing: !!document.getElementById('mk').checked,
      photosBase64: bundle
    };
    try{
      const res = await newLead(data);
      window.toast(res.ok?`Lead saved (Photos attached: ${res.photosAttached||0})`:'Queued');
      location.hash='#map';
    }catch{
      enqueue({ type:'lead', payload:data });
      window.toast('Saved offline, will sync');
      location.hash='#map';
    }
  });

  document.getElementById('match').addEventListener('click', ()=>{
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async pos => {
      const res = await reverseLookup(pos.coords.latitude, pos.coords.longitude);
      if (res && res.ok) document.getElementById('addr').value = res.address;
    });
  });

  document.getElementById('mic').addEventListener('click', ()=>{
    try{
      if (window.SpeechRecognition || window.webkitSpeechRecognition){
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        const r = new SR();
        r.onresult = e => { document.getElementById('notes').value = e.results[0][0].transcript; };
        r.start();
      }
    }catch{}
  });

  document.getElementById('cancel').addEventListener('click', ()=> history.back());
}
function v(id){ return document.getElementById(id).value.trim(); }
