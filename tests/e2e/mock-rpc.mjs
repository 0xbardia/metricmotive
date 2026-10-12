// Mock GenLayer Studio RPC + scenario control. Node http, no deps beyond the
// app's own genlayer-js / viem (resolved from E2E_APP_DIR/node_modules).
//
//   JSON-RPC:  POST /rpc   (header x-mm-source: server | browser)
//   control:   POST /__control/reset | scenario | set-outcome | register-tx
//              GET  /__control/state
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const APP_DIR = process.env.E2E_APP_DIR || "/root/mm-v2-e2e";
const require = createRequire(join(APP_DIR, "package.json"));
const { abi } = await import(pathToFileURL(require.resolve("genlayer-js")).href);
const { fromRlp, hexToBytes, bytesToHex } = await import(pathToFileURL(require.resolve("viem")).href);

export const CHAIN_ID_HEX = "0xf22d"; // 61997 studioDevnet
const STATUS_NUM = { PENDING: "1", ACCEPTED: "5", UNDETERMINED: "6", FINALIZED: "7", CANCELED: "8" };
const CONTRACT = "0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703";

/**
 * Outcome vocabulary (per transaction):
 *  OK            FINALIZED + FINISHED_WITH_RETURN
 *  PENDING       stays PENDING forever (until set-outcome flips it)
 *  ACCEPTED      ACCEPTED + return (undecided for the server: not FINALIZED)
 *  REVERT        FINALIZED + FINISHED_WITH_ERROR  (execution revert)
 *  CANCELED      CANCELED
 *  UNDETERMINED  UNDETERMINED
 *  NO_EXEC       FINALIZED with no execution result at all
 *  MISMATCH      FINALIZED + return, but calldata is a different method
 */
