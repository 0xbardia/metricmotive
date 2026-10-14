// Phase 2 gate measurements: long tasks (top 3 with durations), TBT (first 5 s, M0 method), CLS, rAF frame sampling and
// scroll frames, at 390 px with 4x CPU. Medians over runs. Read-only GETs.
// Usage: node measure.mjs <baseUrl> <outJson> [runs=3] [pages=landing,demo,receipt,app]
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire("/root/mm-release-v2/node_modules/playwright");
const { chromium } = require("playwright");
const [BASE, OUT, RUNS = "3", PAGES_ARG = "landing,demo,receipt,app"] = process.argv.slice(2);
const ALL = { landing: "/", demo: "/demo", receipt: "/verify/rct_14804bf62424284e", app: "/app" };
const pages = PAGES_ARG.split(",");
const VP = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const init = () => {
  const M = (window.__m = { lt: [], ls: [], frames: [], rec: true });
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => M.lt.push([e.startTime, e.duration]))).observe({ type: "longtask", buffered: true }); } catch {}
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => M.ls.push([e.startTime, e.value, e.hadRecentInput]))).observe({ type: "layout-shift", buffered: true }); } catch {}
  const loop = (t) => { if (M.rec) M.frames.push(t); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
};
const frameStats = (ts) => {
  const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
  const s = [...d].sort((a, b) => a - b);
  return { frames: ts.length, over33: d.filter((x) => x > 33).length, over50: d.filter((x) => x > 50).length, p95: s.length ? Math.round(s[Math.floor(s.length * 0.95)]) : null };
};
async function run(browser, path) {
  const ctx = await browser.newContext(VP);
  const page = await ctx.newPage();
  const r = { path };
  try {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(init);
    const resp = await page.goto(BASE + path, { waitUntil: "commit", timeout: 60000 });
    r.status = resp.status();
    await page.waitForTimeout(5000);
    const win = await page.evaluate(() => {
      const M = window.__m; M.rec = false;
      const lt = M.lt.filter((x) => x[0] < 5000);
      return {
        lt: lt.map((x) => [Math.round(x[0]), Math.round(x[1])]),
        tbt: Math.round(lt.reduce((a, x) => a + Math.max(0, x[1] - 50), 0)),
        cls: +M.ls.filter((x) => !x[2]).reduce((a, x) => a + x[1], 0).toFixed(4),
        frames: M.frames.filter((t) => t <= 4000),
      };
    });
    r.lt = win.lt; r.tbt = win.tbt; r.cls = win.cls; r.win = frameStats(win.frames);
    r.top3 = [...win.lt].sort((a, b) => b[1] - a[1]).slice(0, 3);
    // Scripted scroll, 40 steps: frame sampling only (not part of TBT).
    r.scroll = await page.evaluate(() => new Promise((res) => {
      const M = window.__m; M.frames = []; M.rec = true;
      const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      let i = 0;
      const step = () => { i++; window.scrollTo({ top: (max * i) / 40, behavior: "instant" }); if (i < 40) setTimeout(step, 100); else setTimeout(() => { M.rec = false; res(M.frames); }, 150); };
      step();
    })).then((ts) => frameStats(ts));
    r.scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  } catch (e) { r.error = String(e).slice(0, 200); }
  finally { await ctx.close(); }
  return r;
}
const browser = await chromium.launch();
const results = {};
for (const name of pages) {
  results[name] = [];
  for (let i = 0; i < +RUNS; i++) results[name].push(await run(browser, ALL[name]));
}
await browser.close();
const med = (xs) => { const s = xs.filter((x) => typeof x === "number").sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const summary = Object.fromEntries(Object.entries(results).map(([name, rs]) => {
  const ok = rs.filter((r) => !r.error);
  return [name, {
    runs: `${ok.length}/${rs.length}`,
    tbtMedian: med(ok.map((r) => r.tbt)),
    longTasksMedian: med(ok.map((r) => r.lt.length)),
    // rank-wise medians of the top 3 long-task durations across runs (rank 1 = longest in each run)
    top3Median: [0, 1, 2].map((k) => med(ok.map((r) => r.top3[k]?.[1] ?? 0))),
    top3StartMedian: [0, 1, 2].map((k) => med(ok.map((r) => r.top3[k]?.[0] ?? 0))),
    clsMedian: med(ok.map((r) => r.cls)),
    frames4sOver33Median: med(ok.map((r) => r.win.over33)),
    frames4sP95Median: med(ok.map((r) => r.win.p95)),
    scrollOver33Median: med(ok.map((r) => r.scroll.over33)),
    scrollP95Median: med(ok.map((r) => r.scroll.p95)),
    scrollHeightMedian: med(ok.map((r) => r.scrollHeight)),
  }];
}));
writeFileSync(OUT, JSON.stringify({ base: BASE, runs: +RUNS, summary, results }, null, 1));
console.log(JSON.stringify(summary, null, 1));
