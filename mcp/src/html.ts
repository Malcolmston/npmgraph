import { Graphviz } from '@hpcc-js/wasm-graphviz';
import type { DependencyGraph } from './graph.js';
import { CATEGORY_FILL, graphToDot, nodeCategory } from './graph.js';

let graphvizPromise: Promise<Graphviz> | undefined;
async function getGraphviz(): Promise<Graphviz> {
  graphvizPromise ??= Graphviz.load();
  return graphvizPromise;
}

/** Self-contained landing page: a search box that opens /api/html?package=… */
export function renderLandingHtml(): string {
  const examples = ['expo', 'next', 'express', 'sequelize', '@mstone6969/prorm'];
  const chips = examples
    .map(
      p =>
        `<a class="ex" href="/mcp/${encodeURIComponent(p)}">${escapeHtml(p)}</a>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>npmgraph · dependency graphs</title>
<style>
  :root{ color-scheme:light dark; --bg:#f6f7f9; --fg:#191c22; --muted:#69707e; --card:#fff; --line:#e2e5ec; --accent:#4f6bed; }
  @media (prefers-color-scheme:dark){ :root{ --bg:#181a20; --fg:#eef0f5; --muted:#98a0ae; --card:#22262e; --line:#323844; --accent:#8194f6; } }
  *{ box-sizing:border-box; } body{ margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:1.5rem;
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; background:var(--bg); color:var(--fg); }
  .wrap{ width:min(560px,100%); text-align:center; }
  h1{ font-size:2rem; letter-spacing:-.02em; margin:0 0 .25rem; }
  p.sub{ color:var(--muted); margin:0 0 1.5rem; }
  form{ display:flex; gap:.5rem; }
  input{ flex:1; padding:.8rem 1rem; border:1px solid var(--line); border-radius:12px; background:var(--card); color:var(--fg); font-size:1rem; }
  input:focus{ outline:2px solid var(--accent); outline-offset:1px; }
  button{ padding:.8rem 1.3rem; border:none; border-radius:12px; background:var(--accent); color:#fff; font-size:1rem; font-weight:600; cursor:pointer; }
  .ex-row{ margin-top:1.25rem; display:flex; flex-wrap:wrap; gap:.5rem; justify-content:center; }
  .ex{ padding:.35rem .7rem; border:1px solid var(--line); border-radius:999px; background:var(--card); color:var(--muted); text-decoration:none; font-size:.85rem; }
  .ex:hover{ border-color:var(--accent); color:var(--fg); }
  .foot{ margin-top:1.75rem; color:var(--muted); font-size:.8rem; }
</style></head>
<body><div class="wrap">
  <h1>npmgraph</h1>
  <p class="sub">Visualize any npm package's dependency graph — color-coded by risk, searchable, with per-package details.</p>
  <form onsubmit="event.preventDefault();var v=this.q.value.trim();if(v)location.href='/mcp/'+encodeURIComponent(v);">
    <input name="q" type="search" placeholder="package name, e.g. react or @scope/name@1.2.3" autofocus aria-label="Package name" />
    <button type="submit">Graph it</button>
  </form>
  <div class="ex-row">${chips}</div>
  <div class="foot">Powered by the npmgraph MCP · graphs cached in Neo4j</div>
</div></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Render a dependency graph as self-contained, interactive HTML: a
 * Graphviz-laid-out SVG with drag-to-pan, wheel-to-zoom, +/−/fit buttons, clean
 * light/dark styling, and a summary header. No external assets.
 *
 * Pass `{ bodyOnly: true }` to get just the content (scoped `<style>` + markup +
 * inline `<script>`, no `<!doctype>/<html>/<head>/<body>`) — the form a Claude
 * Artifact expects, since it wraps its own document skeleton.
 */
export async function renderGraphHtml(
  graph: DependencyGraph,
  options: { bodyOnly?: boolean; apiBase?: string } = {},
): Promise<string> {
  const graphviz = await getGraphviz();
  let svg = graphviz.dot(graphToDot(graph), 'svg');
  // Keep Graphviz's intrinsic width/height so the SVG actually lays out at a
  // real size — an absolutely-positioned SVG with only a viewBox collapses to
  // 0×0 and shows nothing. Panning/zooming is done by transforming the wrapper,
  // not by resizing the SVG, so a fixed intrinsic size is exactly what we want.
  svg = svg.replace(/<\?xml[^>]*\?>/, '').replace(/<!DOCTYPE[^>]*>/, '');

  const deprecated = graph.nodes.filter(n => n.deprecated).length;
  const vulnerable = graph.nodes.filter(
    n => n.vulnerabilities && n.vulnerabilities > 0,
  ).length;
  const title = `${graph.root} · dependency graph`;

  // Per-node data embedded for the click/tap info popover (no external fetch —
  // an Artifact's CSP blocks that, so we ship what we already computed).
  const nodeData = JSON.stringify(
    Object.fromEntries(
      graph.nodes.map(n => [
        n.key,
        {
          c: nodeCategory(n),
          l: n.level,
          dep: typeof n.deprecated === 'string' ? n.deprecated : n.deprecated ? 1 : 0,
          v: n.vulnerabilities ?? 0,
          sz: n.unpackedSize ?? 0,
          lic: n.license ?? '',
        },
      ]),
    ),
  );

  const legend = (
    [
      ['root', 'Direct'],
      ['transitive', 'Transitive'],
      ['deprecated', 'Deprecated'],
      ['vulnerable', 'Vulnerable'],
    ] as const
  )
    .map(
      ([cat, label]) =>
        `<button type="button" class="npmg-chip" data-cat="${cat}"><i style="background:${CATEGORY_FILL[cat]}"></i>${label}</button>`,
    )
    .join('');

  // A self-sizing flex column (100% height) that works both as a standalone
  // document and inside an Artifact frame (no absolute-viewport assumptions).
  const inner = `<style>
  /* Cool, technical neutrals (slight blue bias toward the accent) — a
     dependency graph is an engineering artifact, not a warm editorial page. */
  .npmg-root { color-scheme: light dark; --bg:#f6f7f9; --fg:#191c22; --muted:#69707e; --card:#ffffff; --line:#e2e5ec; --accent:#4f6bed;
    display:flex; flex-direction:column; width:100%; height:100%; min-height:100vh; margin:0;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background:var(--bg); color:var(--fg); }
  @media (prefers-color-scheme: dark){ .npmg-root{ --bg:#181a20; --fg:#eef0f5; --muted:#98a0ae; --card:#22262e; --line:#323844; --accent:#8194f6; } }
  :root[data-theme="light"] .npmg-root { --bg:#f6f7f9; --fg:#191c22; --muted:#69707e; --card:#ffffff; --line:#e2e5ec; --accent:#4f6bed; }
  :root[data-theme="dark"] .npmg-root { --bg:#181a20; --fg:#eef0f5; --muted:#98a0ae; --card:#22262e; --line:#323844; --accent:#8194f6; }
  .npmg-root *, .npmg-root *::before, .npmg-root *::after { box-sizing:border-box; }
  .npmg-head { display:flex; flex-wrap:wrap; align-items:baseline; gap:.5rem 1.25rem; padding:1rem 1.25rem; border-bottom:1px solid var(--line); flex:none; }
  .npmg-head h1 { margin:0; font-size:1.05rem; font-weight:650; letter-spacing:-.01em; }
  .npmg-stats { display:flex; gap:1rem; color:var(--muted); font-size:.85rem; }
  .npmg-stats b { color:var(--fg); font-variant-numeric:tabular-nums; }
  .npmg-search { margin-left:auto; width:min(260px, 40vw); padding:.4rem .6rem; border:1px solid var(--line); border-radius:8px; background:var(--card); color:var(--fg); font-size:.85rem; }
  .npmg-search:focus { outline:2px solid var(--accent); outline-offset:1px; }
  .npmg-hint { width:100%; color:var(--muted); font-size:.8rem; }
  .npmg-stage { position:relative; flex:1; min-height:320px; overflow:hidden; cursor:grab; touch-action:none; }
  .npmg-stage.grabbing { cursor:grabbing; }
  .npmg-vp { position:absolute; top:0; left:0; transform-origin:0 0; will-change:transform; }
  .npmg-vp svg { display:block; }
  /* Node fills come from the DOT category colors; keep labels dark on the
     light category fills so they stay readable in both themes. */
  .npmg-vp svg .node text { fill:#14161b; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:11px; }
  .npmg-vp svg .edge path { stroke:var(--muted); }
  .npmg-vp svg .edge polygon { fill:var(--muted); stroke:var(--muted); }
  .npmg-legend { display:flex; flex-wrap:wrap; gap:.5rem; width:100%; margin-top:.35rem; font-size:.78rem; }
  .npmg-chip { display:inline-flex; align-items:center; gap:.35rem; padding:.2rem .5rem; border:1px solid var(--line); border-radius:999px; background:var(--card); color:var(--muted); font:inherit; font-size:.78rem; cursor:pointer; }
  .npmg-chip i { width:11px; height:11px; border-radius:3px; border:1px solid rgba(0,0,0,.15); }
  .npmg-chip.off { opacity:.45; text-decoration:line-through; }
  .npmg-ctrls { position:absolute; right:12px; bottom:12px; display:flex; gap:6px; }
  .npmg-ctrls button { width:34px; height:34px; border:1px solid var(--line); border-radius:8px; background:var(--card); color:var(--fg); font-size:16px; cursor:pointer; box-shadow:0 1px 4px rgba(0,0,0,.12); }
  .npmg-ctrls button:hover { border-color:var(--accent); }
  .npmg-info { position:absolute; left:12px; bottom:12px; width:min(320px, calc(100% - 24px)); background:var(--card); border:1px solid var(--line); border-radius:12px; box-shadow:0 6px 24px rgba(0,0,0,.18); padding:.85rem 1rem; font-size:.85rem; z-index:5; }
  .npmg-info[hidden] { display:none; }
  .npmg-info h2 { margin:0 2rem .1rem 0; font-size:.95rem; font-weight:650; word-break:break-all; }
  .npmg-info .tag { display:inline-block; margin:.15rem 0 .5rem; padding:.1rem .5rem; border-radius:999px; font-size:.72rem; color:#14161b; }
  .npmg-info dl { display:grid; grid-template-columns:auto 1fr; gap:.15rem .75rem; margin:.25rem 0 0; }
  .npmg-info dt { color:var(--muted); }
  .npmg-info dd { margin:0; font-variant-numeric:tabular-nums; word-break:break-word; }
  .npmg-info .warn { color:#c0392b; }
  .npmg-info a { display:inline-block; margin-top:.6rem; color:var(--accent); text-decoration:none; font-weight:600; }
  .npmg-info a:hover { text-decoration:underline; }
  .npmg-info .close { position:absolute; top:.5rem; right:.6rem; width:26px; height:26px; border:none; background:transparent; color:var(--muted); font-size:18px; cursor:pointer; }
  @media (max-width:640px){
    .npmg-head { padding:.7rem .85rem; gap:.4rem .7rem; }
    .npmg-head h1 { width:100%; }
    .npmg-stats { font-size:.8rem; gap:.85rem; }
    .npmg-search { margin-left:0; width:100%; order:9; }
    .npmg-hint { display:none; }
    .npmg-ctrls button { width:44px; height:44px; font-size:19px; }
  }
</style>
<div class="npmg-root">
  <div class="npmg-head">
    <h1>${escapeHtml(graph.root)}</h1>
    <div class="npmg-stats">
      <span><b>${graph.nodeCount}</b> packages</span>
      <span><b>${graph.edgeCount}</b> dependencies</span>
      <span><b>${deprecated}</b> deprecated</span>
      <span><b>${vulnerable}</b> vulnerable</span>
    </div>
    <input class="npmg-search" type="search" placeholder="search packages…" aria-label="Search packages" />
    <div class="npmg-legend">${legend}</div>
    <div class="npmg-hint">drag / one-finger to pan · scroll / pinch to zoom · search + tap a tag to filter</div>
  </div>
  <div class="npmg-stage">
    <div class="npmg-vp">${svg}</div>
    <div class="npmg-ctrls">
      <button data-act="out" title="Zoom out">&minus;</button>
      <button data-act="fit" title="Fit">⤢</button>
      <button data-act="in" title="Zoom in">+</button>
    </div>
    <div class="npmg-info" hidden></div>
  </div>
</div>
<script type="application/json" class="npmg-data">${nodeData}</script>
<script>
(function(){
  var root = document.querySelector('.npmg-root');
  var stage = root.querySelector('.npmg-stage');
  var vp = root.querySelector('.npmg-vp');
  var info = root.querySelector('.npmg-info');
  var dataEl = document.querySelector('.npmg-data');
  var NODES = dataEl ? JSON.parse(dataEl.textContent||'{}') : {};
  var API = ${JSON.stringify(options.apiBase ?? '')};
  var x=0, y=0, k=1, min=0.02, max=10;
  function apply(){ vp.style.transform = 'translate('+x+'px,'+y+'px) scale('+k+')'; }
  function dims(){ var s=vp.querySelector('svg'); if(!s) return null; var b=s.getBBox?s.getBBox():null; return { w:(b&&b.width)||s.clientWidth||1, h:(b&&b.height)||s.clientHeight||1 }; }
  function fit(){ var d=dims(); if(!d) return; k=Math.min(stage.clientWidth/d.w, stage.clientHeight/d.h, 1)*0.95||1; x=(stage.clientWidth-d.w*k)/2; y=(stage.clientHeight-d.h*k)/2; apply(); }
  function zoomAt(px,py,factor){ var nk=Math.min(max,Math.max(min,k*factor)); if(nk===k)return; x=px-(px-x)*(nk/k); y=py-(py-y)*(nk/k); k=nk; apply(); }
  function clamp(v){ return Math.min(max, Math.max(min, v)); }
  requestAnimationFrame(fit);
  stage.addEventListener('wheel', function(e){ e.preventDefault(); var r=stage.getBoundingClientRect(); zoomAt(e.clientX-r.left, e.clientY-r.top, Math.exp(-e.deltaY*0.0015)); }, {passive:false});

  // Unified mouse + touch: one pointer pans, two pointers pinch-zoom + pan.
  var pointers=new Map(), pan=null, pinch=null, moved=false;
  function local(e){ var r=stage.getBoundingClientRect(); return { x:e.clientX-r.left, y:e.clientY-r.top }; }
  function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
  function mid(a,b){ return { x:(a.x+b.x)/2, y:(a.y+b.y)/2 }; }
  function startPan(){ var p=pointers.values().next().value; pan={ sx:p.x, sy:p.y, ox:x, oy:y }; }
  function startPinch(){ var pts=Array.from(pointers.values()); var m=mid(pts[0],pts[1]);
    // content point currently under the fingers' midpoint — kept fixed while pinching
    pinch={ d0:dist(pts[0],pts[1]), k0:k, cx:(m.x-x)/k, cy:(m.y-y)/k }; pan=null; }
  stage.addEventListener('pointerdown', function(e){
    if(e.target.closest('.npmg-ctrls') || e.target.closest('.npmg-info')) return;
    try{ stage.setPointerCapture(e.pointerId); }catch(_){}
    pointers.set(e.pointerId, local(e));
    if(pointers.size===1){ moved=false; startPan(); stage.classList.add('grabbing'); }
    else if(pointers.size===2){ moved=true; startPinch(); }
  });
  stage.addEventListener('pointermove', function(e){
    if(!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, local(e));
    if(pointers.size>=2 && pinch){
      var pts=Array.from(pointers.values()); var nd=dist(pts[0],pts[1]); if(pinch.d0<=0) return;
      k=clamp(pinch.k0*(nd/pinch.d0)); var m=mid(pts[0],pts[1]);
      x=m.x-pinch.cx*k; y=m.y-pinch.cy*k; apply();
    } else if(pointers.size===1 && pan){
      var p=pointers.values().next().value; x=pan.ox+(p.x-pan.sx); y=pan.oy+(p.y-pan.sy); apply();
      if(Math.abs(p.x-pan.sx)+Math.abs(p.y-pan.sy) > 5) moved=true;
    }
  });
  function up(e){
    pointers.delete(e.pointerId); try{ stage.releasePointerCapture(e.pointerId); }catch(_){}
    if(pointers.size<2) pinch=null;
    if(pointers.size===0){ pan=null; stage.classList.remove('grabbing'); }
    else if(pointers.size===1){ startPan(); }
  }
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  stage.addEventListener('dblclick', fit);
  root.querySelector('.npmg-ctrls').addEventListener('click', function(e){
    var btn=e.target.closest('button'); if(!btn) return; var act=btn.getAttribute('data-act'); if(!act) return;
    var cx=stage.clientWidth/2, cy=stage.clientHeight/2;
    if(act==='in') zoomAt(cx,cy,1.3); else if(act==='out') zoomAt(cx,cy,1/1.3); else fit();
  });

  // --- node click → info popover ---
  function fmtSize(b){ if(!b) return null; var u=['B','KB','MB','GB'], i=0; while(b>=1024 && i<u.length-1){ b/=1024; i++; } return (Math.round(b*10)/10)+' '+u[i]; }
  var CATLABEL={root:'Direct',transitive:'Transitive',deprecated:'Deprecated',vulnerable:'Vulnerable'};
  var CATCOLOR=${JSON.stringify(CATEGORY_FILL)};
  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function hideInfo(){ info.hidden=true; }
  function showInfo(key){
    var d=NODES[key]; if(!d){ hideInfo(); return; }
    var at=key.lastIndexOf('@'), name=at>0?key.slice(0,at):key, ver=at>0?key.slice(at+1):'';
    var rows='<dt>Depth</dt><dd>'+(d.l===0?'root':d.l)+'</dd>';
    if(d.lic) rows+='<dt>License</dt><dd>'+esc(d.lic)+'</dd>';
    var sz=fmtSize(d.sz); if(sz) rows+='<dt>Install size</dt><dd>'+sz+'</dd>';
    if(d.v) rows+='<dt>Advisories</dt><dd class="warn">'+d.v+' (OSV)</dd>';
    if(d.dep) rows+='<dt>Status</dt><dd class="warn">deprecated</dd>';
    var npm='https://www.npmjs.com/package/'+name+(ver?'/v/'+ver:'');
    info.innerHTML='<button class="close" aria-label="Close">\\u00d7</button><h2>'+esc(name)+(ver?' <span style="font-weight:400;color:var(--muted)">'+esc(ver)+'</span>':'')+'</h2><span class="tag" style="background:'+(CATCOLOR[d.c]||'#eee')+'">'+CATLABEL[d.c]+'</span><dl>'+rows+'</dl><a href="'+npm+'" target="_blank" rel="noopener">View on npm \\u2197</a>';
    info.hidden=false;
    info.setAttribute('data-key', key);
    // When served with a live API (not an offline artifact), fetch richer info.
    if(API){
      fetch(API+'/package-info?package='+encodeURIComponent(key)).then(function(r){return r.ok?r.json():null;}).then(function(pi){
        if(!pi || info.hidden || info.getAttribute('data-key')!==key) return;
        var extra='';
        if(pi.score) extra+='<dt>Score</dt><dd>'+Math.round(pi.score.final*100)+'/100 <span style="color:var(--muted)">('+pi.score.source+')</span></dd>';
        if(pi.downloadsLastMonth!=null) extra+='<dt>Downloads/mo</dt><dd>'+pi.downloadsLastMonth.toLocaleString()+'</dd>';
        if(pi.maintainers && pi.maintainers.length) extra+='<dt>Maintainers</dt><dd>'+pi.maintainers.map(function(m){return esc(m.name||'');}).filter(Boolean).slice(0,5).join(', ')+'</dd>';
        var dl=info.querySelector('dl'); if(dl && extra) dl.insertAdjacentHTML('beforeend', extra);
      }).catch(function(){});
    }
  }
  info.addEventListener('click', function(e){ if(e.target.closest('.close')) hideInfo(); });
  stage.addEventListener('click', function(e){
    if(moved) return;
    if(e.target.closest('.npmg-ctrls')||e.target.closest('.npmg-info')) return;
    var g=e.target.closest('g.node'); if(!g){ hideInfo(); return; }
    var tt=g.querySelector('title'); showInfo(tt?tt.textContent.trim():'');
  });

  // --- search + category filter ---
  var CATS=['root','transitive','deprecated','vulnerable'];
  var offCats={}, query='';
  var nodes=[].slice.call(vp.querySelectorAll('g.node')).map(function(g){
    var title=g.querySelector('title'); var key=title?title.textContent.trim():'';
    var cat='transitive'; for(var i=0;i<CATS.length;i++){ if(g.classList.contains('npmg-'+CATS[i])) cat=CATS[i]; }
    return { g:g, key:key.toLowerCase(), cat:cat, vis:true };
  });
  var byKey={}; nodes.forEach(function(n){ byKey[n.key]=n; });
  var edges=[].slice.call(vp.querySelectorAll('g.edge')).map(function(g){
    var title=g.querySelector('title'); var t=title?title.textContent.trim():'';
    var m=t.split(/->|&#45;&#45;|--/); // graphviz uses "a->b"
    return { g:g, from:(m[0]||'').trim().toLowerCase(), to:(m[1]||'').trim().toLowerCase() };
  });
  function update(){
    nodes.forEach(function(n){
      n.vis = !offCats[n.cat] && (query==='' || n.key.indexOf(query)!==-1);
      n.g.style.opacity = n.vis ? '1' : '0.06';
      n.g.style.pointerEvents = n.vis ? '' : 'none';
    });
    edges.forEach(function(e){
      var a=byKey[e.from], b=byKey[e.to];
      var vis = (!a||a.vis) && (!b||b.vis);
      e.g.style.opacity = vis ? '' : '0.05';
    });
  }
  var search=root.querySelector('.npmg-search');
  if(search) search.addEventListener('input', function(){ query=search.value.trim().toLowerCase(); update(); });
  root.querySelector('.npmg-legend').addEventListener('click', function(e){
    var chip=e.target.closest('.npmg-chip'); if(!chip) return;
    var cat=chip.getAttribute('data-cat'); offCats[cat]=!offCats[cat];
    chip.classList.toggle('off', !!offCats[cat]); update();
  });
})();
</script>`;

  if (options.bodyOnly) return inner;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>html,body{margin:0;height:100%}</style>
</head>
<body>${inner}</body>
</html>`;
}
