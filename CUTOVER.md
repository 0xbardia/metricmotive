# V2 production cut-over

Run by a human operator only. Nothing in this file runs automatically. `v2.0.0-rc3` differs from the rehearsed `v2.0.0-rc1` only in `CUTOVER.md`, `docs/cutover-*.sql` and `scripts/compare-env-registry.mjs`. **Rehearsed end to end on 2026-10-13** against a
disposable PostgreSQL 17 and a V1-state copy of the app on a spare port; the timings below are from that run.

The live site (`metricmotive.xyz`, PM2 process `metricmotive-web` on `127.0.0.1:4189`) serves `.vercel/output` from the
**production working tree** (`deployment/start-production.sh` runs `npm run preview`, which runs `srvx` on that output). Running
`npm run build` in that tree replaces the files the live process serves, so a build there *is* a deploy. **Build only in a
release directory**, then copy the output in. Every command that touches production data or the process is marked
**[PROD]** and needs your explicit approval at that step.

## What the rehearsal found wrong in the first draft (fixed below)
1. `npm run db:migrate` from the production tree is a no-op: that tree is still V1 code and has no 0011-0013 files. Migrate from the release directory.
2. Three migrations are pending (0011, 0012, 0013), not one. Verify and rollback SQL now cover all three.
3. The rollback `git switch main` lands on the wrong commit (production is detached at a recorded commit). Record it first, return to it.
4. The build ran in the production tree. It now runs in a release directory, then the output is copied in.
5. `npm run preview` needs `node_modules/.nitro/last-build.json` (written by a build, here: `{"outputDir":"../../../.vercel/output"}`). The production tree already has it; a fresh tree does not.
6. `npm run build` also runs `db:migrate` and `db:seed` when `DATABASE_URL` is set. Build with `DATABASE_URL` unset after the explicit migrate step so the build touches no database.

## Scope
The cut-over ships the V2 **app** only. The V2 contract (`v2-contract`) stays unmerged and undeployed; the registry keeps `studio-dev-v1` as the only active deployment. A Studio Dev candidate is a separate decision after the cut-over succeeds.

## Step list (you run every [PROD] step; paste the output and I verify it against "Expect")
Each step has the exact command, the expected output, an abort condition (stop and do not continue) and the rollback.

### P0. Read-only facts  [PROD, read-only]
```sh
cd /root/MetricMotive && set -a; . ./.env; set +a
PGOPTIONS='-c default_transaction_read_only=on' psql "$DATABASE_URL" -X -f /root/mm-release-v2/docs/cutover-db-facts.sql
pg_dump --version
```
Expect: `server_version`, a database size, five tables with row counts and sizes, `0010_run_evidence_snapshot.sql` as the newest migration.
Abort if: the newest migration is not `0010_run_evidence_snapshot.sql` (production is not at V1 schema: stop and tell me), or any of the five tables is missing.
Rollback: none (read-only).
**pg_dump must be the same major version as the server or newer.** The host has pg_dump 18. If the server major is greater than 18, use the matching client image instead (needs `docker pull postgres:<major>-alpine` first):
```sh
docker run --rm --network host -e DATABASE_URL -v /root/metricmotive-backups:/backups postgres:<major>-alpine \
  sh -c 'pg_dump --format=custom --no-owner --file=/backups/metricmotive-'"$ts"'.dump "$DATABASE_URL" && pg_restore --list /backups/metricmotive-'"$ts"'.dump | grep -c "TABLE DATA"'
```

### P1. Environment matches the registry  [PROD, read-only; prints names only]
```sh
cd /root/mm-release-v2 && (set -a; . /root/MetricMotive/.env; set +a; node --experimental-strip-types scripts/compare-env-registry.mjs)
```
Expect: each `GENLAYER_*` line says `match` or `unset (the registry value is used)`, then `registry active deployment: studio-dev-v1`, exit 0.
Abort if: any line says `MISMATCH` (the process would refuse to start: `scripts/check-deployment.mjs` runs on every start).
Rollback: none.

