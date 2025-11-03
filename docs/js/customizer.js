(function(){
  // -------- Config --------
  const ROOT = './';
  const SVG  = ROOT + 'assets/svg/bag_base.svg'; // tu SVG
  // Texturas opcionales (si no existen, funcionará con color sólido)
  const TX = {
    smooth: ROOT + 'assets/textures/leather_smooth.jpg',
    suede:  ROOT + 'assets/textures/leather_suede.jpg',
  };

  // -------- Utilidades DOM --------
  const $ = (s,c=document)=>c.querySelector(s);
  const ui = {
    texA: $('#texA'), colA: $('#colA'),
    texB: $('#texB'), colB: $('#colB'),
    dl: $('#dl'), save: $('#save'), hidden: $('#spbc_config_json')
  };

  // -------- Canvas --------
  const W=600, H=800;
  const canvas = new fabric.Canvas('cv', { selection:false });
  canvas.setWidth(W); canvas.setHeight(H);

  // -------- Overlay debug (ligero) --------
  const dbg=document.createElement('div');
  Object.assign(dbg.style,{position:'fixed',top:'8px',right:'8px',background:'rgba(0,0,0,.8)',color:'#fff',
    padding:'8px 10px',font:'12px/1.35 system-ui,Segoe UI,Roboto,Arial',borderRadius:'10px',zIndex:9999,maxWidth:'48ch'});
  dbg.textContent='Cargando…'; document.body.appendChild(dbg);

  // -------- Estado --------
  let mode = '';                // 'ids' | 'auto'
  let bucketA=[], bucketB=[];   // arrays de objetos a pintar
  let imgSmooth=null, imgSuede=null;

  // -------- Helpers Fabric/SVG --------
  function fit(g){
    const m=24, maxW=W-2*m, maxH=H-2*m;
    const w=g.width||g.getScaledWidth(), h=g.height||g.getScaledHeight();
    const s=Math.min(maxW/w, maxH/h);
    g.scale(s);
    g.set({ left:(W-w*s)/2, top:(H-h*s)/2, selectable:false, evented:false });
  }
  function leaves(objs){
    const out=[];
    (function rec(arr){ arr.forEach(o=>{ if(o._objects&&o._objects.length) rec(o._objects); else out.push(o); }); })(objs);
    return out;
  }
  function mapById(objs){
    const map={};
    (function rec(arr){ arr.forEach(o=>{ if(o.id) map[o.id]=o; if(o._objects&&o._objects.length) rec(o._objects); }); })(objs);
    return map;
  }

  // -------- Agrupación por color (modo AUTO) --------
  function normColor(c){
    if(!c) return null;
    const ctx=document.createElement('canvas').getContext('2d');
    ctx.fillStyle=c; return ctx.fillStyle; // rgb(r,g,b)
  }
  function keyFromRGB(rgb){
    if(!rgb) return null;
    const m=rgb.match(/\d+/g); if(!m) return null;
    const [r,g,b]=m.map(n=>parseInt(n,10));
    const q=v=>Math.round(v/16)*16; // tolerancia
    return `rgb(${q(r)}, ${q(g)}, ${q(b)})`;
  }
  function buildBucketsAuto(root){
    const all=leaves(root._objects?root._objects:[root]);
    const map=new Map();
    all.forEach(o=>{
      const base=('fill' in o && o.fill)? o.fill : (('stroke' in o && o.stroke)? o.stroke : null);
      const key=keyFromRGB(normColor(base));
      if(!key) return;
      if(!map.has(key)) map.set(key,[]);
      map.get(key).push(o);
    });
    const top=[...map.entries()].sort((a,b)=>b[1].length-a[1].length).slice(0,2);
    bucketA = top[0]? top[0][1] : [];
    bucketB = top[1]? top[1][1] : [];
    const info=top.map(([k,v],i)=>`#${i+1} ${k} → ${v.length} objs`).join('<br>');
    dbg.innerHTML = `✅ SVG cargado (modo <b>auto</b>)<br>${info || 'No se detectaron colores'}`;
    mode='auto';
  }

  // -------- Agrupación por IDs (preferido) --------
  function buildBucketsById(root){
    const ids = mapById(root._objects?root._objects:[root]);
    if (ids['stripe1'] && ids['stripe2']){
      bucketA = leaves([ids['stripe1']]);
      bucketB = leaves([ids['stripe2']]);
      dbg.innerHTML = `✅ SVG cargado (modo <b>ids</b>)<br>stripe1: ${bucketA.length} objs<br>stripe2: ${bucketB.length} objs`;
      mode='ids';
      return true;
    }
    return false;
  }

  // -------- Texturas --------
  function loadImg(src){
    return new Promise((res)=>{ const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=()=>res(null); i.src=src; });
  }
  function tintPattern(img, hex){
    if(!img) return hex; // si no hay textura, color sólido
    const S=512, off=document.createElement('canvas'); off.width=S; off.height=S;
    const ctx=off.getContext('2d');
    ctx.drawImage(img,0,0,S,S);
    ctx.globalCompositeOperation='multiply'; ctx.fillStyle = hex || '#ffffff'; ctx.fillRect(0,0,S,S);
    ctx.globalCompositeOperation='destination-over'; ctx.fillStyle='#fff'; ctx.fillRect(0,0,S,S);
    return new fabric.Pattern({ source: off, repeat:'repeat' });
  }

  // -------- Pintado --------
  function paint(){
    const colA = ui.colA.value || '#e6e6e6';
    const colB = ui.colB.value || '#c61a1a';
    const patA = tintPattern(ui.texA.value==='suede'?imgSuede:imgSmooth, colA);
    const patB = tintPattern(ui.texB.value==='suede'?imgSuede:imgSmooth, colB);

    const paintSet=(arr,pat,color)=>{
      arr.forEach(o=>{
        if('fill' in o && o.type!=='image') o.set('fill', pat);
        if('stroke' in o) o.set('stroke', color); // stroke a color sólido
        o.opacity=1;
      });
    };
    paintSet(bucketA, patA, colA);
    paintSet(bucketB, patB, colB);
    canvas.requestRenderAll();
  }

  // -------- Carga todo --------
  Promise.all([loadImg(TX.smooth), loadImg(TX.suede)]).then(([a,b])=>{ imgSmooth=a; imgSuede=b; });

  fabric.loadSVGFromURL(SVG, (objs,opts)=>{
    const root = fabric.util.groupSVGElements(objs, opts);
    fit(root); canvas.add(root);

    if (!buildBucketsById(root)) buildBucketsAuto(root);
    paint(); // pinta al cargar
  }, (item,obj)=>{ obj.selectable=false; });

  // -------- Eventos UI --------
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