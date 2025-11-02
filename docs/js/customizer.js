(function(){
  // Rutas relativas para GitHub Pages (sirve igual en local)
  const ROOT = './';
  const TX = {
    smooth: ROOT + 'assets/textures/leather_smooth.jpg',
    suede:  ROOT + 'assets/textures/leather_suede.jpg',
  };
  const SVG = ROOT + 'assets/svg/bag_base.svg';

  const $ = (s,c=document)=>c.querySelector(s);
  const ui = {
    texA: $('#texA'), colA: $('#colA'),
    texB: $('#texB'), colB: $('#colB'),
    dl: $('#dl'), save: $('#save'),
    hidden: $('#spbc_config_json')
  };

  const canvas = new fabric.Canvas('cv', { selection:false, hoverCursor:'pointer' });

  let map = {};                 // objetos por id
  let imgSmooth=null, imgSuede=null;

  function loadImg(src){
    return new Promise((res,rej)=>{ const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=rej; i.src=src; });
  }

  function tintPattern(img, hex){
    const S=512, off=document.createElement('canvas'); off.width=S; off.height=S;
    const ctx=off.getContext('2d');
    ctx.drawImage(img,0,0,S,S);
    ctx.globalCompositeOperation='multiply'; ctx.fillStyle=hex||'#ffffff'; ctx.fillRect(0,0,S,S);
    ctx.globalCompositeOperation='destination-over'; ctx.fillStyle='#fff'; ctx.fillRect(0,0,S,S);
    return new fabric.Pattern({ source: off, repeat:'repeat' });
  }

  function walk(objs){
    objs.forEach(o=>{
      if (o.id) map[o.id]=o;
      if (o._objects) walk(o._objects);
    });
  }

  function setFillDeep(obj, fill){
    if (!obj) return;
    if (obj._objects && obj._objects.length){
      obj._objects.forEach(ch => setFillDeep(ch, fill));
    } else if ('fill' in obj) {
      obj.set('fill', fill);
    }
  }

  function texImg(key){ return key==='smooth' ? imgSmooth : imgSuede; }

  function apply(){
    if (!map['stripe1'] || !map['stripe2'] || !imgSmooth || !imgSuede) return;
    const patA = tintPattern(texImg(ui.texA.value), ui.colA.value);
    const patB = tintPattern(texImg(ui.texB.value), ui.colB.value);
    setFillDeep(map['stripe1'], patA);
    setFillDeep(map['stripe2'], patB);
    canvas.renderAll();
  }

  // Carga assets
  Promise.all([loadImg(TX.smooth), loadImg(TX.suede)]).then(([a,b])=>{
    imgSmooth=a; imgSuede=b; apply();
  });

  fabric.loadSVGFromURL(SVG, (objs, opt)=>{
    const group = fabric.util.groupSVGElements(objs, opt);
    group.selectable=false;
    canvas.add(group);
    walk(group._objects ? group._objects : [group]);
    apply();
  }, (item, obj)=>{ obj.selectable=false; });

  // UI
  ['change','input'].forEach(ev=>{
    ui.texA.addEventListener(ev, apply);
    ui.colA.addEventListener(ev, apply);
    ui.texB.addEventListener(ev, apply);
    ui.colB.addEventListener(ev, apply);
  });

  ui.dl.addEventListener('click', ()=>{
    const data = canvas.toDataURL({ format:'png', multiplier:1.5 });
    const a=document.createElement('a'); a.href=data; a.download='bolso-preview.png'; a.click();
  });

  ui.save.addEventListener('click', ()=>{
    const cfg = {
      model: 'bucket-01',
      stripe1: { texture: ui.texA.value, color: ui.colA.value },
      stripe2: { texture: ui.texB.value, color: ui.colB.value },
      version: '1.0.0'
    };
    ui.hidden.value = JSON.stringify(cfg);
    alert(ui.hidden.value); // muestra JSON
  });
})();