// Cascade Canvass — Minimal Backend (text-only, no photos)
// Writes by header name; PST timestamp; sends plain email (no attachments)

var SPREADSHEET_ID = 'YOUR_GOOGLE_SHEETS_ID';
var SHEET_LEADS    = 'Leads';
var SHEET_VISITS   = 'Visits';

var TO_EMAIL       = 'leads@yourdomain.com';
var SUBJECT_PREFIX = 'Cascade Canvass Lead';
var TZ             = 'America/Los_Angeles';
var API_KEY_REQUIRED = ''; // optional shared secret, leave '' to disable

function nowPST_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
}

function getSheet_(name) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Missing sheet: ' + name);
  return sh;
}

function getHeaderMap_(sheet) {
  var rng = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  var values = rng.getValues()[0];
  var map = {};
  for (var i = 0; i < values.length; i++) {
    var h = String(values[i] || '').trim();
    if (h) map[h] = i;
  }
  return map;
}

function buildRowByHeaders_(headerMap, payload) {
  var width = Object.keys(headerMap).length;
  var row = new Array(width);
  for (var key in headerMap) {
    if (!headerMap.hasOwnProperty(key)) continue;
    var idx = headerMap[key];
    var val = payload.hasOwnProperty(key) ? payload[key] : null;
    if (val === null) {
      for (var k in payload) {
        if (payload.hasOwnProperty(k) && String(k).toLowerCase() === String(key).toLowerCase()) {
          val = payload[k]; break;
        }
      }
    }
    row[idx] = (val === undefined || val === null) ? '' : val;
  }
  return row;
}

function writeByHeaderName_(sheetName, payload) {
  var sh = getSheet_(sheetName);
  var headers = getHeaderMap_(sh);
  if (!payload.Timestamp) payload.Timestamp = nowPST_();
  if (!payload.AppVersion) payload.AppVersion = '4.8.0-gps-address';
  var row = buildRowByHeaders_(headers, payload);
  sh.appendRow(row);
}

function sendLeadEmail_(payload) {
  try {
    var subj = SUBJECT_PREFIX + ': ' + (payload.Address || '(no address)');
    var lines = [];
    lines.push('Time: ' + (payload.Timestamp || nowPST_()));
    if (payload.Address) lines.push('Address: ' + payload.Address);
    if (payload.Name)    lines.push('Name: ' + payload.Name);
    if (payload.Phone)   lines.push('Phone: ' + payload.Phone);
    if (payload.Notes)   lines.push('Notes: ' + payload.Notes);
    if (payload.Outcome) lines.push('Outcome: ' + payload.Outcome);
    if (payload.Lat && payload.Lng) lines.push('Location: ' + payload.Lat + ', ' + payload.Lng);
    if (payload.AppVersion) lines.push('App Version: ' + payload.AppVersion);
    MailApp.sendEmail({ to: TO_EMAIL, subject: subj,
      htmlBody: '<pre style="font-family:ui-monospace,monospace">' + lines.join('\n') + '</pre>' });
  } catch (e) { console.error('Email send failed: ' + e); }
}

function corsJson_(obj) {
  var out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  out.setHeader('Access-Control-Allow-Origin', '*');
  out.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Api-Key');
  out.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  return out;
}

function doGet(e) {
  return corsJson_({ ok: true, when: nowPST_(), version: 'backend-4.8.0-gps-address' });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return corsJson_({ ok: false, error: 'No post data' });
    if (API_KEY_REQUIRED && API_KEY_REQUIRED.length) {
      var hdr = (e.parameter && (e.parameter.apiKey || e.parameter.key)) || '';
      if (hdr !== API_KEY_REQUIRED) return corsJson_({ ok: false, error: 'Unauthorized' });
    }
    var payload = JSON.parse(e.postData.contents);
    var t = (payload.type || '').toLowerCase();
    if (!t) t = (payload.Name || payload.Phone) ? 'lead' : 'visit';
    if (!payload.Timestamp) payload.Timestamp = nowPST_();
    var normalized = {
      Timestamp: payload.Timestamp,
      Address:   payload.Address || payload.address || '',
      Name:      payload.Name || payload.name || '',
      Phone:     payload.Phone || payload.phone || '',
      Notes:     payload.Notes || payload.notes || '',
      Outcome:   payload.Outcome || payload.outcome || '',
      Lat:       payload.Lat || payload.lat || '',
      Lng:       payload.Lng || payload.lng || '',
      Source:    payload.Source || payload.source || 'PWA',
      AppVersion: payload.AppVersion || payload.version || '4.8.0-gps-address'
    };
    if (t === 'lead') { writeByHeaderName_('Leads', normalized); sendLeadEmail_(normalized); }
    else { writeByHeaderName_('Visits', normalized); }
    return corsJson_({ ok: true, type: t, ts: normalized.Timestamp });
  } catch (err) { return corsJson_({ ok: false, error: String(err) }); }
}
