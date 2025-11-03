(function(){
  const ROOT='./';
  const SVG = ROOT+'assets/svg/bag_base.svg';
  const TX  = {
    smooth: ROOT+'assets/textures/leather_smooth.jpg',
    suede:  ROOT+'assets/textures/leather_suede.jpg',
  };

  const $=(s,c=document)=>c.querySelector(s);
  const ui={
    texA:$('#texA'), colA:$('#colA'),
    texB:$('#texB'), colB:$('#colB'),
    dl:$('#dl'), save:$('#save'), hidden:$('#spbc_config_json')
  };

  const W=600,H=800;
  const canvas=new fabric.Canvas('cv',{selection:false});
  canvas.setWidth(W); canvas.setHeight(H);

  // overlay debug
  const dbg=document.createElement('div');
  Object.assign(dbg.style,{position:'fixed',top:'8px',right:'8px',background:'rgba(0,0,0,.85)',color:'#fff',
    padding:'8px 10px',font:'12px/1.35 system-ui,Segoe UI,Roboto,Arial',borderRadius:'10px',zIndex:9999,maxWidth:'48ch'});
  dbg.textContent='Cargando…'; document.body.appendChild(dbg);

  // estado
  let bucketA=[], bucketB=[], mode='auto';
  let imgSmooth=null, imgSuede=null;

  // helpers
  function fit(g){
    const m=24,maxW=W-2*m,maxH=H-2*m;
    const w=g.width||g.getScaledWidth(),h=g.height||g.getScaledHeight();
    const s=Math.min(maxW/w,maxH/h);
    g.scale(s);
    g.set({left:(W-w*s)/2,top:(H-h*s)/2,selectable:false,evented:false});
  }
  function walk(arr,fn){ (function rec(a){ a.forEach(o=>{ fn(o); if(o._objects&&o._objects.length) rec(o._objects); }); })(arr); }
  function leafs(root){ const out=[]; walk([root], o=>{ if(o._objects&&o._objects.length) return; if(o.type==='image') return; out.push(o); }); return out; }
  function getW(o){ return typeof o.getScaledWidth==='function'? o.getScaledWidth(): (o.width||0); }
  function getH(o){ return typeof o.getScaledHeight==='function'? o.getScaledHeight(): (o.height||0); }
  function areaOf(o){ return Math.max(0, getW(o)*getH(o)); }

  // color utils
  function parseColor(str){
    if(!str) return null;
    if(typeof str!=='string') return null;
    const s=str.trim().toLowerCase();
    if(s==='none' || s.startsWith('url(')) return null;
    if(s.startsWith('#')){
      const h=s.slice(1);
      const rgb = h.length===3
        ? h.split('').map(c=>parseInt(c+c,16))
        : [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
      return rgb.some(isNaN)?null:rgb;
    }
    const m=s.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if(m) return [parseInt(m[1],10),parseInt(m[2],10),parseInt(m[3],10)];
    const ctx=document.createElement('canvas').getContext('2d'); ctx.fillStyle=s;
    const m2=ctx.fillStyle.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m2?[+m2[1],+m2[2],+m2[3]]:null;
  }
  const luma=rgb=>0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2];
  const nearGray=([r,g,b],tol=22)=>Math.abs(r-g)<tol&&Math.abs(r-b)<tol&&Math.abs(g-b)<tol;

  // outline = solo stroke oscuro/gris fino
  function isOutline(o){
    const hasFill = ('fill' in o) && o.fill && o.fill!=='none';
    const sw = ('strokeWidth' in o) ? (o.strokeWidth||0) : 0;
    const sRGB = ('stroke' in o) ? parseColor(o.stroke) : null;
    const dark = sRGB && (luma(sRGB)<70) && nearGray(sRGB,22);
    return !hasFill && dark && sw<=3;
  }

  // tomamos base de color (fill si existe, si no stroke)
  function baseColor(o){
    const f = (('fill' in o) && o.fill && o.fill!=='none') ? parseColor(o.fill) : null;
    const s = (('stroke' in o) && o.stroke && o.stroke!=='none') ? parseColor(o.stroke) : null;
    return f || s || null;
  }
  function keyFromRGB(arr){ if(!arr) return null; const q=v=>Math.round(v/16)*16; const [r,g,b]=arr; return `rgb(${q(r)}, ${q(g)}, ${q(b)})`; }

  // texturas
  function loadImg(src){ return new Promise(res=>{ if(!src){res(null);return;} const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=()=>res(null); i.src=src; }); }
  function tintPattern(img, hex){
    if(!img) return hex;
    const S=512, off=document.createElement('canvas'); off.width=S; off.height=S;
    const ctx=off.getContext('2d');
    ctx.drawImage(img,0,0,S,S);
    ctx.globalCompositeOperation='multiply'; ctx.fillStyle=hex||'#ffffff'; ctx.fillRect(0,0,S,S);
    ctx.globalCompositeOperation='destination-over'; ctx.fillStyle='#fff'; ctx.fillRect(0,0,S,S);
    return new fabric.Pattern({ source: off, repeat:'repeat' });
  }
  function applyFill(o, material){ if('fill' in o) o.set('fill',material); else o.fill=material; }

  // pintado
  function paint(){
    const colA=ui.colA.value||'#e6e6e6', colB=ui.colB.value||'#c61a1a';
    const patA=tintPattern(ui.texA.value==='suede'?imgSuede:imgSmooth, colA);
    const patB=tintPattern(ui.texB.value==='suede'?imgSuede:imgSmooth, colB);
    bucketA.forEach(o=>{ applyFill(o, patA); o.dirty=true; });
    bucketB.forEach(o=>{ applyFill(o, patB); o.dirty=true; });
    canvas.requestRenderAll();
  }

  // build AUTO (dominantes por área) – ignoramos ids a propósito
  function buildBucketsAuto(root){
    const all = leafs(root).filter(o=>!isOutline(o));
    if(all.length===0){
      dbg.innerHTML='⚠️ No hay objetos pintables (todo son imágenes o solo trazo).';
      bucketA=[]; bucketB=[]; return;
    }
    const byKey=new Map(), areaSum=new Map();
    all.forEach(o=>{
      const key=keyFromRGB(baseColor(o)); if(!key) return;
      if(!byKey.has(key)){ byKey.set(key,[]); areaSum.set(key,0); }
      byKey.get(key).push(o); areaSum.set(key, areaSum.get(key)+Math.max(1,areaOf(o)));
    });
    const keys=[...byKey.keys()].sort((a,b)=>(areaSum.get(b)||0)-(areaSum.get(a)||0));
    bucketA = keys[0]? byKey.get(keys[0]) : [];
    bucketB = keys[1]? byKey.get(keys[1]) : [];
    const info=keys.slice(0,2).map((k,i)=>`#${i+1} ${k} → ${byKey.get(k)?.length||0} objs, área≈${Math.round(areaSum.get(k)||0)}`).join('<br>');
    dbg.innerHTML=`✅ SVG cargado (modo <b>auto</b>)<br>${info||'No se detectaron colores'}`;
  }

  // carga
  Promise.all([loadImg(TX.smooth), loadImg(TX.suede)]).then(([a,b])=>{ imgSmooth=a; imgSuede=b; });

  fabric.loadSVGFromURL(SVG,(objs,opts)=>{
    const root=fabric.util.groupSVGElements(objs,opts);
    // asegurar que los paths tengan al menos fill transparente si venían sin fill
    walk(objs, o=>{
      if(o.type==='path' && (!o.fill || o.fill==='none')) o.fill='rgba(0,0,0,0)'; // habilita fill para poder pintarlo
    });

    fit(root); canvas.add(root);
    buildBucketsAuto(root); // AUTO forzado
    paint();
  },(item,obj)=>{ obj.selectable=false; });

  // UI
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
      mode:'auto',
      A:{ texture: ui.texA.value, color: ui.colA.value },
      B:{ texture: ui.texB.value, color: ui.colB.value },
      version:'1.0.0'
    });
    alert(ui.hidden.value);
  });
})();