### 1. Release directory (not production)
```sh
cd /root/MetricMotive && git worktree add --detach /root/mm-release-v2 v2.0.0-rc3
cd /root/mm-release-v2 && env -u DATABASE_URL npm ci --no-audit --no-fund && env -u DATABASE_URL npm run build
ls .vercel/output/functions/__server.func/_libs | grep pglite
```
Expect: `added 894 packages`; the build ends with `[migrate] DATABASE_URL not set - skipping` and `[seed] DATABASE_URL not set - skipping official examples.`; the `ls` lists `pglite.data` and `pglite.wasm`.
Abort if: `npm ci` or the build exits non-zero, or the pglite files are missing.
Rollback: `git -C /root/MetricMotive worktree remove --force /root/mm-release-v2` (production untouched).
Free disk first: this needs about 1.3 GB.

### 2. Back up production  [PROD, read-only]
```sh
cd /root/MetricMotive && set -a; . ./.env; set +a
ts=$(date -u +%Y%m%dT%H%M%SZ); mkdir -p /root/metricmotive-backups; echo "$ts" > /root/metricmotive-backups/last-ts
git rev-parse HEAD > /root/metricmotive-backups/start-commit
pg_dump --format=custom --no-owner --file="/root/metricmotive-backups/metricmotive-$ts.dump" "$DATABASE_URL"
pg_restore --list "/root/metricmotive-backups/metricmotive-$ts.dump" | grep -c 'TABLE DATA'
cp -a .vercel/output "/root/metricmotive-backups/vercel-output-$ts"
cat /root/metricmotive-backups/start-commit
```
Expect: `pg_dump` prints nothing; the count is at least 11 (11 in the rehearsal); the last line is `c2ffa2e...` (the full hash).
Abort if: `pg_dump` errors or warns about a version mismatch, the count is below 11, the dump is under a few KB, or the commit is not `c2ffa2e`.
Rollback: none (read-only); delete the files if you abort.

### 3. Migrate  [PROD, writes schema]
```sh
cd /root/mm-release-v2 && set -a; . /root/MetricMotive/.env; set +a && npm run db:migrate
```
Expect exactly: `[migrate] applied 0011_failed_tx_supersede.sql`, `applied 0012_tx_run_id.sql`, `applied 0013_chain_resolved_at.sql`, `[migrate] done - 3 migration(s) applied.`
Abort if: anything else (an error, a different count, or `up to date` meaning someone already migrated: tell me).
Rollback: the V1 app keeps working on the migrated schema (rehearsed twice), so you can stop here safely; to undo the schema use section 7.
Locks: see "Migration safety" below; all statements are metadata-only or create new tables.

### 4. Verify the schema  [PROD, read-only]
```sh
psql "$DATABASE_URL" -At -f /root/mm-release-v2/docs/cutover-verify.sql
```
Expect (in order): `0013_chain_resolved_at.sql`, `0012_tx_run_id.sql`, `0011_failed_tx_supersede.sql`, `0010_run_evidence_snapshot.sql`; then eight lines `create_guard_intents.failed_at`, `...failure_kind`, `...failure_reason`, `guard_transactions.failed_at`, `...failure_kind`, `...failure_reason`, `...run_id`, `guards.chain_resolved_at`; then `t|t`; then `0`, `0`, `0`, `0`.
Abort if: any line differs. Existing rows must not have failures or reservations yet.
Rollback: section 7.

