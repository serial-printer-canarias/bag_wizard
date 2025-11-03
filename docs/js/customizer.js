// docs/js/customizer.js
(function(){
  const ROOT='./', SVG=ROOT+'assets/svg/bag_base.svg';
  const $=(s,c=document)=>c.querySelector(s);
  const ui={ colA:$('#colA'), colB:$('#colB'), dl:$('#dl'), save:$('#save'), hidden:$('#spbc_config_json') };

  const W=600,H=800;
  const canvas=new fabric.Canvas('cv',{selection:false}); canvas.setWidth(W); canvas.setHeight(H);

  // Debug overlay
  const dbg=document.createElement('div');
  Object.assign(dbg.style,{position:'fixed',top:'8px',right:'8px',background:'rgba(0,0,0,.8)',color:'#fff',
    padding:'8px 10px',font:'12px/1.35 system-ui,Segoe UI,Roboto,Arial',borderRadius:'10px',zIndex:9999,maxWidth:'48ch'});
  dbg.textContent='Cargando…'; document.body.appendChild(dbg);

  let mode='';          // 'ids' | 'auto'
  let groupA=[], groupB=[]; // arrays de objetos a pintar

  function fit(g){
    const m=24,maxW=W-2*m,maxH=H-2*m;
    const w=g.width||g.getScaledWidth(),h=g.height||g.getScaledHeight();
    const s=Math.min(maxW/w,maxH/h);
    g.scale(s);
    g.set({left:(W-w*s)/2,top:(H-h*s)/2,selectable:false,evented:false});
  }

  function walkLeaves(objs){
    const out=[];
    (function rec(arr){
      arr.forEach(o=>{
        if(o._objects&&o._objects.length) rec(o._objects);
        else out.push(o);
      });
    })(objs);
    return out;
  }

  function mapById(objs){
    const map={};
    (function rec(arr){
      arr.forEach(o=>{
        if(o.id) map[o.id]=o;
        if(o._objects&&o._objects.length) rec(o._objects);
      });
    })(objs);
    return map;
  }

  function normColor(c){
    if(!c) return null;
    const ctx=document.createElement('canvas').getContext('2d');
    ctx.fillStyle=c; return ctx.fillStyle; // rgb(r,g,b)
  }
  function bucketKey(rgb){
    if(!rgb) return null;
    const m=rgb.match(/\d+/g); if(!m) return null;
    const [r,g,b]=m.map(n=>parseInt(n,10));
    const q=v=>Math.round(v/16)*16; // tolerancia
    return `rgb(${q(r)}, ${q(g)}, ${q(b)})`;
  }

  function pickBucketsAuto(root){
    const leaves=walkLeaves(root._objects?root._objects:[root]);
    const map=new Map();
    leaves.forEach(o=>{
      const base=('fill' in o && o.fill)? o.fill : (('stroke' in o && o.stroke)? o.stroke : null);
      const key=bucketKey(normColor(base));
      if(!key) return;
      if(!map.has(key)) map.set(key,[]);
      map.get(key).push(o);
    });
    const top=[...map.entries()].sort((a,b)=>b[1].length-a[1].length).slice(0,2);
    groupA = top[0]? top[0][1] : [];
    groupB = top[1]? top[1][1] : [];
    const info = top.map(([k,v],i)=>`#${i+1} ${k} → ${v.length} objs`).join('<br>');
    dbg.innerHTML=`✅ SVG cargado (modo <b>auto</b>)<br>${info||'No se detectaron colores'}`;
    mode='auto';
  }

  function pickBucketsById(root){
    const ids=mapById(root._objects?root._objects:[root]);
    if(ids['stripe1'] && ids['stripe2']){
      // aplanamos a hojas
      groupA=walkLeaves([ids['stripe1']]);
      groupB=walkLeaves([ids['stripe2']]);
      dbg.innerHTML=`✅ SVG cargado (modo <b>ids</b>)<br>stripe1: ${groupA.length} objs<br>stripe2: ${groupB.length} objs`;
      mode='ids';
      return true;
    }
    return false;
  }

  function paint(){
    const colA=ui.colA.value||'#e6e6e6', colB=ui.colB.value||'#c61a1a';
    const paintSet=(arr,color)=>{
      arr.forEach(o=>{
        if('fill' in o && o.type!=='image') o.set('fill', color);
        if('stroke' in o) o.set('stroke', color);
        o.opacity=1;
      });
    };
    paintSet(groupA,colA);
    paintSet(groupB,colB);
    canvas.requestRenderAll();
  }

  fabric.loadSVGFromURL(SVG,(objs,opts)=>{
    const root=fabric.util.groupSVGElements(objs,opts);
    fit(root); canvas.add(root);

    // 1) intenta por ids; 2) si no, agrupa por color automáticamente
    if (!pickBucketsById(root)) pickBucketsAuto(root);

    paint();
  },(item,obj)=>{ obj.selectable=false; });

  ['change','input'].forEach(ev=>{
    ui.colA.addEventListener(ev, paint);
    ui.colB.addEventListener(ev, paint);
  });

  ui.dl.addEventListener('click', ()=>{
    const data=canvas.toDataURL({format:'png',multiplier:1.5});
    const a=document.createElement('a'); a.href=data; a.download='bolso-preview.png'; a.click();
  });

  ui.save.addEventListener('click', ()=>{
    ui.hidden.value=JSON.stringify({
      model:'bucket-01',
      mode,
      A:{color:ui.colA.value},
      B:{color:ui.colB.value},
      version:'1.0.0'
    });
    alert(ui.hidden.value);
  });
})();