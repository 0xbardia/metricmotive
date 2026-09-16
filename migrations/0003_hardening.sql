-- V1 hardening: ownership joins, lifecycle invariants, idempotency metadata,
-- and wallet-session primitives. All changes are additive and transactional.

alter table idempotency_keys
  add column if not exists scope text not null default 'default',
  add column if not exists fingerprint text not null default '',
  add column if not exists expires_at timestamptz not null default (now() + interval '24 hours');

create index if not exists idempotency_expiry_idx on idempotency_keys (expires_at);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'guards_status_check') then
    alter table guards add constraint guards_status_check
      check (status in ('DRAFT', 'ARMED', 'EVIDENCE_SUBMITTED', 'RESOLVED'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'guards_authority_check') then
    alter table guards add constraint guards_authority_check
      check (authority in ('LOCAL', 'GENLAYER'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'runs_status_check') then
    alter table runs add constraint runs_status_check
      check (status in ('STARTED', 'FINISHED'));
  end if;
end $$;

alter table runs
  add constraint runs_guard_fk foreign key (guard_id) references guards(id) not valid;
alter table receipts
  add constraint receipts_guard_fk foreign key (guard_id) references guards(id) not valid;
alter table advisory_reports
  add constraint advisory_reports_guard_fk foreign key (guard_id) references guards(id) not valid;

create unique index if not exists receipts_guard_unique_idx on receipts (guard_id);

create table if not exists wallet_nonces (
  nonce_hash text primary key,
  address text not null,
  message text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists wallet_nonces_expiry_idx on wallet_nonces (expires_at);

create table if not exists wallet_sessions (
  token_hash text primary key,
  address text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists wallet_sessions_expiry_idx on wallet_sessions (expires_at);
create index if not exists wallet_sessions_address_idx on wallet_sessions (lower(address));
