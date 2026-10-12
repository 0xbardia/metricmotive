/**
 * Single source for public-page identity (C-01..C-04, C-07, C-09).
 * One description sentence is used by the document head, the web manifest and the hero.
 */
export const SITE_URL = "https://metricmotive.xyz";
export const SITE_NAME = "MetricMotive";
export const SITE_TAGLINE = "Your agent hit the metric. Did it honor the motive?";
export const SITE_DESCRIPTION =
  "MetricMotive checks whether an AI agent served the goal you meant or only the number you measured, and writes the verdict on-chain as a public receipt.";
export const OG_IMAGE = `${SITE_URL}/og.jpg`;
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** Public routes the landing links to. */
export const ROUTES = {
  demo: "/demo",
  builder: "/app/guards/new",
  docs: "/docs",
  contract: "/contract",
  roadmap: "/roadmap",
} as const;

/** Landing sections, in page order. Nav labels (header, jump strip, rail) ARE the section titles (C-07). */
export const LANDING_SECTIONS = [
  { id: "problem", title: "The problem" },
  { id: "case", title: "A real case" },
  { id: "how-it-works", title: "How it works" },
  { id: "audience", title: "Who it's for" },
  { id: "trust", title: "Trust" },
] as const;

export type PageHeadInput = { title?: string; description?: string; path: string; image?: string };

/** Title, description, canonical, robots, Open Graph and Twitter tags for one route. */
export function pageHead({ title, description = SITE_DESCRIPTION, path, image = OG_IMAGE }: PageHeadInput) {
  const fullTitle = title ? `${title} · ${SITE_NAME}` : `${SITE_NAME}: ${SITE_TAGLINE}`;
  const url = `${SITE_URL}${path === "/" ? "" : path}`;
  return {
    meta: [
      { title: fullTitle },
      { name: "description", content: description },
      { name: "robots", content: "index,follow" },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:type", content: "website" },
      { property: "og:title", content: fullTitle },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:image", content: image },
      { property: "og:image:width", content: String(OG_IMAGE_SIZE.width) },
      { property: "og:image:height", content: String(OG_IMAGE_SIZE.height) },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: fullTitle },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}