### 5. Deploy  [PROD, restarts the live process]
Use a fresh shell (not the one that sourced `.env`), see "What `pm2 restart --update-env` does".
```sh
cd /root/MetricMotive && ts=$(cat /root/metricmotive-backups/last-ts)
git switch --detach v2.0.0-rc3
test -f node_modules/.nitro/last-build.json || echo '{"outputDir":"../../../.vercel/output"}' > node_modules/.nitro/last-build.json
mv .vercel/output ".vercel/output.v1-$ts" && cp -a /root/mm-release-v2/.vercel/output .vercel/output
pm2 restart metricmotive-web --update-env
sleep 6; curl -fsS https://metricmotive.xyz/api/v1/ready; echo; pm2 status metricmotive-web
```
Expect: `{"status":"ready",...,"db":true,"contractConfigured":true,"chainId":61997,"network":"GenLayer Studio Dev","contractAddress":"0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703"}`; pm2 shows `online` with the restart counter up by one.
Then: `/`, `/demo`, `/docs`, `/contract`, `/roadmap`, `/verify/rct_14804bf62424284e`, `/app`, `/app/guards/new` return 200; every `/assets/*.js` referenced by `/` returns 200 (use `grep -a`); `pm2 logs metricmotive-web --lines 50 --nostream` shows no errors.
Abort and roll back if: ready is not 200 within 30 s, pm2 is not `online` or is restarting, the contract address or chain differs, any of the eight routes is not 200, or any asset is not 200.
Rollback: section 6 (about 5 s).

### 6. Roll back the app  [PROD]
```sh
cd /root/MetricMotive && ts=$(cat /root/metricmotive-backups/last-ts)
rm -rf .vercel/output && cp -a "/root/metricmotive-backups/vercel-output-$ts" .vercel/output
git switch --detach "$(cat /root/metricmotive-backups/start-commit)"
pm2 restart metricmotive-web --update-env
sleep 6; curl -fsS https://metricmotive.xyz/api/v1/ready
```
Expect: ready 200 with the same contract address; `/` shows the V1 landing (the 80-meeting case).
Abort condition: none; if it is not ready, stop and paste the output (the dump and the V1 output copy are intact).

### 7. Roll back the schema  [PROD, only if required]
It deletes the superseded-transaction history, live reservations and the stored chain times; export them first:
```sql
\copy guard_transaction_history to '/root/metricmotive-backups/guard_transaction_history.csv' csv header
\copy (select guard_id, operation, tx_hash, failure_kind, failure_reason, failed_at, run_id from guard_transactions where failure_kind is not null or run_id is not null) to '/root/metricmotive-backups/guard_transactions_extra.csv' csv header
\copy (select id, chain_resolved_at from guards where chain_resolved_at is not null) to '/root/metricmotive-backups/guards_chain_resolved_at.csv' csv header
```
then `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /root/mm-release-v2/docs/cutover-rollback.sql`.
Expect: `BEGIN`, `ALTER TABLE`/`DROP TABLE`/`DROP INDEX` lines, `DELETE 3`, `COMMIT`. Run `psql "$DATABASE_URL" -Atc "select count(*) from _migrations"` afterwards: the count equals the count before step 3.
Abort if: any error (the whole script is one transaction and rolls back).
Full restore alternative: `pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" /root/metricmotive-backups/metricmotive-$ts.dump`.

## Migration safety (0011-0013, read from the files and rehearsed)
| Migration | Statements | Additive | Locks | Expected duration |
| --- | --- | --- | --- | --- |
| 0011 | 6 x `ADD COLUMN IF NOT EXISTS` (nullable, no default) on `guard_transactions` and `create_guard_intents`; 2 x `CREATE TABLE` with foreign keys to `guards`; 1 x `CREATE INDEX` on the new empty table | Yes | `ACCESS EXCLUSIVE` on each altered table, held only for the catalog change (no rewrite, PostgreSQL 11+); `SHARE ROW EXCLUSIVE` on `guards` while the foreign keys are created | milliseconds, independent of row count |
| 0012 | 2 x `ADD COLUMN IF NOT EXISTS run_id text` (nullable) | Yes | momentary `ACCESS EXCLUSIVE` on `guard_transactions` and the new history table | milliseconds |
| 0013 | 1 x `ADD COLUMN IF NOT EXISTS chain_resolved_at timestamptz` (nullable) | Yes | momentary `ACCESS EXCLUSIVE` on `guards` | milliseconds |
No statement rewrites a table, backfills, or takes a long lock. The runner applies each file in one transaction. Worst case is waiting behind a long-running query on the same table (the `ACCESS EXCLUSIVE` request queues): check `select pid, state, now()-query_start from pg_stat_activity where state <> 'idle'` first if the migrate step ever seems to hang. V1 keeps working between steps 3 and 5: V1 maps rows field by field, so extra columns are ignored (rehearsed: V1 build served `/`, `/app`, `/docs`, receipts, with extra columns populated, 0 console errors, 0 server errors).

