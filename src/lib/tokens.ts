/**
 * Semantic design tokens.
 *
 * One place decides what a status *means*; components only pick a role.
 * Brand ochre means "identity/action accent" and is deliberately NOT a
 * warning or danger colour — warnings and faults have their own roles.
 */

export const SEVERITIES = ["neutral", "info", "success", "warning", "danger"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const VERDICTS = [
  "FAITHFUL_SUCCESS",
  "PARTIAL_ALIGNMENT",
  "METRIC_GAMING",
  "INSUFFICIENT_EVIDENCE",
] as const;
export type Verdict = (typeof VERDICTS)[number];

/** Advisory (non-authoritative) analytics severity. Never a GenLayer finding. */
export const ADVISORY_LEVELS = ["info", "caution", "risk"] as const;
export type AdvisoryLevel = (typeof ADVISORY_LEVELS)[number];

export const PROTOCOL_STATES = ["DRAFT", "ARMED", "EVIDENCE_SUBMITTED", "RESOLVED"] as const;
export type ProtocolState = (typeof PROTOCOL_STATES)[number];

export type TokenRole =
  | Severity
  | "verdict-faithful"
  | "verdict-partial"
  | "verdict-gaming"
  | "verdict-insufficient"
  | "brand";

/** Tailwind utility classes per role. Keep ochre out of warning/danger. */
const ROLE_CLASSES: Record<TokenRole, string> = {
  neutral: "bg-cream text-graphite",
  info: "bg-cream text-carbon",
  success: "bg-sage-soft text-carbon",
  warning: "bg-ochre-soft text-carbon",
  danger: "bg-brick-soft text-carbon",
  brand: "bg-ochre-soft text-carbon",
  "verdict-faithful": "bg-sage-soft text-carbon",
  "verdict-partial": "bg-ochre-soft text-carbon",
  "verdict-gaming": "bg-brick-soft text-carbon",
  "verdict-insufficient": "bg-cream text-graphite",
};

const ROLE_ACCENTS: Record<TokenRole, string> = {
  neutral: "var(--color-graphite)",
  info: "var(--color-graphite)",
  success: "var(--color-sage)",
  warning: "var(--color-ochre)",
  danger: "var(--color-brick)",
  brand: "var(--color-ochre)",
  "verdict-faithful": "var(--color-sage)",
  "verdict-partial": "var(--color-ochre)",
  "verdict-gaming": "var(--color-brick)",
  "verdict-insufficient": "var(--color-graphite)",
};

export function roleClass(role: TokenRole): string {
  return ROLE_CLASSES[role] ?? ROLE_CLASSES.neutral;
}

export function roleAccent(role: TokenRole): string {
  return ROLE_ACCENTS[role] ?? ROLE_ACCENTS.neutral;
}

/** Verdict → presentation role. Colour is never the only signal: every
 * verdict also carries its own label and icon at the component layer. */
export function verdictRole(verdict: Verdict | string | null | undefined): TokenRole {
  switch (verdict) {
    case "FAITHFUL_SUCCESS":
      return "verdict-faithful";
    case "METRIC_GAMING":
      return "verdict-gaming";
    case "PARTIAL_ALIGNMENT":
      return "verdict-partial";
    default:
      return "verdict-insufficient";
  }
}

export type VerdictCopy = {
  label: string;
  summary: string;
  role: TokenRole;
  /** Text/icon-independent signal, so meaning never depends on colour alone. */
  glyph: string;
};

export const VERDICT_COPY: Record<Verdict, VerdictCopy> = {
  FAITHFUL_SUCCESS: {
    label: "Faithful success",
    summary: "The number moved because the motive moved.",
    role: "verdict-faithful",
    glyph: "✓",
  },
  METRIC_GAMING: {
    label: "Metric gaming",
    summary: "The number moved. The motive did not.",
    role: "verdict-gaming",
    glyph: "✕",
  },
  PARTIAL_ALIGNMENT: {
    label: "Partial alignment",
    summary: "Some progress, some gaming. Not a clean pass.",
    role: "verdict-partial",
    glyph: "~",
  },
  INSUFFICIENT_EVIDENCE: {
    label: "Insufficient evidence",
    summary: "The bundle cannot support a decision.",
    role: "verdict-insufficient",
    glyph: "?",
  },
};

export function verdictCopyFor(verdict: Verdict): VerdictCopy {
  return VERDICT_COPY[verdict];
}

/** Protocol/finality state. Neutral by design — never styled as a verdict. */
export const PROTOCOL_COPY: Record<ProtocolState, { label: string; role: TokenRole }> = {
  DRAFT: { label: "Draft", role: "neutral" },
  ARMED: { label: "Locked", role: "neutral" },
  EVIDENCE_SUBMITTED: { label: "Evidence committed", role: "neutral" },
  RESOLVED: { label: "Finalized on-chain", role: "neutral" },
};

export function advisoryRole(level: AdvisoryLevel): TokenRole {
  if (level === "risk") return "danger";
  if (level === "caution") return "warning";
  return "info";
}
