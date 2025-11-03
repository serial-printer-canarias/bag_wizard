(function(){
  // --- Config ---
  const ROOT = './';
  const SVG  = ROOT + 'assets/svg/bag_base.svg';
  // Texturas opcionales (si no existen, se usa color sólido)
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

  // --- Overlay debug ---
  const dbg=document.createElement('div');
  Object.assign(dbg.style,{position:'fixed',top:'8px',right:'8px',background:'rgba(0,0,0,.8)',color:'#fff',
    padding:'8px 10px',font:'12px/1.35 system-ui,Segoe UI,Roboto,Arial',borderRadius:'10px',zIndex:9999,maxWidth:'48ch'});
  dbg.textContent='Cargando…'; document.body.appendChild(dbg);

  // --- Estado ---
  let stripeA=[], stripeB=[]; // hojas con FILL de stripe1/stripe2
  let imgSmooth=null, imgSuede=null;

  // --- Helpers ---
  function fit(g){
    const m=24,maxW=W-2*m,maxH=H-2*m;
    const w=g.width||g.getScaledWidth(),h=g.height||g.getScaledHeight();
    const s=Math.min(maxW/w,maxH/h);
    g.scale(s);
    g.set({left:(W-w*s)/2,top:(H-h*s)/2,selectable:false,evented:false});
  }
  function walk(arr, fn){
    (function rec(a){ a.forEach(o=>{ fn(o); if(o._objects&&o._objects.length) rec(o._objects); }); })(arr);
  }
  function idsMap(arr){
    const map={}; walk(arr, o=>{ if(o.id) map[o.id]=o; }); return map;
  }
  function leafFillArray(root){
    const out=[];
    walk([root], o=>{
      if(o._objects&&o._objects.length) return;
      if(('fill' in o) && o.type!=='image') out.push(o); // SOLO fill (no stroke)
    });
    return out;
  }

  // Texturas sobre color (para FILL)
  function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=()=>res(null); i.src=src; }); }
  function tintPattern(img, hex){
    if(!img) return hex; // si no hay textura, usamos color sólido
    const S=512, off=document.createElement('canvas'); off.width=S; off.height=S;
    const ctx=off.getContext('2d');
    ctx.drawImage(img,0,0,S,S);
    ctx.globalCompositeOperation='multiply'; ctx.fillStyle=hex||'#ffffff'; ctx.fillRect(0,0,S,S);
    ctx.globalCompositeOperation='destination-over'; ctx.fillStyle='#fff'; ctx.fillRect(0,0,S,S);
    return new fabric.Pattern({ source: off, repeat:'repeat' });
  }

  // Pintado (SOLO fill; NO tocamos stroke → outline intacto)
  function paint(){
    const colA=ui.colA.value||'#e6e6e6';
    const colB=ui.colB.value||'#c61a1a';
    const patA=tintPattern(ui.texA.value==='suede'?imgSuede:imgSmooth, colA);
    const patB=tintPattern(ui.texB.value==='suede'?imgSuede:imgSmooth, colB);

    stripeA.forEach(o=>{ o.set('fill', patA); o.dirty=true; });
    stripeB.forEach(o=>{ o.set('fill', patB); o.dirty=true; });
    canvas.requestRenderAll();
  }

  // Carga texturas (opcional)
  Promise.all([loadImg(TX.smooth), loadImg(TX.suede)]).then(([a,b])=>{ imgSmooth=a; imgSuede=b; });

  // Carga SVG y construye stripes por IDs (mismo tratamiento para ambos)
  fabric.loadSVGFromURL(SVG,(objs,opts)=>{
    const root=fabric.util.groupSVGElements(objs,opts);
    fit(root); canvas.add(root);

    const ids = idsMap(root._objects?root._objects:[root]);
    const g1 = ids['stripe1'];
    const g2 = ids['stripe2'];

    if(!g1 || !g2){
      dbg.innerHTML = '❌ Faltan <code>id="stripe1"</code> y/o <code>id="stripe2"</code> en el SVG.';
      return;
    }

    // Recogemos SOLO hojas con FILL dentro de cada stripe
    stripeA = leafFillArray(g1);
    stripeB = leafFillArray(g2);

    dbg.innerHTML = `✅ SVG cargado (modo <b>ids</b>)<br>stripe1 (fill): <b>${stripeA.length}</b><br>stripe2 (fill): <b>${stripeB.length}</b>`;
    paint(); // pinta al cargar
  }, (item,obj)=>{ obj.selectable=false; });

  // Eventos UI
  ['change','input'].forEach(ev=>{
    ui.colA.addEventListener(ev, paint);
    ui.colB.addEventListener(ev, paint);
    ui.texA.addEventListener(ev, paint);
    ui.texB.addEventListener(ev, paint);
  });

  // Utilidades de preview/JSON
  ui.dl.addEventListener('click', ()=>{
    const data=canvas.toDataURL({format:'png',multiplier:1.5});
    const a=document.createElement('a'); a.href=data; a.download='bolso-preview.png'; a.click();
  });

  ui.save.addEventListener('click', ()=>{
    ui.hidden.value = JSON.stringify({
      model:'bucket-01',
      A:{ texture: ui.texA.value, color: ui.colA.value },
      B:{ texture: ui.texB.value, color: ui.colB.value },
      version:'1.0.0'
    });
    alert(ui.hidden.value);
  });
})();