# MetricMotive

**Your agent hit the metric. Did it honor the motive?**

MetricMotive verifies whether autonomous agents honored the user's real objective, or gamed the metric they were optimizing.

It is not a generic AI judge, escrow, reputation system, or chat wrapper. It is a Motive Guard: specify, stress-test, capture evidence, and verify with GenLayer consensus.

## Architecture

- Intelligent Contract (Python / GenLayer): locked definitions, evidence commitments, independent validator adjudication, deterministic verdict mapping
- Web app (TanStack Start): drafts, Run Recorder, advisory preflight, RainbowKit wallet, public receipts
- Postgres: owned product data and chain indexing; never overwrites a finalized on-chain verdict
- Wallet auth: a single-use signed nonce establishes a short-lived HttpOnly session; request-body owners are never trusted

## Quick start

```bash
npm install
cp .env.example .env
# Set VITE_WALLETCONNECT_PROJECT_ID from https://cloud.reown.com for WalletConnect wallets.
# Injected wallets work without it. Leave DATABASE_URL empty to use PGLite.
npm run test:contract
npm test
npm run typecheck
npm run lint
npm run dev
```

The app listens on port 8080. See `docs/ENVIRONMENT.md`. Do not commit secrets.

## Testing

```bash
npm run test:contract
npm test
npm run typecheck
npm run lint
npm run build
```

`npm test` runs the configured scaffold, TypeScript, contract, and SDK suites.
`npm run build` also applies tracked migrations and idempotently seeds the
official examples; ordinary GET routes do not seed data.

## Contract

Source: `contracts/metric-motive/src/metric_motive.py`

- Network: GenLayer Studio Dev
- Chain ID: 61997
- Address: `0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703`
- RPC: `https://studio-dev.genlayer.com/api`
- Explorer: `https://explorer-studio-dev.genlayer.com`
- Deployer: `0xAfdd7BB72513E8516f4F1d43F9bA9cC7A611F677`
- Source SHA-256: `0e5f3cc0103e5f785fe12b34ecd478dfc909014a40d803ccf98227bb77a7cee1`
- Client SDK: `genlayer-js@2.0.0-rc.1`
- Studio Dev is not mainnet and does not carry permanent state guarantees.

Studio: https://studio-dev.genlayer.com/?import-contract=0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703

Historical Studionet (61999) remains supported as read-only provenance:

- Previous: `0xe39e59f8Dd78E416D9EE074Ca3f899C7Eb56Fb2d`
- Legacy: `0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8D7C`

The earlier Studionet address `0x41C3A675c4dd1Bc7C502e4Bfe5086D9F2E996937` is superseded.

## SDK

Local package: `packages/sdk` (`@metricmotive/sdk` 1.0.0). Not published to npm.

```bash
npm run test:sdk
npm run build:sdk
node --experimental-strip-types examples/sales-agent/run.mjs
```

The SDK separates the off-chain Run Recorder from on-chain GenLayer writes. A local run is not a verdict.

The HTTP Run Recorder requires a MetricMotive wallet session, or the signed
webhook integration. SDK HTTP mutations send idempotency keys; retries of the
same request return the original result, while key reuse with a different body
is rejected. The API caps request bodies at 32 KiB, event data at 2,000 UTF-8
bytes, and a run at 80 events. See `/api/v1/openapi.json` and
`packages/sdk/README.md` for schemas, errors, and HMAC headers.

## Studio Dev E2E certification (61997)

Certified on `0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703`. Not mainnet.

- Local Guard `grd_6bf7a408ce5c883c` / on-chain Guard `1`
- Run `run_82a3826bf23f3ab7`
- Receipt `rct_14804bf62424284e`
- create `0x1a24c92ea8beab437d4abb21e9ff646f8aec9d62273a60dbbc541dc069284eb5`
- arm `0x65ce7e772d68e673c63a26ed9e44debf7030a9fc56265cd2c5390c48e4202933`
- submit_evidence `0xf8901f18657b0c612d4f148c89fb3786bb2d4b389a31d623439321649aceaa4b`
- evaluate `0x33bdfa268b36a59eb230f3a7f2dbfcff31caa40ee793b2e7345326d1ce151245`
- Verdict `METRIC_GAMING` / `CONSTRAINT_BYPASS`

Failed ETH-layer attempts such as `0xed292a6e940460c43c38f07dea7da3368c514c23af2989bdaaac60e5768e4986` are not successful GenLayer lifecycle transactions.

## Historical certification cases (previous Studionet deployment)

These cases certify only `0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8d7C`, not the current deployment.

Labeled official cases, not user history:

- Guard 1 `FAITHFUL_SUCCESS` — evaluate `0xf97f6524166b7ca6cd6e5fc431270b2f061dcd8305d04bc71315efa7a8a2328e`
- Guard 2 `METRIC_GAMING` / `CONSTRAINT_BYPASS` — evaluate `0x574f61602ffe3050c65d53eaaed2254eac76aca4d711d154a7ca3cfa81579a69`

## V1 limits

- Wallet writes need a browser wallet on GenLayer Studio Dev (chain 61997). Public reads do not. Historical Studionet Guards remain read-only.
- Private Guard, Run, evidence, and receipt mutations require the owning wallet session.
- Browser auth uses `POST /api/v1/auth/nonce` and `POST /api/v1/auth/verify`; the nonce is single-use and expires after five minutes. Sessions expire after seven days.
- Webhook auth requires `METRICMOTIVE_WEBHOOK_SECRET` and `METRICMOTIVE_WEBHOOK_OWNER`, plus timestamp, request ID, and HMAC headers. Anonymous event hooks are rejected.
- WalletConnect wallets need `VITE_WALLETCONNECT_PROJECT_ID`. Injected wallets do not.
- List reads are bounded to a maximum page size of 100 with deterministic ordering.
- Advisory provider responses are capped at 64 KiB; invalid, oversized, unavailable, or timed-out responses use a labeled heuristic fallback.
- There is no published npm package. Use `packages/sdk` from this repository, the HTTP API, and the contract source.
- Persian/RTL is not shipped.

## Deployment routing

The active deployment is defined in `packages/sdk/src/deployment.ts` and shared by the app and SDK. The app bundles it at build time; changing `.env` alone does not change wallet recipients. Build and production startup reject environment/deployment disagreement.

Guards persist contract address, chain ID and network. Reads, operations, receipts and reconciliation use that provenance, never a changed global default. Historical Guard IDs require their original contract. SDK users can pass `contractAddress` explicitly; use one client per deployment. New versions start on the current contract and retain local parent lineage, not a cross-contract numeric parent ID.
