-- Durable pre-submit ownership for create_guard. A transaction hash is still
-- recorded immediately after wallet submission, but this row closes the race
-- before a hash exists and survives browser/process restarts.
create table if not exists create_guard_intents (
  guard_id text primary key references guards(id),
  idempotency_key text not null unique,
  wallet text not null,
  version integer not null,
  definition_hash text not null,
  chain_id integer not null,
  contract_address text not null,
  claim_token text not null,
  state text not null default 'RESERVED',
  tx_hash text unique,
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (state in ('RESERVED', 'SUBMITTED', 'RECONCILED', 'RELEASED'))
);

create index if not exists create_guard_intents_pending_idx
  on create_guard_intents (updated_at)
  where state <> 'RECONCILED';

-- Existing local creates become durable reservations without changing their
-- chain history. Their legacy key is intentionally unique per local Guard.
insert into create_guard_intents (
  guard_id, idempotency_key, wallet, version, definition_hash, chain_id,
  contract_address, claim_token, state, tx_hash, reconciled_at
)
select
  g.id,
  'legacy:' || g.id,
  g.owner_address,
  g.version,
  g.definition_hash,
  coalesce(g.tx_create_chain_id, 61999),
  coalesce(g.tx_create_contract, '0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8d7C'),
  'legacy',
  case when g.onchain_id is not null then 'RECONCILED' else 'SUBMITTED' end,
  g.tx_create,
  case when g.onchain_id is not null then coalesce(g.updated_at, now()) else null end
from guards g
where g.tx_create is not null
on conflict (guard_id) do nothing;

-- Existing certification activity may already contain multiple V2 drafts. Do
-- not add a uniqueness constraint retroactively; create_guard idempotency is
-- enforced on the durable intent for each local draft below.
