# V2 production cut-over

Run by a human operator only. Nothing in this file runs automatically.

The live site (`metricmotive.xyz`, PM2 process on `127.0.0.1:4189`) serves
`.vercel/output` from **this working tree** (`deployment/start-production.sh`
runs `npm run preview`). Running `npm run build` here replaces the files the
live process serves, so a build in this directory *is* a deploy. Do QA builds
in a separate `git worktree`, never here.

## 0. Preconditions

- Branch `v2` reviewed and approved; working tree clean (`git status`).
- QA build of the same commit passed in a separate worktree.
- Shell loads secrets without printing them: `set -a; . ./.env; set +a`.

## 1. Back up production

```sh
cd /root/MetricMotive
set -a; . ./.env; set +a
ts=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p /root/metricmotive-backups
pg_dump --format=custom --no-owner --file="/root/metricmotive-backups/metricmotive-$ts.dump" "$DATABASE_URL"
pg_restore --list "/root/metricmotive-backups/metricmotive-$ts.dump" | grep -c 'TABLE DATA'   # non-zero
cp -a .vercel/output "/root/metricmotive-backups/vercel-output-$ts"                          # current live build
```

`pg_dump` must be the same major version as the server or newer
(`pg_dump --version`; server: `psql "$DATABASE_URL" -Atc 'show server_version'`).

## 2. Migrate

Migration `0011_failed_tx_supersede.sql` is additive (new nullable columns, two
new tables, one index) and safe for the V1 code that is still running.

```sh
cd /root/MetricMotive
set -a; . ./.env; set +a
npm run db:migrate
```

Expected output: `[migrate] applied 0011_failed_tx_supersede.sql` then
`done — 1 migration(s) applied.` A second run prints `up to date.`

Tested on a disposable PostgreSQL 17 (0002–0010 applied first, then this exact
command, then 0011 re-run twice raw): no errors.

## 3. Verify the schema

```sql
select name, applied_at from _migrations order by name desc limit 3;
select column_name from information_schema.columns
 where table_name in ('guard_transactions','create_guard_intents')
   and column_name in ('failure_kind','failure_reason','failed_at')
 order by table_name, column_name;                       -- 6 rows
select to_regclass('guard_transaction_history'), to_regclass('guard_operation_reservations');  -- both non-null
select count(*) from guard_transactions where failure_kind is not null;      -- 0 right after migrate
select count(*) from guard_transaction_history;                              -- 0 right after migrate
select count(*) from guard_operation_reservations;                           -- 0 right after migrate
```

## 4. Build and restart (needs explicit approval)

```sh
cd /root/MetricMotive
git switch v2
npm run build            # replaces .vercel/output = the deploy
pm2 restart metricmotive-web --update-env
curl -fsS https://metricmotive.xyz/api/v1/ready
```

Then check that every `/assets/*.js` referenced by `/` returns 200.

## Database requirement

- The production build/preview needs `DATABASE_URL` (Postgres) at runtime.
- Without it the app falls back to PGLite, which only works if the PGLite files are in
  `.vercel/output/functions/__server.func/_libs/`. The build copies `pglite.data`,
  `pglite.wasm` and `initdb.wasm` there; confirm with `ls` after building.
- QA previews use a disposable Postgres or PGLite, never the production database.
- Migrations 0011, 0012, 0013 are additive. 0013 adds `guards.chain_resolved_at`, filled lazily
  from the chain for older receipts.
- Order: backup -> migrate -> build in a separate worktree -> switch -> restart.
- Restart the QA preview after every build (stale HTML points at old hashed assets).

## 5. Rollback

App first (V1 code ignores the 0011 objects, so the schema can stay):

```sh
cd /root/MetricMotive
rm -rf .vercel/output && cp -a "/root/metricmotive-backups/vercel-output-$ts" .vercel/output
git switch main
pm2 restart metricmotive-web --update-env
```

Schema rollback for 0011, only if required. It deletes the superseded-transaction
history and live reservations, so export them first:

```sql
\copy guard_transaction_history to '/root/metricmotive-backups/guard_transaction_history.csv' csv header
\copy (select guard_id, operation, tx_hash, failure_kind, failure_reason, failed_at from guard_transactions where failure_kind is not null) to '/root/metricmotive-backups/guard_transactions_failures.csv' csv header

begin;
drop table if exists guard_operation_reservations;
drop index if exists guard_transaction_history_guard_idx;
drop table if exists guard_transaction_history;
alter table guard_transactions drop column if exists failure_kind;
alter table guard_transactions drop column if exists failure_reason;
alter table guard_transactions drop column if exists failed_at;
alter table create_guard_intents drop column if exists failure_kind;
alter table create_guard_intents drop column if exists failure_reason;
alter table create_guard_intents drop column if exists failed_at;
delete from _migrations where name = '0011_failed_tx_supersede.sql';
commit;
```

A transaction superseded under V2 has already been removed from
`guard_transactions`; after a schema rollback its record survives only in the
CSV export. Full restore: `pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" <dump>`.
