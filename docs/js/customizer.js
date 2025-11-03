// js/customizer.js
(function(){
  // --- RUTAS (relativas al index) ---
  const ROOT = './';
  const SVG  = ROOT + 'assets/svg/bag_base.svg';
  const TX   = {
    smooth: ROOT + 'assets/textures/leather_smooth.jpg',
    suede:  ROOT + 'assets/textures/leather_suede.jpg',
  };

  // --- UI ---
  const $=(s,c=document)=>c.querySelector(s);
  const ui={
    texA:$('#texA'), colA:$('#colA'),
    texB:$('#texB'), colB:$('#colB'),
    stitch:$('#stitchColor'),
    dl:$('#dl'), save:$('#save'), hidden:$('#spbc_config_json')
  };

  // --- Canvas ---
  const W=600,H=800;
  const canvas=new fabric.Canvas('cv',{selection:false});
  canvas.setWidth(W); canvas.setHeight(H);

  // helpers
  const fit=(g)=>{ const m=24,maxW=W-2*m,maxH=H-2*m; const w=g.width||g.getScaledWidth(),h=g.height||g.getScaledHeight();
    const s=Math.min(maxW/w,maxH/h); g.scale(s); g.set({left:(W-w*s)/2,top:(H-h*s)/2,selectable:false,evented:false}); };
  const walk=(arr,fn)=>{ (function rec(a){ a.forEach(o=>{ fn(o); if(o._objects&&o._objects.length) rec(o._objects); }); })(arr); };
  const leafs=(root)=>{ const out=[]; walk([root],o=>{ if(o._objects&&o._objects.length) return; if(o.type==='image') return; out.push(o); }); return out; };
  const byId=(root)=>{ const map={}; walk([root], o=>{ if(o.id) map[o.id]=o; }); return map; };
  const bringChildToTop=(parent,child)=>{ if(!parent||!parent._objects) return; const a=parent._objects,i=a.indexOf(child); if(i>=0){a.splice(i,1);a.push(child);parent.dirty=true;} };
  const hasStroke=o=>('stroke' in o) && o.stroke && o.stroke!=='none';
  const hasFill=o=>('fill' in o) && o.fill && o.fill!=='none';
  const applyFill=(o,mat)=>{ if('fill' in o) o.set('fill',mat); else o.fill=mat; };

  // texturas
  function loadImg(src){ return new Promise(res=>{ if(!src){res(null);return;} const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=()=>res(null); i.src=src; }); }
  function tintPattern(img,hex){
    if(!img) return hex||'#ffffff';
    const S=512, off=document.createElement('canvas'); off.width=S; off.height=S;
    const ctx=off.getContext('2d');
    ctx.drawImage(img,0,0,S,S);
    ctx.globalCompositeOperation='multiply'; ctx.fillStyle=hex||'#ffffff'; ctx.fillRect(0,0,S,S);
    ctx.globalCompositeOperation='destination-over'; ctx.fillStyle='#fff'; ctx.fillRect(0,0,S,S);
    return new fabric.Pattern({ source: off, repeat:'repeat' });
  }

  let imgSmooth=null, imgSuede=null;
  Promise.all([loadImg(TX.smooth), loadImg(TX.suede)]).then(([a,b])=>{ imgSmooth=a; imgSuede=b; });

  // buckets
  let bucketA=[], bucketB=[], stitchSet=new Set(), outlineSet=new Set();
  let rootGroup=null;

  function styleOutlines(g){
    outlineSet.clear();
    if(!g) return;
    const leaves = leafs(g);
    leaves.forEach(o=>{
      // contorno SIEMPRE negro y encima
      if(hasStroke(o) && !hasFill(o)){
        o.set({fill:'none', stroke:'#111', strokeWidth:1.4, strokeLineCap:'round', strokeLineJoin:'round', strokeUniform:true, opacity:1});
      }else{
        o.set({fill:'#111', stroke:null, strokeWidth:0, opacity:1});
      }
      if(o.group) bringChildToTop(o.group,o);
      outlineSet.add(o);
    });
    if(g.group) bringChildToTop(g.group, g);
  }

  function colorStitch(color){
    stitchSet.forEach(o=>{
      if(hasStroke(o)){ o.set({stroke:color, strokeUniform:true, opacity:1}); }
      else{ o.set({fill:color, opacity:1}); }
      if(o.group) bringChildToTop(o.group,o);
      o.dirty=true;
    });
  }

  function paint(){
    const colA=ui.colA.value||'#e6e6e6';
    const colB=ui.colB.value||'#c61a1a';
    const matA=tintPattern(ui.texA.value==='suede'?imgSuede:imgSmooth, colA);
    const matB=tintPattern(ui.texB.value==='suede'?imgSuede:imgSmooth, colB);

    bucketA.forEach(o=>{ applyFill(o,matA); o.dirty=true; });
    bucketB.forEach(o=>{ applyFill(o,matB); o.dirty=true; });

    // Reafirmar outline y costura
    colorStitch(ui.stitch.value || '#2a2a2a');

    canvas.requestRenderAll();
  }

  // Carga estricta por IDs
  fabric.loadSVGFromURL(SVG,(objs,opts)=>{
    rootGroup = fabric.util.groupSVGElements(objs,opts);
    fit(rootGroup); canvas.add(rootGroup);

    const ids = byId(rootGroup);
    const gA = ids['stripe1'];
    const gB = ids['stripe2'];
    const gOutline = ids['body_x5F_clip'] || ids['outline'] || null;
    const gStitch  = ids['stitch'] || null;

    if(!gA || !gB){
      console.warn('Faltan id="stripe1" y/o id="stripe2" en el SVG.');
      return;
    }

    bucketA = leafs(gA);
    bucketB = leafs(gB);

    styleOutlines(gOutline);

    stitchSet.clear();
    if(gStitch) leafs(gStitch).forEach(o=>stitchSet.add(o));

    console.log(`SVG listo · A:${bucketA.length} · B:${bucketB.length} · outline:${outlineSet.size} · stitch:${stitchSet.size}`);
    paint();
  },(item,obj)=>{ obj.selectable=false; });

  // UI
  ['change','input'].forEach(ev=>{
    ui.colA.addEventListener(ev, paint);
    ui.colB.addEventListener(ev, paint);
    ui.texA.addEventListener(ev, paint);
    ui.texB.addEventListener(ev, paint);
    ui.stitch.addEventListener(ev, paint);
  });

  ui.dl.addEventListener('click', ()=>{
    const data=canvas.toDataURL({format:'png',multiplier:1.5});
    const a=document.createElement('a'); a.href=data; a.download='bolso-preview.png'; a.click();
  });
  ui.save.addEventListener('click', ()=>{
    ui.hidden.value = JSON.stringify({
      model:'ids',
      A:{ texture: ui.texA.value, color: ui.colA.value },
      B:{ texture: ui.texB.value, color: ui.colB.value },
      C:{ stitch: ui.stitch.value },
      version:'1.0.0'
    });
    alert(ui.hidden.value);
  });
})();