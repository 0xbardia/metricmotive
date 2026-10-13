import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

const files = ["src/routes/demo.tsx", ...readdirSync("src/components/demo").map((f) => `src/components/demo/${f}`)];
const FORBIDDEN = ["@/lib/wallet", "@/lib/contract", "genlayer-js", "wagmi", "viem", "@rainbow-me", "@/lib/server"];

describe("/demo is public and wallet-free", () => {
  it("imports no wallet, contract or server module", () => {
    for (const f of files) {
      const specs = [...readFileSync(f, "utf8").matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const s of specs) {
        assert.ok(!FORBIDDEN.some((x) => s === x || s.startsWith(x)), `${f} imports ${s}`);
      }
    }
  });
  it("reads the public D1 case", () => {
    assert.match(readFileSync("src/components/demo/replay.tsx", "utf8"), /from "@\/lib\/d1-case"/);
  });
});
