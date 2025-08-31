const DEFAULT_SETTINGS_URL = "https://script.google.com/macros/s/AKfycbwPEUITyVd3jaSywdjO1dKiBt3M5Mn_yRt4g9UaR3be1_1HAUN0aHicGTLH12XULnANoQ/exec";

export function getSettingsURL(){ return localStorage.getItem('settingsUrl') || DEFAULT_SETTINGS_URL; }
export function setSettingsURL(url){ localStorage.setItem('settingsUrl', url); }

export async function listDoors(sinceDays=365){
  const url = new URL(getSettingsURL());
  url.searchParams.set('action','listDoors');
  url.searchParams.set('sinceDays', String(sinceDays));
  const r = await fetch(url.toString(), { cache:'no-store' });
  return r.json();
}

export async function logVisit(data){
  const r = await fetch(getSettingsURL(), {
    method:'POST',
    body: JSON.stringify({ action:'logVisit', data })
  });
  return r.json();
}

export async function reverseLookup(lat,lng){
  const url = new URL(getSettingsURL());
  url.searchParams.set('action','reverseLookup');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lng', String(lng));
  const r = await fetch(url.toString(), { cache:'no-store' });
  return r.json();
}

export async function newLead(data){
  const r = await fetch(getSettingsURL(), {
    method:'POST',
    body: JSON.stringify({ action:'newLead', data })
  });
  return r.json();
}

export async function listLeadsToday(){
  const url = new URL(getSettingsURL());
  url.searchParams.set('action','listLeadsToday');
  const r = await fetch(url.toString(), { cache:'no-store' });
  return r.json();
}

export async function weeklyLeadCount(start,end){
  const url = new URL(getSettingsURL());
  url.searchParams.set('action','weeklyLeadCount');
  url.searchParams.set('start', start);
  url.searchParams.set('end', end);
  const r = await fetch(url.toString(), { cache:'no-store' });
  return r.json();
}

export async function voidLead(leadId, rep, reason='Accidental'){
  const r = await fetch(getSettingsURL(), {
    method:'POST',
    body: JSON.stringify({ action:'voidLead', leadId, rep, reason })
  });
  return r.json();
}

export async function restoreLead(leadId, rep){
  const r = await fetch(getSettingsURL(), {
    method:'POST',
    body: JSON.stringify({ action:'restoreLead', leadId, rep })
  });
  return r.json();
}

export async function diagnostics(){
  const url = new URL(getSettingsURL());
  url.searchParams.set('action','diagnostics');
  const r = await fetch(url.toString(), { cache:'no-store' });
  return r.json();
}