export function createMock() {
  const state = freshState();
  function freshState() {
    return {
      txs: new Map(),
      guards: new Map(),
      nextGuardId: 1,
      queue: {}, // method -> [outcome, ...] consumed at registration
      defaultOutcome: "OK",
      rateLimit: null, // { sources: ["server"], methods: [...] }
      log: [],
      unknown: [],
      sends: 0,
    };
  }

  const record = (method, source, extra = {}) => state.log.push({ t: Date.now(), method, source, ...extra });

  function decodeCall(txCalldata) {
    const parts = fromRlp(txCalldata);
    const raw = hexToBytes(parts[0]);
    const decoded = abi.calldata.decode(raw);
    const entries = decoded instanceof Map ? Object.fromEntries(decoded) : decoded;
    return { raw, method: entries[""] ?? entries.method, args: entries.args ?? [] };
  }

  function registerTx({ hash, from, to, txCalldata }) {
    const { raw, method, args } = decodeCall(txCalldata);
    const outcome = state.queue[method]?.shift() ?? state.defaultOutcome;
    const tx = { hash, from, to: to ?? CONTRACT, method, args, raw: [...raw], outcome, reads: 0 };
    if (method === "create_guard") {
      tx.guardId = String(state.nextGuardId++);
      state.guards.set(tx.guardId, { id: tx.guardId, owner: from, motive: args[0], metric: args[1], guardrails_json: args[2], createTx: hash });
    }
    state.txs.set(hash.toLowerCase(), tx);
    state.sends += 1;
    return { method, args: args.map(String), outcome, guardId: tx.guardId };
  }

  function txView(tx) {
    const o = tx.outcome;
    const statusName =
      o === "PENDING" ? "PENDING" : o === "ACCEPTED" ? "ACCEPTED" : o === "CANCELED" ? "CANCELED" : o === "UNDETERMINED" ? "UNDETERMINED" : "FINALIZED";
    let raw = tx.raw;
    if (o === "MISMATCH") {
      const m = abi.calldata.decode(Uint8Array.from(tx.raw));
      const entries = new Map(m instanceof Map ? m : Object.entries(m));
      entries.set("", tx.method === "evaluate_guard" ? "arm_guard" : "evaluate_guard");
      raw = [...abi.calldata.encode(entries)];
    }
    const view = {
      hash: tx.hash,
      from: tx.from,
      sender: tx.from,
      to: tx.to,
      recipient: tx.to,
      chainId: CHAIN_ID_HEX,
      status: statusName, // studio returns the status NAME; genlayer-js derives the number
      statusName,
      data: { calldata: { raw } },
      consensus_data: {},
    };
    const withReturn = ["OK", "ACCEPTED", "MISMATCH"].includes(o);
    if (withReturn) {
      view.txExecutionResultName = "FINISHED_WITH_RETURN";
      view.txExecutionResult = 1;
      view.consensus_data = {
        leader_receipt: [
          {
            execution_result: "SUCCESS",
            result: { status: "return", payload: { readable: tx.guardId ?? "1" } },
          },
        ],
      };
    } else if (o === "REVERT") {
      view.txExecutionResultName = "FINISHED_WITH_ERROR";
      view.txExecutionResult = 2;
      view.consensus_data = { leader_receipt: [{ execution_result: "ERROR", result: { status: "rollback", payload: { readable: "reverted" } } }] };
    }
    // PENDING / CANCELED / UNDETERMINED / NO_EXEC: no execution result at all.
    return view;
  }

  function guardView(id) {
    const g = state.guards.get(String(id));
    const created = g && state.txs.get(g.createTx.toLowerCase());
    if (!g || !created || !["OK", "MISMATCH"].includes(created.outcome)) return { found: false };
    const armed = [...state.txs.values()].some((t) => t.method === "arm_guard" && String(t.args[0]) === g.id && t.outcome === "OK");
    return {
      found: true,
      id: g.id,
      owner: g.owner,
      parent_id: "",
      version: 1,
      motive: g.motive,
      metric: g.metric,
      guardrails_json: g.guardrails_json,
      definition_hash: "",
      status: armed ? "ARMED" : "DRAFT",
      evidence_json: "",
      evidence_hash: "",
      findings_json: "",
      verdict: "",
      primary_pattern: "",
      created_at: "2026-01-01T00:00:00Z",
      armed_at: armed ? "2026-01-01T00:01:00Z" : "",
      evidence_at: "",
      resolved_at: "",
    };
  }

  const hex = (n) => "0x" + BigInt(n).toString(16);
  function rpc(method, params, source) {
    switch (method) {
      case "eth_chainId":
        return CHAIN_ID_HEX;
      case "net_version":
        return "61997";
      case "eth_blockNumber":
        return hex(1000 + Math.floor(Date.now() / 1000) % 100000);
      case "eth_getBalance":
        return hex(10n ** 21n);
      case "eth_gasPrice":
        return "0x1";
      case "eth_estimateGas":
        return "0x5208";
      case "eth_getTransactionCount":
        return "0x0";
      case "sim_getFeeConfig":
        return {
          enabled: true,
          policy: {
            genPerTimeUnit: "1000", storageUnitPrice: "1", receiptGasPrice: "1", timeUnitOverlayBps: "0",
          },
        };
      case "sim_estimateTransactionFees":
        return {
          recommendedPreset: {
            feeValue: "1000000000000000",
            distribution: {
              leaderTimeunitsAllocation: "1000", validatorTimeunitsAllocation: "1000", appealRounds: 0,
              executionBudgetPerRound: "1000", executionConsumed: "1", totalMessageFees: "0", rotations: [0],
              maxPriceGenPerTimeUnit: "1", storageFeeMaxGasPrice: "1", receiptFeeMaxGasPrice: "1",
            },
          },
        };
      case "eth_getTransactionReceipt": {
        const tx = state.txs.get(String(params[0]).toLowerCase());
        if (!tx) return null;
        return {
          transactionHash: tx.hash, transactionIndex: "0x0", blockHash: "0x" + "ab".repeat(32), blockNumber: "0x3e8",
          from: tx.from, to: tx.to, cumulativeGasUsed: "0x5208", gasUsed: "0x5208", contractAddress: null,
          logs: [], logsBloom: "0x" + "00".repeat(256), status: "0x1", effectiveGasPrice: "0x1", type: "0x0",
        };
      }
      case "eth_getTransactionByHash": {
        const tx = state.txs.get(String(params[0]).toLowerCase());
        if (!tx) return null;
        tx.reads += 1;
        return txView(tx);
      }
      case "gen_call": {
        const p = params[0];
        const parts = fromRlp(p.data);
        const call = abi.calldata.decode(hexToBytes(parts[0]));
        const entries = call instanceof Map ? Object.fromEntries(call) : call;
        const name = entries[""] ?? entries.method;
        if (name === "get_guard") return bytesToHex(abi.calldata.encode(guardView(entries.args[0])));
        throw rpcError(-32000, `mock: unsupported contract read ${name}`);
      }
      default:
        state.unknown.push({ method, source });
        console.error(`[mock-rpc] UNKNOWN METHOD ${method} from ${source}`, JSON.stringify(params).slice(0, 300));
        throw rpcError(-32601, `Method not found: ${method}`);
    }
  }
  const rpcError = (code, message) => Object.assign(new Error(message), { rpcCode: code });

  const READ_METHODS = ["eth_getTransactionByHash", "gen_call"];
  async function handleRpc(req, res, body) {
    const source = req.headers["x-mm-source"] || "browser";
    const one = (msg) => {
      const hash = msg.method === "eth_getTransactionByHash" ? String(msg.params?.[0]) : undefined;
      record(msg.method, source, hash ? { hash } : {});
      try {
        return { jsonrpc: "2.0", id: msg.id, result: rpc(msg.method, msg.params ?? [], source) };
      } catch (e) {
        return { jsonrpc: "2.0", id: msg.id, error: { code: e.rpcCode ?? -32603, message: String(e.message) } };
      }
    };
    const msgs = Array.isArray(body) ? body : [body];
    const rl = state.rateLimit;
    if (rl && rl.sources.includes(source) && msgs.some((m) => READ_METHODS.includes(m.method))) {
      msgs.forEach((m) => record(m.method, source, { status: 429 }));
      res.writeHead(429, { "content-type": "application/json", "retry-after": "1" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: msgs[0].id, error: { code: -32005, message: "Too Many Requests (429): rate limit exceeded" } }));
      return;
    }
    const out = msgs.map(one);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(Array.isArray(body) ? out : out[0]));
  }

  function snapshot() {
    return {
      sends: state.sends,
      unknown: state.unknown,
      txs: [...state.txs.values()].map((t) => ({ hash: t.hash, method: t.method, args: t.args.map(String), outcome: t.outcome, reads: t.reads })),
      reads: (source) => state.log.filter((l) => l.method === "eth_getTransactionByHash" && (!source || l.source === source)).length,
      log: state.log.length,
    };
  }

  async function handleControl(req, res, path, body) {
    const json = (o, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (path === "/__control/reset") { Object.assign(state, freshState()); return json({ ok: true }); }
    if (path === "/__control/scenario") {
      if (body.queue) state.queue = Object.fromEntries(Object.entries(body.queue).map(([k, v]) => [k, [...v]]));
      if ("defaultOutcome" in body) state.defaultOutcome = body.defaultOutcome;
      if ("rateLimit" in body) state.rateLimit = body.rateLimit;
      return json({ ok: true });
    }
    if (path === "/__control/register-tx") return json(registerTx(body));
    if (path === "/__control/set-outcome") {
      // { hash } | { latest: method } -> outcome
      const tx = body.hash ? state.txs.get(body.hash.toLowerCase()) : [...state.txs.values()].filter((t) => t.method === body.latest).pop();
      if (!tx) return json({ error: "no such tx" }, 404);
      tx.outcome = body.outcome;
      return json({ ok: true, hash: tx.hash });
    }
    if (path === "/__control/state") {
      const s = snapshot();
      const q = new URL(req.url, "http://x").searchParams;
      return json({ ...s, reads: undefined, serverReads: s.reads("server"), browserReads: s.reads("browser"), logTail: state.log.slice(-Number(q.get("tail") ?? 0)) });
    }
    return json({ error: "unknown control path" }, 404);
  }

  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        const body = text ? JSON.parse(text) : {};
        const path = new URL(req.url, "http://x").pathname;
        if (path.startsWith("/__control/")) return await handleControl(req, res, path, body);
        return await handleRpc(req, res, body);
      } catch (e) {
        console.error("[mock-rpc] handler error", e);
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: String(e?.message ?? e) }));
      }
    });
  });
  return { server, state };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const port = Number(process.env.E2E_MOCK_PORT || 4292);
  createMock().server.listen(port, "127.0.0.1", () => console.error(`[mock-rpc] listening on 127.0.0.1:${port}`));
}
