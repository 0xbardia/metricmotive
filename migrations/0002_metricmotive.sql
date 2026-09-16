create table if not exists guards (
  id text primary key,
  owner_address text not null default '',
  parent_id text,
  version integer not null default 1,
  motive text not null default '',
  metric text not null default '',
  guardrails_json text not null default '[]',
  definition_hash text not null default '',
  status text not null default 'DRAFT',
  evidence_json text not null default '',
  evidence_hash text not null default '',
  findings_json text not null default '',
  verdict text,
  primary_pattern text,
  onchain_id text,
  tx_create text,
  tx_arm text,
  tx_evidence text,
  tx_evaluate text,
  authority text not null default 'LOCAL',
  is_example boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  armed_at timestamptz,
  evidence_at timestamptz,
  resolved_at timestamptz
);

create index if not exists guards_status_idx on guards (status);
create index if not exists guards_owner_idx on guards (owner_address);
create index if not exists guards_example_idx on guards (is_example);

create table if not exists runs (
  id text primary key,
  guard_id text not null,
  agent_ref text not null default '',
  status text not null default 'STARTED',
  events_json text not null default '[]',
  outcome_json text not null default '{}',
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists runs_guard_idx on runs (guard_id);

create table if not exists receipts (
  id text primary key,
  guard_id text not null,
  is_example boolean not null default false,
  snapshot_json text not null,
  created_at timestamptz not null default now()
);

create index if not exists receipts_guard_idx on receipts (guard_id);

create table if not exists advisory_reports (
  id text primary key,
  guard_id text not null,
  kind text not null,
  result_json text not null,
  model text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists advisory_guard_idx on advisory_reports (guard_id, kind);

create table if not exists idempotency_keys (
  key text primary key,
  response_json text not null,
  created_at timestamptz not null default now()
);
