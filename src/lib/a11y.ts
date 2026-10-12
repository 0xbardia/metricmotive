export type BannerTone = "neutral" | "info" | "success" | "warning" | "danger";

/** Danger is assertive; everything else is a polite status. */
export function bannerRole(tone: BannerTone): "alert" | "status" {
  return tone === "danger" ? "alert" : "status";
}

/** ids for a field's hint/error elements, derived from the field id. */
export function fieldIds(id: string) {
  return { hint: `${id}-hint`, error: `${id}-error` };
}

/** aria-describedby value (undefined when nothing to describe). */
export function fieldDescribedBy(
  id: string,
  { hint, error }: { hint?: unknown; error?: unknown },
): string | undefined {
  const ids = fieldIds(id);
  const parts = [hint ? ids.hint : "", error ? ids.error : ""].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}
