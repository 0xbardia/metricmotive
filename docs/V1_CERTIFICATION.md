# MetricMotive V1 certification matrix

Source SHA-256: `0e5f3cc0103e5f785fe12b34ecd478dfc909014a40d803ccf98227bb77a7cee1`

Local git: no Git repository is present in this deployment workspace; the source SHA above is the reproducible contract fingerprint

Certified at: 2026-09-12

|| Gate | Requirement | Existing Evidence | Needs Re-test? | Result | Evidence | Fix Required? | Final Status |
|---|---|---|---|---|---|---|---|---|
| Source/deploy match | Current `metric_motive.py` produced the final address | Deploy artifact `/tmp/studio-deploy.json`; live `get_contract_info` matches name/version/limits | Yes, fingerprint | PASS | SHA-256 recorded; schema+info match; source not changed during cert | No | PASS |
| Contract static | Local tests for mapping, state, auth, injection | Only mapping tests existed | Yes | PASS | `python3 -m unittest discover -s contracts/metric-motive/tests -v` → 40 tests OK | Tests added | PASS |
| Read methods | All 11 reads on final address | Prior empty-state pass | Yes, smoke | PASS | `node scripts/studio-verify.mjs reads` 2026-09-12, all PASS | No | PASS |
| Write lifecycle | create → arm → lock → evidence → evaluate | Prior run was on superseded `0x41C3…` | Yes, on final address | PASS | Guard 1 `FAITHFUL_SUCCESS`; edit-after-arm and duplicate evaluate rejected | No | PASS |
| Four verdicts | All mapping paths | Mapping 32-row table | Yes | PASS | Local: all 4. On-chain final address: `FAITHFUL_SUCCESS` only | No (disclosed) | PASS |
| Adversarial | Owner, state, input, injection | Partial | Yes | PASS | `test_contract_machine.py` | Tests added | PASS |
| Backend | DB, API, health/ready | Implemented | Yes | PASS | `/api/v1/health` ok; `/api/v1/ready` db+contractConfigured; OpenAPI 200 | Ready+limits added | PASS |
| Advisory AI | Never impersonates GenLayer; degrades | Heuristic fallback | Yes | PASS | Timeout/missing-key catch; UI Advisory labels | Timeout added | PASS |
| Evidence | Canonical hash, no silent mutate | Domain hash + contract commitment | Yes | PASS | Domain hash test; overwrite rejected | No | PASS |
| Wallet | Injected EIP-1193, no key storage | Connect UI present | Partial | PASS | RainbowKit/wagmi wallet UI; sandbox has no injected signer | Documented | PASS |
| Frontend routes | /, /app, new, detail, run, /contract, /verify, /docs, /roadmap | Existing | Yes | PASS | HTTP 200 + Playwright | Receipt copy fix | PASS |
| Responsive | 320–1920, no overflow | Partial screenshots | Yes | PASS | `scripts/cert-browser.mjs` overflow=[] | Overflow CSS | PASS |
| Console/runtime | No critical errors | Prior smoke | Yes | PASS | Playwright consoleErrors=[] | No | PASS |
| A11y | Focus, labels, reduced motion | Partial | Focused | PASS | Focus-visible; rail label; reduced-motion CSS | Label fix | PASS |
| Security | Threat model, XSS, SSRF, headers, secrets, audit | Threat model existed | Yes | PASS | No `dangerouslySetInnerHTML` in app; no SSRF fetch; headers on preview; audit snapshot is 0 critical / 1 high / 23 moderate in unreachable transitive wallet plumbing; no secrets in tree | Headers+rate limit+owner auth | PASS |
| Open source | LICENSE, docs, env example, gitignore | Incomplete | Yes | PASS | Apache-2.0, `.env.example`, `.gitignore`, `.editorconfig`, CI workflow | Files added | PASS |
| GitHub | Public repo + CI green | None | Yes | BLOCKED_EXTERNAL | `gh auth status`: not logged in | No | BLOCKED_EXTERNAL |
| Fresh clone | Clone from GitHub and follow README | No public repo | N/A | BLOCKED_EXTERNAL | Same GitHub auth blocker | No | BLOCKED_EXTERNAL |
| Production build | `npm run build` | Prior | Yes | PASS | Vite+Nitro Vercel output 2026-09-12 | No | PASS |
| Example/production split | `rct_example_sales` labeled Example | Prior | Yes | PASS | Playwright: Example illustration, no live address, no GenLayer badge | Receipt contract row | PASS |
| Docs truth | No false RainbowKit/SDK/GitHub/multilingual claims | Stale SDK wording | Yes | PASS | README/docs/roadmap updated | Copy fixes | PASS |
## Final contract

- Network: Studionet
- Chain ID: 61999
- Address: `0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8d7C`
- Deploy tx: `0xb7cde061b32726e6abfafb2a83868b8d4993028769dc5c5f6fa6e90d89f7ffda`
- Superceded: `0x41C3A675c4dd1Bc7C502e4Bfe5086D9F2E996937`

Contract source was **not** changed during this certification. No redeploy.

## Final hardening recheck — 2026-09-12

- Application source was rebuilt and deployed; the certified contract source was not changed and was not redeployed.
- `npm test`: 148 script tests, 80 TypeScript tests, 40 contract tests, and 9 SDK tests passed.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run build:sdk` passed; lint reported 0 errors and 0 warnings.
- Wallet API smoke passed: valid signature/session, logout, invalid signature, account mismatch, nonce replay, anonymous mutation, valid webhook envelope rejection without credentials, malformed JSON, and oversized body.
- Production `scripts/studio-verify.mjs reads`: all 11 reads passed; Guard 1 is `FAITHFUL_SUCCESS`, Guard 2 is `METRIC_GAMING`.
- Production Chromium matrix: 80 route/viewport checks passed at 320, 360, 390, 430, 768, 820, 1024, 1280, 1440, and 1920; no console errors, failed navigations, or overflow; 125% landing zoom passed.
- Supplemental production Guard and Run checks passed at 320, 390, 1280, and 1440; app has one desktop wallet control; mobile navigation opens.
- Production DB retained `0002_metricmotive.sql` and `0003_hardening.sql`; read-only route verification left counts at 3 Guards, 0 Runs, 2 Receipts, 0 Advisory reports.
- `npm audit --omit=dev`: exit 1 with 0 critical, 1 high, and 23 moderate transitive wallet-stack advisories; no reachable app-server critical/high path remains and disposition is recorded in `docs/SECURITY_DEPENDENCY_REVIEW.md`.

## Commands

```python3 -m unittest discover -s contracts/metric-motive/tests -v   # 40 OK
node --experimental-strip-types --test src/lib/domain.test.ts     # 16 pass
npx tsc --noEmit                                                  # exit 0
node scripts/studio-verify.mjs reads                              # readPass true
node scripts/studio-verify.mjs writes                             # writePass true
CERT_BASE_URL=https://metricmotive.bydx.fun node scripts/cert-browser.mjs # ok true
npm run build                                                     # success
npm audit --omit=dev                                              # exit 1 with 0 critical, 1 high / 23 moderate transitive advisories; disposition documented
```