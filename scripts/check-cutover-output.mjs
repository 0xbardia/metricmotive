#!/usr/bin/env node
// Validates pasted output of one CUTOVER.md step against that step's "Expect" / "Abort if" text.
//   node scripts/check-cutover-output.mjs <p1|1|2|3|4|5|6|7> [file]      (stdin if no file)
// Exit 0 = PASS, 1 = ABORT/FAIL, 2 = usage / unparseable (ABORT-grade). Reads text only; prints no secret values.
import { readFileSync } from "node:fs";

const CONTRACT = "0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703";
const CHAIN = 61997;
const NETWORK = "GenLayer Studio Dev";
const DASH = "[-–—]"; // the scripts print an em dash, CUTOVER.md shows " - "
const ROLLBACK = {
  p1: "none (read-only); fix the environment, do not start the process",
  1: "git -C /root/MetricMotive worktree remove --force /root/mm-release-v2 (production untouched)",
  2: "none (read-only); delete the backup files and stop",
  3: "CUTOVER.md section 7 only to undo the schema; the V1 app keeps working on the migrated schema, so stopping here is safe",
  4: "CUTOVER.md section 7",
  5: "CUTOVER.md section 6",
  6: "none; stop and paste the output (the dump and the V1 output copy are intact)",
  7: "none; the script is one transaction and rolls back on error (full restore: pg_restore --clean, CUTOVER.md section 7)",
};
const lines = (t) => t.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
const errLine = /\b(error|warning|warn|fatal|mismatch|ELIFECYCLE|failed)\b|npm ERR/i;

const STEPS = {
  p1(text) {
    const a = [], n = [];
    const ls = lines(text);
    for (const name of ["GENLAYER_CONTRACT_ADDRESS", "GENLAYER_CHAIN_ID", "GENLAYER_NETWORK", "GENLAYER_RPC_URL"]) {
      const l = ls.find((x) => x.startsWith(name + ":"));
      if (!l) a.push(`${name} line missing`);
      else if (l === `${name}: match`) n.push(l);
      else if (/MISMATCH/.test(l)) a.push(`${name} MISMATCH (the process would refuse to start)`);
      else if (/unset/.test(l)) a.push(`NOT PASS: unset variable falls back to the registry value, needs explicit human OK (${name})`);
      else a.push(`${name} line is not exactly ": match": ${l}`);
    }
    for (const l of ls) if (/^GENLAYER_\w+:/.test(l) && !/^GENLAYER_(CONTRACT_ADDRESS|CHAIN_ID|NETWORK|RPC_URL): match$/.test(l) && !a.some((x) => x.includes(l.split(":")[0]))) a.push(`unexpected GENLAYER line: ${l}`);
    if (!ls.includes("registry active deployment: studio-dev-v1")) a.push("line `registry active deployment: studio-dev-v1` missing");
    return { a, n };
  },
  1(text) {
    const a = [], n = [];
    const m = /added (\d+) packages?/.exec(text);
    if (!m) a.push("`added N packages` missing (npm ci did not finish)");
    else { n.push(`npm ci added ${m[1]} packages` + (m[1] === "894" ? "" : " (rehearsal: 894, differs)")); }
    if (/npm ERR|ELIFECYCLE|Error:/.test(text)) a.push("npm or build error text present");
    if (!new RegExp(`\\[migrate\\] DATABASE_URL not set ${DASH} skipping`).test(text)) a.push("`[migrate] DATABASE_URL not set - skipping` line missing (the build may have touched a database)");
    if (!new RegExp(`\\[seed\\] DATABASE_URL not set ${DASH} skipping official examples\\.`).test(text)) a.push("`[seed] DATABASE_URL not set - skipping official examples.` line missing");
    const ls = lines(text);
    for (const f of ["pglite.data", "pglite.wasm"]) if (!ls.includes(f)) a.push(`${f} not listed`);
    return { a, n };
  },
  2(text) {
    const a = [], n = [];
    const ls = lines(text);
    const bad = ls.filter((l) => errLine.test(l) || /^pg_dump:/.test(l));
    if (bad.length) a.push(`pg_dump is not silent (${bad.length} line(s) of warning/error/mismatch text, first: ${bad[0].slice(0, 80)})`);
    const last = ls.at(-1) ?? "";
    if (!/^c2ffa2e[0-9a-f]{33}$/.test(last)) a.push("last line is not a full 40-hex hash starting with c2ffa2e");
    else n.push(`start commit ${last}`);
    const body = ls.slice(0, -1);
    const count = body.filter((l) => /^\d+$/.test(l));
    if (count.length !== 1) a.push("expected exactly one integer TABLE DATA count line");
    else if (Number(count[0]) < 11) a.push(`TABLE DATA count ${count[0]} is below 11`);
    else n.push(`TABLE DATA count ${count[0]}`);
    const extra = body.filter((l) => !/^\d+$/.test(l) && !errLine.test(l) && !/^pg_dump:/.test(l));
    if (extra.length) a.push(`unexpected extra output: ${extra[0].slice(0, 80)}`);
    return { a, n };
  },
  3(text) {
    const a = [], n = [];
    if (/up to date/.test(text)) a.push("`up to date`: someone already migrated production, tell me before continuing");
    if (/error applying|failed:|ERROR/.test(text)) a.push("migrate printed an error");
    const applied = [...text.matchAll(/applied (\d{4}_\S+?\.sql)/g)].map((m) => m[1]);
    const want = ["0011_failed_tx_supersede.sql", "0012_tx_run_id.sql", "0013_chain_resolved_at.sql"];
    if (applied.join() !== want.join()) a.push(`applied list is [${applied.join(", ")}], expected exactly [${want.join(", ")}] in order`);
    else n.push("applied 0011, 0012, 0013 in order");
    if (!new RegExp(`\\[migrate\\] done ${DASH} 3 migration\\(s\\) applied\\.`).test(text)) a.push("`done - 3 migration(s) applied.` line missing");
    return { a, n };
  },
  4(text) {
    const want = [
      "0013_chain_resolved_at.sql", "0012_tx_run_id.sql", "0011_failed_tx_supersede.sql", "0010_run_evidence_snapshot.sql",
      "create_guard_intents.failed_at", "create_guard_intents.failure_kind", "create_guard_intents.failure_reason",
      "guard_transactions.failed_at", "guard_transactions.failure_kind", "guard_transactions.failure_reason", "guard_transactions.run_id",
      "guards.chain_resolved_at", "t|t", "0", "0", "0", "0",
    ];
    const ls = lines(text);
    const i = ls.findIndex((l, k) => l !== want[k]);
    const a = [];
    if (i !== -1 || ls.length !== want.length) {
      const k = i === -1 ? Math.min(ls.length, want.length) : i;
      a.push(`line ${k + 1} differs: got ${JSON.stringify(ls[k] ?? "(missing)")}, expected ${JSON.stringify(want[k] ?? "(end of output)")}; ${ls.length} lines, expected ${want.length}`);
    }
    return { a, n: a.length ? [] : ["all 17 lines match in order"] };
  },
  5: (text) => ready(text, true),
  6: (text) => ready(text, false),
  7(text) {
    const a = [], n = [];
    const ls = lines(text);
    const at = (re, from = 0) => ls.findIndex((l, k) => k >= from && re.test(l));
    if (ls.some((l) => /ERROR/.test(l))) a.push("ERROR present");
    const b = at(/^BEGIN$/), c = at(/^COMMIT$/), d = at(/^DELETE 3$/, Math.max(b, 0));
    if (b === -1) a.push("`BEGIN` missing");
    if (d === -1) a.push("`DELETE 3` missing");
    if (c === -1) a.push("`COMMIT` missing");
    if (b !== -1 && c !== -1 && d !== -1 && !(b < d && d < c)) a.push("BEGIN, DELETE 3, COMMIT not in order");
    const ddl = ls.filter((l) => /^(ALTER TABLE|DROP TABLE|DROP INDEX)$/.test(l));
    if (ddl.length < 1) a.push("no ALTER TABLE / DROP TABLE / DROP INDEX lines");
    else n.push(`${ddl.length} DDL lines`);
    return { a, n };
  },
};

