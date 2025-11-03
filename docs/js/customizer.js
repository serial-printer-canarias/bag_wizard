/* Tambour Wizard — 2 colores, 2 texturas, contorno fijo */
(function () {
  const ROOT = './';
  const SVG  = ROOT + 'assets/svg/bag_base.svg';
  const TX   = {
    smooth: ROOT + 'assets/textures/leather_smooth.jpg',
    suede:  ROOT + 'assets/textures/leather_suede.jpg',
  };

  // ---- helpers UI
  const $ = (s, c = document) => c.querySelector(s);
  const ui = {
    texA: $('#texA'), colA: $('#colA'),
    texB: $('#texB'), colB: $('#colB'),
    dl:   $('#dl')
  };

  // ---- canvas
  const W = 800, H = 900;
  const canvas = new fabric.Canvas('cv', { selection: false });
  canvas.setWidth(W); canvas.setHeight(H);

  // ---- debug toast
  const dbg = document.createElement('div');
  Object.assign(dbg.style, {
    position: 'fixed', top: '10px', right: '10px', zIndex: 9999,
    background: 'rgba(17,17,17,.9)', color: '#fff', padding: '8px 10px',
    borderRadius: '12px', font: '12px/1.35 ui-sans-serif,system-ui',
    maxWidth: '50ch', display: 'none'
  });
  document.body.appendChild(dbg);
  let dbgOn = false;
  const log = (t) => { if (dbgOn) { dbg.style.display='block'; dbg.innerHTML = t; } };

  window.addEventListener('keydown', (e)=>{ if(e.key.toLowerCase()==='d'){ dbgOn=!dbgOn; dbg.style.display=dbgOn?'block':'none'; } });

  // ---- state
  let root = null;
  let bucketA = [], bucketB = [];
  let outlineSet = new Set();
  let imgSmooth = null, imgSuede = null;
  let mode = 'ids';

  // ---- utils (fabric)
  function fit(g) {
    const margin = 28, maxW = W - margin*2, maxH = H - margin*2;
    const w = g.width || g.getScaledWidth(), h = g.height || g.getScaledHeight();
    const s = Math.min(maxW / w, maxH / h);
    g.scale(s);
    g.set({ left: (W - w*s) / 2, top: (H - h*s) / 2, selectable: false, evented: false });
  }
  function walk(arr, fn) {
    (function rec(a) { a.forEach(o => { fn(o); if (o._objects && o._objects.length) rec(o._objects); }); })(arr);
  }
  const leafs = (r) => { const out=[]; walk([r],o=>{ if(o._objects&&o._objects.length) return; if(o.type==='image') return; out.push(o); }); return out; };
  const idsMap = (arr) => { const map={}; walk(arr,o=>{ if(o.id) map[o.id]=o; }); return map; };
  const hasFill = (o) => ('fill' in o) && o.fill && o.fill !== 'none';
  const hasStroke = (o) => ('stroke' in o) && o.stroke && o.stroke !== 'none';

  function bringChildToTop(parent, child){
    if(!parent || !parent._objects) return;
    const a=parent._objects, i=a.indexOf(child);
    if(i>=0){ a.splice(i,1); a.push(child); parent.dirty=true; }
  }

  // ---- parse colors
  function parseColor(str){
    if(!str || typeof str!=='string') return null;
    const s=str.trim().toLowerCase();
    if(s==='none' || s.startsWith('url(')) return null;
    if(s.startsWith('#')){
      const h=s.slice(1);
      const rgb = h.length===3
        ? h.split('').map(c=>parseInt(c+c,16))
        : [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
      return rgb.some(isNaN)?null:[rgb[0],rgb[1],rgb[2],1];
    }
    const m=s.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\)/);
    if(m) return [parseInt(m[1],10),parseInt(m[2],10),parseInt(m[3],10), m[4]!=null?parseFloat(m[4]):1];
    const ctx=document.createElement('canvas').getContext('2d'); ctx.fillStyle=s;
    const m2=ctx.fillStyle.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    return m2?[+m2[1],+m2[2],+m2[3], m2[4]!=null?+m2[4]:1]:null;
  }
  const luma = rgb => 0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2];
  const nearGray = (rgb,t=24)=> Math.abs(rgb[0]-rgb[1])<t && Math.abs(rgb[0]-rgb[2])<t && Math.abs(rgb[1]-rgb[2])<t;

  // ---- identify outlines (no pintables)
  function styleAndCollectOutlines(r){
    outlineSet = new Set();
    const ids = idsMap(r._objects ? r._objects : [r]);
    const gOutline = ids['body_x5F_clip'] || ids['outline'] || ids['outlines'] || null;

    const collectLeaves = (g) => { const arr=[]; walk([g],o=>{ if(o._objects&&o._objects.length) return; arr.push(o); }); return arr; };

    if (gOutline){
      collectLeaves(gOutline).forEach(o=>{
        outlineSet.add(o);
        if (hasStroke(o) || !hasFill(o)) {
          o.set({ fill:'none', stroke:'#111', strokeWidth:1.3, strokeLineCap:'round', strokeLineJoin:'round', strokeUniform:true, opacity:1 });
        } else {
          // tinta (pocos casos): forzamos negro
          o.set({ fill:'#111', stroke:null, strokeWidth:0, opacity:1 });
        }
        if(o.group) bringChildToTop(o.group,o);
      });
      const parent = gOutline.group || r; bringChildToTop(parent,gOutline);
    }

    // backup: todo objeto oscuro y pequeño se considera detalle de tinta
    leafs(r).forEach(o=>{
      if(outlineSet.has(o)) return;
      if(!hasFill(o) && hasStroke(o)){
        const srgb=parseColor(o.stroke)||[0,0,0,1];
        if(nearGray(srgb,28) && luma(srgb)<90){
          outlineSet.add(o);
          o.set({ fill:'none', stroke:'#111', strokeWidth:1.2, strokeLineCap:'round', strokeLineJoin:'round', strokeUniform:true });
          if(o.group) bringChildToTop(o.group,o);
        }
      }else if(hasFill(o)){
        const frgb=parseColor(o.fill);
        if(frgb && nearGray(frgb,24) && luma(frgb)<85){
          outlineSet.add(o);
          o.set({ fill:'#111', stroke:null, strokeWidth:0 });
          if(o.group) bringChildToTop(o.group,o);
        }
      }
    });
  }

  // ---- bucket building
  function buildBuckets(r){
    const ids = idsMap(r._objects ? r._objects : [r]);
    const A = ids['stripe1'] ? leafs(ids['stripe1']).filter(o=>!outlineSet.has(o)) : [];
    const B = ids['stripe2'] ? leafs(ids['stripe2']).filter(o=>!outlineSet.has(o)) : [];
    if (A.length && B.length){
      bucketA=A; bucketB=B; mode='ids';
      log(`✅ SVG cargado (modo <b>ids</b>) · A:${A.length} · B:${B.length} · outline:${outlineSet.size}`);
      return;
    }

    // Fallback muy sencillo por posición X para no mezclar
    const paintables = leafs(r).filter(o=>!outlineSet.has(o));
    const cx = o => (o.getBoundingRect(true,true).left + o.getBoundingRect(true,true).width/2);
    const median = paintables.map(cx).sort((a,b)=>a-b)[Math.floor(paintables.length/2)] || 0;
    bucketA = paintables.filter(o=>cx(o)<=median);
    bucketB = paintables.filter(o=>cx(o)> median);
    mode='auto';
    log(`✅ SVG cargado (modo <b>auto</b>) · A:${bucketA.length} · B:${bucketB.length} · outline:${outlineSet.size}`);
  }

  // ---- textures
  function loadImg(src){ return new Promise(res=>{ if(!src){res(null);return;} const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=()=>res(null); i.src=src; }); }
  function tintPattern(img, hex){
    if(!img) return hex;
    const S=512, off=document.createElement('canvas'); off.width=S; off.height=S;
    const ctx=off.getContext('2d');
    ctx.drawImage(img,0,0,S,S);
    ctx.globalCompositeOperation='multiply'; ctx.fillStyle=hex || '#ffffff'; ctx.fillRect(0,0,S,S);
    ctx.globalCompositeOperation='destination-over'; ctx.fillStyle='#fff'; ctx.fillRect(0,0,S,S);
    return new fabric.Pattern({ source: off, repeat: 'repeat' });
  }

  // ---- paint
  function paint(){
    if(!root) return;
    const colA = ui.colA.value || '#d9d9d9';
    const colB = ui.colB.value || '#c61a1a';
    const patA = tintPattern(ui.texA.value==='suede'?imgSuede:imgSmooth, colA);
    const patB = tintPattern(ui.texB.value==='suede'?imgSuede:imgSmooth, colB);

    bucketA.forEach(o=>{ if('fill' in o) o.set('fill', patA); else o.fill=patA; o.dirty=true; });
    bucketB.forEach(o=>{ if('fill' in o) o.set('fill', patB); else o.fill=patB; o.dirty=true; });

    // mantener contorno negro y arriba
    outlineSet.forEach(o=>{
      if(hasStroke(o) || !hasFill(o)) o.set({fill:'none', stroke:'#111'});
      else o.set({fill:'#111', stroke:null, strokeWidth:0});
      if(o.group) bringChildToTop(o.group,o);
      o.dirty=true;
    });

    canvas.requestRenderAll();
  }

  // ---- load textures and svg, then build/paint
  Promise.all([loadImg(TX.smooth), loadImg(TX.suede)]).then(([a,b])=>{ imgSmooth=a; imgSuede=b; });

  fabric.loadSVGFromURL(SVG, (objs, opts) => {
    root = fabric.util.groupSVGElements(objs, opts);
    fit(root);
    root.selectable=false; root.evented=false;
    canvas.add(root);

    styleAndCollectOutlines(root);
    buildBuckets(root);
    paint();
  }, (item, obj) => { obj.selectable=false; });

  // ---- events
  ['input','change'].forEach(ev=>{
    ui.colA.addEventListener(ev, paint);
    ui.colB.addEventListener(ev, paint);
    ui.texA.addEventListener(ev, paint);
    ui.texB.addEventListener(ev, paint);
  });

  ui.dl.addEventListener('click', ()=>{
    const data=canvas.toDataURL({format:'png', multiplier:1.75});
    const a=document.createElement('a'); a.href=data; a.download='bolso-preview.png'; a.click();
  });
})();