// CLS at 390 px, 4x CPU, normal font loading, 5 s after commit; each layout-shift with its sources (node + previous/current rect).
// Read-only. Usage: node cls4x.mjs <baseUrl> <outJson> [runs=3]
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire("/root/mm-release-v2/node_modules/playwright");
const { chromium } = require("playwright");
const [BASE, OUT, RUNS = "3"] = process.argv.slice(2);
const PAGES = { landing: "/", app: "/app", demo: "/demo", receipt: "/verify/rct_14804bf62424284e" };
const browser = await chromium.launch();
const out = {};
for (const [name, path] of Object.entries(PAGES)) {
  out[name] = [];
  for (let i = 0; i < +RUNS; i++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await p.addInitScript(() => { window.__ls = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__ls.push({ t: Math.round(e.startTime), v: e.value, input: e.hadRecentInput, src: (e.sources || []).map((s) => ((s.node && (s.node.nodeName + "." + (s.node.className?.toString?.() || "").split(" ")[0] + (s.node.id ? "#" + s.node.id : ""))) || "?") + " " + (s.previousRect?.y ?? "") + "->" + (s.currentRect?.y ?? "")) }))).observe({ type: "layout-shift", buffered: true }); });
    await p.goto(BASE + path, { waitUntil: "commit", timeout: 120000 });
    await p.waitForTimeout(5000);
    const ls = await p.evaluate(() => window.__ls);
    const shifts = ls.filter((x) => !x.input);
    out[name].push({ run: i, cls: +shifts.reduce((a, x) => a + x.v, 0).toFixed(5), shifts: shifts.filter((x) => x.v > 0).map((x) => ({ t: x.t, v: +x.v.toFixed(5), src: x.src.slice(0, 3) })) });
    await ctx.close();
  }
}
await browser.close();
writeFileSync(OUT, JSON.stringify(out, null, 1));
for (const [name, rs] of Object.entries(out)) console.log(name, "CLS per run", rs.map((r) => r.cls).join(", "), rs.some((r) => r.shifts.length) ? "shifts: " + JSON.stringify(rs.find((r) => r.shifts.length)?.shifts.slice(0, 3)) : "");
