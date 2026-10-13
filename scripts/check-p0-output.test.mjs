import assert from "node:assert/strict";
import { test } from "node:test";
import { checkP0, parsePsql, sizeToBytes } from "./check-p0-output.mjs";

// Real psql output (disposable DB mm_rc3, migrated to 0013 = the ABORT sample), then edited for PASS.
const REAL = `
 server_version 
----------------
 17.11
(1 row)

 database_size 
---------------
 8342 kB
(1 row)

        table         | est_rows | total_size 
----------------------+----------+------------
 create_guard_intents |       -1 | 40 kB
 guard_transactions   |       -1 | 32 kB
 guards               |       -1 | 120 kB
 receipts             |       -1 | 64 kB
 runs                 |       -1 | 24 kB
(5 rows)

          t           | count 
----------------------+-------
 guards               |     3
 runs                 |     0
 receipts             |     2
 guard_transactions   |     0
 create_guard_intents |     0
(5 rows)

             name             
------------------------------
 0013_chain_resolved_at.sql
 0012_tx_run_id.sql
 0011_failed_tx_supersede.sql
(3 rows)

 long_running 
--------------
            0
(1 row)

pg_dump (PostgreSQL) 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1)
`.trimStart();
const ABORT_SAMPLE = REAL;
const PASS = REAL.replace(" 0013_chain_resolved_at.sql\n 0012_tx_run_id.sql\n 0011_failed_tx_supersede.sql\n", " 0010_run_evidence_snapshot.sql\n 0009_x.sql\n 0008_y.sql\n");
const FREE = 100 * 1024 ** 3;
const run = (t, free = FREE) => checkP0(t, { freeBytes: free });

test("sizes and psql parsing", () => {
  assert.equal(sizeToBytes("8342 kB"), 8342 * 1024);
  assert.equal(sizeToBytes("1 GB"), 1024 ** 3);
  assert.equal(sizeToBytes("12 bytes"), 12);
  assert.equal(sizeToBytes("junk"), null);
  assert.equal(parsePsql(PASS).length, 6);
});

test("PASS case, tables sorted largest first", () => {
  const r = run(PASS);
  assert.equal(r.ok, true, r.aborts.join());
  assert.match(r.lines.join("\n"), /guards 120 kB, receipts 64 kB, create_guard_intents 40 kB, guard_transactions 32 kB, runs 24 kB/);
  assert.doesNotMatch(r.lines.join("\n"), /REQUIRED/);
});

test("newer server major: still PASS, prints the docker command", () => {
  const r = run(PASS.replace(" 17.11", " 19.0 (Debian 19.0-1.pgdg120+1)"));
  assert.equal(r.ok, true);
  assert.match(r.lines.join("\n"), /REQUIRED[^\n]*\ndocker run[^\n]*postgres:19-alpine/);
});

test("version string with Debian suffix parses", () => {
  assert.equal(run(PASS.replace(" 17.11", " 17.5 (Debian 17.5-1.pgdg120+1)")).ok, true);
});

test("ABORT: newest migration is 0013 (real sample)", () => {
  const r = run(ABORT_SAMPLE);
  assert.equal(r.ok, false);
  assert.match(r.aborts.join(), /0013_chain_resolved_at.sql, not 0010/);
});

test("ABORT: database larger than free disk / 3", () => {
  assert.match(run(PASS, 8342 * 1024 * 2).aborts.join(), /one third of free disk/);
});

test("ABORT: a table is missing", () => {
  const r = run(PASS.replace(" runs                 |       -1 | 24 kB\n", ""));
  assert.match(r.aborts.join(), /missing: runs/);
});

test("ABORT: long-running query", () => {
  const r = run(PASS.replace(/(long_running \n-+\n\s+)0/, "$12"));
  assert.match(r.aborts.join(), /long-running query is open/);
});

test("ABORT: pg_dump line or server_version missing", () => {
  assert.match(run(PASS.replace(/pg_dump .*\n?/, "")).aborts.join(), /pg_dump --version line missing/);
  assert.match(run(PASS.replace(/server_version *\n-+\n 17.11\n\(1 row\)\n/, "")).aborts.join(), /server_version missing/);
});

test("garbage input is not a PASS", () => {
  assert.equal(run("hello").ok, false);
});
