#!/bin/sh
set -eu
cd /root/MetricMotive
set -a
. ./.env
set +a
export PATH=/root/.nvm/versions/node/v22.23.2/bin:$PATH
node scripts/check-deployment.mjs
exec npm run preview -- --host 127.0.0.1 --port 4189
