# V2 production cut-over

Run by a human operator only. Nothing in this file runs automatically. `v2.0.0-rc2` differs from the rehearsed `v2.0.0-rc1` only in `CUTOVER.md` and `docs/cutover-*.sql`. **Rehearsed end to end on 2026-10-13** against a
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

## 0. Preconditions
- Branch `v2` reviewed; tag `v2.0.0-rc2` exists (`git tag -l`). Working tree of production is clean (`git -C /root/MetricMotive status`).
- Record where production is now, for the rollback: `git -C /root/MetricMotive rev-parse HEAD` (at rehearsal time `c2ffa2e`, detached).
- No new dependencies in V2 (the diff only removes packages), so the production `node_modules` is a superset of what V2 needs: no `npm ci` in the production tree.

## 1. Release directory (not production)  - about 1 min
```sh
cd /root/MetricMotive            # read-only use: shares the repository
git worktree add --detach /root/mm-release-v2 v2.0.0-rc2
cd /root/mm-release-v2
env -u DATABASE_URL npm ci --no-audit --no-fund       # ~60 s
env -u DATABASE_URL npm run build                     # ~24 s; skips migrate and seed
ls .vercel/output/functions/__server.func/_libs | grep pglite    # pglite.data, pglite.wasm present
```
Gates already green on the tag: typecheck, `npm test`, 14 browser e2e scenarios on this exact build, Lighthouse.

## 2. Back up production  **[PROD]**  - under 1 s on a small database
```sh
cd /root/MetricMotive
set -a; . ./.env; set +a
ts=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p /root/metricmotive-backups
pg_dump --format=custom --no-owner --file="/root/metricmotive-backups/metricmotive-$ts.dump" "$DATABASE_URL"
pg_restore --list "/root/metricmotive-backups/metricmotive-$ts.dump" | grep -c 'TABLE DATA'   # non-zero (11 in the rehearsal)
cp -a .vercel/output "/root/metricmotive-backups/vercel-output-$ts"                          # the live V1 build
echo "$ts" > /root/metricmotive-backups/last-ts
```
`pg_dump` must be the same major version as the server or newer (`pg_dump --version`; `psql "$DATABASE_URL" -Atc 'show server_version'`). The host has pg_dump 18 and the server is expected to be 17 or newer.

## 3. Migrate  **[PROD]**  - about 1 s
Migrations 0011, 0012 and 0013 are additive (new nullable columns, two tables, one index); the V1 code that is still running ignores them (rehearsed: V1 served `/`, `/docs`, `/app` and `/api/v1/ready` on the migrated schema with no errors).
```sh
cd /root/mm-release-v2           # the release directory, NOT the production tree
set -a; . /root/MetricMotive/.env; set +a
npm run db:migrate
```
Expected: `applied 0011_failed_tx_supersede.sql`, `applied 0012_tx_run_id.sql`, `applied 0013_chain_resolved_at.sql`, `done - 3 migration(s) applied.` A second run prints `up to date.`

## 4. Verify the schema  **[PROD, read-only]**  - under 1 s
```sh
psql "$DATABASE_URL" -At -f /root/mm-release-v2/docs/cutover-verify.sql
```
Expected: the three migration names first; 8 columns (`create_guard_intents.{failed_at,failure_kind,failure_reason}`, `guard_transactions.{failed_at,failure_kind,failure_reason,run_id}`, `guards.chain_resolved_at`); `t|t`; then counts `0 0 0 0` right after migrating.

## 5. Deploy  **[PROD]**  - about 5 s of downtime (the restart)
```sh
cd /root/MetricMotive
ts=$(cat /root/metricmotive-backups/last-ts)
git switch --detach v2.0.0-rc2
test -f node_modules/.nitro/last-build.json || echo '{"outputDir":"../../../.vercel/output"}' > node_modules/.nitro/last-build.json
mv .vercel/output ".vercel/output.v1-$ts"
cp -a /root/mm-release-v2/.vercel/output .vercel/output
pm2 restart metricmotive-web --update-env
curl -fsS https://metricmotive.xyz/api/v1/ready
```
Then check `/`, `/demo`, `/docs`, `/contract`, `/roadmap`, `/verify/rct_14804bf62424284e`, `/app`, `/app/guards/new` return 200, and that every `/assets/*.js` referenced by `/` returns 200 (grep with `grep -a`: the HTML is one long line). Look at `pm2 logs metricmotive-web --lines 50` for errors and at the nginx error log for 5xx.

## 6. Roll back the app  **[PROD]**  - about 5 s
```sh
cd /root/MetricMotive
ts=$(cat /root/metricmotive-backups/last-ts)
rm -rf .vercel/output && cp -a "/root/metricmotive-backups/vercel-output-$ts" .vercel/output
git switch --detach <the commit recorded in section 0>
pm2 restart metricmotive-web --update-env
curl -fsS https://metricmotive.xyz/api/v1/ready
```
V1 code ignores the new schema objects, so the schema can stay. (Rehearsed: V1 output restored, tree back on the recorded commit, healthy.)

## 7. Roll back the schema  **[PROD]**, only if required  - under 1 s
It deletes the superseded-transaction history, live reservations and the stored chain times, so export them first:
```sql
\copy guard_transaction_history to '/root/metricmotive-backups/guard_transaction_history.csv' csv header
\copy (select guard_id, operation, tx_hash, failure_kind, failure_reason, failed_at, run_id from guard_transactions where failure_kind is not null or run_id is not null) to '/root/metricmotive-backups/guard_transactions_extra.csv' csv header
\copy (select id, chain_resolved_at from guards where chain_resolved_at is not null) to '/root/metricmotive-backups/guards_chain_resolved_at.csv' csv header
```
then `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /root/mm-release-v2/docs/cutover-rollback.sql`.
Rehearsed: after this SQL the schema (`pg_dump --schema-only`) is identical to a restore of the backup, and `_migrations` is back to 9 rows. A transaction superseded under V2 survives only in the CSV export.
Full restore instead: `pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" <dump>` (about 1 s on the rehearsal data).

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
