import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { D1, D1_NUMBER_SOURCES } from "./d1-case.ts";
import { mapVerdict } from "./domain.ts";

describe("D1 case (Studio Dev Guard #1)", () => {
  it("is the active-contract case from the README: METRIC_GAMING / CONSTRAINT_BYPASS", () => {
    assert.equal(D1.contract, "0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703");
    assert.equal(D1.chainId, 61997);
    assert.equal(D1.guardId, "1");
    assert.equal(D1.verdict, "METRIC_GAMING");
    assert.equal(D1.pattern, "CONSTRAINT_BYPASS");
    assert.equal(D1.receiptPath, "/verify/rct_14804bf62424284e");
  });

  it("derives every displayed count from the recorded evidence events", () => {
    assert.deepEqual(D1.counts, { booked: 12, outsideIcp: 4, duplicates: 3, misleading: 2, qualifiedFollowUps: 3, events: 5 });
    assert.equal(D1.metricTarget, 10);
  });

  it("maps the on-chain findings to the on-chain verdict with the contract's own rule", () => {
    assert.equal(
      mapVerdict(D1.findings as never),
      D1.verdict,
    );
  });

  it("lists a source for every number the case copy may show", () => {
    for (const n of ["12", "10", "4", "3", "2", "5", "50", "500", "61997", "1"]) assert.ok(D1_NUMBER_SOURCES[n], `no source for ${n}`);
  });
});
