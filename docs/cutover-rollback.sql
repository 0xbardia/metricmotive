begin;
-- 0013
alter table guards drop column if exists chain_resolved_at;
-- 0012 (guard_transaction_history.run_id goes with the table below)
alter table guard_transactions drop column if exists run_id;
-- 0011
drop table if exists guard_operation_reservations;
drop index if exists guard_transaction_history_guard_idx;
drop table if exists guard_transaction_history;
alter table guard_transactions drop column if exists failure_kind;
alter table guard_transactions drop column if exists failure_reason;
alter table guard_transactions drop column if exists failed_at;
alter table create_guard_intents drop column if exists failure_kind;
alter table create_guard_intents drop column if exists failure_reason;
alter table create_guard_intents drop column if exists failed_at;
delete from _migrations where name in ('0011_failed_tx_supersede.sql','0012_tx_run_id.sql','0013_chain_resolved_at.sql');
commit;
