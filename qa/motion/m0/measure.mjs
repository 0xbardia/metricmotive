import { createRequire } from 'module';
import fs from 'fs';
const { chromium } = createRequire(import.meta.url)('/root/mm-release-v2/node_modules/playwright');
const OUT = '/root/MetricMotive-v2.1-wt/qa/motion/m0/';
const BASE = 'https://metricmotive.xyz';
const PAGES = [['landing','/'],['demo','/demo'],['receipt','/verify/rct_14804bf62424284e'],['app','/app']];
const VPS = { mobile:{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}, desktop:{viewport:{width:1440,height:900}} };
const FLAG = /^(width|height|top|left|right|bottom|max-width|max-height|min-height|min-width|padding.*|margin.*|filter|backdrop-filter|box-shadow|background-color|border-color|color)$/i;
const camel = s => s.replace(/[A-Z]/g, m => '-' + m.toLowerCase());

const init = () => {
  const M = window.__m = { lt: [], ls: [], frames: [], anims: {}, bd: 0, reveal: null, running: null };
  try { new PerformanceObserver(l => l.getEntries().forEach(e => M.lt.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true }); } catch {}
  try { new PerformanceObserver(l => l.getEntries().forEach(e => M.ls.push([e.startTime, e.value, e.hadRecentInput]))).observe({ type: 'layout-shift', buffered: true }); } catch {}
  M.rec = true;
  const loop = t => { if (M.rec) M.frames.push(t); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  const KF = new Set(['offset','computedOffset','easing','composite']);
  const snap = at => {
    const out = [];
    for (const a of document.getAnimations()) {
      const type = a.constructor.name;
      const el = a.effect && a.effect.target;
      let props = [];
      try { props = [...new Set(a.effect.getKeyframes().flatMap(k => Object.keys(k).filter(x => !KF.has(x))))]; } catch {}
      let dur = null; try { dur = a.effect.getTiming().duration; } catch {}
      out.push({ type, name: a.animationName || a.transitionProperty || a.id || '', tag: el && el.tagName, cls: el && el.classList && el.classList[0] || '', pseudo: a.effect && a.effect.pseudoElement || '', props, dur, state: a.playState });
    }
    M.anims[at] = out;
    if (at === 1200) {
      M.running = out.filter(x => (x.type === 'CSSAnimation' || x.type === 'CSSTransition') && x.state === 'running' && (x.dur === 'auto' || x.dur > 20)).length;
    }
  };
  [100, 500, 1200].forEach(t => setTimeout(() => snap(t), t));
  window.__bd = () => { let n = 0; const vh = innerHeight, vw = innerWidth;
    for (const e of document.querySelectorAll('*')) { const cs = getComputedStyle(e); const v = cs.backdropFilter || cs.webkitBackdropFilter;
      if (v && v !== 'none') { const r = e.getBoundingClientRect(); if (r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw && r.width && r.height) n++; } }
    return n; };
  setTimeout(() => { M.bd = window.__bd(); M.bdLoad = M.bd;
    const rs = [...document.querySelectorAll('[class*=reveal]')].map(e => { const cs = getComputedStyle(e); return [cs.opacity, cs.transform]; });
    M.reveal = rs; }, 1500);
};
const statFrames = ts => { const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i-1]);
  const s = [...d].sort((a,b)=>a-b);
  return { frames: ts.length, o33: d.filter(x=>x>33).length, o50: d.filter(x=>x>50).length, p95: s.length ? s[Math.floor(s.length*0.95)] : null }; };

async function run(browser, slug, path, vpn, rate, reduced, run, shot) {
  const ctx = await browser.newContext({ ...VPS[vpn] });
  const page = await ctx.newPage();
  const r = { page: slug, vp: vpn, rate, reduced, run };
  try {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(init);
    const resp = await page.goto(BASE + path, { waitUntil: 'commit', timeout: 30000 });
    r.status = resp.status();
    if (r.status >= 400) { r.error = 'HTTP ' + r.status; return r; }
    await page.waitForTimeout(4100);
    const w = await page.evaluate(() => { const M = window.__m; M.rec = false; return { frames: M.frames.filter(t => t <= 4000), cls4: M.ls.filter(x=>!x[2]).reduce((a,x)=>a+x[1],0) }; });
    r.win = statFrames(w.frames); r.cls4s = w.cls4;
    if (shot) await page.screenshot({ path: `${OUT}shots/${slug}-${vpn === 'mobile' ? 390 : 1440}.png` });
    // scroll
    const sc = await page.evaluate(() => new Promise(res => {
      const M = window.__m; M.frames = []; M.rec = true;
      const H = document.documentElement.scrollHeight, max = Math.max(0, H - innerHeight);
      let i = 0, bdMax = 0;
      const step = () => { i++; window.scrollTo({ top: max * i / 40, behavior: 'instant' }); if (i % 8 === 0) bdMax = Math.max(bdMax, window.__bd());
        if (i < 40) setTimeout(step, 100); else setTimeout(() => { M.rec = false; bdMax = Math.max(bdMax, window.__bd()); res({ H, bdMax }); }, 150); };
      step();
    }));
    r.scrollHeight = sc.H;
    const st = await page.evaluate(() => { const M = window.__m; return { frames: M.frames, lt: M.lt, ls: M.ls, anims: M.anims, bdLoad: M.bdLoad, reveal: M.reveal, running: M.running }; });
    r.scroll = statFrames(st.frames);
    r.longtasks = st.lt.filter(x => x[0] < 5000).length;
    r.tbt = st.lt.filter(x => x[0] < 5000).reduce((a,x)=>a+Math.max(0,x[1]-50),0);
    r.longtasksAll = st.lt.length;
    r.clsTotal = st.ls.filter(x=>!x[2]).reduce((a,x)=>a+x[1],0);
    r.bdLoad = st.bdLoad; r.bdMax = Math.max(st.bdLoad || 0, sc.bdMax);
    r.anims = st.anims; r.running = st.running;
    r.animCounts = Object.fromEntries(Object.entries(st.anims).map(([k,v]) => [k, v.length]));
    r.props = [...new Set(Object.values(st.anims).flat().flatMap(a => a.props.map(camel)))].sort();
    r.reveal = st.reveal && { n: st.reveal.length, visible: st.reveal.every(([o,t]) => o === '1' && (t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)')), bad: st.reveal.filter(([o,t]) => !(o === '1' && (t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)'))).length };
  } catch (e) { r.error = String(e).slice(0, 200); }
  finally { await ctx.close(); }
  return r;
}

