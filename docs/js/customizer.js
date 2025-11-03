(function(){
  const ROOT = './';
  const SVG  = ROOT + 'assets/svg/bag_base.svg';

  // texturas
  const TX = {
    smooth: ROOT + 'assets/textures/leather_smooth.jpg',
    suede:  ROOT + 'assets/textures/leather_suede.jpg',
  };

  const $=(s,c=document)=>c.querySelector(s);
  const ui={
    texA:$('#texA'), colA:$('#colA'),
    texB:$('#texB'), colB:$('#colB'),
    stitch:$('#stitchColor'),
    dl:$('#dl'), save:$('#save'), hidden:$('#spbc_config_json')
  };

  const W=600,H=800;
  const canvas=new fabric.Canvas('cv',{selection:false});
  canvas.setWidth(W); canvas.setHeight(H);

  // Debug badge
  const badge=document.createElement('div');
  Object.assign(badge.style,{position:'fixed',top:'8px',right:'8px',background:'rgba(0,0,0,.85)',color:'#fff',
    padding:'8px 10px',font:'12px/1.35 system-ui,Segoe UI,Roboto,Arial',borderRadius:'10px',zIndex:9999,maxWidth:'48ch'});
  badge.textContent='Cargando…'; document.body.appendChild(badge);

  // helpers
  const fit=g=>{
    const m=24,maxW=W-2*m,maxH=H-2*m;
    const w=g.width||g.getScaledWidth(),h=g.height||g.getScaledHeight();
    const s=Math.min(maxW/w,maxH/h);
    g.scale(s); g.set({left:(W-w*s)/2,top:(H-h*s)/2,selectable:false,evented:false});
  };
  const walk=(arr,fn)=>{(function rec(a){a.forEach(o=>{fn(o); if(o._objects&&o._objects.length) rec(o._objects);});})(arr)};
  const leafs=root=>{const out=[]; walk([root],o=>{ if(o._objects&&o._objects.length) return; if(o.type==='image') return; out.push(o);}); return out;};
  const idsMap=arr=>{const map={}; walk(arr,o=>{ if(o.id) map[o.id]=o;}); return map;};
  const bringTop=(parent,child)=>{ if(!parent||!parent._objects) return; const i=parent._objects.indexOf(child); if(i>=0){parent._objects.splice(i,1); parent._objects.push(child); parent.dirty=true;}};

  // color utils
  function parseColor(str){
    if(!str||typeof str!=='string') return null;
    const s=str.trim().toLowerCase();
    if(s==='none'||s.startsWith('url(')) return null;
    if(s.startsWith('#')){
      const h=s.slice(1);
      const rgb = h.length===3? h.split('').map(c=>parseInt(c+c,16)) :
                   [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
      return rgb.some(isNaN)?null:[rgb[0],rgb[1],rgb[2],1];
    }
    const m=s.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\)/);
    if(m) return [parseInt(m[1],10),parseInt(m[2],10),parseInt(m[3],10), m[4]!=null?parseFloat(m[4]):1];
    const ctx=document.createElement('canvas').getContext('2d'); ctx.fillStyle=s;
    const m2=ctx.fillStyle.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    return m2?[+m2[1],+m2[2],+m2[3], m2[4]!=null?+m2[4]:1]:null;
  }
  const hasFill=o=>('fill' in o) && o.fill && o.fill!=='none';
  const hasStroke=o=>('stroke' in o) && o.stroke && o.stroke!=='none';

  // patrones (tint)
  let imgSmooth=null, imgSuede=null;
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

  // buckets
  let bucketA=[], bucketB=[];
  let mode='';
  const applyFill=(o,mat)=>{ if('fill' in o) o.set('fill',mat); else o.fill=mat; };

  function kmeans2X(objs){
    if(objs.length<=2) return [objs,[]];
    const cx=o=>o.getBoundingRect(true,true).left + o.getBoundingRect(true,true).width/2;
    let c1=Math.min(...objs.map(cx)), c2=Math.max(...objs.map(cx));
    for(let i=0;i<8;i++){
      const A=[],B=[]; objs.forEach(o=>{ (Math.abs(cx(o)-c1)<=Math.abs(cx(o)-c2)?A:B).push(o); });
      const mean=a=>a.length?a.reduce((s,o)=>s+cx(o),0)/a.length:0;
      const n1=mean(A), n2=mean(B);
      if(Math.abs(n1-c1)<.5 && Math.abs(n2-c2)<.5) break; c1=n1; c2=n2;
    }
    const A=[],B=[]; objs.forEach(o=>{ (Math.abs(o.left-c1)<=Math.abs(o.left-c2)?A:B).push(o); });
    return [A,B];
  }

  // costura
  let stitchSet=new Set(); // objetos de costura (grupo C)
  function collectLeafs(root){ const out=[]; walk([root],o=>{ if(o._objects&&o._objects.length) return; out.push(o);}); return out; }

  function prepareBuckets(root){
    const ids=idsMap(root._objects?root._objects:[root]);

    // --- detectar GRUPO DE COSTURA ---
    stitchSet=new Set();
    const gSt  = ids['stitch'] || ids['costura'] || null;
    if(gSt){
      const leaves = collectLeafs(gSt);
      leaves.forEach(o=>{
        stitchSet.add(o);
        // Estilo base de puntada (solo trazo)
        o.set({
          fill: 'none',
          stroke: '#2a2a2a',
          strokeWidth: 1.4,
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
          strokeUniform: true,
          opacity: 1
        });
      });
      // Subir costura por encima
      const parent=gSt.group || root; bringTop(parent,gSt);
    }

    // --- construir A/B ---
    const paintables = leafs(root).filter(o=>!stitchSet.has(o)); // nunca pintar costura
    if(ids['stripe1'] && ids['stripe2']){
      const A=leafs(ids['stripe1']).filter(o=>!stitchSet.has(o));
      const B=leafs(ids['stripe2']).filter(o=>!stitchSet.has(o));
      if(A.length && B.length){
        bucketA=A; bucketB=B; mode='ids';
        badge.innerHTML = `✅ SVG cargado (modo <b>ids</b>) · A: ${A.length} · B: ${B.length} · stitch: ${stitchSet.size}`;
        return;
      }
    }
    const [AX,BX]=kmeans2X(paintables);
    bucketA=AX; bucketB=BX; mode='auto-geom';
    badge.innerHTML = `✅ SVG cargado (modo <b>auto-geom</b>) · A: ${AX.length} · B: ${BX.length} · stitch: ${stitchSet.size}`;
  }

  function paint(){
    // A/B con textura
    const patA = tintPattern( ui.texA.value==='suede'?imgSuede:imgSmooth, ui.colA.value||'#cccccc' );
    const patB = tintPattern( ui.texB.value==='suede'?imgSuede:imgSmooth, ui.colB.value||'#c61a1a' );

    bucketA.forEach(o=>{ applyFill(o,patA); o.dirty=true; });
    bucketB.forEach(o=>{ applyFill(o,patB); o.dirty=true; });

    // Costura: color liso sobre stroke
    const sc = ui.stitch.value || '#2a2a2a';
    stitchSet.forEach(o=>{
      // puntadas con stroke
      o.set({ fill:'none', stroke: sc, opacity:1 });
      if(o.group) bringTop(o.group,o);
      o.dirty=true;
    });

    canvas.requestRenderAll();
  }

  // cargar texturas y svg
  Promise.all([loadImg(TX.smooth), loadImg(TX.suede)]).then(([a,b])=>{ imgSmooth=a; imgSuede=b; });
  fabric.loadSVGFromURL(SVG,(objs,opts)=>{
    const root=fabric.util.groupSVGElements(objs,opts);
    fit(root); canvas.add(root);
    prepareBuckets(root);
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
      model:'bucket-01',
      mode,
      A:{ texture: ui.texA.value, color: ui.colA.value },
      B:{ texture: ui.texB.value, color: ui.colB.value },
      C:{ texture: 'none', color: ui.stitch.value }, // costura
      version:'1.1.0'
    });
    alert(ui.hidden.value);
  });
})();