import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_DRAFT,
  draftKey,
  initialBuilderState,
  loadDraft,
  saveDraft,
  validateGuardSearch,
} from "./guard-draft.ts";

const mem = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const d = (motive: string) => ({ motive, metric: "metric1", guardrails: [] });

test("fresh visit with stale stored draft and no guardId starts empty", () => {
  const s = initialBuilderState({ ownedGuard: null, stored: d("stale draft text") });
  assert.deepEqual(s, { id: null, step: 0, draft: EMPTY_DRAFT });
});

test("owned guardId restores its per-guard draft; not owned is empty", () => {
  const store = mem();
  saveDraft(store, "grd_a", d("mine edited"));
  const owned = { id: "grd_a", ...d("server version") };
  const s = initialBuilderState({ searchGuardId: "grd_a", ownedGuard: owned, stored: loadDraft(store, "grd_a") });
  assert.equal(s.id, "grd_a");
  assert.equal(s.draft.motive, "mine edited");
  const n = initialBuilderState({ searchGuardId: "grd_a", ownedGuard: null, stored: loadDraft(store, "grd_a") });
  assert.deepEqual(n.draft, EMPTY_DRAFT);
  assert.equal(n.id, null);
});

test("saving continues after id assigned and guards do not overwrite each other", () => {
  const store = mem();
  saveDraft(store, null, d("before id"));
  saveDraft(store, "grd_a", d("a v2"));
  saveDraft(store, "grd_b", d("b v1"));
  saveDraft(store, "grd_a", d("a v3"));
  assert.equal(loadDraft(store, "grd_a")?.motive, "a v3");
  assert.equal(loadDraft(store, "grd_b")?.motive, "b v1");
  assert.equal(loadDraft(store, null)?.motive, "before id");
  assert.notEqual(draftKey("grd_a"), draftKey("grd_b"));
});

test("invalid guardId search value is rejected", () => {
  assert.equal(validateGuardSearch({ guardId: "../x" }).guardId, undefined);
  assert.equal(validateGuardSearch({ guardId: 5 }).guardId, undefined);
  assert.equal(validateGuardSearch({ guardId: "grd_abc123" }).guardId, "grd_abc123");
});
