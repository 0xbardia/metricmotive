// Attribute main-thread long tasks (first 5 s after navigationStart, same window as M0 TBT) to scripts,
// using CPU-profile samples, plus layout/style/paint/parse durations from trace events.
// Usage: node analyze-trace.mjs <trace.json>
import { readFileSync } from "node:fs";
const ev = JSON.parse(readFileSync(process.argv[2], "utf8")).traceEvents;
const m = ev.find((e) => e.ph === "M" && e.name === "thread_name" && e.args.name === "CrRendererMain");
const { pid, tid } = m;
const main = ev.filter((e) => e.pid === pid && e.tid === tid && e.ph === "X");
const nav = ev.find((e) => e.name === "navigationStart" && e.args?.data?.documentLoaderURL && e.pid === pid) || main.find((e) => e.name === "navigationStart");
const t0 = nav.ts, win = t0 + 5_000_000;
const longTasks = main.filter((e) => e.name === "RunTask" && e.ts >= t0 && e.ts < win && e.dur >= 50_000).sort((a, b) => a.ts - b.ts);
// CPU profile samples -> timeline
const samples = []; // {t, url, fn}
const profiles = ev.filter((e) => e.name === "ProfileChunk" && e.pid === pid);
const nodeMap = new Map(); let clock = null;
for (const p of profiles) {
  const cp = p.args.data.cpuProfile; for (const n of cp.nodes || []) nodeMap.set(n.id, n.callFrame);
  if (p.args.data.timeDeltas) { if (clock === null) clock = ev.find((e) => e.name === "Profile" && e.pid === pid)?.args?.data?.startTime ?? p.ts; let i = 0; for (const s of cp.samples || []) { clock += p.args.data.timeDeltas[i++] || 0; samples.push({ t: clock, id: s }); } }
}
const label = (cf) => { if (!cf) return { url: "(none)", fn: "" }; if (!cf.url) return { url: `(native:${cf.functionName || "?"})`, fn: cf.functionName }; try { const u = new URL(cf.url); const host = u.host === "metricmotive.xyz" ? "app" : u.host; return { url: `${host}${u.pathname.replace(/-[A-Za-z0-9_-]{6,}\.(js|css)$/, ".$1")}`, fn: cf.functionName || "(anon)" }; } catch { return { url: cf.url.slice(0, 50), fn: cf.functionName }; } };
const tasksOut = []; const urlTotals = {}; let tbt = 0; const cats = {};
const kindOf = { UpdateLayoutTree: "style", RecalculateStyles: "style", Layout: "layout", PrePaint: "paint", Paint: "paint", PaintImage: "paint", UpdateLayer: "paint", ParseHTML: "parse", ParseAuthorStyleSheet: "parse", "v8.compileModule": "script-compile", FunctionCall: "script-event" };
for (const t of longTasks) {
  const end = t.ts + t.dur; tbt += t.dur - 50_000;
  const inTask = samples.filter((s) => s.t >= t.ts && s.t < end);
  const per = {}; const fnPer = {};
  for (let i = 0; i < inTask.length; i++) { const dt = (inTask[i + 1]?.t ?? end) - inTask[i].t; const cf = nodeMap.get(inTask[i].id); const { url, fn } = label(cf); per[url] = (per[url] || 0) + dt; const key = `${url} :: ${fn}`; fnPer[key] = (fnPer[key] || 0) + dt; urlTotals[url] = (urlTotals[url] || 0) + dt; }
  const pieces = {}; for (const k of main) { if (k.ts >= t.ts && k.ts + k.dur <= end && kindOf[k.name]) { pieces[kindOf[k.name]] = (pieces[kindOf[k.name]] || 0) + k.dur; cats[kindOf[k.name]] = (cats[kindOf[k.name]] || 0) + k.dur; } }
  const top = Object.entries(fnPer).sort((a, b) => b[1] - a[1])[0];
  tasksOut.push({ startMs: Math.round((t.ts - t0) / 1000), durMs: Math.round(t.dur / 1000), sampledJsMs: Math.round(Object.values(per).reduce((a, b) => a + b, 0) / 1000), topFn: top ? `${top[0]} (${Math.round(top[1] / 1000)} ms)` : "-", layoutStyleMs: Math.round(((pieces.style || 0) + (pieces.layout || 0)) / 1000), paintMs: Math.round((pieces.paint || 0) / 1000), parseMs: Math.round((pieces.parse || 0) / 1000) });
}
console.log(`long tasks (>=50 ms) in 5 s: ${longTasks.length}; TBT ${Math.round(tbt / 1000)} ms; CPU samples in window: ${samples.filter((s) => s.t >= t0 && s.t < win).length}`);
console.log("Long-task time by category (ms, traced durations):", Object.entries(cats).map(([k, v]) => `${k}=${Math.round(v / 1000)}`).join(" "));
console.log("Top 5 long tasks by duration:"); for (const r of [...tasksOut].sort((a, b) => b.durMs - a.durMs).slice(0, 5)) console.log(JSON.stringify(r));
console.log("JS self-time inside long tasks, by script (ms):"); for (const [u, d] of Object.entries(urlTotals).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${String(Math.round(d / 1000)).padStart(5)}  ${u}`);
