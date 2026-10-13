#!/usr/bin/env node
// Validates the pasted output of CUTOVER.md step P0 (docs/cutover-db-facts.sql + `pg_dump --version`).
//   node scripts/check-p0-output.mjs [file] [--free-bytes N]     (stdin if no file)
// Exit 0 = PASS, 1 = ABORT, 2 = usage / unparseable (ABORT-grade). Reads text only; prints no secrets.
import { readFileSync, statfsSync } from "node:fs";

const NEWEST = "0010_run_evidence_snapshot.sql";
const TABLES = ["guards", "runs", "receipts", "guard_transactions", "create_guard_intents"];
const UNITS = { bytes: 1, byte: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4, pb: 1024 ** 5 };

export function sizeToBytes(s) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(bytes?|kB|MB|GB|TB|PB)\s*$/i.exec(s ?? "");
  return m ? Math.round(Number(m[1]) * UNITS[m[2].toLowerCase()]) : null;
}

/** Parses psql aligned output into [{header: string[], rows: string[][]}]. */
export function parsePsql(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    if (!/^-{2,}(\+-{2,})*$/.test(lines[i].trim()) || !lines[i - 1].trim()) continue;
    const split = (l) => l.split("|").map((c) => c.trim());
    const t = { header: split(lines[i - 1]), rows: [] };
    for (i++; i < lines.length && lines[i].trim() && !/^\(\d+ rows?\)/.test(lines[i].trim()); i++) t.rows.push(split(lines[i]));
    out.push(t);
  }
  return out;
}

const fmt = (n) => (n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(1) + " GB" : n >= 1024 ** 2 ? (n / 1024 ** 2).toFixed(1) + " MB" : Math.round(n / 1024) + " kB");

export function checkP0(text, { freeBytes } = {}) {
  const tabs = parsePsql(text);
  const find = (h) => tabs.find((t) => t.header.includes(h));
  const lines = [];
  const aborts = [];
  const ver = find("server_version")?.rows[0]?.[0];
  const dump = /^pg_dump \(PostgreSQL\) (\d+)/m.exec(text);
  const size = find("database_size")?.rows[0]?.[0];
  const sizeB = sizeToBytes(size);
  const tableT = find("total_size");
  const migs = find("name")?.rows.map((r) => r[0]) ?? [];
  const lr = find("long_running")?.rows[0]?.[0];

  if (!ver) aborts.push("server_version missing from output");
  if (!dump) aborts.push("pg_dump --version line missing from output");
  if (sizeB === null) aborts.push("database_size missing or unparseable");
  if (lr === undefined || !/^\d+$/.test(lr)) aborts.push("long_running result missing");
  if (!tableT) aborts.push("table size result missing");

  const serverMajor = ver ? Number(/^(\d+)/.exec(ver)?.[1]) : NaN;
  const dumpMajor = dump ? Number(dump[1]) : NaN;
  if (ver) lines.push(`server_version: ${ver} (major ${serverMajor})`);
  if (dump) lines.push(`pg_dump major: ${dumpMajor}`);
  if (serverMajor > dumpMajor) {
    lines.push(`REQUIRED: server major ${serverMajor} > pg_dump major ${dumpMajor}; take the backup with the matching client image (docker pull postgres:${serverMajor}-alpine first):`);
    lines.push(
      `docker run --rm --network host -e DATABASE_URL -v /root/metricmotive-backups:/backups postgres:${serverMajor}-alpine \\\n` +
        `  sh -c 'pg_dump --format=custom --no-owner --file=/backups/metricmotive-'"$ts"'.dump "$DATABASE_URL" && pg_restore --list /backups/metricmotive-'"$ts"'.dump | grep -c "TABLE DATA"'`,
    );
  }
  const free = freeBytes ?? (() => { const s = statfsSync("/"); return s.bavail * s.bsize; })();
  if (sizeB !== null) {
    lines.push(`database size: ${size} (${sizeB} bytes); free disk of /: ${fmt(free)}`);
    if (sizeB > free / 3) aborts.push(`database size ${size} exceeds one third of free disk (${fmt(free)})`);
  }
  if (tableT) {
    const ti = tableT.header.indexOf("table"), si = tableT.header.indexOf("total_size");
    const rows = tableT.rows.map((r) => ({ t: r[ti], s: r[si], b: sizeToBytes(r[si]) ?? 0 })).sort((a, b) => b.b - a.b);
    lines.push("tables, largest first: " + rows.map((r) => `${r.t} ${r.s}`).join(", "));
    const missing = TABLES.filter((t) => !rows.some((r) => r.t === t));
    if (missing.length) aborts.push(`table(s) missing: ${missing.join(", ")}`);
  }
  const counts = tabs.find((t) => t.header[0] === "t" && t.header.includes("count"));
  if (counts) lines.push("row counts: " + counts.rows.map((r) => `${r[0]}=${r[1]}`).join(", "));
  if (migs.length) {
    lines.push(`newest migration: ${migs[0]}`);
    if (migs[0] !== NEWEST) aborts.push(`newest migration is ${migs[0]}, not ${NEWEST} (production is not at the V1 schema, or already migrated)`);
  } else aborts.push("migration list missing from output");
  if (lr !== undefined) {
    lines.push(`long_running: ${lr}`);
    if (/^\d+$/.test(lr) && Number(lr) !== 0) aborts.push("a long-running query is open (long_running != 0)");
  }
  return { ok: aborts.length === 0, lines, aborts };
}

function main() {
  const argv = process.argv.slice(2);
  let freeBytes, file;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--free-bytes") freeBytes = Number(argv[++i]);
    else if (argv[i].startsWith("--")) { console.error("usage: check-p0-output.mjs [file] [--free-bytes N]"); process.exit(2); }
    else file = argv[i];
  }
  if (freeBytes !== undefined && !Number.isFinite(freeBytes)) { console.error("--free-bytes needs a number"); process.exit(2); }
  let text;
  try { text = readFileSync(file ?? 0, "utf8"); } catch (e) { console.error(`cannot read input: ${e.message}`); process.exit(2); }
  if (!text.trim()) { console.log("VERDICT: ABORT — empty input (unparseable)"); process.exit(2); }
  const r = checkP0(text, { freeBytes });
  for (const l of r.lines) console.log(l);
  if (r.ok) console.log("VERDICT: PASS — production is at the V1 schema, disk and tools suffice");
  else console.log(`VERDICT: ABORT — ${r.aborts.join("; ")} (read-only step, nothing to roll back)`);
  process.exit(r.ok ? 0 : 1);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
