import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { guardProvenanceSchemaReady } from "./schema.ts";

describe("guard provenance schema readiness", () => {
  it("requires all provenance columns", () => {
    assert.equal(
      guardProvenanceSchemaReady([
        { column_name: "contract_address" },
        { column_name: "chain_id" },
        { column_name: "network" },
      ]),
      true,
    );
  });

  it("fails closed when any provenance column is missing", () => {
    assert.equal(
      guardProvenanceSchemaReady([{ column_name: "contract_address" }]),
      false,
    );
  });
});
