/* Tambour Wizard — 2 colores / 2 texturas / contorno fijo */
(function () {
  // --- Rutas (probar en este orden) ---
  const CANDIDATES = [
    'assets/svg/bag_base.svg',
    './assets/svg/bag_base.svg',
    'bag_base.svg',
    './bag_base.svg'
  ];
  const TX = {
    smooth: 'assets/textures/leather_smooth.jpg',
    suede:  'assets/textures/leather_suede.jpg',
  };

  // ---- UI ----
  const $=(s,c=document)=>c.querySelector(s);
  const ui={ texA:$('#texA'), colA:$('#colA'), texB:$('#texB'), colB:$('#colB'), dl:$('#dl') };

  const W=800,H=900;
  const canvas=new fabric.Canvas('cv',{selection:false});
  canvas.setWidth(W); canvas.setHeight(H);

  // ---- Debug overlay (visible hasta pulsar D) ----
  let dbgOn=true;
  const dbg=document.createElement('div');
  Object.assign(dbg.style,{position:'fixed',top:'10px',right:'10px',background:'rgba(0,0,0,.86)',color:'#fff',
    padding:'8px 10px',borderRadius:'12px',font:'12px/1.35 system-ui',zIndex:9999,display:'block',maxWidth:'48ch'});
  document.body.appendChild(dbg);
  const log=(t)=>{ dbg.innerHTML=t; dbg.style.display=dbgOn?'block':'none'; };
  window.addEventListener('keydown',e=>{ if(e.key.toLowerCase()==='d'){ dbgOn=!dbgOn; dbg.style.display=dbgOn?'block':'none'; } });

  // ---- helpers fabric ----
  function fit(g){
    const m=28, maxW=W-2*m, maxH=H-2*m;
    const w=g.width||g.getScaledWidth(), h=g.height||g.getScaledHeight();
    const s=Math.min(maxW/w, maxH/h);
    g.scale(s);
    g.set({left:(W-w*s)/2, top:(H-h*s)/2, selectable:false, evented:false});
  }
  function walk(arr,fn){ (function rec(a){ a.forEach(o=>{ fn(o); if(o._objects&&o._objects.length) rec(o._objects); }); })(arr); }
  const leafs=(r)=>{ const out=[]; walk([r],o=>{ if(o._objects&&o._objects.length) return; if(o.type==='image') return; out.push(o); }); return out; };
  const idsMap=(arr)=>{ const map={}; walk(arr,o=>{ if(o.id) map[o.id]=o; }); return map; };
  const hasFill=o=>('fill' in o)&&o.fill&&o.fill!=='none';
  const hasStroke=o=>('stroke' in o)&&o.stroke&&o.stroke!=='none';
  function bringChildToTop(parent, child){
    if(!parent||!parent._objects) return;
    const a=parent._objects, i=a.indexOf(child);
    if(i>=0){ a.splice(i,1); a.push(child); parent.dirty=true; }
  }

  // ---- estado ----
  let root=null, bucketA=[], bucketB=[], outlineSet=new Set();
  let imgSmooth=null, imgSuede=null;

  // ---- contorno fijo (id body_x5F_clip / outline / outlines) ----
  function styleAndCollectOutlines(r){
    outlineSet=new Set();
    const ids=idsMap(r._objects?r._objects:[r]);
    const gOutline = ids['body_x5F_clip'] || ids['outline'] || ids['outlines'] || null;
    if(gOutline){
      const leaves=[]; walk([gOutline],o=>{ if(o._objects&&o._objects.length) return; leaves.push(o); });
      leaves.forEach(o=>{
        outlineSet.add(o);
        if(hasStroke(o) || !hasFill(o)){
          o.set({fill:'none', stroke:'#111', strokeWidth:1.3, strokeLineCap:'round', strokeLineJoin:'round', strokeUniform:true, opacity:1});
        }else{
          o.set({fill:'#111', stroke:null, strokeWidth:0, opacity:1});
        }
        if(o.group) bringChildToTop(o.group,o);
      });
      const parent=gOutline.group||r; bringChildToTop(parent,gOutline);
    }
  }

  // ---- buckets A/B: SOLO ids stripe1/stripe2 ----
  function buildBuckets_ids(r){
    const ids=idsMap(r._objects?r._objects:[r]);
    const g1=ids['stripe1'], g2=ids['stripe2'];
    if(!g1 || !g2){
      log('❌ No encontré <g id="stripe1"> y/o <g id="stripe2"> en el SVG. Verifica nombres en Illustrator.');
      bucketA=[]; bucketB=[]; return false;
    }
    bucketA=leafs(g1).filter(o=>!outlineSet.has(o));
    bucketB=leafs(g2).filter(o=>!outlineSet.has(o));
    log(`✅ SVG cargado (ids) · stripe1:${bucketA.length} · stripe2:${bucketB.length} · outline:${outlineSet.size}`);
    return true;
  }

  // ---- texturas (opcional; si no cargan, pinta color liso) ----
  function loadImg(src){ return new Promise(res=>{ if(!src){res(null);return;} const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=()=>res(null); i.src=src; }); }
  function tintPattern(img,hex){
    if(!img) return hex;
    const S=512, off=document.createElement('canvas'); off.width=S; off.height=S;
    const ctx=off.getContext('2d');
    ctx.drawImage(img,0,0,S,S);
    ctx.globalCompositeOperation='multiply'; ctx.fillStyle=hex||'#ffffff'; ctx.fillRect(0,0,S,S);
    ctx.globalCompositeOperation='destination-over'; ctx.fillStyle='#fff'; ctx.fillRect(0,0,S,S);
    return new fabric.Pattern({ source: off, repeat:'repeat' });
  }

  function paint(){
    if(!root) return;
    const colA=ui.colA.value||'#d9d9d9';
    const colB=ui.colB.value||'#c61a1a';
    const patA=tintPattern(ui.texA.value==='suede'?imgSuede:imgSmooth, colA);
    const patB=tintPattern(ui.texB.value==='suede'?imgSuede:imgSmooth, colB);

    bucketA.forEach(o=>{ if('fill' in o) o.set('fill',patA); else o.fill=patA; o.dirty=true; });
    bucketB.forEach(o=>{ if('fill' in o) o.set('fill',patB); else o.fill=patB; o.dirty=true; });

    // Reafirmar contorno y llevarlo arriba
    outlineSet.forEach(o=>{
      if(hasStroke(o) || !hasFill(o)) o.set({fill:'none', stroke:'#111'});
      else o.set({fill:'#111', stroke:null, strokeWidth:0});
      if(o.group) bringChildToTop(o.group,o);
      o.dirty=true;
    });

    canvas.requestRenderAll();
  }

  // ---- cargar SVG (intenta varias rutas y muestra cuál funcionó) ----
  async function loadSVGText(){
    for(const p of CANDIDATES){
      try{
        const r=await fetch(p,{cache:'no-store'});
        if(r.ok){ const txt=await r.text(); return {txt,url:p}; }
      }catch(e){}
    }
    return null;
  }

  // ---- arranque ----
  (async ()=>{
    const [a,b] = await Promise.all([loadImg(TX.smooth), loadImg(TX.suede)]);
    imgSmooth=a; imgSuede=b;

    const hit = await loadSVGText();
    if(!hit){ log('❌ No se pudo cargar el SVG. Verifica que exista en assets/svg/bag_base.svg'); return; }
    log(`Cargando SVG desde: <b>${hit.url}</b>…`);

    fabric.loadSVGFromString(hit.txt, (objs, opts)=>{
      root=fabric.util.groupSVGElements(objs,opts);
      fit(root); canvas.add(root);
      styleAndCollectOutlines(root);
      buildBuckets_ids(root);
      paint();
    }, (item,obj)=>{ obj.selectable=false; });
  })();

  // ---- eventos UI ----
  ['input','change'].forEach(ev=>{
    ui.colA.addEventListener(ev, paint);
    ui.colB.addEventListener(ev, paint);
    ui.texA.addEventListener(ev, paint);
    ui.texB.addEventListener(ev, paint);
  });

  ui.dl.addEventListener('click', ()=>{
    const data=canvas.toDataURL({format:'png',multiplier:1.75});
    const a=document.createElement('a'); a.href=data; a.download='bolso-preview.png'; a.click();
  });
})();