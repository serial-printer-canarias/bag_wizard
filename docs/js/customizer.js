(function(){
  // --- Config ---
  const ROOT = './';
  const SVG  = ROOT + 'assets/svg/bag_base.svg';
  const TX = {
    smooth: ROOT + 'assets/textures/leather_smooth.jpg',
    suede:  ROOT + 'assets/textures/leather_suede.jpg',
  };

  // --- UI ---
  const $ = (s,c=document)=>c.querySelector(s);
  const ui = {
    texA: $('#texA'), colA: $('#colA'),
    texB: $('#texB'), colB: $('#colB'),
    dl: $('#dl'), save: $('#save'), hidden: $('#spbc_config_json')
  };

  // --- Canvas ---
  const W=600, H=800;
  const canvas = new fabric.Canvas('cv', { selection:false });
  canvas.setWidth(W); canvas.setHeight(H);

  // --- Debug overlay ---
  const dbg=document.createElement('div');
  Object.assign(dbg.style,{position:'fixed',top:'8px',right:'8px',background:'rgba(0,0,0,.8)',color:'#fff',
    padding:'8px 10px',font:'12px/1.35 system-ui,Segoe UI,Roboto,Arial',borderRadius:'10px',zIndex:9999,maxWidth:'48ch'});
  dbg.textContent='Cargando…'; document.body.appendChild(dbg);

  // --- Estado ---
  let mode='';               // 'ids' | 'auto'
  let bucketA=[], bucketB=[]; // arrays de hojas a pintar (solo fill)
  let imgSmooth=null, imgSuede=null;

  // --- Helpers ---
  function fit(g){
    const m=24,maxW=W-2*m,maxH=H-2*m;
    const w=g.width||g.getScaledWidth(),h=g.height||g.getScaledHeight();
    const s=Math.min(maxW/w,maxH/h);
    g.scale(s);
    g.set({left:(W-w*s)/2,top:(H-h*s)/2,selectable:false,evented:false});
  }
  function leaves(arr){
    const out=[]; (function rec(a){ a.forEach(o=>{ if(o._objects&&o._objects.length) rec(o._objects); else out.push(o); }); })(arr);
    return out;
  }
  function leavesFill(arr){
    return leaves(arr).filter(o => ('fill' in o) && o.fill && o.type!=='image');
  }
  function mapById(arr){
    const map={}; (function rec(a){ a.forEach(o=>{ if(o.id) map[o.id]=o; if(o._objects&&o._objects.length) rec(o._objects); }); })(arr); return map;
  }
  function normColor(c){
    if(!c) return null; const ctx=document.createElement('canvas').getContext('2d'); ctx.fillStyle=c; return ctx.fillStyle;
  }
  function keyFromRGB(rgb){
    if(!rgb) return null; const m=rgb.match(/\d+/g); if(!m) return null;
    const [r,g,b]=m.map(n=>parseInt(n,10)); const q=v=>Math.round(v/16)*16;
    return `rgb(${q(r)}, ${q(g)}, ${q(b)})`;
  }

  // --- Buckets por IDs (preferido)
  function buildBucketsById(root){
    const ids = mapById(root._objects?root._objects:[root]);
    if(ids['stripe1'] && ids['stripe2']){
      bucketA = leavesFill([ids['stripe1']]); // solo fill
      bucketB = leavesFill([ids['stripe2']]);
      dbg.innerHTML = `✅ SVG cargado (modo <b>ids</b>)<br>stripe1 (fill): ${bucketA.length}<br>stripe2 (fill): ${bucketB.length}`;
      mode='ids'; return true;
    }
    return false;
  }

  // --- Buckets AUTO (agrupa por color de fill, ignora strokes)
  function buildBucketsAuto(root){
    const all = leavesFill(root._objects?root._objects:[root]); // solo fill
    const map=new Map();
    all.forEach(o=>{
      const key=keyFromRGB(normColor(o.fill));
      if(!key) return;
      if(!map.has(key)) map.set(key,[]);
      map.get(key).push(o);
    });
    const top=[...map.entries()].sort((a,b)=>b[1].length-a[1].length).slice(0,2);
    bucketA = top[0]? top[0][1] : [];
    bucketB = top[1]? top[1][1] : [];
    const info=top.map(([k,v],i)=>`#${i+1} ${k} → ${v.length} objs`).join('<br>');
    dbg.innerHTML = `✅ SVG cargado (modo <b>auto</b>)<br>${info || 'No se detectaron fills'}`;
    mode='auto';
  }

  // --- Texturas sobre color (solo para fill) ---
  function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=()=>res(null); i.src=src; }); }
  function tintPattern(img, hex){
    if(!img) return hex;
    const S=512, off=document.createElement('canvas'); off.width=S; off.height=S;
    const ctx=off.getContext('2d');
    ctx.drawImage(img,0,0,S,S);
    ctx.globalCompositeOperation='multiply'; ctx.fillStyle=hex||'#ffffff'; ctx.fillRect(0,0,S,S);
    ctx.globalCompositeOperation='destination-over'; ctx.fillStyle='#fff'; ctx.fillRect(0,0,S,S);
    return new fabric.Pattern({ source: off, repeat:'repeat' });
  }

  // --- Pintado (fill solo; NO tocamos stroke = outline se mantiene) ---
  function paint(){
    const colA=ui.colA.value||'#e6e6e6', colB=ui.colB.value||'#c61a1a';
    const patA=tintPattern(ui.texA.value==='suede'?imgSuede:imgSmooth, colA);
    const patB=tintPattern(ui.texB.value==='suede'?imgSuede:imgSmooth, colB);

    const paintSet=(arr,pat)=>{ arr.forEach(o=>{ o.set('fill', pat); o.opacity=1; }); };
    paintSet(bucketA, patA);
    paintSet(bucketB, patB);
    canvas.requestRenderAll();
  }

  // --- Carga ---
  Promise.all([loadImg(TX.smooth), loadImg(TX.suede)]).then(([a,b])=>{ imgSmooth=a; imgSuede=b; });

  fabric.loadSVGFromURL(SVG,(objs,opts)=>{
    const root=fabric.util.groupSVGElements(objs,opts);
    fit(root); canvas.add(root);
    if(!buildBucketsById(root)) buildBucketsAuto(root);
    paint();
  },(item,obj)=>{ obj.selectable=false; });

  // --- Eventos ---
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