// v4.5-fixed full app.js with Test POST in Settings
window.S = window.S || {rep:localStorage.getItem('rep')||'',theme:localStorage.getItem('theme')||'dark',
  endpoint:null,secret:'',emailNotifyTo:'',visitsLog:JSON.parse(localStorage.getItem('visitsLog')||'[]'),
  leadsLog:JSON.parse(localStorage.getItem('leadsLog')||'[]'),queue:JSON.parse(localStorage.getItem('queue')||'[]')};
document.documentElement.dataset.theme=(S.theme==='light')?'light':'';
(async function(){try{const cfg=await fetch('./app.settings.json').then(r=>r.json());
S.endpoint=cfg.sheetsEndpoint||null;S.secret=cfg.sharedSecret||'';S.emailNotifyTo=cfg.emailNotifyTo||'';}catch(e){}window.addEventListener('online',retryQueue);})();
const el=s=>document.querySelector(s);function saveLS(){localStorage.setItem('rep',S.rep);localStorage.setItem('theme',S.theme);
localStorage.setItem('visitsLog',JSON.stringify(S.visitsLog));localStorage.setItem('leadsLog',JSON.stringify(S.leadsLog));
localStorage.setItem('queue',JSON.stringify(S.queue));}
function showToast(m,t='success'){const r=el('#toast-root');if(!r)return;const d=document.createElement('div');d.textContent=m;r.appendChild(d);setTimeout(()=>d.remove(),2000);}
function go(tab){if(tab==='settings')return renderSettings();document.getElementById('view').innerHTML='<section class="card"><h2>'+tab+'</h2></section>';}
// Settings with Test POST
function renderSettings(){el('#view').innerHTML=`<section class="card"><h2>Settings</h2>
<div class="field"><label>Rep Name</label><input id="s_rep" value="${S.rep||''}"></div>
<div class="btn-row"><button onclick="savePrefs()">Save</button><button onclick="testPost()">Test POST</button></div>
<div class="field"><label>Test Result</label><textarea id="adm_msg" rows="3" readonly></textarea></div></section>`;}
function savePrefs(){S.rep=el('#s_rep').value.trim();saveLS();showToast('Saved ✓');}
async function testPost(){const box=el('#adm_msg');if(!S.endpoint){box.value='No endpoint configured';return;}
const payload={type:'visit',date:new Date().toISOString().slice(0,10),time:new Date().toISOString(),
address:'TEST ADDRESS',notes:'test payload',outcome:'No Answer',rep:S.rep||'',source:'PWA',secret:S.secret,emailNotifyTo:S.emailNotifyTo};
try{const r=await fetch(S.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
const text=await r.text();box.value=`HTTP ${r.status}\\n${text}`;}catch(e){box.value=String(e);}}
