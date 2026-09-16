-- A submitted GenLayer write is durable evidence even when confirmation reads fail.
-- Keep its provenance on the Guard so a refresh or process restart can resume
-- reconciliation without ever asking the wallet to submit the write again.
alter table guards add column if not exists tx_create_operation text;
alter table guards add column if not exists tx_create_owner text;
alter table guards add column if not exists tx_create_chain_id integer;
alter table guards add column if not exists tx_create_contract text;
alter table guards add column if not exists tx_create_submitted_at timestamptz;

create index if not exists guards_pending_create_idx
  on guards (tx_create)
  where tx_create is not null and onchain_id is null;
