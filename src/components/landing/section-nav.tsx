import { useEffect, useState } from "react";
import { LANDING_SECTIONS } from "@/lib/site";

/**
 * Jump strip (phones/tablets) and section rail (desktop), both from LANDING_SECTIONS.
 * The strip overlays the hero (negative margin in styles.css), so it adds no height above it.
 * Active section and tone come from the section under a probe point, so lazy sections need no observer.
 */
export function LandingSectionNav() {
  const [active, setActive] = useState<string | null>(null);
  const [tone, setTone] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const update = () => {
      const at = (y: number) =>
        document.elementFromPoint(window.innerWidth / 2, Math.min(y, window.innerHeight - 1))?.closest<HTMLElement>("section[data-tone]");
      const t = at(110);
      if (t) setTone(t.dataset.tone === "dark" ? "dark" : "light");
      const a = at(window.innerHeight / 2);
      setActive(a && LANDING_SECTIONS.some((s) => s.id === a.id) ? a.id : null);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <>
      <nav className="landing-rail" data-tone={tone} aria-label="Landing sections">
        <ol>
          {LANDING_SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} data-active={active === s.id} aria-current={active === s.id ? "true" : undefined}>
                <span className="landing-rail-dot" aria-hidden="true" />
                <span className="landing-rail-label">{s.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <nav className="landing-jump" data-tone={tone} aria-label="Jump to section">
        {LANDING_SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} data-active={active === s.id}>
            {s.title}
          </a>
        ))}
      </nav>
    </>
  );
}
