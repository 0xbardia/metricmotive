// Paired, interleaved measurement of two builds (A and B), n runs each, via phase2/measure.mjs (one run per call).
// Records the 1-min load before each run. Summary: medians and ranges for landing/demo TBT, the top-3 long tasks,
// CLS, and scroll frames (over 33 ms, p95).
// Usage: node paired.mjs <labelA> <urlA> <labelB> <urlB> <pages e.g. landing,demo> <n> <outDir>
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const [LA, UA, LB, UB, PAGES, N, OUT] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const load = () => readFileSync("/proc/loadavg", "utf8").split(" ")[0];
const meta = [];
for (let i = 1; i <= +N; i++) {
  const order = i % 2 ? [[LA, UA], [LB, UB]] : [[LB, UB], [LA, UA]];
  for (const [label, url] of order) {
    const file = `${OUT}/${label}-${i}.json`;
    // Wait for a 1-minute load below 12 (2 per core on 6 cores) before each run.
    while (+load() >= 12) execFileSync("sleep", ["15"]);
    const l = load();
    // A stalled browser run is retried once (150 s cap per attempt), then recorded as failed rather than blocking the batch.
    let ok = false;
    for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
      try { execFileSync("node", ["qa/motion/phase2/measure.mjs", url, file, "1", PAGES], { stdio: "ignore", timeout: 150000 }); ok = true; }
      catch (e) { console.log(`${label} run ${i} attempt ${attempt} failed: ${String(e.signal || e.status)}`); }
    }
    meta.push({ label, run: i, loadBefore: +l, ok });
    console.log(`${label} run ${i} load(1m before)=${l}`);
  }
}
const runs = {};
for (const label of [LA, LB]) runs[label] = [];
for (const m of meta) { if (!m.ok) continue; runs[m.label].push({ ...m, results: JSON.parse(readFileSync(`${OUT}/${m.label}-${m.run}.json`, "utf8")).results }); }
const med = (a) => { const s = a.filter((x) => typeof x === "number").sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const rng = (a) => { const s = a.filter((x) => typeof x === "number").sort((x, y) => x - y); return s.length ? `${s[0]}–${s[s.length - 1]}` : "n/a"; };
const summary = {};
for (const page of PAGES.split(",")) {
  summary[page] = {};
  for (const label of [LA, LB]) {
    const rs = runs[label].map((m) => m.results[page][0]).filter((r) => r && !r.error);
    summary[page][label] = {
      n: rs.length,
      loadMedian: med(runs[label].map((m) => m.loadBefore)),
      tbt: { median: med(rs.map((r) => r.tbt)), range: rng(rs.map((r) => r.tbt)) },
      rank: [0, 1, 2].map((k) => ({ median: med(rs.map((r) => r.top3[k]?.[1] ?? 0)), range: rng(rs.map((r) => r.top3[k]?.[1] ?? 0)) })),
      cls: { median: med(rs.map((r) => r.cls)), range: rng(rs.map((r) => r.cls)) },
      scrollOver33: { median: med(rs.map((r) => r.scroll.over33)), range: rng(rs.map((r) => r.scroll.over33)) },
      scrollP95: { median: med(rs.map((r) => r.scroll.p95)), range: rng(rs.map((r) => r.scroll.p95)) },
      scrollFrames: { median: med(rs.map((r) => r.scroll.frames)), range: rng(rs.map((r) => r.scroll.frames)) },
    };
  }
}
writeFileSync(`${OUT}/summary.json`, JSON.stringify({ A: { label: LA, url: UA }, B: { label: LB, url: UB }, meta, summary }, null, 1));
console.log(JSON.stringify(summary, null, 1));
