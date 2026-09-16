-- One durable provenance record per GenLayer write operation.
-- The hash is the authoritative submission evidence; confirmation is a later
-- reconciliation step and must never replace it with a fresh write.
create table if not exists guard_transactions (
  guard_id text not null references guards(id),
  operation text not null,
  tx_hash text not null,
  originating_wallet text not null,
  chain_id integer not null,
  contract_address text not null,
  expected_guard_id text,
  expected_evidence_hash text,
  submitted_at timestamptz not null default now(),
  reconciled_at timestamptz,
  primary key (guard_id, operation),
  unique (tx_hash),
  check (operation in ('create_guard', 'update_draft', 'arm_guard', 'submit_evidence', 'evaluate_guard', 'create_version'))
);

create index if not exists guard_transactions_pending_idx
  on guard_transactions (submitted_at)
  where reconciled_at is null;

-- Carry forward the legacy transaction columns written before this ledger
-- existed.  Conflict clauses make this safe on every deploy/restart.
insert into guard_transactions (
  guard_id, operation, tx_hash, originating_wallet, chain_id, contract_address,
  expected_guard_id, expected_evidence_hash, submitted_at
)
select id, 'create_guard', tx_create, coalesce(tx_create_owner, owner_address),
       coalesce(tx_create_chain_id, 61999), coalesce(tx_create_contract, '0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8d7C'),
       onchain_id, null, coalesce(tx_create_submitted_at, created_at)
  from guards
 where tx_create is not null
on conflict do nothing;

insert into guard_transactions (
  guard_id, operation, tx_hash, originating_wallet, chain_id, contract_address,
  expected_guard_id, expected_evidence_hash, submitted_at
)
select id, 'arm_guard', tx_arm, owner_address, 61999,
       '0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8d7C', onchain_id, null, coalesce(armed_at, updated_at)
  from guards
 where tx_arm is not null
on conflict do nothing;

insert into guard_transactions (
  guard_id, operation, tx_hash, originating_wallet, chain_id, contract_address,
  expected_guard_id, expected_evidence_hash, submitted_at
)
select id, 'submit_evidence', tx_evidence, owner_address, 61999,
       '0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8d7C', onchain_id, null, coalesce(evidence_at, updated_at)
  from guards
 where tx_evidence is not null
on conflict do nothing;

insert into guard_transactions (
  guard_id, operation, tx_hash, originating_wallet, chain_id, contract_address,
  expected_guard_id, expected_evidence_hash, submitted_at
)
select id, 'evaluate_guard', tx_evaluate, owner_address, 61999,
       '0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8d7C', onchain_id, null, coalesce(resolved_at, updated_at)
  from guards
 where tx_evaluate is not null
on conflict do nothing;
