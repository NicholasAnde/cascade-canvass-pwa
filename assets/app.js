// PATCH: Replace Turf list with Geocoder-based suggestions (Overpass API)
// - Suggests nearest doors based on current GPS
// - After saving an outcome, advances to the next closest
// - Falls back to manual address if GPS/geocoder fails
//
// Drop-in for Backend v2 build (keeps queue, admin, statuses).

(function(){
  // Extend global S with geocoder state
  if (typeof S === 'undefined') window.S = {};
  S.geoList = S.geoList || [];   // [{addr, lat, lon, dist}...]
  S.geoPtr  = S.geoPtr  || 0;
  S.geoRadius = S.geoRadius || 150; // meters
  S.geoLimit  = S.geoLimit  || 25;

  const el = s => document.querySelector(s);
  const km = (a,b)=>{
    const R=6371e3, toRad=x=>x*Math.PI/180;
    const dlat=toRad(b.lat-a.lat), dlon=toRad(b.lon-a.lon);
    const la1=toRad(a.lat), la2=toRad(b.lat);
    const x = Math.sin(dlat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dlon/2)**2;
    return 2*R*Math.asin(Math.sqrt(x));
  };

  // Compose address string from OSM tags
  function fmtAddr(tags){
    const num=tags['addr:housenumber']||'';
    const street=tags['addr:street']||tags['name']||'';
    const city=tags['addr:city']||tags['addr:suburb']||tags['addr:hamlet']||'';
    const unit=tags['addr:unit']||'';
    return [num, street, unit?('#'+unit):'', city].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
  }

  // Fetch nearby addr:* points using Overpass
  async function fetchNearby(lat,lon, radius=S.geoRadius, limit=S.geoLimit){
    const q = `[out:json][timeout:20];
      (
        node["addr:housenumber"]["addr:street"](around:${radius},${lat},${lon});
        way["addr:housenumber"]["addr:street"](around:${radius},${lat},${lon});
      );
      out center ${limit};`;
    const body = new URLSearchParams({ data: q });
    const u = 'https://overpass-api.de/api/interpreter';
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
      uniq.set(addr, {addr, lat:latc, lon:lonc});
    }
    // compute distance and sort
    const arr = Array.from(uniq.values()).map(o=>({...o, dist: km({lat,lon},{lat:o.lat,lon:o.lon})}))
      .sort((a,b)=>a.dist-b.dist)
      .slice(0, limit);
    return arr;
  }

  // Helper: update sticky strip + progress (geo mode)
  function stripHTML_geo(){
    const total=S.geoList.length;
    const idx=Math.min(S.geoPtr+1,total||1);
    const segs = total ? Array.from({length: total}, (_,i)=>`<span class="seg ${i<idx?'filled':''}" data-i="${i}" title="${i+1}/${total}"></span>`).join('') : '';
    const current = S.geoList[S.geoPtr]?.addr || '(No suggestions yet)';
    return `<div class="strip"><div class="addr">${current}</div><div class="meta">${idx} / ${total}</div><div class="progress">${segs}</div></div>`;
  }
  function bindProgressClicks_geo(){
    document.querySelectorAll('.progress .seg').forEach(seg=>{
      seg.addEventListener('click', ()=>{
        const i = parseInt(seg.getAttribute('data-i'),10);
        if(!isNaN(i)) { S.geoPtr = i; renderKnock_geo(); }
      });
    });
  }

  // Public: call to refresh suggestion list
  async function refreshGeoList(radius){
    if(!navigator.geolocation){ showToast('Geolocation not available','error'); return; }
    if(radius) S.geoRadius = parseInt(radius,10)||S.geoRadius;
    return new Promise(resolve=>{
      navigator.geolocation.getCurrentPosition(async pos=>{
        const {latitude, longitude} = pos.coords;
        try{
          const arr = await fetchNearby(latitude, longitude, S.geoRadius, S.geoLimit);
          if(!arr.length){
            showToast('No nearby addresses found','info');
            resolve(false); return;
          }
          S.geoList = arr; S.geoPtr = 0;
          showToast(`Loaded ${arr.length} nearby doors ✓`,'success');
          resolve(true);
        }catch(e){
          showToast('Geocoder error','error'); resolve(false);
        }
      }, ()=>{ showToast('Location error','error'); resolve(false); });
    });
  }

  // --- Replace Next Door view with geo-suggested workflow ---
  const _renderKnock_orig = window.renderKnock;
  window.renderKnock_geo = async function(){
    // Ensure we have suggestions
    if(!S.geoList.length){
      const ok = await refreshGeoList();
      if(!ok){ // fallback to original view if available
        if (typeof _renderKnock_orig === 'function') return _renderKnock_orig();
        // minimal fallback
        el('#view').innerHTML = `<section class="card"><h2>Next Door</h2>
          <div class="field"><label>Address*</label><input id="k_addr" placeholder="1208 Maple St"></div>
          <div class="field"><label>Notes</label><input id="k_notes" placeholder="Optional"></div>
          <div class="btn-row"><button class="primary" onclick="postVisit('Lead')">Lead</button></div>
        </section>`;
        return;
      }
    }

    const cur = S.geoList[S.geoPtr]||{};
    el('#view').innerHTML = `
    <section class="card">
      ${stripHTML_geo()}
      <h2>Next Door</h2>
      <div class="field"><label>Address*</label><input id="k_addr" value="${(cur.addr||'').replace(/"/g,'&quot;')}" placeholder="1208 Maple St"></div>
      <div class="field"><label>Notes</label><input id="k_notes" placeholder="Optional"></div>
      <div class="btn-row" style="margin-top:.6rem">
        <button class="primary" onclick="postVisit_geo('Lead')">Lead</button>
        <button class="ghost" onclick="postVisit_geo('No Answer')">No Answer</button>
        <button class="ghost" onclick="postVisit_geo('Left Literature')">Left Literature</button>
        <button class="ghost" onclick="postVisit_geo('Skipped')">Skip Door</button>
        <button class="ghost" onclick="advanceGeo()">Next Closest →</button>
        <button class="ghost" onclick="refreshGeoList()">Reload Nearby</button>
      </div>
      <p class="mono" style="opacity:.7;margin-top:.5rem">${cur.dist? Math.round(cur.dist):'—'} m away</p>
    </section>`;
    bindProgressClicks_geo();
  };

  window.advanceGeo = function(){
    if (!S.geoList.length) return showToast('No list','info');
    S.geoPtr = Math.min(S.geoPtr+1, S.geoList.length-1);
    renderKnock_geo();
  };

  // Override router to point the knock route to geo view
  const _go_prev = window.go;
  window.go = function(tab){
    if (tab==='knock') return renderKnock_geo();
    return _go_prev(tab);
  };

  // Geocoder-based post visit (mirrors backend v2 postVisit)
  window.postVisit_geo = async function(outcome){
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
    // Try POST if configured (use S.* from global)
    if (S.endpoint){
      const payload = {...item, secret:S.secret, emailNotifyTo:S.emailNotifyTo};
      try{
        const r=await fetch(S.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        if(!r.ok) throw new Error('HTTP '+r.status);
      }catch(e){ S.queue.push(payload); }
    }
    S.visitsLog.push(item); localStorage.setItem('visitsLog', JSON.stringify(S.visitsLog));
    showToast((outcome==='Lead'?'Lead':'Visit')+' saved ✓','success');
    // Auto-advance on skip/visit; if Lead, jump to lead form
    if(outcome==='Lead') { go('lead'); }
    else { advanceGeo(); }
  };

})();