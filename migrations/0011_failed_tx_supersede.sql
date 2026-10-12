-- Replaceable failed writes + pre-signature reservations for the non-create
-- operations. A recorded hash stays the durable submission evidence; only a
-- server-verified revert may be superseded, and the old row is archived to
-- guard_transaction_history rather than deleted.
alter table guard_transactions add column if not exists failure_kind text;
alter table guard_transactions add column if not exists failure_reason text;
alter table guard_transactions add column if not exists failed_at timestamptz;
alter table create_guard_intents add column if not exists failure_kind text;
alter table create_guard_intents add column if not exists failure_reason text;
alter table create_guard_intents add column if not exists failed_at timestamptz;

create table if not exists guard_transaction_history (
  id bigserial primary key,
  guard_id text not null references guards(id),
  operation text not null,
  tx_hash text not null unique,
  originating_wallet text not null,
  chain_id integer not null,
  contract_address text not null,
  expected_guard_id text,
  expected_evidence_hash text,
  submitted_at timestamptz,
  failure_kind text,
  failure_reason text,
  failed_at timestamptz,
  superseded_at timestamptz not null default now(),
  superseded_by text
);

create index if not exists guard_transaction_history_guard_idx
  on guard_transaction_history (guard_id, operation);

-- Hashless reservation taken BEFORE the wallet is asked to sign. The row is
-- removed when the hash is recorded (the hash is the lock from then on) or on
-- release; a stale row (updated_at older than the app-side TTL) can be taken over.
create table if not exists guard_operation_reservations (
  guard_id text not null references guards(id),
  operation text not null,
  wallet text not null,
  claim_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guard_id, operation),
  check (operation in ('arm_guard', 'submit_evidence', 'evaluate_guard'))
);
