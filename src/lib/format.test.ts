import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatUtc } from "./format.ts";

describe("formatUtc", () => {
  it("matches Intl en medium date and short time in UTC, across a decade", () => {
    const intl = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
    for (let t = Date.UTC(2020, 0, 1); t < Date.UTC(2030, 0, 1); t += 3 * 3600 * 1000 + 7 * 60 * 1000) {
      const iso = new Date(t).toISOString();
      assert.equal(formatUtc(iso), `${intl.format(new Date(t))} UTC`, iso);
    }
  });

  it("keeps the empty and invalid cases", () => {
    assert.equal(formatUtc(null), "—");
    assert.equal(formatUtc("not a date"), "not a date");
  });
});
