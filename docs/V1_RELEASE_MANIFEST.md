# MetricMotive V1 release manifest

## Identity

- Product: MetricMotive
- Version: 1.0.3 (final hardening pass)
- Source SHA-256 (`contracts/metric-motive/src/metric_motive.py`): `0e5f3cc0103e5f785fe12b34ecd478dfc909014a40d803ccf98227bb77a7cee1`
- Workspace source snapshot: no Git repository is present in this deployment workspace; the contract source SHA above is reproducible

## Contract

- Network: Studionet
- Chain ID: 61999
- Final address: `0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8d7C`
- Deploy tx: `0xb7cde061b32726e6abfafb2a83868b8d4993028769dc5c5f6fa6e90d89f7ffda`
- Deployer: `0xEb2C34eBD96739338427807BE9b70d4278D6A5ec`
- Validators at deploy: 4 agreed
- Execution: SUCCESS
- Studio: https://studio.genlayer.com/contracts

### Read methods (final address, 2026-09-12)

| Method | Result |
|---|---|
| get_contract_info | PASS |
| get_guard_count | PASS |
| get_guard_summary | PASS |
| get_guard_status | PASS |
| get_guard_definition | PASS |
| get_guard_lineage | PASS |
| get_guard_evidence | PASS |
| get_guard_findings | PASS |
| get_guard_verdict | PASS |
| get_guard | PASS |
| get_guards_by_owner | PASS |

### Write lifecycle (final address)

- create_guard `0x09c3302bc9e504a914372afea9b239395dfdba833c8098c0905599d182cdf293` SUCCESS
- arm_guard `0xbff9eeed778b11c0617b4500ee0669268f820d012684fa988f8429e16f8d1520` SUCCESS
- Motive Lock / update_draft after arm `0x44fe14a22ac870cdfd220339298a15b3b30cc175cc607f4966941f61c4450c74` rejected
- submit_evidence `0x471e6244b2aaf5ed86896e8f0d0c78dfc6138d03fedbb6856b1ef2dddadfcd5a` SUCCESS
- evaluate_guard `0xf97f6524166b7ca6cd6e5fc431270b2f061dcd8305d04bc71315efa7a8a2328e` SUCCESS → Guard 1 `FAITHFUL_SUCCESS`
- duplicate evaluate `0x5978d902dc4f245045de94bf89eb72bbafea70236c7dee67c4daf33e54553d8a` rejected

### Adversarial (local contract suite, 40 tests)

Owner isolation, edit-after-arm, evidence-before-arm, evaluate-before-evidence, evidence overwrite, duplicate evaluate, invalid IDs, empty/oversized inputs, malformed JSON, prompt injection treated as data. PASS.

## Backend

- Postgres via `getSql()`; PGLite when `DATABASE_URL` is unset
- Migrations: `migrations/0002_metricmotive.sql`, `migrations/0003_hardening.sql`
- API: `/api/v1/health`, `/api/v1/ready`, `/api/v1/contract`, `/api/v1/openapi.json`, `/api/v1/auth/*`, `/api/v1/runs`, and authenticated `/api/v1/hooks/events`
- Ready requires DB + certified contract address
- Wallet-session or signed-webhook authentication on mutations; request-body owners are not trusted
- Rate limit + 32 KiB JSON body cap on mutating API routes; the MetricMotive nginx vhost overwrites forwarded client IP headers before the app trusts them
- Event data max 2,000 UTF-8 bytes, max 80 events/run, and list page max 100
- Scoped 24-hour idempotency for run, event, finish, and webhook mutations
- No SSRF URL fetch

## Frontend

- Routes certified in Chromium: `/`, `/app`, `/app/guards/new`, `/contract`, `/docs`, `/roadmap`, `/verify/rct_example_sales`, missing receipt
- Viewports 320, 360, 390, 430, 768, 820, 1024, 1280, 1440, 1920; 125% zoom: no page overflow
- Console: no critical errors (WalletConnect 403 without a Reown project id is ignored)
- Example receipt labeled Example; does not show the live contract address

## Wallet

- RainbowKit 2.2.11, wagmi 2.19.5, viem 2.56.3, TanStack Query 5.101.0, genlayer-js 1.1.8
- Theme: MetricMotive ochre/carbon/bone (not default RainbowKit chrome)
- Playwright EIP-1193 mock (2026-09-12): connect, disconnect, reconnect, account change, wrong-network, Studionet restore, wizard → Motive Lock “Create Guard on Studionet” PASS
- On-chain writes in this sandbox (browser wallet): BLOCKED_EXTERNAL (no injectable Studionet signer)
- Hosted Guard 2 METRIC_GAMING via genlayer-js deployer account (script, not browser wallet)

## SDK

- Package: `@metricmotive/sdk` 1.0.0 at `packages/sdk` (not published to npm)
- Example: `examples/sales-agent`

## Security

- Threat model: `docs/THREAT_MODEL.md`
- Dependency audit: `npm audit --omit=dev` snapshot 2026-09-12 is 0 critical / 1 high / 23 moderate, all transitive wallet-stack findings; axios is patched by override and the unreachable nested WalletConnect `ws` result is documented in `docs/SECURITY_DEPENDENCY_REVIEW.md`
- Secret scan of app source: no wallet private keys / API keys. Preview auth test key remains server-only

- Headers on preview: `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
- Production Nitro middleware adds a minimized CSP for the app, GenLayer, and WalletConnect/Reown; it contains no platform/Grok origin
- XSS: no app `dangerouslySetInnerHTML`
- Writes use certified `DEPLOYMENT.contractAddress` and Studionet chain id 61999; confirm* handlers re-read chain before indexing

## Open source

- Apache-2.0
- README, LICENSE, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, ARCHITECTURE, ROADMAP, CHANGELOG, `.env.example`, `.gitignore`, `.editorconfig`
- CI workflow present; not executed on GitHub

## Hardening verification (2026-09-12)

- `npm test`: 148 script tests, 80 TypeScript tests, 40 contract tests, and 9 SDK tests passed
- `npm run typecheck`: passed; `npm run lint`: passed with 0 errors and 0 warnings
- `npm run build`: passed; tracked migrations are current and official examples seed idempotently
- Built-output Chromium matrix: 80 route/viewport checks passed, with no console errors, failed navigations, or overflow; 125% landing zoom also passed
- Focused API/auth smoke: wallet nonce/session, replay, invalid signature, account mismatch, logout, anonymous mutation, malformed JSON, and oversized body checks passed
- Production Chromium: 80 route/viewport checks passed; representative Guard and Run checks passed at 320/390/1280/1440; production smoke passed at 1280/390 and 125% landing zoom
- Production after restart: PM2 online, DB ready, HTTPS 200/TLS verified, `/__grok/manifest.webmanifest` 404, MetricMotive PWA identity, and read-side DB counts unchanged

## GitHub

BLOCKED_EXTERNAL: `gh auth status` — not logged into any GitHub host. No fabricated repository URL.

## Known limitations

- Browser wallet writes need a real Studionet signer. This sandbox has no injectable signing wallet; write methods are implemented and confirmed by re-reading the contract. Guard 2 METRIC_GAMING was submitted with the deployer account via genlayer-js, not RainbowKit.
- `PARTIAL_ALIGNMENT` and `INSUFFICIENT_EVIDENCE` are certified locally and by the 32-row mapping table; they were not re-hosted on the final address. `FAITHFUL_SUCCESS` is Guard 1. `METRIC_GAMING` is Guard 2.
- `@metricmotive/sdk` is local-only. It is not published to npm.
- Persian/RTL is not shipped.
- Public GitHub clone/CI/release is blocked until credentials exist.
