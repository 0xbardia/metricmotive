# Changelog

## 1.1.0

- Active deployment migrated to GenLayer Studio Dev (chain 61997), contract `0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703`
- Client SDK pinned to `genlayer-js@2.0.0-rc.1`
- Deployment-aware historical provenance: Studionet 61999 contracts remain first-class and read-only
- Dual-network explorer and wallet routing (Studio Dev active; Studionet historical)
- GenLayer v2 fee-aware lifecycle writes (`estimateTransactionFeesForWrite` + `fees.{distribution,feeValue}`)
- Real Studio Dev end-to-end certification: Guard 1 `METRIC_GAMING` / `CONSTRAINT_BYPASS`
- Historical 61999 receipts and Guards are preserved; this is not mainnet

## 1.0.3

- Wallet nonce/signature sessions and server-side owner enforcement for private mutations
- Authenticated, replay-resistant webhook events with scoped idempotency
- Canonical runtime validation, malformed-JSON rejection, bounded reads, atomic event appends, unique receipts, and monotonic chain indexing
- Read routes no longer seed example data; official examples use explicit idempotent seeding
- Removed production-visible platform install/PWA branding and tightened CSP
- Clarified advisory-vs-GenLayer language, transaction confirmation lag, receipt narrative, and error states

## 1.0.2

- RainbowKit + wagmi + viem wallet stack, customized to the MetricMotive palette
- Primary product writes go through the certified Studionet contract: create_guard, arm_guard, submit_evidence, evaluate_guard
- Motive Locked and GenLayer verdict labels wait for confirmed contract state
- Playwright wallet QA: connect, disconnect, reconnect, account switch, wrong-network, Studionet restore. Real writes remain BLOCKED_EXTERNAL without a Studionet signer
- TypeScript SDK `@metricmotive/sdk` 1.0.0 in `packages/sdk` (not published to npm)
- Sales-agent example: Agent → SDK → Run Recorder → Evidence Manifest
- Hosted Studionet Guard 2 `METRIC_GAMING` / `CONSTRAINT_BYPASS`
- Dependency review: axios 1.18.0 override; nested WalletConnect `ws` accepted until V1.1


## 1.0.1

- Recertified Intelligent Contract on Studionet at `0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8d7C`
- All 11 public read methods verified against empty state and missing IDs
- Editorial type pairing (Fraunces / Source Sans 3) and motion system for the product surfaces
- Recorded source SHA-256 `0e5f3cc0103e5f785fe12b34ecd478dfc909014a40d803ccf98227bb77a7cee1`
- Advisory receipts no longer display the live contract address as their own proof
- Local contract certification covers state machine, authorization, input bounds, prompt injection, and all four verdict paths

## 1.0.0

- Motive Guard Intelligent Contract on GenLayer Studionet
- Run Recorder and evidence manifests
- Advisory preflight / loophole scan (never impersonates a GenLayer verdict)
- Public receipts
- Studionet-oriented dApp