function ready(text, withPm2) {
  const a = [], n = [];
  const m = /\{[^\n]*"status"[^\n]*\}/.exec(text);
  let j;
  try { j = m && JSON.parse(m[0]); } catch { j = null; }
  if (!j) a.push("ready JSON missing or not parseable");
  else {
    if (j.status !== "ready") a.push(`status is ${JSON.stringify(j.status)}, not "ready"`);
    if (j.chainId !== CHAIN) a.push(`chainId is ${JSON.stringify(j.chainId)}, not ${CHAIN}`);
    if (String(j.contractAddress ?? "").toLowerCase() !== CONTRACT.toLowerCase()) a.push("contractAddress differs from the registry address");
    if (withPm2) {
      if (j.db !== true) a.push(`db is ${JSON.stringify(j.db)}, not true`);
      if (j.contractConfigured !== true) a.push(`contractConfigured is ${JSON.stringify(j.contractConfigured)}, not true`);
      if (j.network !== NETWORK) a.push(`network is ${JSON.stringify(j.network)}, not ${NETWORK}`);
    }
    if (!a.length) n.push(`ready JSON ok (chain ${CHAIN}, contract ${CONTRACT})`);
  }
  const row = lines(text).find((l) => l.includes("metricmotive-web") && /[│|]/.test(l));
  if (withPm2 && row) {
    if (/online/.test(row) && !/errored|stopped|launching|waiting/.test(row)) n.push("pm2 online");
    else a.push("pm2 row for metricmotive-web is not `online`");
  }
  return { a, n };
}

export function checkStep(step, text) {
  if (!STEPS[step]) throw new Error(`unknown step ${step}`);
  const { a, n } = STEPS[step](text);
  return { ok: a.length === 0, notes: n, aborts: a, rollback: ROLLBACK[step] };
}

function main() {
  const [step, file] = process.argv.slice(2);
  if (!STEPS[step]) { console.error("usage: check-cutover-output.mjs <p1|1|2|3|4|5|6|7> [file]"); process.exit(2); }
  let text;
  try { text = readFileSync(file ?? 0, "utf8"); } catch (e) { console.error(`cannot read input: ${e.message}`); process.exit(2); }
  if (!text.trim()) { console.log(`VERDICT: ABORT — empty input for step ${step} (unparseable); roll back: ${ROLLBACK[step]}`); process.exit(2); }
  const r = checkStep(step, text);
  for (const l of r.notes) console.log(l);
  for (const l of r.aborts) console.log(`ABORT: ${l}`);
  if (r.ok) console.log(`VERDICT: PASS — step ${step} output matches CUTOVER.md`);
  else console.log(`VERDICT: ABORT — ${r.aborts[0]}${r.aborts.length > 1 ? ` (+${r.aborts.length - 1} more)` : ""}; roll back: ${r.rollback}`);
  process.exit(r.ok ? 0 : 1);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
