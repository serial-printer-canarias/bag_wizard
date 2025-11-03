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

  let buckets=[[],[]]; // [A,B]
  let root=null;

  function fit(g){
    const m=24,maxW=W-2*m,maxH=H-2*m;
    const w=g.width||g.getScaledWidth(),h=g.height||g.getScaledHeight();
    const s=Math.min(maxW/w,maxH/h);
    g.scale(s);
    g.set({left:(W-w*s)/2,top:(H-h*s)/2,selectable:false,evented:false});
  }

  function leaves(objs){
    const out=[];
    (function walk(arr){
      arr.forEach(o=>{
        if(o._objects&&o._objects.length){ walk(o._objects); }
        else out.push(o);
      });
    })(objs);
    return out;
  }

  function normalizeColor(c){
    if(!c) return null;
    const ctx=document.createElement('canvas').getContext('2d');
    ctx.fillStyle=c; return ctx.fillStyle; // devuelve rgb(r,g,b)
  }

  function hashColor(rgb){ // agrupa por color aproximado (tolerancia 16)
    if(!rgb) return null;
    const m=rgb.match(/\d+/g); if(!m) return null;
    const [r,g,b]=m.map(n=>parseInt(n,10));
    const q=(v)=>Math.round(v/16)*16; // cuantiza
    return `rgb(${q(r)}, ${q(g)}, ${q(b)})`;
  }

  function buildBuckets(group){
    const all=leaves(group._objects?group._objects:[group]);

    // Mapa de color -> objetos (usamos fill si existe, si no stroke)
    const map=new Map();
    all.forEach(o=>{
      const base = ('fill' in o && o.fill) ? o.fill : (('stroke' in o && o.stroke) ? o.stroke : null);
      const norm = normalizeColor(base);
      const key = hashColor(norm);
      if(!key) return;
      if(!map.has(key)) map.set(key, []);
      map.get(key).push(o);
    });

    // Coge los 2 colores con más objetos
    const colors=[...map.entries()].sort((a,b)=>b[1].length-a[1].length).slice(0,2);
    buckets=[ colors[0]?colors[0][1]:[], colors[1]?colors[1][1]:[] ];

    const info = colors.map(([k,v],i)=>`#${i+1} ${k} → ${v.length} objs`).join('<br>');
    dbg.innerHTML = `✅ SVG cargado<br>${info || 'No se detectaron colores'}<br><small>Estos dos “grupos” son los que pintarán Color A y B.</small>`;
  }

  function paint(){
    // Aplica color SOLIDO a ambos buckets (fill y stroke)
    const colA=ui.colA.value||'#e6e6e6', colB=ui.colB.value||'#c61a1a';
    const paintSet=(set,color)=>{
      set.forEach(o=>{
        if('fill' in o && o.type!=='image') o.set('fill', color);
        if('stroke' in o) o.set('stroke', color);
        o.opacity=1;
      });
    };
    paintSet(buckets[0], colA);
    paintSet(buckets[1], colB);
    canvas.requestRenderAll();
  }

  fabric.loadSVGFromURL(SVG,(objs,opts)=>{
    root=fabric.util.groupSVGElements(objs,opts);
    fit(root); canvas.add(root);
    buildBuckets(root);
    paint(); // pinta al cargar
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
      A:{color:ui.colA.value}, B:{color:ui.colB.value}, version:'1.0.0'
    });
    alert(ui.hidden.value);
  });
})();