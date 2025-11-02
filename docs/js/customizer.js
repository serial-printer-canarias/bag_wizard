(function () {
  // ---------- rutas ----------
  const ROOT = './';
  const SVG  = ROOT + 'assets/svg/bag_base.svg';
  const TX   = {
    smooth: ROOT + 'assets/textures/leather_smooth.jpg',
    suede:  ROOT + 'assets/textures/leather_suede.jpg',
  };

  // ---------- UI ----------
  const $ = (s,c=document)=>c.querySelector(s);
  const ui = {
    texA: $('#texA'), colA: $('#colA'),
    texB: $('#texB'), colB: $('#colB'),
    dl: $('#dl'), save: $('#save'), hidden: $('#spbc_config_json')
  };

  // ---------- canvas ----------
  const CANVAS_W = 600, CANVAS_H = 800;
  const canvas = new fabric.Canvas('cv', { selection:false });
  canvas.setWidth(CANVAS_W); canvas.setHeight(CANVAS_H);

  // ---------- estado ----------
  let imgSmooth=null, imgSuede=null;
  let idMap = {};          // { id: fabric.Object }
  let rootGroup = null;

  // ---------- helpers ----------
  function loadImg(src){
    return new Promise((res, rej)=>{
      const i=new Image(); i.crossOrigin='anonymous';
      i.onload=()=>res(i); i.onerror=(e)=>{console.warn('No carga', src, e); res(null);};
      i.src=src;
    });
  }
  function walk(objs){
    objs.forEach(o=>{
      if (o.id) idMap[o.id]=o;
      if (o._objects) walk(o._objects);
    });
  }
  function setFillDeep(obj, fill){
    if (!obj) return;
    if (obj._objects && obj._objects.length){
      obj._objects.forEach(ch => setFillDeep(ch, fill));
    } else if ('fill' in obj){
      obj.set('fill', fill);
    }
  }
  function tintPattern(img, hex){
    if (!img) return hex; // fallback color sólido
    const S=512, off=document.createElement('canvas');
    off.width=S; off.height=S;
    const ctx=off.getContext('2d');
    ctx.drawImage(img,0,0,S,S);
    ctx.globalCompositeOperation='multiply';
    ctx.fillStyle = hex || '#ffffff';
    ctx.fillRect(0,0,S,S);
    ctx.globalCompositeOperation='destination-over';
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,S,S);
    return new fabric.Pattern({ source: off, repeat:'repeat' });
  }
  function paint(){
    const stripe1 = idMap['stripe1'];
    const stripe2 = idMap['stripe2'];
    if (!stripe1 || !stripe2) return;

    const patA = tintPattern(ui.texA.value==='suede' ? imgSuede : imgSmooth, ui.colA.value);
    const patB = tintPattern(ui.texB.value==='suede' ? imgSuede : imgSmooth, ui.colB.value);

    setFillDeep(stripe1, patA);
    setFillDeep(stripe2, patB);
    canvas.requestRenderAll();
  }
  function fitAndCenter(g){
    // Escala el SVG para que quepa en el canvas con margen
    const margin = 24;
    const maxW = CANVAS_W - margin*2;
    const maxH = CANVAS_H - margin*2;
    const w = g.width  || g.getScaledWidth();
    const h = g.height || g.getScaledHeight();
    const scale = Math.min(maxW / w, maxH / h);
    g.scale(scale);
    g.set({
      left: (CANVAS_W - w*scale)/2,
      top:  (CANVAS_H - h*scale)/2,
      selectable:false, evented:false
    });
  }

  // ---------- carga ----------
  Promise.all([loadImg(TX.smooth), loadImg(TX.suede)]).then(([a,b])=>{
    imgSmooth=a; imgSuede=b; paint();
  });

  fabric.loadSVGFromURL(SVG, (objects, options)=>{
    rootGroup = fabric.util.groupSVGElements(objects, options);
    fitAndCenter(rootGroup);
    canvas.add(rootGroup);
    walk(rootGroup._objects ? rootGroup._objects : [rootGroup]);

    if (!idMap['stripe1'] || !idMap['stripe2']) {
      console.warn('IDs no encontrados. Asegúrate de tener id="stripe1" y id="stripe2" en tu SVG.');
    }
    paint();
  }, (item,obj)=>{ obj.selectable=false; });

  // ---------- eventos ----------
  ['change','input'].forEach(ev=>{
    ui.texA.addEventListener(ev, paint);
    ui.colA.addEventListener(ev, paint);
    ui.texB.addEventListener(ev, paint);
    ui.colB.addEventListener(ev, paint);
  });
  ui.dl.addEventListener('click', ()=>{
    const data = canvas.toDataURL({ format:'png', multiplier:1.5 });
    const a=document.createElement('a'); a.href=data; a.download='bolso-preview.png'; a.click();
  });
  ui.save.addEventListener('click', ()=>{
    const cfg = {
      model:'bucket-01',
      stripe1:{ texture: ui.texA.value, color: ui.colA.value },
      stripe2:{ texture: ui.texB.value, color: ui.colB.value },
      version:'1.0.0'
    };
    ui.hidden.value = JSON.stringify(cfg);
    alert(ui.hidden.value);
  });
})();