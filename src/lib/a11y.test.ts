import assert from "node:assert/strict";
import test from "node:test";
import { bannerRole, fieldDescribedBy } from "./a11y.ts";

test("fieldDescribedBy", () => {
  assert.equal(fieldDescribedBy("m", {}), undefined);
  assert.equal(fieldDescribedBy("m", { hint: "h" }), "m-hint");
  assert.equal(fieldDescribedBy("m", { error: "e" }), "m-error");
  assert.equal(fieldDescribedBy("m", { hint: "h", error: "e" }), "m-hint m-error");
});

test("bannerRole", () => {
  assert.equal(bannerRole("danger"), "alert");
  for (const t of ["neutral", "info", "success", "warning"] as const)
    assert.equal(bannerRole(t), "status");
});
