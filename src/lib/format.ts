export function shortHex(value: string, size = 4): string {
  if (!value) return "—";
  if (value.length <= size * 2 + 2) return value;
  return `${value.slice(0, size + 2)}…${value.slice(-size)}`;
}

/**
 * Consistent mid-ellipsis for identifiers. Short values are returned untouched
 * so a short Guard id is never pointlessly truncated (H4).
 */
export function midEllipsis(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/**
 * Timestamps always name their zone (N33).
 *
 * Previously the zone was whatever the viewer's browser happened to be, which
 * made a finalized on-chain timestamp ambiguous — two people comparing the same
 * receipt could read different clocks with no way to tell. Stored instants are
 * UTC, so UTC is what is displayed, explicitly.
 */
export function formatUtc(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(d) + " UTC";
}

export function classForVerdict(
  verdict: string | null | undefined,
): "sage" | "brick" | "ochre" | "graphite" {
  switch (verdict) {
    case "FAITHFUL_SUCCESS":
      return "sage";
    case "METRIC_GAMING":
      return "brick";
    case "PARTIAL_ALIGNMENT":
      return "ochre";
    default:
      return "graphite";
  }
}
