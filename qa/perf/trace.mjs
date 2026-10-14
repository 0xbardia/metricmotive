// Chrome trace of a page load at 390 px, CPU 4x (read-only GETs). Usage: node trace.mjs <url> <outFile>
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("/root/mm-release-v2/node_modules/playwright");
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
const events = [];
cdp.on("Tracing.dataCollected", (e) => events.push(...e.value));
const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
await cdp.send("Tracing.start", { categories: "-*,devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,toplevel,blink.user_timing,v8.execute,loading,disabled-by-default-devtools.timeline.stack,disabled-by-default-v8.cpu_profiler,disabled-by-default-v8.cpu_profiler.hires", transferMode: "ReportEvents" });
await page.goto(url, { waitUntil: "load", timeout: 90000 });
await page.waitForTimeout(5000);
if (process.argv[4] === "scroll") { await page.waitForTimeout(1000); for (let i = 0; i < 40; i++) { await page.evaluate((y) => window.scrollTo(0, y), i * 120); await page.waitForTimeout(60); } await page.waitForTimeout(500); }
await cdp.send("Tracing.end");
await done;
writeFileSync(out, JSON.stringify({ traceEvents: events }));
console.log("events", events.length, "->", out);
await browser.close();
