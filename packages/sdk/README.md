# @metricmotive/sdk

Minimal TypeScript SDK for MetricMotive V1. Not published to npm in this release.

On-chain methods default to the active Studionet contract
`0xe39e59f8Dd78E416D9EE074Ca3f899C7Eb56Fb2d`. Run Recorder methods talk to the
HTTP API when `apiUrl` is set, otherwise an in-memory recorder.

A local run is never a GenLayer verdict.

## HTTP authentication and retries

HTTP Run Recorder mutations are authenticated in one of two ways:

- Browser use: sign the server-issued wallet nonce through the MetricMotive app. The server binds the HttpOnly session to that wallet address.
- Agent/webhook use: configure the client with `webhookSecret`. The SDK sends `x-metricmotive-timestamp`, `x-metricmotive-request-id`, and `x-metricmotive-signature` (HMAC-SHA256 over `<timestamp>.<request-id>.<raw-body>`). The server must also configure `METRICMOTIVE_WEBHOOK_OWNER`.

The SDK sends scoped idempotency keys for `startRun`, `recordEvent`, and
`completeRun`. A retry returns the original result; reusing a key for a
different body is a conflict. Keep the same explicit `idempotencyKey` when
retrying `startRun`. Event IDs are not inferred from an untrusted event count.
The HTTP API caps bodies at 32 KiB, event data at 2,000 UTF-8 bytes, runs at 80
events, and list pages at 100. Malformed JSON and invalid schemas are 400s;
unauthenticated calls are 401s; ownership failures are 403s; lifecycle and
idempotency conflicts are 409s.

## Install (local)

From the repository root the package lives at `packages/sdk`. Peer dependency:
`genlayer-js@^1.1.8`.

```ts
import { MetricMotiveClient, eventOf } from "@metricmotive/sdk";
import { createAccount } from "genlayer-js";

const mm = new MetricMotiveClient({
  apiUrl: "http://127.0.0.1:8080", // optional
  account: createAccount(process.env.GENLAYER_PRIVATE_KEY as `0x${string}`), // writes only
});
```

## Methods

Off-chain (Run Recorder):

- `startRun({ guardId, agentRef })`
- `recordEvent(runId, event)`
- `completeRun(runId, outcome)`
- `evidenceFromRun(guardId, run)`

On-chain (requires a genlayer-js account; never a GenLayer verdict until `waitForVerdict`):

- `createGuard({ motive, metric, guardrails })`
- `armGuard(id)`
- `getGuard(id)`
- `getVerdict(id)`
- `submitEvidence(id, manifest)`
- `evaluateGuard(id)` — waits until the transaction is FINALIZED; if confirmation times out, the error includes the transaction hash and must be retried as confirmation, not as a new write
- `waitForVerdict(id)` — re-reads the contract until RESOLVED

## Example

See `examples/sales-agent`.

## Tests

```bash
npm run test:sdk
```

## Deployment routing

The active deployment is defined in `packages/sdk/src/deployment.ts` and shared by the app and SDK. The app bundles it at build time; changing `.env` alone does not change wallet recipients. Build and production startup reject environment/deployment disagreement.

Guards persist contract address, chain ID and network. Reads, operations, receipts and reconciliation use that provenance, never a changed global default. Historical Guard IDs require their original contract. SDK users can pass `contractAddress` explicitly; use one client per deployment. New versions start on the current contract and retain local parent lineage, not a cross-contract numeric parent ID.
