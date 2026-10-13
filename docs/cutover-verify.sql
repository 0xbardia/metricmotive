select name from _migrations order by name desc limit 4;
select table_name||'.'||column_name from information_schema.columns
 where (table_name in ('guard_transactions','create_guard_intents') and column_name in ('failure_kind','failure_reason','failed_at'))
    or (table_name='guard_transactions' and column_name='run_id')
    or (table_name='guards' and column_name='chain_resolved_at') order by 1;
select to_regclass('guard_transaction_history') is not null as history, to_regclass('guard_operation_reservations') is not null as reservations;
select count(*) as failures from guard_transactions where failure_kind is not null;
select count(*) as history from guard_transaction_history;
select count(*) as reservations from guard_operation_reservations;
select count(*) as guards_with_chain_time from guards where chain_resolved_at is not null;
