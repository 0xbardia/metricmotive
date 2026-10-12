import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { D1 } from "./d1-case.ts";
import { formatUtc } from "./format.ts";
import { receiptTimes } from "./receipt-times.ts";

describe("receipt times (D1)", () => {
  it("the on-chain time shown is exactly the contract's resolved_at, the same string the landing shows", () => {
    const t = receiptTimes({ chainResolvedAt: D1.at.resolved, recordedAt: "2026-09-19T03:14:05.046Z" });
    assert.equal(t.onChain, formatUtc(D1.at.resolved));
    assert.equal(t.onChain, "Sep 19, 2026, 3:13 AM UTC");
  });

  it("keeps the app's recorded time separate and never presents it as the chain time", () => {
    const t = receiptTimes({ chainResolvedAt: D1.at.resolved, recordedAt: "2026-09-19T03:14:05.046Z" });
    assert.equal(t.recorded, "Sep 19, 2026, 3:14 AM UTC");
    assert.notEqual(t.onChain, t.recorded);
  });

  it("shows no on-chain time until one is known (older receipts), only the recorded time", () => {
    assert.deepEqual(receiptTimes({ recordedAt: "2026-09-19T03:14:05.046Z" }), { onChain: null, recorded: "Sep 19, 2026, 3:14 AM UTC" });
    assert.deepEqual(receiptTimes({ chainResolvedAt: "", recordedAt: null }), { onChain: null, recorded: null });
  });
});
