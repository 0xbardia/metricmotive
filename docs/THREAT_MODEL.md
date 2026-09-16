# Threat model

## Contract

- Unauthorized mutation: owner checks on draft/arm/evidence
- State bypass: explicit status guards; resolved cannot re-evaluate
- Prompt injection: untrusted content isolated; findings schema constrained
- Malicious evidence: bounded size, schema required, commitment immutable
- Duplicate resolution: status must be EVIDENCE_SUBMITTED
- Malformed LLM output: rejected; validators independently re-evaluate
- Validator disagreement: consensus rotation rather than leader trust
- Data size abuse: hard length limits

## Backend

- SQL via parameterized queries
- No arbitrary URL fetch (no SSRF surface in V1)
- CORS same-origin for app; API returns normalized errors without stack traces
- Wallet ownership uses a single-use five-minute signed nonce and a seven-day HttpOnly session cookie
- Every private mutation derives its owner from the verified session; request-body owners are ignored
- Webhook/event ingestion requires a wallet session or HMAC integration credentials; Run ownership is checked server-side
- Event and request schemas are shared across server actions, REST, hooks, and SDK-facing paths
- Request bodies are capped at 32 KiB; event data at 2,000 UTF-8 bytes; runs at 80 events; lists at 100 rows/page
- Idempotency is scoped by mutation and key, fingerprints the request body, and retains the original response for 24 hours
- Atomic event append, unique Guard receipts, and monotonic chain indexing prevent lost or regressed state
- Secrets never enter `VITE_` values, logs, or receipts

## Frontend

- No `dangerouslySetInnerHTML`
- Wallet account and chain changes handled
- Transaction hash is not treated as a verdict; delayed confirmation keeps provenance visible and avoids duplicate retry guidance
- Example data labeled Example
