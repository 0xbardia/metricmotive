export function shortHex(value: string, size = 4): string {
  if (!value) return "—";
  if (value.length <= size * 2 + 2) return value;
  return `${value.slice(0, size + 2)}…${value.slice(-size)}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
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
