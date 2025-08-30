/* v4.7 Backend — header-name mapping + photo attachments (up to 3)
   Deploy as Web App (Execute as: Me; Anyone with link) */

const SHEETS = { VISITS:'Visits', LEADS:'Leads', ERRORS:'Errors' };
const OFFICE_TZ='America/Los_Angeles', DATE_FMT='yyyy-MM-dd', TIME_FMT='h:mm a';
const SHARED_SECRET='CHANGE_ME';
const DEFAULT_EMAIL_TO='you@example.com';

function doGet(e){ return _json({ok:true}); }
function doPost(e){
  try{
    if(!e||!e.postData||!e.postData.contents) return _json({ok:false,error:'no body'},400);
    const body=JSON.parse(e.postData.contents);
    if (SHARED_SECRET && body.secret !== SHARED_SECRET) return _json({ok:false,error:'forbidden'},403);

    const now=new Date(); const day=Utilities.formatDate(now,OFFICE_TZ,DATE_FMT); const time=Utilities.formatDate(now,OFFICE_TZ,TIME_FMT);
    const ss=SpreadsheetApp.getActive();
    const type=String(body.type||'').toLowerCase();

    if(type==='lead'){
      const L=normLead(body,day,time);
      const sh=ensureSheet(ss,SHEETS.LEADS,leadHeaders());
      appendByHeader(sh, {'Timestamp':new Date(),'Lead Date':L.date,'Lead Time':L.time,'Name':L.name,'Phone (Pretty)':L.phonePretty,'Phone (E.164)':L.phoneE164,'Email':L.email,'Address':L.address,'Service':L.service,'Urgency':L.urgency,'Budget':L.budget,'Notes':L.notes,'Rep':L.rep,'Source':L.source,'Lat':L.lat,'Lon':L.lon});
      formatLeads(sh); sendLeadEmail(L, body.photosBase64||[], now, body.emailNotifyTo); return _json({ok:true});
    }else{
      const V=normVisit(body,day,time);
      const sh=ensureSheet(ss,SHEETS.VISITS,visitHeaders());
      appendByHeader(sh, {'Timestamp':new Date(),'Visit Date':V.date,'Visit Time':V.time,'Rep':V.rep,'Outcome':V.outcome,'Objection':V.objection,'Address':V.address,'Notes':V.notes,'Source':V.source,'Lat':V.lat,'Lon':V.lon});
      formatVisits(sh); return _json({ok:true});
    }
  }catch(err){
    try{ const sh=ensureSheet(SpreadsheetApp.getActive(),SHEETS.ERRORS,['Timestamp','Error','Raw']); sh.appendRow([new Date(),String(err),(e&&e.postData&&e.postData.contents)||'']); }catch(_){}
    return _json({ok:false,error:String(err)},500);
  }
}

function normLead(d,day,time){
  const P=toPhone(String(d.phone||''));
  return {date:day,time:time,name:title(d.name),phonePretty:P.pretty,phoneE164:P.e164,email:String(d.email||'').trim(),address:title(d.address),service:String(d.service||''),urgency:String(d.urgency||''),budget:String(d.budget||''),notes:clean(d.notes),rep:String(d.rep||''),source:String(d.source||'PWA'),lat:num(d.lat),lon:num(d.lon)};
}
function normVisit(d,day,time){
  let outcome=d.outcome; if(!outcome && String(d.type||'').toLowerCase()==='lead') outcome='Lead';
  return {date:day,time:time,rep:String(d.rep||''),outcome:String(outcome||'Visit'),objection:String(d.objection||''),address:title(d.address),notes:clean(d.notes),source:String(d.source||'PWA'),lat:num(d.lat),lon:num(d.lon)};
}

