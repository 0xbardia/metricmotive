# Architecture

```
User → Web app (TanStack Start)
        ├─ Wallet nonce/signature → HttpOnly owner session
        ├─ Drafts, runs, receipts (Postgres)
        ├─ Advisory intelligence (provider-neutral, labeled local/off-chain)
        └─ Writes/reads → GenLayer Intelligent Contract (Studionet)

Verdict mapping lives in the contract and is mirrored in TypeScript for local advisory evaluation.
Off-chain results never overwrite a finalized on-chain verdict. Chain-derived
local state is monotonic: delayed ARMED/EVIDENCE updates cannot downgrade
RESOLVED.

Private mutations use the authenticated wallet address from the server session,
not an address supplied by a request. API and webhook mutations use canonical
Zod schemas, a 32 KiB body cap, bounded event data, and scoped idempotency
records. Run events append atomically in PostgreSQL, and one receipt is allowed
per Guard. Official examples are inserted by explicit idempotent seeding, never
by a GET route.

The landing route does not mount the wallet provider. Wallet and GenLayer client
code is mounted at app/write boundaries so public marketing pages can render
without initializing write infrastructure.

TypeScript SDK: `packages/sdk` (`@metricmotive/sdk` 1.0.0, not published to npm).
Sales-agent example: `examples/sales-agent`.

## Evidence commitment invariants

A finished Run is immutable for evidence purposes.

- **Finish Run** builds the canonical evidence manifest once and persists it
  verbatim (`runs.evidence_snapshot_json`) with both digests: the inner
  `manifestHash` (canonical manifest excluding that field) and the contract
  commitment `evidence_commitment_hash` (canonical full manifest, which is what
  the contract stores as `evidence_hash`).
- **Submission** (`prepareEvidenceFn`) and **reconciliation** replay those
  exact persisted bytes. Neither rebuilds a manifest from the mutable Run
  columns; a refresh can no longer change what is being compared.
- Reconciliation compares the on-chain argument to the pinned snapshot by
  canonical preimage. A difference is a hard `MISMATCH` — never a fuzzy match.
- Runs finished before snapshots existed are recovered by proving the submitted
  manifest is canonically identical to the persisted Run, then pinning the
  SUBMITTED bytes (the transaction is the submission of record). A mismatched
  transaction fails closed.
- Timestamps are normalized to ISO-8601 UTC at the DB boundary, and the
  canonical serializer renders a `Date` as its ISO string. Both were required:
  a driver-parsed `Date` previously canonicalized to `{}`, which made the same
  Run hash differently between submission and confirmation.

A submitted-but-unconfirmed transaction is a delay, not a failure: the hash is
preserved and the only offered action re-reads it ("Check again"). It never
resubmits.

```

Contract source: `contracts/metric-motive/src/metric_motive.py`

Active deployment: GenLayer Studio Dev (not mainnet; not a permanent-state guarantee):

- Address: `0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703`
- Chain ID: 61997
- RPC: `https://studio-dev.genlayer.com/api`
- Explorer: `https://explorer-studio-dev.genlayer.com`
- SDK: `genlayer-js@2.0.0-rc.1`

Historical Studionet (61999) remains first-class and read-only:

- Previous: `0xe39e59f8Dd78E416D9EE074Ca3f899C7Eb56Fb2d`
- Legacy: `0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8D7C`

## Deployment routing

The active deployment is defined in `packages/sdk/src/deployment.ts` and shared by the app and SDK. The app bundles it at build time; changing `.env` alone does not change wallet recipients. Build and production startup reject environment/deployment disagreement.

Guards persist contract address, chain ID and network. Reads, operations, receipts and reconciliation use that provenance, never a changed global default. Historical Guard IDs require their original contract. SDK users can pass `contractAddress` explicitly; use one client per deployment. New versions start on the current contract and retain local parent lineage, not a cross-contract numeric parent ID.
