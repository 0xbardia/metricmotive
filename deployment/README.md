# deployment/

- `start-production.sh`: production launcher (loads `.env`, runs `scripts/check-deployment.mjs`, then `npm run preview` on 127.0.0.1:4189; PM2 `metricmotive-web` supervises it). See `docs/ENVIRONMENT.md` and `CUTOVER.md`.
- `metricmotive-studionet.json`: HISTORICAL record of the previous Studionet (61999) deployment. Not loaded by any code. The active deployment registry is `packages/sdk/src/deployment.ts`.