function sendLeadEmail(L, photosBase64, when, overrideTo){
  const to=String(overrideTo||PropertiesService.getScriptProperties().getProperty('EMAIL_TO')||DEFAULT_EMAIL_TO||'').trim(); if(!to) return;
  const esc=_esc; const atts=[];
  (photosBase64||[]).slice(0,3).forEach((data,i)=>{ try{ const parts=String(data).split(','); if(parts.length<2) return; const mime=(parts[0].match(/data:(.*?);base64/i)||[])[1]||'image/jpeg'; const bytes=Utilities.base64Decode(parts[1]); const name=`lead_${L.name.replace(/\W+/g,'_')}_${i+1}.jpg`; atts.push(Utilities.newBlob(bytes,mime,name)); }catch(_){}});
  const html=`<div style="font:14px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#222">
    <h2>New Lead</h2>
    <div><b>Name:</b> ${esc(L.name)}</div>
    <div><b>Phone:</b> ${esc(L.phonePretty)} <span style="color:#888">(${esc(L.phoneE164)})</span></div>
    <div><b>Email:</b> ${esc(L.email)}</div>
    <div><b>Address:</b> ${esc(L.address)}</div>
    <div><b>Service:</b> ${esc(L.service)}</div>
    <div><b>Urgency:</b> ${esc(L.urgency)}</div>
    <div><b>Budget:</b> ${esc(L.budget)}</div>
    <div><b>Notes:</b><br/>${esc(L.notes).replace(/\n/g,'<br/>')}</div>
    <div><b>Rep:</b> ${esc(L.rep)}</div>
    <div style="color:#666;margin-top:6px">Logged: ${when}</div>
  </div>`;
  MailApp.sendEmail({ to, subject:`New Lead (Cascade Lead App) — ${L.name} — ${L.address}`, htmlBody:html, attachments:atts, replyTo:L.email||to });
}

function ensureSheet(ss,name,headers){ const sh=ss.getSheetByName(name)||ss.insertSheet(name); if(sh.getLastRow()===0){ sh.getRange(1,1,1,headers.length).setValues([headers]); sh.setFrozenRows(1);} return sh; }
function leadHeaders(){ return ['Timestamp','Lead Date','Lead Time','Name','Phone (Pretty)','Phone (E.164)','Email','Address','Service','Urgency','Budget','Notes','Rep','Source','Lat','Lon']; }
function visitHeaders(){ return ['Timestamp','Visit Date','Visit Time','Rep','Outcome','Objection','Address','Notes','Source','Lat','Lon']; }
function appendByHeader(sh,obj){ const lastCol=sh.getLastColumn(); let headers=sh.getRange(1,1,1,Math.max(1,lastCol)).getValues()[0].map(String); const missing=Object.keys(obj).filter(k=>headers.indexOf(k)===-1); if(missing.length){ const start=headers.length+1; sh.getRange(1,start,1,missing.length).setValues([missing]); headers=headers.concat(missing);} const row=new Array(headers.length).fill(''); headers.forEach((h,i)=>{ if(h in obj) row[i]=obj[h]; }); sh.appendRow(row); }
function formatLeads(sh){ const rows=Math.max(1,sh.getLastRow()-1); const h=headerIndex_(sh); if(rows>0){ if(h['Lead Date']) sh.getRange(2,h['Lead Date'],rows,1).setNumberFormat('yyyy-mm-dd'); if(h['Lead Time']) sh.getRange(2,h['Lead Time'],rows,1).setNumberFormat('h:mm AM/PM'); if(h['Notes']) sh.getRange(2,h['Notes'],rows,1).setWrap(true);} }
function formatVisits(sh){ const rows=Math.max(1,sh.getLastRow()-1); const h=headerIndex_(sh); if(rows>0){ if(h['Visit Date']) sh.getRange(2,h['Visit Date'],rows,1).setNumberFormat('yyyy-mm-dd'); if(h['Visit Time']) sh.getRange(2,h['Visit Time'],rows,1).setNumberFormat('h:mm AM/PM'); if(h['Notes']) sh.getRange(2,h['Notes'],rows,1).setWrap(true);} }
function headerIndex_(sh){ const row=sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getValues()[0]; const map={}; row.forEach((h,i)=>map[String(h)]=i+1); return map; }

function toPhone(raw){ const d=String(raw||'').replace(/\D/g,''); if(d.length===10) return {pretty:`(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`, e164:`+1${d}`}; if(d.length>10&&d.length<=15) return {pretty:`+${d}`, e164:`+${d}`}; return {pretty:'', e164:''}; }
function title(s){ return String(s||'').toLowerCase().replace(/\b([a-z])/g,m=>m.toUpperCase()); }
function clean(s){ return String(s||'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim(); }
function num(x){ const n=Number(x); return Number.isFinite(n)?n:null; }
function _esc(s){ return String(s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])); }
function _json(obj,status){ const out=ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); if(status&&out.setResponseCode) out.setResponseCode(status); return out; }
function setupWorkbook(){ const ss=SpreadsheetApp.getActive(); ensureSheet(ss,SHEETS.VISITS,visitHeaders()); ensureSheet(ss,SHEETS.LEADS,leadHeaders()); ensureSheet(ss,SHEETS.ERRORS,['Timestamp','Error','Raw']); }
