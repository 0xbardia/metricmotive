import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Source-scan rules (Phase 5), same style as ui-remediation.test.ts:
 *  1. Each page imports AND renders <StateCard.
 *  2. User-visible text is checked for the banned words "armed" / "fingerprint": JSX text nodes (`>text<`) and
 *     string `label=` / `title=` attributes. Identifiers, `kind="fingerprint"` props, comments and stored values
 *     ("ARMED", "arm_guard") are not user-visible and are ignored (the pattern is a whole word, "arm_guard" is not
 *     matched; stored `"ARMED"` sits in code, not in a JSX text node).
 *  3. Every `kind="error"` StateCard carries an `action=`; the shared PrivateReadError also routes every step to a Button.
 */
const FILES = {
  list: "src/components/app-home-content.tsx",
  guard: "src/routes/app/guards/$id.tsx",
  run: "src/routes/app/runs/$id.tsx",
} as const;
const EXTRA_WORDS = ["src/components/ui/evidence-committed-card.tsx"];

const read = (p: string) => readFileSync(p, "utf8");

function visibleText(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/>([^<>{}=]*[A-Za-z][^<>{}]*)</g)) out.push(m[1]);
  for (const m of src.matchAll(/\b(?:label|title|aria-label)="([^"]*)"/g)) out.push(m[1]);
  for (const m of src.matchAll(/\b(?:label|title)=\{?`([^`]*)`/g)) out.push(m[1]);
  return out;
}

describe("page states", () => {
  for (const [name, path] of Object.entries(FILES)) {
    it(`${name} imports and renders StateCard`, () => {
      const src = read(path);
      assert.match(src, /import \{ StateCard \} from "@\/components\/ui\/state-card"/);
      assert.match(src, /<StateCard/);
    });
  }

  it("the Guard and Run pages have loading, not-found and error branches", () => {
    for (const path of [FILES.guard, FILES.run]) {
      const src = read(path);
      assert.match(src, /kind="loading"/);
      assert.match(src, /kind="empty" title="(Guard|Run) not found\."/);
      assert.match(src, /<PrivateReadError/);
    }
  });

  it("the list has not-connected, loading, empty and error states", () => {
    const src = read(FILES.list);
    for (const k of ["loading", "empty", "error"]) assert.match(src, new RegExp(`kind="${k}"`));
    assert.match(src, /Connect wallet/);
    assert.match(src, /No Guards yet\./);
    assert.match(src, /Create a Motive Guard/);
    assert.match(src, /Try again/);
  });

  it("every error StateCard offers an action", () => {
    for (const path of Object.values(FILES)) {
      for (const m of read(path).matchAll(/<StateCard[^>]*kind="error"[^>]*>/g)) {
        assert.match(m[0], /action=/, `${path}: error StateCard without action`);
      }
    }
    const list = read(FILES.list);
    assert.match(list, /Back to Cases/);
    assert.match(list, /Sign in with wallet/);
  });

  it("no user-visible 'armed' or 'fingerprint'", () => {
    for (const path of [...Object.values(FILES), ...EXTRA_WORDS, "src/routes/app/index.tsx"]) {
      for (const text of visibleText(read(path))) {
        assert.doesNotMatch(text, /\b(armed|fingerprint)\b/i, `${path}: "${text}"`);
      }
    }
  });
});
