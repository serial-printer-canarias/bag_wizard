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

  // Canvas fabric
  const el = $('#cv');
  const canvas=new fabric.Canvas('cv',{ selection:false });

  // Debug badge
  const dbg=document.createElement('div');
  Object.assign(dbg.style,{position:'fixed',top:'8px',right:'8px',background:'rgba(0,0,0,.85)',color:'#fff',
    padding:'8px 10px',font:'12px/1.35 system-ui,Segoe UI,Roboto,Arial',borderRadius:'10px',zIndex:9999,maxWidth:'48ch'});
  dbg.textContent='Cargando…'; document.body.appendChild(dbg);

  let mode=''; let bucketA=[], bucketB=[];
  let outlineSet=new Set(); let stitchSet=new Set();
  let imgSmooth=null, imgSuede=null;
  let rootObj=null;

  // ---------- tamaño canvas (CSS vs backstore) ----------
  function syncCanvasToCSS(){
    // Tamaño CSS real del canvas (controlado por index.css con aspect-ratio 3/4)
    const cssW = Math.max(260, el.clientWidth || 600);
    const cssH = Math.max(320, el.clientHeight || Math.round(cssW*4/3));

    // Backstore @1x o @devicePixelRatio para nitidez
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));

    // Ajusta backstore (pixeles reales)
    canvas.setDimensions({ width: cssW*dpr, height: cssH*dpr }, { backstoreOnly:true });
    // Ajusta CSS (pixeles lógicos)
    canvas.setDimensions({ width: cssW, height: cssH }, { cssOnly:true });
    // Asegura zoom coherente
    canvas.setZoom(dpr);
  }

  // ---------- encaje de la ilustración ----------
  function fit(g){
    // márgenes internos
    const isMob = matchMedia('(max-width: 768px)').matches;
    const PAD = isMob ? 10 : 16;

    const canvasW = canvas.getWidth();
    const canvasH = canvas.getHeight();
    const maxW = canvasW - 2*PAD;
    const maxH = canvasH - 2*PAD;

    // reset escala para medir
    g.set({ scaleX:1, scaleY:1, left:0, top:0 });
    g.setCoords();
    const r0 = g.getBoundingRect(true,true);
    const w0 = Math.max(1, r0.width);
    const h0 = Math.max(1, r0.height);

    // “tamaño normal”: que el bolso ocupe este % del ancho util, sin pasarse de alto
    const TARGET_W = (isMob ? 0.58 : 0.44) * maxW;  // ← si lo quieres un poco más grande/pequeño, cambia aquí
    let s = TARGET_W / w0;
    if (h0 * s > maxH) s = maxH / h0;               // nunca cortar por alto

    g.scale(s);
    // colocación: centrado en su recuadro (queda alineado visualmente)
    const w = w0 * s, h = h0 * s;
    g.set({
      left: (canvasW - w)/2,
      top : (canvasH - h)/2,
      selectable:false, evented:false
    });
    g.setCoords();
  }

  // utilidades existentes
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

  // ---------- color helpers ----------
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
  function hasVisibleFill(o){ if(!('fill' in o) || !o.fill) return false; if(o.fill==='none') return false; const c=parseColor(o.fill); if(!c) return false; const a=c[3]==null?1:c[3]; return a>0.02; }
  function hasStroke(o){ return ('stroke' in o) && o.stroke && o.stroke!=='none'; }

  // contorno
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
    if(!(nearGray(rgb,28) && luma(rgb)<90)) return false;
    const a=bboxArea(o);
    return a <= areaRoot*0.02;
  }

  // clustering
  function rgb2hsv([r,g,b]){ r/=255; g/=255; b/=255; const max=Math.max(r,g,b), min=Math.min(r,g,b); const d=max-min; let h=0; if(d!==0){ if(max===r) h=((g-b)/d)%6; else if(max===g) h=(b-r)/d+2; else h=(r-g)/d+4; h*=60; if(h<0) h+=360; } const s=max===0?0:d/max, v=max; return [h,s,v]; }
  function baseRGB(o){ if(hasVisibleFill(o)){ const c=parseColor(o.fill); return c?[c[0],c[1],c[2]]:null; } if(hasStroke(o)){ const s=parseColor(o.stroke); return s?[s[0],s[1],s[2]]:null; } return null; }
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
    let c1={hx:0,hy:0,p=Math.min(...items.map(i=>i.p))}; // typo fixed below
  }