export async function processFiles(files, capBytes = 9.5*1024*1024){
  const out = []; let total = 0;
  for (const f of Array.from(files).slice(0,3)){
    let { blob } = await downscale(f, 1280, 0.82);
    let q = 0.82;
    while (total + blob.size > capBytes && q > 0.6){
      q -= 0.05;
      ({ blob } = await downscale(f, 1280, q));
    }
    total += blob.size;
    out.push(await blobToDataURL(blob));
  }
  return out;
}
function loadImage(file){
  return new Promise((res, rej)=>{
    const img = new Image();
    img.onload = ()=> res(img);
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}
async function downscale(file, maxEdge, quality){
  const img = await loadImage(file);
  const [w,h] = scale(img.width, img.height, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
  return { blob };
}
function scale(w,h,max){
  if (Math.max(w,h) <= max) return [w,h];
  const ratio = w > h ? max / w : max / h;
  return [Math.round(w*ratio), Math.round(h*ratio)];
}
function blobToDataURL(blob){
  return new Promise((res)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.readAsDataURL(blob); });
}
