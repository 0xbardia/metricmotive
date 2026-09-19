# Environment

Do not commit a `.env` file. Copy `.env.example` for a local run. The preview
injects `DATABASE_URL` (optional; PGLite otherwise). Advisory AI is configured
with `OFFCHAIN_AI_API_KEY`, `OFFCHAIN_AI_BASE_URL`, `OFFCHAIN_AI_MODEL`, and
`OFFCHAIN_AI_TIMEOUT_MS`; if the key is absent, heuristics are used.
`XAI_API_KEY` remains a backwards-compatible server-only fallback during
configuration migration.

For non-browser event integrations, set both `METRICMOTIVE_WEBHOOK_SECRET` and
`METRICMOTIVE_WEBHOOK_OWNER` server-side. Send `x-metricmotive-timestamp` (Unix
seconds), `x-metricmotive-request-id`, and
`x-metricmotive-signature: sha256=<hex HMAC-SHA256>` over
`<timestamp>.<request-id>.<raw-body>`. Timestamps outside five minutes are
rejected. Never expose or log the secret.

Public values (also the production defaults in code):

- GenLayer RPC: `https://studio-dev.genlayer.com/api`
- Chain ID: `61997`
- Contract: `0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703`
- Explorer: `https://explorer-studio-dev.genlayer.com`
- Network: GenLayer Studio Dev
- Previous Studionet (61999) contract: `0xe39e59f8Dd78E416D9EE074Ca3f899C7Eb56Fb2d`

MetricMotive's active submission deployment is currently on GenLayer Studio Dev (61997). This is not mainnet and does not carry permanent state guarantees. Historical receipts may reference Studionet (61999) and keep that provenance. Product writes use `genlayer-js@2.0.0-rc.1`.

Required for WalletConnect wallets:

- `VITE_WALLETCONNECT_PROJECT_ID` from [Reown Cloud](https://cloud.reown.com)

Injected EIP-1193 wallets work without that id. The app never stores a private key.

On-chain writes from scripts (SDK `--onchain`, hosted certification) read `GENLAYER_PRIVATE_KEY` or `/tmp/studio-account.json`. Those keys must never enter the repository.

The TypeScript SDK is `packages/sdk`. It is not published to npm in V1.


Startup validates the certified contract address from `src/lib/contract.ts`. There is no silent fallback to the superseded address `0x41C3A675c4dd1Bc7C502e4Bfe5086D9F2E996937`.

## Production deployment runbook

The V1 host runs the built Nitro output through PM2 on `127.0.0.1:4189`.
Keep the contract source frozen: do not run `studio:deploy` for an application
release.

1. Create a timestamped source backup and a PostgreSQL backup of affected data.
2. Run `set -a; . ./.env; set +a; npm run db:migrate` and confirm the migration list.
3. Run `npm run test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
4. Run `nginx -t && nginx -s reload` when the proxy configuration changes.
5. Restart only `metricmotive-web` with `pm2 restart metricmotive-web --update-env`.
6. Verify `/api/v1/health`, `/api/v1/ready`, `/api/v1/contract`, HTTPS, and the
   production Chromium matrix before declaring the release complete.

The MetricMotive nginx vhost sets `X-MetricMotive-Proxy: nginx` and overwrites
`X-Forwarded-For` with `$remote_addr`; it must not use `$proxy_add_x_forwarded_for`
for this host because inbound forwarded headers are untrusted.

The current V1 deployment uses `migrations/0002_metricmotive.sql` and
`migrations/0003_hardening.sql`. Official examples are seeded by the build or
the explicit `db:seed` command; ordinary GET/read routes do not write data.

## Deployment routing

The active deployment is defined in `packages/sdk/src/deployment.ts` and shared by the app and SDK. The app bundles it at build time; changing `.env` alone does not change wallet recipients. Build and production startup reject environment/deployment disagreement.

Guards persist contract address, chain ID and network. Reads, operations, receipts and reconciliation use that provenance, never a changed global default. Historical Guard IDs require their original contract. SDK users can pass `contractAddress` explicitly; use one client per deployment. New versions start on the current contract and retain local parent lineage, not a cross-contract numeric parent ID.
