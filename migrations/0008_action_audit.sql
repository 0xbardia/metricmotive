-- Minimal UI mutation audit trail. Payloads are intentionally excluded: the
-- existing Guard, Run, and transaction provenance tables remain authoritative.
create table if not exists ui_action_audit (
  id text primary key,
  action_name text not null,
  resource_id text,
  actor_wallet text not null,
  route text not null,
  idempotency_key text,
  operation_id text,
  created_at timestamptz not null default now()
);

create index if not exists ui_action_audit_resource_idx
  on ui_action_audit (resource_id, created_at desc);
create index if not exists ui_action_audit_action_idx
  on ui_action_audit (action_name, created_at desc);
