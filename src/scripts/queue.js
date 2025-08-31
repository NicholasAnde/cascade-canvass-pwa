const KEY = 'cc_queue_v1';

function readQ(){ try{ return JSON.parse(localStorage.getItem(KEY)||'[]'); }catch{ return []; } }
function writeQ(arr){ localStorage.setItem(KEY, JSON.stringify(arr)); }

export function qLength(){ return readQ().length; }

export function enqueue(item){
  const arr = readQ();
  arr.push({ ...item, id: crypto.randomUUID(), ts: Date.now() });
  writeQ(arr);
  return arr.length;
}

export function clearQueue(){ writeQ([]); }

export async function drainQueue(sender){
  const arr = readQ(); if (!arr.length) return 0;
  const kept = [];
  for (const it of arr){
    try { await sender(it); } catch(e){ kept.push(it); }
  }
  writeQ(kept);
  return arr.length - kept.length;
}
