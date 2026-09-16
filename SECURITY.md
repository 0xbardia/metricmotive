# Security

Do not submit secrets, private keys, or personal data as evidence. MetricMotive
does not custody signing keys.

## Reporting

Email security issues privately. Do not file public GitHub issues for exploitable contract or auth bugs.

## Implemented controls

- Intelligent Contract access control and state machine
- Wallet nonce/signature sessions with single-use five-minute challenges and seven-day HttpOnly sessions
- Owner checks on Guard, Run, evidence, advisory, receipt, and chain-index mutations
- Signed webhook authentication, five-minute replay window, and scoped idempotency keys
- Evidence/event runtime schemas, a 32 KiB request cap, 2,000-byte event data cap, and 80-event run cap
- Monotonic chain indexing, atomic event append, and unique Guard receipts
- Prompt-injection isolation, runtime advisory-output validation, a 64 KiB provider-response cap, and explicit local-vs-GenLayer authority labels
- Parameterized SQL and no arbitrary URL fetch (no SSRF surface in V1)
- Same-origin browser policy and trusted nginx proxy marker for forwarded-IP rate limiting; the MetricMotive nginx vhost overwrites `X-Forwarded-For` with the connecting client IP

## Scope

Public verification surfaces are intentionally readable. Mutable private
resources are wallet-owned. A webhook integration is disabled until both
`METRICMOTIVE_WEBHOOK_SECRET` and `METRICMOTIVE_WEBHOOK_OWNER` are configured;
the browser must never receive that secret.

Dependency status is recorded in `docs/SECURITY_DEPENDENCY_REVIEW.md`. Run
`npm audit --omit=dev` against the installed lockfile when changing dependencies;
do not use a major dependency upgrade as a V1 security shortcut.

## Advisory AI data handling

Advisory analysis is optional and off-chain. When configured, the server sends
the submitted motive, metric, guardrails, and bounded evidence to the configured
AI provider; no wallet private key is sent. Advisory reports are stored with
the owning Guard as application data. Provider retention is controlled by the
configured provider, so MetricMotive makes no zero-retention claim. If the
provider is absent, times out, fails, exceeds the response cap, or returns an
invalid schema, the server uses a labeled `heuristic` fallback; it never
creates or implies GenLayer authority.

See `docs/THREAT_MODEL.md` and `docs/SECURITY_DEPENDENCY_REVIEW.md`.
