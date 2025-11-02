(function () {
  const ROOT = './';
  const SVG  = ROOT + 'assets/svg/bag_base.svg';

  const $ = (s,c=document)=>c.querySelector(s);
  const ui = {
    colA: $('#colA'), colB: $('#colB'),
    texA: $('#texA'), texB: $('#texB'),
    dl: $('#dl'), save: $('#save'), hidden: $('#spbc_config_json')
  };

  // --- panel debug en pantalla ---
  const dbg = document.createElement('div');
  dbg.style.position='fixed'; dbg.style.top='8px'; dbg.style.right='8px';
  dbg.style.background='rgba(0,0,0,.75)'; dbg.style.color='#fff';
  dbg.style.padding='8px 10px'; dbg.style.font='12px/1.3 system-ui,Segoe UI,Roboto,Arial';
  dbg.style.borderRadius='8px'; dbg.style.zIndex='9999'; dbg.style.maxWidth='42ch';
  dbg.innerHTML = '⏳ Cargando…';
  document.body.appendChild(dbg);

  const canvas = new fabric.Canvas('cv', { selection:false });
  const W=600,H=800; canvas.setWidth(W); canvas.setHeight(H);

  let rootGroup=null;
  let map={}; // id -> object

  function walk(objs){
    objs.forEach(o=>{
      if (o.id) map[o.id]=o;
      if (o._objects) walk(o._objects);
    });
  }
  function fillables(obj){
    let n=0, leaves=[];
    (function rec(o){
      if (o._objects && o._objects.length) { o._objects.forEach(rec); return; }
      const canFill = ('fill' in o) && o.type!=='image';
      if (canFill) { n++; leaves.push(o); }
    })(obj);
    return {n, leaves};
  }
  function setFillDeep(obj, value){
    if (!obj) return;
    if (obj._objects && obj._objects.length){
      obj._objects.forEach(ch => setFillDeep(ch, value));
    } else if ('fill' in obj && obj.type!=='image') {
      obj.set('fill', value);
    }
  }
  function fit(g){
    const m=24, maxW=W-2*m, maxH=H-2*m;
    const w=g.width||g.getScaledWidth(), h=g.height||g.getScaledHeight();
    const s=Math.min(maxW/w, maxH/h);
    g.scale(s);
    g.set({ left:(W-w*s)/2, top:(H-h*s)/2, selectable:false, evented:false });
  }
  function repaint(solid=false){
    const A = map['stripe1'], B = map['stripe2'];
    if(!A || !B) return;

    const colA = ui.colA.value || '#e6e6e6';
    const colB = ui.colB.value || '#c61a1a';

    // 1) prueba sólida (asegura que vemos cambio sí o sí)
    setFillDeep(A, solid ? '#00ff88' : colA);
    setFillDeep(B, solid ? '#ff66ff' : colB);

    canvas.requestRenderAll();
    const ca = fillables(A).n, cb = fillables(B).n;
    dbg.innerHTML = `
      ✅ SVG cargado<br>
      stripe1 (rellenable): <b>${ca}</b><br>
      stripe2 (rellenable): <b>${cb}</b><br>
      <small>${(ca+cb)==0 ? '⚠️ Dentro de stripe1/2 no hay formas con <code>fill</code> (son trazos/imágenes). Pon relleno en Illustrator o separa contorno a "outline".' : ''}</small>
      <div style="margin-top:6px">
        <button id="force">Forzar colores de test</button>
      </div>
    `;
    $('#force', dbg).onclick=()=>{ repaint(true); };
  }

  fabric.loadSVGFromURL(SVG, (objs, opts)=>{
    rootGroup = fabric.util.groupSVGElements(objs, opts);
    fit(rootGroup);
    canvas.add(rootGroup);
    walk(rootGroup._objects ? rootGroup._objects : [rootGroup]);

    if(!map['stripe1'] || !map['stripe2']){
      dbg.innerHTML = '❌ No encuentro <code>id="stripe1"</code> y/o <code>id="stripe2"</code> en tu SVG.<br>Renombra los grupos en Illustrator y vuelve a exportar.';
      return;
    }
    repaint(false);
  }, (item,obj)=>{ obj.selectable=false; });

  ['change','input'].forEach(ev=>{
    ui.colA.addEventListener(ev, ()=>repaint(false));
    ui.colB.addEventListener(ev, ()=>repaint(false));
    ui.texA.addEventListener(ev, ()=>repaint(false)); // ahora mismo no usamos textura
    ui.texB.addEventListener(ev, ()=>repaint(false));
  });

  ui.dl.addEventListener('click', ()=>{
    const data = canvas.toDataURL({ format:'png', multiplier:1.5 });
    const a=document.createElement('a'); a.href=data; a.download='bolso-preview.png'; a.click();
  });

  ui.save.addEventListener('click', ()=>{
    const cfg = {
      model: 'bucket-01',
      stripe1: { color: ui.colA.value, texture: ui.texA.value },
      stripe2: { color: ui.colB.value, texture: ui.texB.value },
      version: '1.0.0'
    };
    ui.hidden.value = JSON.stringify(cfg);
    alert(ui.hidden.value);
  });
})();