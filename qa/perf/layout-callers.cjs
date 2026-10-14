const ev = JSON.parse(require("fs").readFileSync(process.argv[2], "utf8")).traceEvents;
const m = ev.find((e) => e.ph === "M" && e.name === "thread_name" && e.args.name === "CrRendererMain");
const frames = (e) => { const st = e.args?.beginData?.stackTrace || e.args?.data?.stackTrace || e.args?.stackTrace || []; return st.slice(0, 4).map((s) => `${(s.url || "").split("/").pop().replace(/\?.*$/, "")}:${s.lineNumber} ${s.functionName || ""}`.trim()).join(" < ") || "(none)"; };
const t0 = ev.find((e) => e.name === "navigationStart" && e.args?.data?.documentLoaderURL && e.pid === m.pid)?.ts ?? 0;
const pick = ev.filter((e) => e.pid === m.pid && e.tid === m.tid && ["UpdateLayoutTree", "InvalidateLayout", "ScheduleStyleRecalculation"].includes(e.name) && (e.name !== "UpdateLayoutTree" || e.dur > 3000)).sort((a, b) => a.ts - b.ts);
for (const e of pick) console.log(`${String(Math.round((e.ts - t0) / 1000)).padStart(6)}ms ${e.name.padEnd(26)} ${e.dur ? Math.round(e.dur / 1000) + "ms" : "    "} ${frames(e)}`);
