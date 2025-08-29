/* Backend for Increment 3 — Sheets + Email (No Drive), PST/PDT */
const SHEETS = { VISITS:'Visits', LEADS:'Leads', ERRORS:'Errors' };
const DEFAULT_EMAIL_TO = 'nicholasande@gmail.com';
const MAX_PHOTOS = 3;
const OFFICE_TZ = 'America/Los_Angeles'; const DATE_FMT='yyyy-MM-dd'; const TIME_FMT='h:mm a';
const SHARED_SECRET = 'CHANGE_ME';
function doGet(e){ return _json({ok:true}); }
function doPost(e){ try{ if(!e||!e.postData||!e.postData.contents) return _json({ok:false,error:'no body'},400); const body=JSON.parse(e.postData.contents);
  if(SHARED_SECRET && body.secret!==SHARED_SECRET) return _json({ok:false,error:'forbidden'},403);
  const now=new Date(); const dateLocal=Utilities.formatDate(now,OFFICE_TZ,DATE_FMT); const timeLocal=Utilities.formatDate(now,OFFICE_TZ,TIME_FMT);
  const ss=SpreadsheetApp.getActive();
  if((body.type||'').toLowerCase()==='lead'){ const lead=normLead(body,dateLocal,timeLocal); const sh=sheet(ss,SHEETS.LEADS,leadHeaders());
    sh.appendRow([lead.date,lead.time,lead.name,lead.phonePretty,lead.phoneE164,lead.email,lead.address,lead.service,lead.urgency,lead.timeline,lead.budget,lead.notes,body.rep||'',body.source||'PWA',lead.emailLink,lead.callLink]); fmtLeads(sh); sendLeadEmail(lead,body.photos); return _json({ok:true}); }
  else { const v=normVisit(body,dateLocal,timeLocal); const sh=sheet(ss,SHEETS.VISITS,visitHeaders()); sh.appendRow([v.date,v.time,v.outcome,v.objection,v.address,v.notes,body.rep||'',body.source||'PWA']); fmtVisits(sh); return _json({ok:true}); } }
  catch(err){ try{ const sh=sheet(SpreadsheetApp.getActive(),SHEETS.ERRORS,['Timestamp','Error','Raw']); sh.appendRow([new Date(),String(err),(e&&e.postData&&e.postData.contents)||'']); }catch(_){ } return _json({ok:false,error:String(err)},500); } }
function normLead(d,dateStr,timeStr){ const digits=s=>String(s||'').replace(/\D/g,''); const fmt=ds=>ds.length===10?{pretty:`(${ds.slice(0,3)}) ${ds.slice(3,6)}-${ds.slice(6)}`,e164:`+1${ds}`}:(ds.length>10&&ds.length<=15?{pretty:`+${ds}`,e164:`+${ds}`}:{pretty:'',e164:''}); const p=fmt(digits(d.phone)); const emailLink=d.email?`=HYPERLINK("mailto:${d.email}?subject="+ENCODEURL("Tree Service Quote — ${d.name}") ,"Email")`:''; const callLink=p.e164?`=HYPERLINK("tel:${p.e164}","Call")`:''; return {date:dateStr,time:timeStr,name:title(d.name),phonePretty:p.pretty,phoneE164:p.e164,email:String(d.email||'').trim(),address:title(d.address),service:d.service||'',urgency:d.urgency||'',timeline:d.timeline||'',budget:d.budget||'',notes:clean(d.notes||''),emailLink,callLink}; }
function normVisit(d,dateStr,timeStr){ return {date:dateStr,time:timeStr,outcome:(d.type==='lead'?'Lead':(d.outcome||'')),objection:d.objection||'',address:title(d.address),notes:clean(d.notes||'')}; }
function sendLeadEmail(lead,photos){ const to=PropertiesService.getScriptProperties().getProperty('EMAIL_TO')||DEFAULT_EMAIL_TO; if(!to) return; const subject="New Lead (Cascade Lead App)";
  const esc=s=>String(s).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])); const html=`<div style="font:14px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#222"><h2>New Lead</h2><div><b>Name:</b> ${esc(lead.name)}</div><div><b>Phone:</b> ${esc(lead.phonePretty)} <span style="color:#888">(${esc(lead.phoneE164)})</span></div><div><b>Email:</b> ${esc(lead.email)}</div><div><b>Address:</b> ${esc(lead.address)}</div><div><b>Service:</b> ${esc(lead.service)}</div><div><b>Urgency:</b> ${esc(lead.urgency)}</div><div><b>Timeline:</b> ${esc(lead.timeline)}</div><div><b>Budget:</b> ${esc(lead.budget)}</div><div><b>Notes:</b><br/>${esc(lead.notes).replace(/\n/g,'<br/>')}</div></div>`;
  const atts=[]; const arr=Array.isArray(photos)?photos.slice(0,MAX_PHOTOS):[]; for(let i=0;i<arr.length;i++){ try{ const parts=String(arr[i]).split(','); if(parts.length<2) continue; const bytes=Utilities.base64Decode(parts[1]); const blob=Utilities.newBlob(bytes,'image/jpeg',`lead_photo_${i+1}.jpg`); atts.push(blob);}catch(_){}} MailApp.sendEmail({to,subject,htmlBody:html,attachments:atts,replyTo:lead.email||to}); }
function sheet(ss,name,headers){ const sh=ss.getSheetByName(name)||ss.insertSheet(name); if(sh.getLastRow()===0){ sh.getRange(1,1,1,headers.length).setValues([headers]); sh.setFrozenRows(1);} return sh; }
function leadHeaders(){ return ['Lead Date','Lead Time','Name','Phone (Pretty)','Phone (E.164)','Email','Address','Service','Urgency','Timeline','Budget','Notes','Rep','Source','Email ⤳','Call ⤳']; }
function visitHeaders(){ return ['Visit Date','Visit Time','Outcome','Objection','Address','Notes','Rep','Source']; }
function fmtLeads(sh){ const h=leadHeaders(); const c={}; h.forEach((x,i)=>c[x]=i+1); const rows=Math.max(1,sh.getLastRow()-1);
  if(rows>0){ sh.getRange(2,c['Notes'],rows,1).setWrap(true); sh.getRange(2,c['Lead Date'],rows,1).setNumberFormat('yyyy-mm-dd'); sh.getRange(2,c['Lead Time'],rows,1).setNumberFormat('h:mm AM/PM'); }
  sh.setColumnWidths(c['Lead Date'],2,110); sh.setColumnWidth(c['Name'],170); sh.setColumnWidth(c['Phone (Pretty)'],135); sh.setColumnWidth(c['Phone (E.164)'],120);
  sh.setColumnWidth(c['Email'],200); sh.setColumnWidth(c['Address'],260); sh.setColumnWidth(c['Notes'],320);
}
function fmtVisits(sh){ const h=visitHeaders(); const c={}; h.forEach((x,i)=>c[x]=i+1); const rows=Math.max(1,sh.getLastRow()-1);
  if(rows>0){ sh.getRange(2,c['Visit Date'],rows,1).setNumberFormat('yyyy-mm-dd'); sh.getRange(2,c['Visit Time'],rows,1).setNumberFormat('h:mm AM/PM'); sh.getRange(2,c['Notes'],rows,1).setWrap(true); }
}
function title(s){ return String(s||'').toLowerCase().replace(/\b([a-z])/g,c=>c.toUpperCase()); }
function clean(s){ return String(s||'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim(); }
function _json(obj,status){ const out=ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); if(status && out.setResponseCode) out.setResponseCode(status); return out; }