const browser = await chromium.launch();
const res = [];
const failed = new Set();
const cfgs = [['mobile',4],['desktop',4],['mobile',1]];
for (const [slug, path] of PAGES) for (const [vpn, rate] of cfgs) {
  for (let i = 1; i <= 3; i++) {
    if (failed.has(slug)) break;
    let r = await run(browser, slug, path, vpn, rate, false, i, i === 1 && rate === 4);
    if (r.error && !/HTTP/.test(r.error)) r = await run(browser, slug, path, vpn, rate, false, i, i === 1 && rate === 4);
    if (r.error && /HTTP/.test(r.error)) failed.add(slug);
    res.push(r); fs.writeFileSync(OUT + 'measurements.json', JSON.stringify(res));
  }
}
for (const [slug, path] of PAGES.filter(p => ['landing','receipt'].includes(p[0]))) for (let i = 1; i <= 3; i++) {
  let r = await run(browser, slug, path, 'mobile', 4, true, i, false);
  res.push(r); fs.writeFileSync(OUT + 'measurements.json', JSON.stringify(res));
}
await browser.close();
fs.writeFileSync(OUT + 'measurements.json', JSON.stringify(res, null, 1));

// markdown
const med = a => { a = a.filter(x => x != null).sort((x,y)=>x-y); return a.length ? a[Math.floor(a.length/2)] : 'n/a'; };
const f = (x, d=1) => typeof x === 'number' ? +x.toFixed(d) : x;
let md = '# Motion baseline M0 (live V2 rc6), medians of 3 runs\n\n';
for (const [slug] of PAGES) for (const [vpn, rate] of cfgs) {
  const rs = res.filter(r => r.page===slug && r.vp===vpn && r.rate===rate && !r.reduced);
  const ok = rs.filter(r => !r.error);
  md += `## ${slug} / ${vpn} / ${rate}x CPU\n`;
  if (!ok.length) { md += `FAILED: ${rs.map(r=>r.error).join('; ')}\n\n`; continue; }
  const props = [...new Set(ok.flatMap(r => r.props))].sort().map(p => FLAG.test(p) ? `**${p}** (FLAG)` : p);
  md += `| metric | value |\n|---|---|\n`;
  const row = (k, v) => md += `| ${k} | ${v} |\n`;
  row('runs ok', `${ok.length}/${rs.length}`);
  row('scroll height px', med(ok.map(r=>r.scrollHeight)));
  row('long tasks (5s)', med(ok.map(r=>r.longtasks)));
  row('TBT ms (5s)', f(med(ok.map(r=>r.tbt))));
  row('CLS (4s / total)', `${f(med(ok.map(r=>r.cls4s)),4)} / ${f(med(ok.map(r=>r.clsTotal)),4)}`);
  row('frames (4s)', med(ok.map(r=>r.win.frames)));
  row('frames >33ms', med(ok.map(r=>r.win.o33)));
  row('frames >50ms', med(ok.map(r=>r.win.o50)));
  row('p95 interval ms', f(med(ok.map(r=>r.win.p95))));
  row('scroll frames', med(ok.map(r=>r.scroll.frames)));
  row('scroll frames >33ms', med(ok.map(r=>r.scroll.o33)));
  row('scroll p95 ms', f(med(ok.map(r=>r.scroll.p95))));
  row('max backdrop-filter layers (load / max)', `${med(ok.map(r=>r.bdLoad))} / ${Math.max(...ok.map(r=>r.bdMax))}`);
  row('animations at 100/500/1200ms', ['100','500','1200'].map(k=>med(ok.map(r=>r.animCounts[k]))).join(' / '));
  row('animated properties (union)', props.join(', ') || 'none');
  md += '\n';
}
md += '## Reduced motion (390x844, 4x CPU)\n| page | anims @500 | anims @1200 | reveal els | reveal not visible | CSS anim/transition >20ms running @1200 | props |\n|---|---|---|---|---|---|---|\n';
for (const slug of ['landing','receipt']) {
  const ok = res.filter(r => r.reduced && r.page===slug && !r.error);
  if (!ok.length) { md += `| ${slug} | FAILED |||||\n`; continue; }
  md += `| ${slug} | ${med(ok.map(r=>r.animCounts['500']))} | ${med(ok.map(r=>r.animCounts['1200']))} | ${med(ok.map(r=>r.reveal.n))} | ${Math.max(...ok.map(r=>r.reveal.bad))} | ${Math.max(...ok.map(r=>r.running))} | ${[...new Set(ok.flatMap(r=>r.props))].join(', ')} |\n`;
}
fs.writeFileSync(OUT + 'measurements.md', md);
console.log('done');
