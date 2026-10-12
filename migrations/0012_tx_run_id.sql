-- Bind a submit_evidence transaction to the Run it commits (E-14).
alter table guard_transactions add column if not exists run_id text;
alter table guard_transaction_history add column if not exists run_id text;
