-- A finished Run's canonical evidence snapshot is immutable.
--
-- Previously the manifest was rebuilt from mutable columns on every read, so
-- the same Run could hash differently between the wallet submission and the
-- reconciliation (driver Date vs ISO string cost us exactly that). Persist the
-- exact canonical manifest + its two digests once, at Finish Run, and replay
-- those bytes everywhere afterwards.
alter table runs add column if not exists evidence_snapshot_json text;
alter table runs add column if not exists evidence_manifest_hash text;
alter table runs add column if not exists evidence_commitment_hash text;
alter table runs add column if not exists evidence_committed_at timestamptz;

-- Evidence is committed against a Run's snapshot, so the commitment recorded
-- for a submit_evidence transaction is the Run snapshot's — not a fresh hash.
comment on column runs.evidence_snapshot_json is
  'Canonical evidence manifest JSON captured once at Finish Run; the exact bytes submitted on chain.';
comment on column runs.evidence_commitment_hash is
  'sha256(canonical(manifest including manifestHash)) as stored by the contract (evidence_hash).';
