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
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Same text as Intl "en" (medium date, short time) in UTC, written out: the first Intl.DateTimeFormat costs
 * about 30 ms cold (over 100 ms at 4x CPU), and the landing's case section formats a timestamp on first paint.
 * Parity with Intl is tested in format.test.ts.
 */
export function formatUtc(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const h = d.getUTCHours();
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${h % 12 || 12}:${minutes} ${h < 12 ? "AM" : "PM"} UTC`;
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
