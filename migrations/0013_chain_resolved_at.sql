-- The contract's own resolve time (get_guard.resolved_at), kept apart from resolved_at, which is the
-- moment this app recorded the verdict. The receipt shows "Resolved on-chain" from this column and
-- "Recorded" from resolved_at. Set once; older rows are filled lazily from the chain on first view.
alter table guards add column if not exists chain_resolved_at timestamptz;
