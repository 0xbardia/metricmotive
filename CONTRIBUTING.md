# Contributing

1. Open an issue describing the change.
2. Keep the Intelligent Contract the source of truth for verdicts.
3. Do not impersonate a GenLayer verdict with off-chain AI.
4. Do not change `contracts/metric-motive/src/metric_motive.py` unless there is a proven contract defect. A source change supersedes the certified address and requires full recertification.
5. Add tests for state transitions, validation, ownership, idempotency, and verdict mapping when relevant.
6. Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` before a PR.
7. For API changes, update `src/routes/api/v1/openapi[.]json.ts` and the API/SDK docs.
8. Migrations must be additive, tracked, and safe to run once against a backup/test database.
9. Do not add a GET-side seed or mutation.
10. SDK lives in `packages/sdk`. Do not publish it as if it were on npm unless the package is actually published.
