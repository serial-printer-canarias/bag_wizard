(function(){
  const ROOT='./';
  const SVG = ROOT+'assets/svg/bag_base.svg';
  const TX  = {
    smooth: ROOT+'assets/textures/leather_smooth.jpg',
    suede:  ROOT+'assets/textures/leather_suede.jpg',
  };

  const $=(s,c=document)=>c.querySelector(s);
  const ui={
    texA:$('#texA'), colA:$('#colA'),
    texB:$('#texB'), colB:$('#colB'),
    stitch: $('#stitchColor'),
    dl:$('#dl'), save:$('#save'), hidden:$('#spbc_config_json')
  };

  const W=600,H=800;
  const cvEl = document.getElementById('cv');
  const canvas=new fabric.Canvas('cv',{selection:false});
  canvas.setWidth(W); canvas.setHeight(H);

  // Debug
  const dbg=document.createElement('div');
  Object.assign(dbg.style,{position:'fixed',top:'8px',right:'8px',background:'rgba(0,0,0,.85)',color:'#fff',
    padding:'8px 10px',font:'12px/1.35 system-ui,Segoe UI,Roboto,Arial',borderRadius:'10px',zIndex:9999,maxWidth:'48ch'});
  dbg.textContent='Cargando…'; document.body.appendChild(dbg);

  let mode=''; // 'ids' | 'auto-mix' | 'auto-geom'
  let bucketA=[], bucketB=[];
  let outlineSet=new Set();
  let stitchSet=new Set();
  let imgSmooth=null, imgSuede=null;

  // ---------- helpers ----------
  // ⬇️ NUEVO: iguala el tamaño interno del canvas al tamaño visible
  function syncCanvasSize(){
    const w = Math.max(1, cvEl.clientWidth || W);
    const h = Math.max(1, cvEl.clientHeight || H);
    canvas.setDimensions({ width:w, height:h }, { backstoreOnly:false });
  }

  // ⬇️ REESCRITO: encaja usando viewport (NO escala el grupo)
  function fit(g){
    if(!g) return;
    // Medimos el grupo en coordenadas "mundo" (sin viewport)
    const oldVPT = canvas.viewportTransform ? canvas.viewportTransform.slice() : [1,0,0,1,0,0];
    canvas.setViewportTransform([1,0,0,1,0,0]);
    canvas.renderAll();
    g.setCoords();
    const b = g.getBoundingRect(true,true); // incluye strokes/transforms
    // Restauramos VPT antes de calcular zoom
    canvas.setViewportTransform(oldVPT);

    const CW = canvas.getWidth(), CH = canvas.getHeight();
    const m = Math.round(Math.min(CW,CH)*0.04); // ~4% de margen
    const availW = Math.max(1, CW - 2*m);
    const availH = Math.max(1, CH - 2*m);

    const bw = Math.max(1, b.width);
    const bh = Math.max(1, b.height);
    const zoom = Math.min(availW / bw, availH / bh);

    const cx = CW/2, cy = CH/2;
    const bx = b.left + b.width/2;
    const by = b.top  + b.height/2;

    // VPT = [zoom,0,0,zoom, tx, ty] centrando el grupo
    const tx = cx - bx*zoom;
    const ty = cy - by*zoom;
    canvas.setViewportTransform([zoom,0,0,zoom,tx,ty]);
    canvas.requestRenderAll();
  }

  function walk(arr,fn){ (function rec(a){ a.forEach(o=>{ fn(o); if(o._objects&&o._objects.length) rec(o._objects); }); })(arr); }
  function leafs(root){ const out=[]; walk([root], o=>{ if(o._objects&&o._objects.length) return; if(o.type==='image') return; out.push(o); }); return out; }
  function idsMap(arr){ const map={}; walk(arr,o=>{ if(o.id) map[o.id]=o; }); return map; }
  function bringChildToTop(parent, child){
    if(!parent || !parent._objects) return;
    const arr=parent._objects, idx=arr.indexOf(child);
    if(idx>=0){ arr.splice(idx,1); arr.push(child); parent.dirty=true; }
  }

  const getW=o=>typeof o.getScaledWidth==='function'?o.getScaledWidth(): (o.width||0);
  const getH=o=>typeof o.getScaledHeight==='function'?o.getScaledHeight(): (o.height||0);
  const bboxArea=o=>Math.max(1,getW(o)*getH(o));
  const centerX=o=>{ const r=o.getBoundingRect(true,true); return r.left + r.width/2; };

  // ---------- color ----------
  function parseColor(str){
    if(!str || typeof str!=='string') return null;
    const s=str.trim().toLowerCase();
    if(s==='none' || s.startsWith('url(')) return null;
    if(s.startsWith('#')){
      const h=s.slice(1);
      const rgb = h.length===3
        ? h.split('').map(c=>parseInt(c+c,16))
        : [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
      return rgb.some(isNaN)?null:[rgb[0],rgb[1],rgb[2],1];
    }
    const m=s.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\)/);
    if(m) return [parseInt(m[1],10),parseInt(m[2],10),parseInt(m[3],10), m[4]!=null?parseFloat(m[4]):1];
    const ctx=document.createElement('canvas').getContext('2d'); ctx.fillStyle=s;
    const m2=ctx.fillStyle.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    return m2?[+m2[1],+m2[2],+m2[3], m2[4]!=null?+m2[4]:1]:null;
  }
  const luma=rgb=>0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2];
  const nearGray=([r,g,b],tol=22)=>Math.abs(r-g)<tol&&Math.abs(r-b)<tol&&Math.abs(g-b)<tol;
  function hasVisibleFill(o){
    if(!('fill' in o) || !o.fill) return false;
    if(o.fill==='none') return false;
    const c=parseColor(o.fill); if(!c) return false;
    const a=c[3]==null?1:c[3];
    return a>0.02;
  }
  function hasStroke(o){ return ('stroke' in o) && o.stroke && o.stroke!=='none'; }
  function isOutlineStroke(o){
    if(hasVisibleFill(o)) return false;
    if(!hasStroke(o)) return false;
    const sRGB=parseColor(o.stroke);
    const sw=('strokeWidth' in o)?(o.strokeWidth||0):0;
    return sRGB && nearGray(sRGB,30) && luma(sRGB)<85 && sw<=4;
  }
  function isInkDetail(o, areaRoot){
    if(!hasVisibleFill(o)) return false;
    const rgb=parseColor(o.fill);
    if(!rgb) return false;
    if(!(nearGray(rgb,28) && luma(rgb)<90)) return false; // oscuro
    const a=bboxArea(o);
    return a <= areaRoot*0.02;
  }

  // ---------- clustering ----------
  function rgb2hsv([r,g,b]){
    r/=255; g/=255; b/=255;
    const max=Math.max(r,g,b), min=Math.min(r,g,b);
    const d=max-min; let h=0;
    if(d!==0){ if(max===r) h=((g-b)/d)%6; else if(max===g) h=(b-r)/d+2; else h=(r-g)/d+4; h*=60; if(h<0) h+=360; }
    const s=max===0?0:d/max, v=max;
    return [h,s,v];
  }
  function baseRGB(o){
    if(hasVisibleFill(o)){ const c=parseColor(o.fill); return c?[c[0],c[1],c[2]]:null; }
    if(hasStroke(o)){ const s=parseColor(o.stroke); return s?[s[0],s[1],s[2]]:null; }
    return null;
  }
  function areaMetric(o){ return hasVisibleFill(o) ? bboxArea(o) : Math.max(1,(o.strokeWidth||1)*5); }

  function kmeans2_mix(objs){
    if(objs.length<=2) return {A:objs,B:[]};
    const weightHue=1.0, weightPos=0.6;

    const items = objs.map(o=>{
      const rgb=baseRGB(o);
      let hx=0, hy=0;
      if(rgb){
        const [h,s,v]=rgb2hsv(rgb);
        if(!(s<0.18 || v<0.28)){ const rad=h*Math.PI/180; hx=Math.cos(rad)*weightHue; hy=Math.sin(rad)*weightHue; }
      }
      const x=centerX(o);
      return {o,hx,hy,x,w:areaMetric(o)};
    });

    const xs=items.map(i=>i.x);
    const minX=Math.min(...xs), maxX=Math.max(...xs) || (minX+1);
    items.forEach(i=>{ i.p=((i.x-minX)/(maxX-minX))*weightPos; });

    let c1={hx:0,hy:0,p:Math.min(...items.map(i=>i.p))};
    let c2={hx:0,hy:0,p:Math.max(...items.map(i=>i.p))};
    const dist=(a,b)=>{ const dx=a.hx-b.hx, dy=a.hy-b.hy, dp=a.p-b.p; return dx*dx+dy*dy+dp*dp; };
    const mean=arr=>{ const W=arr.reduce((s,i)=>s+i.w,0)||1;
      return {hx:arr.reduce((s,i)=>s+i.hx*i.w,0)/W, hy:arr.reduce((s,i)=>s+i.hy*i.w,0)/W, p:arr.reduce((s,i)=>s+i.p*i.w,0)/W}; };

    for(let it=0; it<10; it++){
      const A=[],B=[]; items.forEach(i=>{ (dist(i,c1)<=dist(i,c2)?A:B).push(i); });
      if(!A.length || !B.length){
        const median=items.map(i=>i.p).sort((a,b)=>a-b)[Math.floor(items.length/2)];
        const A2=items.filter(i=>i.p<=median), B2=items.filter(i=>i.p>median);
        return {A:A2.map(i=>i.o), B:B2.map(i=>i.o)};
      }
      const n1=mean(A), n2=mean(B);
      if(Math.abs(n1-c1)<1e-3 && Math.abs(n2-c2)<1e-3 &&
         Math.abs(n1.hx-c1.hx)<1e-3 && Math.abs(n2.hx-c2.hx)<1e-3 &&
         Math.abs(n1.hy-c1.hy)<1e-3 && Math.abs(n2.hy-c2.hy)<1e-3) break;
      c1=n1; c2=n2;
    }
    const A=[],B=[]; items.forEach(i=>{ (dist(i,c1)<=dist(i,c2)?A:B).push(i); });
    return {A:A.map(i=>i.o), B:B.map(i=>i.o)};
  }
  function kmeans2X(objs){
    if(objs.length<=2) return [objs,[]];
    const xs=objs.map(o=>centerX(o));
    let c1=Math.min(...xs), c2=Math.max(...xs);
    for(let i=0;i<8;i++){
      const A=[],B=[]; objs.forEach((o,idx)=>{ (Math.abs(xs[idx]-c1)<=Math.abs(xs[idx]-c2)?A:B).push(o); });
      const mean=arr=>arr.length?arr.reduce((s,o)=>s+centerX(o),0)/arr.length:0;
      const n1=mean(A), n2=mean(B);
      if(Math.abs(n1-c1)<0.5 && Math.abs(n2-c2)<0.5) break; c1=n1; c2=n2;
    }
    const A=[],B=[]; objs.forEach(o=>{ (Math.abs(centerX(o)-c1)<=Math.abs(centerX(o)-c2)?A:B).push(o); });
    return [A,B];
  }

  // texturas
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
  const applyFill=(o,mat)=>{ if('fill' in o) o.set('fill',mat); else o.fill=mat; };

  // --------- OUTLINE ----------
  function styleAndCollectOutlines(root){
    outlineSet=new Set();
    const areaRoot = (root.getScaledWidth?.()||getW(root)) * (root.getScaledHeight?.()||getH(root)) || (W*H);

    const ids=idsMap(root._objects?root._objects:[root]);
    const gOutline = ids['body_x5F_clip'] || ids['outline'] || ids['outlines'] || null;
    if(gOutline){
      const leaves=[]; walk([gOutline], o=>{ if(o._objects&&o._objects.length) return; leaves.push(o); });
      leaves.forEach(o=>{
        outlineSet.add(o);
        if(hasStroke(o) || !hasVisibleFill(o)){
          o.set({fill:'none', stroke:'#111', strokeWidth:1.4, strokeLineCap:'round', strokeLineJoin:'round', strokeUniform:true, opacity:1});
        }else{
          o.set({fill:'#111', stroke:null, strokeWidth:0, opacity:1});
        }
        if(o.group) bringChildToTop(o.group,o);
      });
      const parent = gOutline.group || root; bringChildToTop(parent, gOutline);
    }

    leafs(root).forEach(o=>{
      if(outlineSet.has(o)) return;
      if(isOutlineStroke(o) || isInkDetail(o, areaRoot)){
        outlineSet.add(o);
        if(isOutlineStroke(o)){
          o.set({fill:'none', stroke:'#111', strokeWidth:1.4, strokeLineCap:'round', strokeLineJoin:'round', strokeUniform:true, opacity:1});
        }else{
          o.set({fill:'#111', stroke:null, strokeWidth:0, opacity:1});
        }
        if(o.group) bringChildToTop(o.group,o);
      }
    });
  }

  // --------- STITCH ----------
  function collectStitch(root){
    stitchSet = new Set();
    const ids=idsMap(root._objects?root._objects:[root]);
    const gStitch = ids['stitch'] || ids['costura'] || ids['seams'] || ids['stitching'] || null;
    if(!gStitch) return;

    const leaves = leafs(gStitch);
    leaves.forEach(o=>{
      stitchSet.add(o);
      o.set({
        fill: 'none',
        stroke: ui.stitch?.value || '#2a2a2a',
        strokeWidth: 1.4,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        strokeUniform: true,
        opacity: 1
      });
      if(o.group) bringChildToTop(o.group,o);
    });
    const parent = gStitch.group || root; bringChildToTop(parent, gStitch);
  }

  // --------- buckets ----------
  function buildBuckets(root){
    const allLeaves = leafs(root);
    const paintables = allLeaves.filter(o=>!outlineSet.has(o) && !stitchSet.has(o));
    const ids=idsMap(root._objects?root._objects:[root]);
    if(ids['stripe1'] && ids['stripe2']){
      const A=leafs(ids['stripe1']).filter(o=>!outlineSet.has(o) && !stitchSet.has(o));
      const B=leafs(ids['stripe2']).filter(o=>!outlineSet.has(o) && !stitchSet.has(o));
      if(A.length>=5 && B.length>=5){
        bucketA=A; bucketB=B; mode='ids';
        dbg.innerHTML=`✅ SVG cargado (modo <b>ids</b>) · stripe1: ${A.length} · stripe2: ${B.length} · stitch: ${stitchSet.size} · outline: ${outlineSet.size}`;
        return;
      }
    }
    const mix=kmeans2_mix(paintables);
    if(mix.A.length && mix.B.length){
      bucketA=mix.A; bucketB=mix.B; mode='auto-mix';
      dbg.innerHTML=`✅ SVG cargado (modo <b>auto-mix</b>) · A: ${bucketA.length} · B: ${bucketB.length} · stitch: ${stitchSet.size} · outline: ${outlineSet.size}`;
      return;
    }
    const [AX,BX]=kmeans2X(paintables);
    bucketA=AX; bucketB=BX; mode='auto-geom';
    dbg.innerHTML=`✅ SVG cargado (modo <b>auto-geom</b>) · A: ${AX.length} · B: ${BX.length} · stitch: ${stitchSet.size} · outline: ${outlineSet.size}`;
  }

  // --------- pintado ----------
  function paint(){
    const colA=ui.colA.value||'#e6e6e6', colB=ui.colB.value||'#c61a1a';
    const patA=tintPattern(ui.texA.value==='suede'?imgSuede:imgSmooth, colA);
    const patB=tintPattern(ui.texB.value==='suede'?imgSuede:imgSmooth, colB);

    bucketA.forEach(o=>{ applyFill(o, patA); o.dirty=true; });
    bucketB.forEach(o=>{ applyFill(o, patB); o.dirty=true; });

    outlineSet.forEach(o=>{
      if(hasStroke(o) || !hasVisibleFill(o)){
        o.set({fill:'none', stroke:'#111'});
      }else{
        o.set({fill:'#111', stroke:null, strokeWidth:0});
      }
      if(o.group) bringChildToTop(o.group,o);
      o.dirty=true;
    });

    if(ui.stitch){
      const sc = ui.stitch.value || '#2a2a2a';
      stitchSet.forEach(o=>{
        o.set({ fill:'none', stroke: sc, opacity:1 });
        if(o.group) bringChildToTop(o.group,o);
        o.dirty=true;
      });
    }

    canvas.requestRenderAll();
  }

  Promise.all([loadImg(TX.smooth), loadImg(TX.suede)]).then(([a,b])=>{ imgSmooth=a; imgSuede=b; });

  let rootRef = null;

  fabric.loadSVGFromURL(SVG,(objs,opts)=>{
    const root=fabric.util.groupSVGElements(objs,opts);
    rootRef = root;

    // 1) igualamos tamaño al visible
    syncCanvasSize();
    // 2) añadimos el grupo SIN escalarlo
    canvas.add(root);
    // 3) detectores y buckets
    collectStitch(root);
    styleAndCollectOutlines(root);
    buildBuckets(root);
    paint();
    // 4) encaje por viewport al tamaño actual
    fit(root);
  },(item,obj)=>{ obj.selectable=false; });

  // UI
  ['change','input'].forEach(ev=>{
    ui.colA.addEventListener(ev, paint);
    ui.colB.addEventListener(ev, paint);
    ui.texA.addEventListener(ev, paint);
    ui.texB.addEventListener(ev, paint);
    if(ui.stitch) ui.stitch.addEventListener(ev, paint);
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
      C:{ texture:'none', color: ui.stitch ? ui.stitch.value : '#2a2a2a' },
      version:'1.0.1'
    });
    alert(ui.hidden.value);
  });

  // === Responsive: refit cuando cambie el tamaño visible del canvas ===
  if('ResizeObserver' in window){
    const ro = new ResizeObserver(()=>{
      syncCanvasSize();
      if (rootRef) fit(rootRef);
    });
    ro.observe(cvEl);
  }
  window.addEventListener('resize', ()=>{
    syncCanvasSize();
    if (rootRef) fit(rootRef);
  });
})();