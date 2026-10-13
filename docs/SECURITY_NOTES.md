# Security notes

## CSP (S-01)
HTML responses get `script-src 'self' 'nonce-<n>'` from `src/server.ts` (fresh 16-byte nonce per request, set on
`router.options.ssr.nonce`, which TanStack Router stamps on every inline script/style it renders and echoes as a
`csp-nonce` meta for the client). The policy text lives in `src/lib/server/csp.ts` (`buildCsp`). Non-HTML responses
get the same policy with `'unsafe-inline'` from `server/middleware/security-headers.ts` (it only fills the header when absent).

Residual risk: `style-src` keeps `'unsafe-inline'` (the framework inlines the stylesheet and React sets style
attributes), so CSS injection is not blocked. Hashes cannot replace nonces for scripts: the hydration/stream
barrier scripts embed per-request dehydrated state, so their content changes on every response.

## Errors (E-06)
`errorBody` returns code/message only for `AppError`. Every other error returns `INTERNAL` and is logged
server-side with the request id.
