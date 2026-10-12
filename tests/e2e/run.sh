#!/usr/bin/env bash
# Build + serve E2E_APP_DIR on :4291, start the mock RPC on :4292, run the
# scenarios, always tear both down. Never touches DATABASE_URL or real chains.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
export E2E_APP_DIR="${E2E_APP_DIR:-/root/mm-v2-e2e}"
export E2E_BASE_URL="${E2E_BASE_URL:-http://127.0.0.1:4291}"
export E2E_MOCK_URL="${E2E_MOCK_URL:-http://127.0.0.1:4292}"
APP_PORT=4291; MOCK_PORT=4292
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill -- -"$p" 2>/dev/null; done; }
trap cleanup EXIT INT TERM

cd "$E2E_APP_DIR" || exit 2
if [ "${E2E_SKIP_BUILD:-0}" != 1 ]; then
  env -u DATABASE_URL node scripts/with-app-env.mjs npx vite build >"${TMPDIR:-/tmp}/e2e-build.log" 2>&1 || { tail -30 "${TMPDIR:-/tmp}/e2e-build.log"; exit 2; }
fi
# The built server bundle expects PGLite's wasm/data next to it (preview without DATABASE_URL).
cp node_modules/@electric-sql/pglite/dist/{pglite.data,pglite.wasm,initdb.wasm} .vercel/output/functions/__server.func/_libs/

E2E_MOCK_PORT=$MOCK_PORT setsid node "$HERE/mock-rpc.mjs" >"${TMPDIR:-/tmp}/e2e-mock.log" 2>&1 & PIDS+=($!)
setsid env -u DATABASE_URL NODE_OPTIONS="--import=$HERE/server-fetch-shim.mjs" \
  node scripts/with-app-env.mjs npx vite preview --host 127.0.0.1 --port $APP_PORT --strictPort \
  >"${TMPDIR:-/tmp}/e2e-app.log" 2>&1 & PIDS+=($!)

for _ in $(seq 1 90); do
  curl -sf -o /dev/null "$E2E_BASE_URL/app/guards/new" && curl -sf -o /dev/null -X POST -d '{}' "$E2E_MOCK_URL/__control/reset" && break
  sleep 1
done
# Sequential on purpose: every file shares ONE mock RPC and ONE app, so files must not run in parallel.
cd "$HERE/../.." && node --test --test-concurrency=1 "$@" tests/e2e/*.e2e.test.mjs
