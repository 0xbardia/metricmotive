import { definitionHash } from "../domain.ts";

/**
 * Golden-value fixture used to prove the frontend remediation did not disturb
 * the canonical definition hashing used for locks and reconciliation.
 */
const FIXTURE = {
  motive: "Generate genuine qualified sales opportunities from the declared ICP.",
  metric: "Book 80 meetings this week.",
  guardrails: [
    { kind: "MUST" as const, text: "Duplicates do not count." },
    { kind: "QUALITY" as const, text: "Preserve trust." },
  ],
};

export function computeDefinitionHashFixture(): Promise<string> {
  return definitionHash(FIXTURE.motive, FIXTURE.metric, [...FIXTURE.guardrails]);
}
