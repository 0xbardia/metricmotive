// Medians and per-run values for the interleaved Lighthouse A/B (performance category, mobile).
const fs = require("fs");
const files = fs.readdirSync(".").filter((f) => f.endsWith(".json"));
const rows = {};
for (const f of files) {
  const [label, pagePart] = f.split("-", 2);
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  const a = j.audits;
  const page = f.includes("verify") ? "receipt" : "landing";
  const key = `${page} ${label}`;
  (rows[key] ||= []).push({ score: Math.round(j.categories.performance.score * 100), tbt: Math.round(a["total-blocking-time"].numericValue), cls: +a["cumulative-layout-shift"].numericValue.toFixed(4), lcp: Math.round(a["largest-contentful-paint"].numericValue), fcp: Math.round(a["first-contentful-paint"].numericValue), si: Math.round(a["speed-index"].numericValue), load: j.runWarnings?.length ?? 0 });
}
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
for (const key of Object.keys(rows).sort()) {
  const r = rows[key];
  console.log(key.padEnd(18), `n=${r.length}`, "score", med(r.map((x) => x.score)), "TBT", med(r.map((x) => x.tbt)), "CLS", med(r.map((x) => x.cls)), "LCP", med(r.map((x) => x.lcp)), "FCP", med(r.map((x) => x.fcp)), "SI", med(r.map((x) => x.si)));
  console.log("   scores", JSON.stringify(r.map((x) => x.score)), "TBT", JSON.stringify(r.map((x) => x.tbt)));
}
