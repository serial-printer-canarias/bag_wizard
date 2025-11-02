(function () {
  const ROOT = './';
  const SVG  = ROOT + 'assets/svg/bag_base.svg';

  const $ = (s,c=document)=>c.querySelector(s);

  // UI
  const ui = {
    colA: $('#colA'), colB: $('#colB'),
    texA: $('#texA'), texB: $('#texB'),
    dl: $('#dl'), save: $('#save'), hidden: $('#spbc_config_json')
  };

  // Canvas
  const W=600, H=800;
  const canvas = new fabric.Canvas('cv', { selection:false });
  canvas.setWidth(W); canvas.setHeight(H);

  // Estado
  let root=null, map={}; // id -> fabric object

  // -------- helpers ----------
  function walk(objs){
    objs.forEach(o=>{
      if (o.id) map[o.id]=o;
      if (o._objects) walk(o._objects);
    });
  }
  function fit(g){
    const m=24, maxW=W-2*m, maxH=H-2*m;
    const w=g.width||g.getScaledWidth(), h=g.height||g.getScaledHeight();
    const s=Math.min(maxW/w, maxH/h);
    g.scale(s);
    g.set({ left:(W-w*s)/2, top:(H-h*s)/2, selectable:false, evented:false });
  }
  function setFillDeep(obj, value){
    if (!obj) return;
    if (obj._objects && obj._objects.length){
      obj._objects.forEach(ch => setFillDeep(ch, value));
    } else if ('fill' in obj && obj.type!=='image') {
      obj.set('fill', value);
    }
  }
  function repaintSolid(){
    const A = map['stripe1'], B = map['stripe2'];
    if(!A || !B) return;
    setFillDeep(A, ui.colA.value || '#e6e6e6');
    setFillDeep(B, ui.colB.value || '#c61a1a');
    canvas.requestRenderAll();
  }
  function repaintTest(){ // verde / fucsia estridentes
    const A = map['stripe1'], B = map['stripe2'];
    if(!A || !B) return;
    setFillDeep(A, '#00ff88');
    setFillDeep(B, '#ff33cc');
    canvas.requestRenderAll();
  }

  // Debug overlay (ligero)
  const dbg = document.createElement('div');
  Object.assign(dbg.style, {
    position:'fixed', top:'8px', right:'8px', background:'rgba(0,0,0,.78)',
    color:'#fff', padding:'8px 10px', font:'12px/1.35 system-ui,Segoe UI,Roboto,Arial',
    borderRadius:'10px', zIndex:9999, maxWidth:'44ch', pointerEvents:'auto'
  });
  dbg.innerHTML = '⏳ Cargando…';
  document.body.appendChild(dbg);

  function updateDebug(){
    function countFillables(obj){
      let n=0; (function rec(o){
        if (o._objects && o._objects.length) { o._objects.forEach(rec); return; }
        if ('fill' in o && o.type!=='image') n++;
      })(obj);
      return n;
    }
    const a = map['stripe1'] ? countFillables(map['stripe1']) : 0;
    const b = map['stripe2'] ? countFillables(map['stripe2']) : 0;
    dbg.innerHTML = `
      ✅ SVG cargado<br>
      stripe1 (rellenable): <b>${a}</b><br>
      stripe2 (rellenable): <b>${b}</b><br>
      <div style="margin-top:6px">
        <button id="force" style="padding:6px 10px;border-radius:6px;border:0;background:#ffd400;color:#000;cursor:pointer">Forzar colores de test</button>
      </div>
    `;
  }

  // Captura el click al botón SIEMPRE (iOS/Safari included)
  document.addEventListener('click', function(ev){
    const t = ev.target;
    if (t && t.id === 'force') {
      ev.preventDefault(); ev.stopPropagation();
      repaintTest();
    }
  }, true);

  // Carga SVG
  fabric.loadSVGFromURL(SVG, (objs, opts)=>{
    root = fabric.util.groupSVGElements(objs, opts);
    fit(root);
    canvas.add(root);
    walk(root._objects ? root._objects : [root]);

    if(!map['stripe1'] || !map['stripe2']){
      dbg.innerHTML = '❌ No encuentro <code>id="stripe1"</code> / <code>id="stripe2"</code> en el SVG.';
      return;
    }
    updateDebug();
    repaintSolid(); // pinta con los pickers al cargar
  }, (item, obj)=>{ obj.selectable=false; });

  // Eventos UI
  ['change','input'].forEach(ev=>{
    ui.colA.addEventListener(ev, repaintSolid);
    ui.colB.addEventListener(ev, repaintSolid);
    // (texA/texB aún no se usan; reactivaremos cuando pongamos texturas)
  });

  // Descargar / JSON
  ui.dl.addEventListener('click', ()=>{
    const data = canvas.toDataURL({ format:'png', multiplier:1.5 });
    const a=document.createElement('a'); a.href=data; a.download='bolso-preview.png'; a.click();
  });
  ui.save.addEventListener('click', ()=>{
    const cfg = {
      model: 'bucket-01',
      stripe1: { color: ui.colA.value, texture: ui.texA.value },
      stripe2: { color: ui.colB.value, texture: ui.texB.value },
      version:'1.0.0'
    };
    ui.hidden.value = JSON.stringify(cfg);
    alert(ui.hidden.value);
  });
})();