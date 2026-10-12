/** Pure builder-draft helpers: key naming, validation, and initial-state decision. */
export type DraftRail = { kind: "MUST" | "QUALITY"; text: string };
export type GuardDraft = { motive: string; metric: string; guardrails: DraftRail[] };
export type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

const PREFIX = "metricmotive.guard-draft";
export const NEW_DRAFT_KEY = `${PREFIX}:new`;
export const draftKey = (guardId: string | null | undefined) =>
  guardId ? `${PREFIX}:${guardId}` : NEW_DRAFT_KEY;

/** Route search validator: guardId is optional and must look like a guard id. */
export function validateGuardSearch(search: Record<string, unknown>): { guardId?: string } {
  const g = search.guardId;
  return { guardId: typeof g === "string" && /^grd_[A-Za-z0-9_-]{1,64}$/.test(g) ? g : undefined };
}

export function parseDraft(raw: string | null): GuardDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<GuardDraft>;
    if (typeof d.motive !== "string" || typeof d.metric !== "string") return null;
    const guardrails = Array.isArray(d.guardrails)
      ? d.guardrails.filter(
          (r): r is DraftRail =>
            Boolean(r) &&
            (r.kind === "MUST" || r.kind === "QUALITY") &&
            typeof r.text === "string",
        )
      : [];
    return { motive: d.motive, metric: d.metric, guardrails };
  } catch {
    return null;
  }
}

export function loadDraft(store: KeyValueStore, guardId: string | null): GuardDraft | null {
  try {
    return parseDraft(store.getItem(draftKey(guardId)));
  } catch {
    return null;
  }
}

/** Writes to the per-guard key (or the new-draft key while no id exists). */
export function saveDraft(store: KeyValueStore, guardId: string | null, draft: GuardDraft) {
  try {
    store.setItem(draftKey(guardId), JSON.stringify(draft));
    return true;
  } catch {
    return false; // best-effort convenience copy
  }
}

export type InitialBuilder = {
  id: string | null;
  step: number;
  draft: GuardDraft;
};

export const EMPTY_DRAFT: GuardDraft = { motive: "", metric: "", guardrails: [] };

/**
 * Fresh visits start empty. Only a ?guardId= that the current wallet owns
 * restores its own per-guard draft (falling back to the server definition).
 */
export function initialBuilderState(input: {
  searchGuardId?: string;
  ownedGuard: (GuardDraft & { id: string }) | null;
  stored: GuardDraft | null;
}): InitialBuilder {
  const { searchGuardId, ownedGuard, stored } = input;
  if (!searchGuardId || !ownedGuard || ownedGuard.id !== searchGuardId) {
    return { id: null, step: 0, draft: EMPTY_DRAFT };
  }
  const { motive, metric, guardrails } = stored ?? ownedGuard;
  return { id: ownedGuard.id, step: 1, draft: { motive, metric, guardrails } };
}

export const sameWallet = (a?: string | null, b?: string | null) =>
  Boolean(a && b && a.toLowerCase() === b.toLowerCase());
