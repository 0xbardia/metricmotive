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

```

Contract source: `contracts/metric-motive/src/metric_motive.py`

Active Studionet deployment (read-certified; real-wallet test pending):

- Address: `0xe39e59f8Dd78E416D9EE074Ca3f899C7Eb56Fb2d`
- Chain ID: 61999
- Previous deployment tx (legacy only): `0xb7cde061b32726e6abfafb2a83868b8d4993028769dc5c5f6fa6e90d89f7ffda`

## Deployment routing

The active deployment is defined in `packages/sdk/src/deployment.ts` and shared by the app and SDK. The app bundles it at build time; changing `.env` alone does not change wallet recipients. Build and production startup reject environment/deployment disagreement.

Guards persist contract address, chain ID and network. Reads, operations, receipts and reconciliation use that provenance, never a changed global default. Historical Guard IDs require their original contract. SDK users can pass `contractAddress` explicitly; use one client per deployment. New versions start on the current contract and retain local parent lineage, not a cross-contract numeric parent ID.
