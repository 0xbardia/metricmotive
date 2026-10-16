# Write-path browser E2E (mocked wallet + GenLayer RPC)

Run everything (build, serve on :4291, mock RPC on :4292, tests, teardown):

    tests/e2e/run.sh            # E2E_APP_DIR selects the built app (default in tests/e2e/harness.mjs); E2E_SKIP_BUILD=1 reuses the build

Tests alone (app + mock already up): `node --test tests/e2e/*.e2e.test.mjs`.
Failure screenshots: $REPORT_DIR/qa/e2e/ (override E2E_SHOT_DIR).

- `mock-rpc.mjs`: JSON-RPC mock + `/__control/*` scenario endpoints (outcomes: OK, PENDING, ACCEPTED, REVERT, CANCELED, UNDETERMINED, NO_EXEC, MISMATCH; rateLimit -> HTTP 429).
- `server-fetch-shim.mjs`: `--import`ed into the app server so its RPC calls hit the mock.
- `wallet-init.mjs`: EIP-1193/6963 wallet with a fixed test key; tx hashes are scripted, nothing is broadcast.
- Test-only time scaling lives in the init script (`timeScale`), no app changes.
