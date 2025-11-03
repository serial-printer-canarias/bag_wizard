(function(){
  // --- Config ---
  const ROOT = './';
  const SVG  = ROOT + 'assets/svg/bag_base.svg';
  const TX = {
    smooth: ROOT + 'assets/textures/leather_smooth.jpg',
    suede:  ROOT + 'assets/textures/leather_suede.jpg',
  };

  // Filtros para modo AUTO (quitan motas/ruido)
  const AUTO_FILTERS = {
    MIN_AREA_1: 250,   // px^2 (tras escalar) primer intento
    MIN_LUMA_1: 35,    // luminancia mínima (0..255)
    MIN_AREA_2: 40,    // fallback relajado si no encuentra 2 grupos
    MIN_LUMA_2: 0
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
  let mode='';                // 'ids' | 'auto'
  let bucketA=[], bucketB=[]; // hojas a pintar (solo fill)
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
  function leavesFill(arr){ // SOLO objetos con fill (ignora strokes e imágenes)
    return leaves(arr).filter(o => ('fill' in o) && o.fill && o.type!=='image');
  }
  function mapById(arr){
    const map={}; (function rec(a){ a.forEach(o=>{ if(o.id) map[o.id]=o; if(o._objects&&o._objects.length) rec(o._objects); }); })(arr); return map;
  }
  function normColor(c){
    if(!c) return null; const ctx=document.createElement('canvas').getContext('2d'); ctx.fillStyle=c; return ctx.fillStyle;
  }
  function rgbParts(rgb){
    const m=rgb && rgb.match(/\d+/g); if(!m) return null; return m.map(n=>parseInt(n,10));
  }
  function luma(rgb){ const p=rgbParts(rgb); if(!p) return 0; const [r,g,b]=p; return 0.2126*r+0.7152*g+0.0722*b; }
  function keyFromRGB(rgb){ // agrupa por color aprox (cuantiza /16)
    const p=rgbParts(rgb); if(!p) return null; const [r,g,b]=p;
    const q=v=>Math.round(v/16)*16;
    return `rgb(${q(r)}, ${q(g)}, ${q(b)})`;
  }
  function areaOf(o){
    const w = typeof o.getScaledWidth==='function' ? o.getScaledWidth() : (o.width||0);
    const h = typeof o.getScaledHeight==='function'? o.getScaledHeight(): (o.height||0);
    return Math.max(0, w*h);
  }

  // --- Buckets por IDs (preferido)
  function buildBucketsById(root){
    const ids = mapById(root._objects?root._objects:[root]);
    if(ids['stripe1'] && ids['stripe2']){
      bucketA = leavesFill([ids['stripe1']]);
      bucketB = leavesFill([ids['stripe2']]);
      dbg.innerHTML = `✅ SVG cargado (modo <b>ids</b>)<br>stripe1 (fill): ${bucketA.length}<br>stripe2 (fill): ${bucketB.length}`;
      mode='ids'; return true;
    }
    return false;
  }

  // --- Buckets AUTO (agrupa por color de fill + filtros de área y luminosidad) ---
  function buildBucketsAuto(root){
    function compute(minArea, minLuma){
      const all = leavesFill(root._objects?root._objects:[root])
        .filter(o => areaOf(o) >= minArea)                       // quita motas pequeñas
        .filter(o => luma(normColor(o.fill)) >= minLuma);        // quita casi-negros (ruido/outline)

      const byKey=new Map(), areaSum=new Map();
      all.forEach(o=>{
        const key=keyFromRGB(normColor(o.fill)); if(!key) return;
        if(!byKey.has(key)) { byKey.set(key,[]); areaSum.set(key,0); }
        byKey.get(key).push(o);
        areaSum.set(key, areaSum.get(key)+areaOf(o));
      });

      // Top 2 por ÁREA total (mejor que por cantidad)
      const top=[...byKey.keys()]
            .sort((a,b)=> (areaSum.get(b)||0)-(areaSum.get(a)||0))
            .slice(0,2);
      return {
        A: top[0]? byKey.get(top[0]) : [],
        B: top[1]? byKey.get(top[1]) : [],
        info: top.map((k,i)=>`#${i+1} ${k} → ${byKey.get(k)?.length||0} objs, área≈${Math.round(areaSum.get(k)||0)}`).join('<br>')
      };
    }

    // 1º intento (fuerte)
    let res = compute(AUTO_FILTERS.MIN_AREA_1, AUTO_FILTERS.MIN_LUMA_1);
    // fallback si no logramos 2 grupos
    if(res.A.length===0 || res.B.length===0){
      res = compute(AUTO_FILTERS.MIN_AREA_2, AUTO_FILTERS.MIN_LUMA_2);
      dbg.innerHTML = `✅ SVG cargado (modo <b>auto</b> · fallback)<br>${res.info || 'No se detectaron fills'}`;
    } else {
      dbg.innerHTML = `✅ SVG cargado (modo <b>auto</b>)<br>${res.info || 'No se detectaron fills'}`;
    }
    bucketA = res.A; bucketB = res.B; mode='auto';
  }

  // --- Texturas sobre color (solo fill) ---
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

  // --- Pintado (fill solo; NO tocamos stroke) ---
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
    if(!buildBucketsById(root)) buildBucketsAuto(root); // IDs o AUTO con filtros
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