(function(){
  // ---------- Config ----------
  const ROOT='./';
  const SVG = ROOT+'assets/svg/bag_base.svg';
  const TX  = {
    smooth: ROOT+'assets/textures/leather_smooth.jpg', // opcional
    suede:  ROOT+'assets/textures/leather_suede.jpg',  // opcional
  };

  // ---------- UI ----------
  const $=(s,c=document)=>c.querySelector(s);
  const ui={
    texA:$('#texA'), colA:$('#colA'),
    texB:$('#texB'), colB:$('#colB'),
    dl:$('#dl'), save:$('#save'), hidden:$('#spbc_config_json')
  };

  // ---------- Canvas ----------
  const W=600,H=800;
  const canvas=new fabric.Canvas('cv',{selection:false});
  canvas.setWidth(W); canvas.setHeight(H);

  // Debug overlay
  const dbg=document.createElement('div');
  Object.assign(dbg.style,{position:'fixed',top:'8px',right:'8px',background:'rgba(0,0,0,.8)',color:'#fff',
    padding:'8px 10px',font:'12px/1.35 system-ui,Segoe UI,Roboto,Arial',borderRadius:'10px',zIndex:9999,maxWidth:'48ch'});
  dbg.textContent='Cargando…'; document.body.appendChild(dbg);

  // ---------- Estado ----------
  let mode='';                 // 'ids' | 'auto'
  let bucketA=[], bucketB=[];  // objetos a pintar
  let imgSmooth=null, imgSuede=null;

  // ---------- Utils ----------
  function fit(g){
    const m=24,maxW=W-2*m,maxH=H-2*m;
    const w=g.width||g.getScaledWidth(),h=g.height||g.getScaledHeight();
    const s=Math.min(maxW/w,maxH/h);
    g.scale(s);
    g.set({left:(W-w*s)/2,top:(H-h*s)/2,selectable:false,evented:false});
  }
  function walk(arr,fn){ (function rec(a){ a.forEach(o=>{ fn(o); if(o._objects&&o._objects.length) rec(o._objects); }); })(arr); }
  function idsMap(arr){ const map={}; walk(arr,o=>{ if(o.id) map[o.id]=o; }); return map; }

  function getW(o){ return typeof o.getScaledWidth==='function'? o.getScaledWidth(): (o.width||0); }
  function getH(o){ return typeof o.getScaledHeight==='function'? o.getScaledHeight(): (o.height||0); }
  function areaOf(o){ return Math.max(0, getW(o)*getH(o)); }

  function cssColor(c){ if(!c) return null; const ctx=document.createElement('canvas').getContext('2d'); ctx.fillStyle=c; return ctx.fillStyle; }
  function rgbParts(rgb){ const m=rgb && rgb.match(/\d+/g); return m? m.map(n=>parseInt(n,10)) : null; }
  function luma(rgb){ const p=rgbParts(rgb)||[0,0,0]; const [r,g,b]=p; return 0.2126*r+0.7152*g+0.0722*b; }
  function nearGray(rgb, tol=18){ const p=rgbParts(rgb)||[0,0,0]; const [r,g,b]=p; return Math.abs(r-g)<tol && Math.abs(r-b)<tol && Math.abs(g-b)<tol; }
  function isOutline(o){
    // Consideramos outline si NO tiene fill visible, tiene stroke casi negro/gris oscuro y fino
    const hasFill = ('fill' in o) && o.fill && o.fill!=='none';
    const stroke  = ('stroke' in o) ? cssColor(o.stroke) : null;
    const sw      = ('strokeWidth' in o)? (o.strokeWidth||0) : 0;
    const dark    = stroke && (luma(stroke) < 70) && nearGray(stroke,22);
    return !hasFill && dark && sw <= 3;
  }
  function paintableLeafs(root){
    const out=[];
    walk([root], o=>{
      if(o._objects&&o._objects.length) return;
      if(o.type==='image') return;    // ignorar raster
      if(isOutline(o)) return;        // no tocar outline
      out.push(o);
    });
    return out;
  }

  // baseColor = color para agrupar (si no hay fill, usamos stroke)
  function baseColor(o){
    const f = (('fill' in o) && o.fill && o.fill!=='none') ? cssColor(o.fill) : null;
    const s = (('stroke' in o) && o.stroke && o.stroke!=='none') ? cssColor(o.stroke) : null;
    return f || s || null;
  }
  function keyFromRGB(rgb){ const p=rgbParts(rgb); if(!p) return null; const [r,g,b]=p; const q=v=>Math.round(v/16)*16; return `rgb(${q(r)}, ${q(g)}, ${q(b)})`; }

  // ---------- Texturas ----------
  function loadImg(src){ return new Promise(res=>{ if(!src){res(null);return;} const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=()=>res(null); i.src=src; }); }
  function tintPattern(img, hex){
    if(!img) return hex; // sin textura → color sólido
    const S=512, off=document.createElement('canvas'); off.width=S; off.height=S;
    const ctx=off.getContext('2d');
    ctx.drawImage(img,0,0,S,S);
    ctx.globalCompositeOperation='multiply'; ctx.fillStyle=hex||'#ffffff'; ctx.fillRect(0,0,S,S);
    ctx.globalCompositeOperation='destination-over'; ctx.fillStyle='#fff'; ctx.fillRect(0,0,S,S);
    return new fabric.Pattern({ source: off, repeat:'repeat' });
  }

  // ---------- Buckets ----------
  function buildBucketsById(root){
    const ids=idsMap(root._objects?root._objects:[root]);
    if(ids['stripe1'] && ids['stripe2']){
      const A = paintableLeafs(ids['stripe1']);
      const B = paintableLeafs(ids['stripe2']);
      bucketA=A; bucketB=B;
      mode='ids';
      dbg.innerHTML=`✅ SVG cargado (modo <b>ids</b>)<br>stripe1: ${A.length} objs<br>stripe2: ${B.length} objs`;
      return true;
    }
    return false;
  }

  function buildBucketsAuto(root){
    const all = paintableLeafs(root._objects?root._objects:[root]);
    if(all.length===0){
      mode='auto'; bucketA=[]; bucketB=[];
      dbg.innerHTML='⚠️ Modo <b>auto</b>: no hay objetos pintables (todo son imágenes o outline).';
      return;
    }

    // agrupar por color base (fill o stroke), ordenar por área acumulada
    const byKey=new Map(), areaSum=new Map();
    all.forEach(o=>{
      const key=keyFromRGB(baseColor(o)); if(!key) return;
      if(!byKey.has(key)){ byKey.set(key,[]); areaSum.set(key,0); }
      byKey.get(key).push(o);
      areaSum.set(key, areaSum.get(key)+areaOf(o));
    });
    const keys=[...byKey.keys()].sort((a,b)=>(areaSum.get(b)||0)-(areaSum.get(a)||0));
    bucketA=keys[0]?byKey.get(keys[0]):[];
    bucketB=keys[1]?byKey.get(keys[1]):[];
    mode='auto';
    const info=keys.slice(0,2).map((k,i)=>`#${i+1} ${k} → ${byKey.get(k)?.length||0} objs, área≈${Math.round(areaSum.get(k)||0)}`).join('<br>');
    dbg.innerHTML=`✅ SVG cargado (modo <b>auto</b>)<br>${info || 'No se detectaron colores'}`;
  }

  // ---------- Pintado (solo fill; si no tenía fill, lo creamos) ----------
  function applyFill(o, material){
    if('fill' in o) o.set('fill', material);
    else o.fill = material;
  }

  function paint(){
    const colA=ui.colA.value||'#e6e6e6', colB=ui.colB.value||'#c61a1a';
    const patA=tintPattern(ui.texA.value==='suede'?imgSuede:imgSmooth, colA);
    const patB=tintPattern(ui.texB.value==='suede'?imgSuede:imgSmooth, colB);
    bucketA.forEach(o=>{ applyFill(o, patA); o.dirty=true; });
    bucketB.forEach(o=>{ applyFill(o, patB); o.dirty=true; });
    canvas.requestRenderAll();
  }

  // ---------- Carga ----------
  Promise.all([loadImg(TX.smooth), loadImg(TX.suede)]).then(([a,b])=>{ imgSmooth=a; imgSuede=b; });

  fabric.loadSVGFromURL(SVG,(objs,opts)=>{
    const root=fabric.util.groupSVGElements(objs,opts);
    fit(root); canvas.add(root);

    // 1) ids, 2) auto
    if(!buildBucketsById(root)) buildBucketsAuto(root);
    paint();
  },(item,obj)=>{ obj.selectable=false; });

  // ---------- UI ----------
  ['change','input'].forEach(ev=>{
    ui.colA.addEventListener(ev, paint);
    ui.colB.addEventListener(ev, paint);
    ui.texA.addEventListener(ev, paint);
    ui.texB.addEventListener(ev, paint);
  });

  ui.dl.addEventListener('click', ()=>{
    const data=canvas.toDataURL({format:'png',multiplier:1.5});
    const a=document.createElement('a'); a.href=data; a.download='bolso-preview.png'; a.click();
  });
  ui.save.addEventListener('click', ()=>{
    ui.hidden.value = JSON.stringify({
      model:'bucket-01',
      mode,
      A:{ texture: ui.texA.value, color: ui.colA.value },
      B:{ texture: ui.texB.value, color: ui.colB.value },
      version:'1.0.0'
    });
    alert(ui.hidden.value);
  });
})();