-- READ-ONLY production facts. Run with: PGOPTIONS='-c default_transaction_read_only=on' psql "$DATABASE_URL" -X -f docs/cutover-db-facts.sql
show server_version;
select pg_size_pretty(pg_database_size(current_database())) as database_size;
select relname as "table",
       (select reltuples::bigint from pg_class c2 where c2.oid = c.oid) as est_rows,
       pg_size_pretty(pg_total_relation_size(c.oid)) as total_size
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
   and relname in ('guards','runs','receipts','guard_transactions','create_guard_intents')
 order by relname;
select 'guards' as t, count(*) from guards union all select 'runs', count(*) from runs
 union all select 'receipts', count(*) from receipts union all select 'guard_transactions', count(*) from guard_transactions
 union all select 'create_guard_intents', count(*) from create_guard_intents;
select name from _migrations order by name desc limit 3;      -- expect 0010_run_evidence_snapshot.sql first