## What `pm2 restart metricmotive-web --update-env` does with the environment
PM2 restarts the registered script, `deployment/start-production.sh`. That script runs `set -a; . ./.env` itself and then `node scripts/check-deployment.mjs` and `exec npm run preview ...`, so **every variable defined in `/root/MetricMotive/.env` is re-read from the file on each restart**, and the file wins over anything PM2 stored. `--update-env` additionally replaces PM2's stored environment with the environment of the shell that runs the command; it matters only for variables that `.env` does not define (for example `PATH`). So: run step 5 in a fresh shell, because a shell that sourced `.env` for the backup would copy the database URL and secrets into PM2's stored environment (visible in `pm2 env`/dump). Plain `pm2 restart metricmotive-web` is enough for this cut-over, since V2 adds no variables.

## Rehearsal timings (disposable database, small data)
| Step | Time |
| --- | --- |
| Release dir from tag | under 1 s |
| `npm ci` | about 60 s |
| `npm run build` | 23.8 s |
| `pg_dump` + `pg_restore --list` + copy of live output | 0.5 s + 0.2 s |
| `db:migrate` (0011-0013) / re-run | 0.7 s / 0.5 s |
| Verification queries | 0.2 s |
| Switch tree + swap output | 0.3 s |
| Restart until `/api/v1/ready` | 4.9 s |
| Rollback: restore output + restart | 5 s |
| Schema rollback SQL | under 1 s |
| Full `pg_restore` | under 1 s |
Production data volume will make the dump, restore and migrate times larger; the app downtime is only the restart.

## Database requirement
- The production build/preview needs `DATABASE_URL` (Postgres) at runtime. Without it the app falls back to PGLite, which needs `pglite.data`, `pglite.wasm` and `initdb.wasm` in `.vercel/output/functions/__server.func/_libs/` (the build copies them).
- QA previews use a disposable Postgres or PGLite, never the production database.
- Restart a preview after every build (stale HTML points at old hashed assets).

## Accepted risks and kept components

- **`style-src 'unsafe-inline'` (accepted risk).** Script CSP is nonce-based (S-01 done). Styles stay inline because the
  framework inlines the stylesheet (`server.build.inlineCss`), which was worth +13-15 Lighthouse mobile points (landing 88 vs 73
  when linked) and React sets `style` attributes. Impact: CSS injection is not blocked; script execution still is.
  Follow-up: serve the stylesheet as a linked, cacheable file with a nonce or hash, re-measure Lighthouse (keep >= 90), then drop `'unsafe-inline'` from `style-src`.
- **Better Auth is kept, and is not in the production output.** The `better-auth` package, `src/lib/auth/*` and `AuthProvider`
  stay because `vite.config.ts` loads `src/lib/auth/popup.server.ts` for the live-preview platform's `/auth/popup`. Checked on the
  v2 build: `.vercel/output` has no `better-auth` code (no match in the server bundle or static assets; `node_modules` of the server
  function has no `better-auth`), because `VITE_AUTH_ENABLED=false` and there are no auth routes. Production sign-in is wallet auth
  (`/api/v1/auth/*`). Removing the stack needs a decision about the preview platform's popup.
