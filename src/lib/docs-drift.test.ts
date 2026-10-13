import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("openapi version is 2.0.0", () => {
  assert.match(read("src/routes/api/v1/openapi[.]json.ts"), /version: "2\.0\.0"/);
});

test(".env.example lists the names, with no secret values", () => {
  const env = read(".env.example");
  for (const n of ["XAI_API_KEY", "METRICMOTIVE_WEBHOOK_SECRET", "METRICMOTIVE_WEBHOOK_OWNER", "METRICMOTIVE_API_URL", "METRICMOTIVE_ALLOW_CERTIFICATION_WRITES"]) {
    assert.match(env, new RegExp(`^${n}=$`, "m"), n);
  }
  assert.doesNotMatch(env, /^(?:\w*(?:SECRET|API_KEY|PRIVATE_KEY))=\S/m);
});

test("historical files carry the banner", () => {
  assert.match(read("docs/V1_RELEASE_MANIFEST.md"), /HISTORICAL/);
  assert.match(read("docs/V1_CERTIFICATION.md"), /HISTORICAL/);
  assert.match(read("deployment/metricmotive-studionet.json"), /"_historical"/);
  for (const f of ["studio-deploy", "audit-contract-readonly", "wallet-e2e", "studio-verify"]) {
    assert.match(read(`scripts/${f}.mjs`), /HISTORICAL/, f);
  }
});

for (const f of ["studio-deploy", "audit-contract-readonly", "wallet-e2e"]) {
  test(`${f} refuses without METRICMOTIVE_ALLOW_HISTORICAL`, () => {
    const r = spawnSync("node", [`scripts/${f}.mjs`], {
      cwd: new URL("../../", import.meta.url),
      env: { PATH: process.env.PATH ?? "" },
      encoding: "utf8",
      timeout: 20000,
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /METRICMOTIVE_ALLOW_HISTORICAL=YES/);
  });
}
