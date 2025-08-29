// PATCH: Geocoder flow + 90-day cooldown enforcement for Backend v2
// Drop-in replacement for /assets/app.js if you're on the geocoder-based Next Door workflow.
// If you're still on Turf-only, apply the earlier geocoder patch first.

(function(){
  // Ensure S exists
  if (typeof S === 'undefined') window.S = {};
  // Defaults
  S.geoList = S.geoList || [];   // [{addr, lat, lon, dist, last, days, eligible}]
  S.geoPtr  = S.geoPtr  || 0;
  S.geoRadius = S.geoRadius || 150; // meters
  S.geoLimit  = S.geoLimit  || 25;
  S.cooldownDays = S.cooldownDays || 90;

  const el = s => document.querySelector(s);
  const km = (a,b)=>{
    const R=6371e3, toRad=x=>x*Math.PI/180;
    const dlat=toRad(b.lat-a.lat), dlon=toRad(b.lon-a.lon);
    const la1=toRad(a.lat), la2=toRad(b.lat);
    const x = Math.sin(dlat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dlon/2)**2;
    return 2*R*Math.asin(Math.sqrt(x));
  };
  const daysSince = iso => Math.floor((Date.now() - new Date(iso).getTime())/86400000);

  // Build last-visit index from S.visitsLog
  function buildLastVisitIndex(){
    const idx = new Map();
    try{
      const arr = Array.isArray(S.visitsLog) ? S.visitsLog : [];
      for(const v of arr){
        const a = (v.address||'').trim();
        const t = v.time || v.date || '';
        if(!a || !t) continue;
        const prev = idx.get(a);
        if(!prev || new Date(t) > new Date(prev)) idx.set(a, t);
      }
    }catch(_){}
    return idx;
  }

  // Compose address from OSM tags
  function fmtAddr(tags){
    const num=tags['addr:housenumber']||'';
    const street=tags['addr:street']||tags['name']||'';
    const unit=tags['addr:unit']||'';
    const city=tags['addr:city']||tags['addr:suburb']||tags['addr:hamlet']||'';
    return [num, street, unit?('#'+unit):'', city].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
  }

  // Fetch nearby addr:* points via Overpass
  async function fetchNearby(lat,lon, radius=S.geoRadius, limit=S.geoLimit){
    const q = `[out:json][timeout:20];
      (
        node["addr:housenumber"]["addr:street"](around:${radius},${lat},${lon});
        way["addr:housenumber"]["addr:street"](around:${radius},${lat},${lon});
      );
      out center ${limit};`;
    const u = 'https://overpass-api.de/api/interpreter';
    const body = new URLSearchParams({ data: q });
    const r = await fetch(u,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'}, body});
    const j = await r.json();
    const elems = Array.isArray(j.elements)? j.elements:[];
    const uniq = new Map();
    for(const e of elems){
      const tags=e.tags||{};
      const addr=fmtAddr(tags);
      if(!addr) continue;
      const latc = e.lat ?? e.center?.lat;
      const lonc = e.lon ?? e.center?.lon;
      if(latc==null||lonc==null) continue;
      if(!uniq.has(addr)) uniq.set(addr, {addr, lat:latc, lon:lonc});
    }
    const here = {lat,lon};
    const idx = buildLastVisitIndex();
    // compute distance + cooldown fields
    const arr = Array.from(uniq.values()).map(o=>{
      const dist = km(here,{lat:o.lat,lon:o.lon});
      const last = idx.get(o.addr) || null;
      const d = last ? daysSince(last) : Infinity;
      const eligible = (d===Infinity) || (d >= S.cooldownDays);
      return {...o, dist, last, days: (d===Infinity?null:d), eligible};
    }).sort((a,b)=> a.eligible===b.eligible ? (a.dist-b.dist) : (a.eligible? -1 : 1))
      .slice(0, limit);
    return arr;
  }

  function statusLine(item){
    if(item.eligible) return 'Eligible';
    const left = Math.max(0, S.cooldownDays - (item.days||0));
    return `Cooling (${left}d left)`;
  }

  function stripHTML_geo(){
    const total=S.geoList.length;
    const idx=Math.min(S.geoPtr+1,total||1);
    const segs = total ? Array.from({length: total}, (_,i)=>{
      const c = S.geoList[i]; const cls = `seg ${i<idx?'filled':''} ${c?.eligible?'':'cool'}`;
      return `<span class="${cls}" data-i="${i}" title="${i+1}/${total}"></span>`;
    }).join('') : '';
    const cur = S.geoList[S.geoPtr]||{};
    const meta = `${idx} / ${total} • ${cur.dist? Math.round(cur.dist):'—'} m • ${statusLine(cur)}`;
    return `<div class="strip"><div class="addr">${cur.addr||'(No suggestions yet)'}</div><div class="meta">${meta}</div><div class="progress">${segs}</div></div>`;
  }

  function bindProgressClicks_geo(){
    document.querySelectorAll('.progress .seg').forEach(seg=>{
      seg.addEventListener('click', ()=>{
        const i = parseInt(seg.getAttribute('data-i'),10);
        if(!isNaN(i)) { S.geoPtr = i; renderKnock_geo(); }
      });
    });
  }

  async function refreshGeoList(radius){
    if(!navigator.geolocation){ showToast('Geolocation not available','error'); return false; }
    if(radius) S.geoRadius = parseInt(radius,10)||S.geoRadius;
    return new Promise(resolve=>{
      navigator.geolocation.getCurrentPosition(async pos=>{
        const {latitude, longitude} = pos.coords;
        try{
          const arr = await fetchNearby(latitude, longitude, S.geoRadius, S.geoLimit);
          if(!arr.length){ showToast('No nearby addresses found','info'); resolve(false); return; }
          S.geoList = arr; S.geoPtr = Math.min(S.geoPtr, Math.max(0, arr.length-1));
          showToast(`Loaded ${arr.length} nearby doors ✓`,'success');
          resolve(true);
        }catch(e){ showToast('Geocoder error','error'); resolve(false); }
      }, ()=>{ showToast('Location error','error'); resolve(false); });
    });
  }

  function nextEligiblePtr(start){
    for(let i=start; i<S.geoList.length; i++){
      if(S.geoList[i]?.eligible) return i;
    }
    return -1;
  }

  // Render Next Door (geo)
  window.renderKnock_geo = async function(){
    if(!S.geoList.length){
      const ok = await refreshGeoList();
      if(!ok){
        // minimal fallback for manual entry
        el('#view').innerHTML = `<section class="card"><h2>Next Door</h2>
          <div class="field"><label>Address*</label><input id="k_addr" placeholder="1208 Maple St"></div>
          <div class="field"><label>Notes</label><input id="k_notes" placeholder="Optional"></div>
          <div class="btn-row"><button class="primary" onclick="postVisit_geo('Lead')">Lead</button></div>
        </section>`;
        return;
      }
    }

    // Snap pointer to next eligible if current is cooling
    const ptr = S.geoPtr;
    if(!S.geoList[ptr]?.eligible){
      const n = nextEligiblePtr(ptr);
      if(n>=0) S.geoPtr = n;
    }

    const cur = S.geoList[S.geoPtr]||{};
    el('#view').innerHTML = `
    <section class="card">
      ${stripHTML_geo()}
      <h2>Next Door</h2>
      <div class="field"><label>Address*</label><input id="k_addr" value="${(cur.addr||'').replace(/"/g,'&quot;')}" placeholder="1208 Maple St"></div>
      <div class="field"><label>Notes</label><input id="k_notes" placeholder="Optional"></div>
      <div class="btn-row" style="margin-top:.6rem">
        <button class="primary" ${cur.eligible?'':'disabled'} onclick="postVisit_geo('Lead')">Lead</button>
        <button class="ghost" ${cur.eligible?'':'disabled'} onclick="postVisit_geo('No Answer')">No Answer</button>
        <button class="ghost" ${cur.eligible?'':'disabled'} onclick="postVisit_geo('Left Literature')">Left Literature</button>
        <button class="ghost" onclick="postVisit_geo('Skipped')">Skip Door</button>
        <button class="ghost" onclick="advanceGeo()">Next Closest →</button>
        <button class="ghost" onclick="refreshGeoList()">Reload Nearby</button>
      </div>
    </section>`;
    bindProgressClicks_geo();

    // If cooling, inform and auto-advance hint
    if(!cur.eligible){
      const left = Math.max(0, S.cooldownDays - (cur.days||0));
      showToast(`Cooling — ${left}d left. Advancing to next…`,'info');
    }
  };

  window.advanceGeo = function(){
    if (!S.geoList.length) return showToast('No list','info');
    // Move to next eligible if possible
    const n = nextEligiblePtr(S.geoPtr+1);
    S.geoPtr = (n>=0) ? n : Math.min(S.geoPtr+1, S.geoList.length-1);
    renderKnock_geo();
  };

  // Override router to use geo view
  const _go_prev = window.go;
  window.go = function(tab){
    if (tab==='knock') return renderKnock_geo();
    return _go_prev(tab);
  };

  // Logging with cooldown update
  window.postVisit_geo = async function(outcome){
    // If current is cooling and outcome isn't "Skipped", auto-advance
    const cur = S.geoList[S.geoPtr]||{};
    if(outcome!=='Skipped' && !cur.eligible){
      const left = Math.max(0, S.cooldownDays - (cur.days||0));
      showToast(`Cooling — ${left}d left. Skipping to next eligible…`,'info');
      return advanceGeo();
    }

    const addr = (el('#k_addr')?.value||'').trim();
    const notes = (el('#k_notes')?.value||'').trim();
    if(!addr){ showToast('Address is required.','error'); el('#k_addr')?.focus(); return; }

    const item = {
      type: outcome==='Lead' ? 'lead' : 'visit',
      date: new Date().toISOString().slice(0,10),
      time: new Date().toISOString(),
      address: addr,
      name:'', phone:'', email:'', notes,
      rep: S.rep||'', source:'PWA',
      outcome: outcome==='Lead'? undefined : outcome,
      objection: ''
    };

    // Backend POST if configured
    if (S.endpoint){
      const payload = {...item, secret:S.secret, emailNotifyTo:S.emailNotifyTo};
      try{
        const r=await fetch(S.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        if(!r.ok) throw new Error('HTTP '+r.status);
      }catch(e){ S.queue.push(payload); }
    }

    // Local log + cooldown refresh
    S.visitsLog.push(item);
    localStorage.setItem('visitsLog', JSON.stringify(S.visitsLog));

    // Update this entry in geoList as cooling now
    try{
      S.geoList[S.geoPtr].eligible = false;
      S.geoList[S.geoPtr].days = 0;
      S.geoList[S.geoPtr].last = item.time;
    }catch(_){}

    showToast((outcome==='Lead'?'Lead':'Visit')+' saved ✓','success');

    if(outcome==='Lead'){ go('lead'); return; }
    advanceGeo();
  };

})();