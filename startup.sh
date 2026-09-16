#!/bin/sh
set -eu
APP_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$APP_ROOT"
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
node scripts/preview.mjs stop || true
nohup npm run dev >>/tmp/app-startup.log 2>&1 </dev/null &
