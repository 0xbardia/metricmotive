# Security dependency review (V1)

## Current audit snapshot — 2026-09-12

`npm audit --omit=dev` reports 24 transitive advisories in the installed
wallet connector graph: 0 critical, 1 high, and 23 moderate. The high result is
`ws` 8.18.0 nested under WalletConnect/Reown's pinned `viem@2.23.2`; the
moderate results include the same graph's `uuid` and `decode-uri-component`
paths. The available automatic remediation upgrades `wagmi` to 3.7.7, which is
outside the MetricMotive V1 dependency freeze.

This command therefore exits non-zero as an audit report. It is not a reachable
MetricMotive application-server vulnerability: the app does not run a Node
WebSocket server or accept inbound WebSocket frames, and browser WalletConnect
uses the browser's native WebSocket. Keep this disposition explicit and rerun
the audit when the wallet stack is upgraded.

High findings from `npm audit --omit=dev` after the RainbowKit wallet stack.
Do not run `npm audit fix --force` (it would install wagmi 3, which is out of V1 freeze).

## 1. axios — GHSA-gcfj-64vw-6mp9

- Package: `axios`
- Installed (before override): `1.16.0`
- Advisory: [GHSA-gcfj-64vw-6mp9](https://github.com/advisories/GHSA-gcfj-64vw-6mp9) — Node HTTP adapter can use an inherited proxy after interceptor config cloning
- Severity: high
- Affected: `>=1.15.2 <1.18.0`
- Fixed: `1.18.0`
- Also grouped by npm under the same `axios` node: several moderate prototype-pollution / DoS advisories, all fixed in `1.18.0`

### Dependency path

MetricMotive → `wagmi` → `@wagmi/connectors` → `@base-org/account` → `@coinbase/cdp-sdk` → `axios`

MetricMotive does not import `axios`, Coinbase CDP, or `@base-org/account`. Wallet connectors are `injected` / MetaMask / Rainbow / WalletConnect via `connectorsForWallets`, not `getDefaultConfig` (which pulled Coinbase).

### Runtime context

- Application code: unused
- Browser bundle: possible unused CDP graph; the high advisory is the **Node HTTP adapter**
- Server: MetricMotive does not construct axios clients or set proxies

### Exploit prerequisites

Attacker must control axios config / prototype pollution such that a Node HTTP adapter inherits a proxy. Requires the CDP/axios path to run with attacker-controlled options.

### Exposure

`NOT_REACHABLE` for the application path. `PARTIALLY_REACHABLE` only as a transitive install.

### Mitigation

npm `overrides.axios = 1.18.0` (patch-level, non-breaking). No Coinbase connector is mounted. No attacker-controlled proxy configuration.

### Decision

`FIXED` via override to `1.18.0`. Target: keep override until wagmi 2 no longer pulls axios, or a V1.1 wagmi 3 evaluation.

---

## 2. ws — GHSA-96hv-2xvq-fx4p (high) and GHSA-58qx-3vcg-4xpx (moderate)

- Package: `ws`
- Installed (vulnerable copies): `8.18.0` under WalletConnect/Reown nested `viem@2.23.2`
- Top-level `viem@2.56.3` already uses patched `ws@8.21.0`
- High advisory: [GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) — memory exhaustion DoS from tiny fragments (`>=8.0.0 <8.21.0`)
- Moderate: [GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx) — uninitialized memory disclosure (`>=8.0.0 <8.20.1`), CVSS 4.4, high privileges required
- Fix available via `npm audit fix --force` → `wagmi@3.7.7` (semver-major, V1 freeze)

### Dependency path

MetricMotive → `@rainbow-me/rainbowkit` / `wagmi` → `@walletconnect/ethereum-provider` → `@reown/appkit` → `@walletconnect/utils` → nested `viem@2.23.2` → `ws@8.18.0`

Also present: `ws@7.5.13` under `@walletconnect/jsonrpc-ws-connection` (different major; a blanket override to 8.21 would retarget that copy).

### Runtime context

- `ws` is a **Node** WebSocket implementation
- In the browser, WalletConnect uses the native `WebSocket` via `isows`
- MetricMotive does not open a Node `ws` server and does not accept untrusted WebSocket clients
- WalletConnect sockets, when used, connect from the user's browser to Reown/WalletConnect relays after the user chooses WalletConnect

### Exploit prerequisites (high DoS)

Network attacker sending crafted tiny frames to a **Node `ws` server** the process is running. MetricMotive is not that server.

Uninitialized-memory disclosure additionally needs a privileged peer on a Node `ws` connection.

### Exposure

`NOT_REACHABLE` for the Node `ws` high DoS as an application server. `PARTIALLY_REACHABLE` only if a future server-side WalletConnect path used the nested Node `ws` copy as a client — still not an inbound untrusted socket.

WalletConnect hosted wallets additionally require `VITE_WALLETCONNECT_PROJECT_ID`. Without it, that path is not used (injected wallets only).

### Mitigation

- Do not globally override `ws` to 8.21: it would force-upgrade the `ws@7` WalletConnect JSON-RPC copy
- Do not upgrade to wagmi 3 during V1 freeze
- WalletConnect origin allowlist / project id (when configured)
- Browser sandbox: user-initiated WC session only

### Decision

`ACCEPTED_TEMPORARILY`

- Target release: V1.1
- Upgrade path: evaluate wagmi 3 / RainbowKit that dedupes to `ws@8.21+` without breaking WC v2; or nested override of `viem@2.23.2`'s `ws` after a dedicated smoke
- Monitor: re-run `npm audit --omit=dev` on wallet-stack upgrades

---

## Release rule

No reachable critical/high application path remains open. axios high is patched by override. ws high is Node-server DoS in a nested WalletConnect copy that MetricMotive does not expose as a server.
