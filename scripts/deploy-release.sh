#!/usr/bin/env bash
# Deploy a built release to the live PM2 process, with an automatic rollback.
#
#   bash scripts/deploy-release.sh <release-dir> <tag> \
#     --prod DIR --backups DIR --pm2 PATH --ready-url URL --chain ID --contract 0x... [--app NAME]
#
# Run only after the backup step (CUTOVER.md step 2 wrote <backups>/last-ts, start-commit and
# vercel-output-<ts>) and the operator's approval, from a fresh shell (DATABASE_URL unset).
# Any failure after the first change restores the recorded start commit and the backed-up output,
# restarts once, and exits non-zero.
# Exit: 0 deployed | 1 failed, rolled back | 2 rollback incomplete, stop | 3 preflight abort, nothing changed.
# Test knobs (not paths): READY_TRIES (default 15), READY_SLEEP (default 2).
set -Eeuo pipefail

say() { printf '[deploy %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
abort() { say "ABORT (nothing changed): $*"; exit 3; }
usage() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 3; }

[ $# -ge 2 ] || usage
REL=$1; TARGET=$2; shift 2
PROD=; BK=; PM2=; READY_URL=; EXPECT_CHAIN=; EXPECT_CONTRACT=; APP=metricmotive-web
while [ $# -gt 0 ]; do
  [ $# -ge 2 ] || abort "missing value for $1"
  case $1 in
    --prod) PROD=$2 ;; --backups) BK=$2 ;; --pm2) PM2=$2 ;; --app) APP=$2 ;;
    --ready-url) READY_URL=$2 ;; --chain) EXPECT_CHAIN=$2 ;; --contract) EXPECT_CONTRACT=$2 ;;
    *) abort "unknown option $1" ;;
  esac
  shift 2
done
for v in PROD BK PM2 READY_URL EXPECT_CHAIN EXPECT_CONTRACT; do [ -n "${!v}" ] || abort "--$(echo "$v" | tr 'A-Z_' 'a-z-') is required"; done
READY_TRIES=${READY_TRIES:-15}
export PATH="$PATH:$(dirname "$PM2"):/usr/bin:/bin"   # pm2's shebang needs node on PATH

# --- preflight: read-only, no rollback needed ---
[ -z "${DATABASE_URL:-}" ] || abort "DATABASE_URL is set; run from a fresh shell that did not source .env"
[ -x "$PM2" ] || abort "$PM2 is not executable"
[ -f "$BK/last-ts" ] && [ -f "$BK/start-commit" ] || abort "backup markers missing in $BK (run the backup step first)"
ts=$(cat "$BK/last-ts"); START=$(cat "$BK/start-commit")
[ -d "$BK/vercel-output-$ts" ] || abort "backup output $BK/vercel-output-$ts missing"
[ "$(git -C "$PROD" rev-parse HEAD)" = "$START" ] || abort "production HEAD is not the recorded start commit"
[ "$(git -C "$REL" describe --tags)" = "$TARGET" ] || abort "release dir is not at $TARGET"
[ -z "$(git -C "$REL" status --porcelain --untracked-files=no)" ] || abort "release dir has tracked changes"
[ -d "$REL/.vercel/output" ] || abort "release output missing"
[ ! -e "$PROD/.vercel/output.prev-$ts" ] || abort ".vercel/output.prev-$ts already exists"

restarts() { "$PM2" jlist | node -e 'const n=process.argv[1];const p=JSON.parse(require("fs").readFileSync(0,"utf8")).find(x=>x.name===n);if(!p)process.exit(1);console.log(p.pm2_env.restart_time)' "$APP"; }
wait_ready() {
  local i out
  for i in $(seq 1 "$READY_TRIES"); do
    out=$(curl -fsS --max-time 5 "$READY_URL" 2>/dev/null) && { printf '%s\n' "$out"; return 0; }
    sleep "${READY_SLEEP:-2}"
  done
  return 1
}

# --- rollback: runs at most once ---
ROLLED=0
rollback() {
  local rc=$?
  trap - ERR INT TERM
  set +eE
  [ "$ROLLED" = 0 ] || exit "$rc"
  ROLLED=1
  say "FAILURE (rc=$rc): rolling back to $START"
  cd "$PROD" || exit 2
  rm -rf .vercel/output && cp -a "$BK/vercel-output-$ts" .vercel/output \
    && git switch --detach "$START" \
    && [ "$(git rev-parse HEAD)" = "$START" ] \
    && "$PM2" restart "$APP" \
    && wait_ready >/dev/null || { say "ROLLBACK INCOMPLETE: stop and inspect (backup intact: $BK/vercel-output-$ts)"; exit 2; }
  say "rolled back: HEAD=$(git rev-parse --short HEAD), ready OK. $PROD/.vercel/output.prev-$ts left in place."
  exit 1
}

# --- deploy: first change starts here ---
cd "$PROD"
before=$(restarts); say "restart counter before: $before"
trap rollback ERR INT TERM   # armed only now: everything above is read-only
git switch --detach "$TARGET"
mkdir -p node_modules/.nitro
test -f node_modules/.nitro/last-build.json || echo '{"outputDir":"../../../.vercel/output"}' > node_modules/.nitro/last-build.json
mv .vercel/output ".vercel/output.prev-$ts"
cp -a "$REL/.vercel/output" .vercel/output
"$PM2" restart "$APP"
ready=$(wait_ready)
echo "$ready"
echo "$ready" | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));const [c,a]=process.argv.slice(1);if(j.status!=="ready"||j.chainId!==Number(c)||j.contractAddress!==a){console.error("ready payload mismatch");process.exit(1)}' "$EXPECT_CHAIN" "$EXPECT_CONTRACT"
after=$(restarts); say "restart counter after: $after"
[ "$after" = "$((before + 1))" ] || { say "restart counter did not move by exactly 1"; false; }
trap - ERR INT TERM
say "DEPLOYED $TARGET. Run the post-deploy verification. Kept: $PROD/.vercel/output.prev-$ts (remove only on the operator's word)."
