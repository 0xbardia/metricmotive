alter table guards add column if not exists contract_address text;
alter table guards add column if not exists chain_id integer;
alter table guards add column if not exists network text;

update guards g set
  contract_address = coalesce(g.tx_create_contract,
    (select t.contract_address from guard_transactions t where t.guard_id=g.id order by t.submitted_at limit 1),
    '0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8d7C'),
  chain_id = coalesce(g.tx_create_chain_id,
    (select t.chain_id from guard_transactions t where t.guard_id=g.id order by t.submitted_at limit 1), 61999),
  network = 'Studionet'
where g.contract_address is null and
  (g.onchain_id is not null or g.tx_create is not null or exists
    (select 1 from guard_transactions t where t.guard_id=g.id));

update guards g set contract_address=i.contract_address, chain_id=i.chain_id, network='Studionet'
from create_guard_intents i where i.guard_id=g.id and g.contract_address is null and i.state <> 'RELEASED';

create index if not exists guards_contract_identity_idx
  on guards(chain_id, lower(contract_address), onchain_id);

update receipts r set snapshot_json =
  (r.snapshot_json::jsonb || jsonb_build_object(
    'contractAddress', coalesce(r.snapshot_json::jsonb->>'contractAddress', g.contract_address),
    'chainId', g.chain_id))::text
from guards g where g.id=r.guard_id and g.contract_address is not null;
