import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "product", label: "Define" },
  { id: "how-it-works", label: "Lock" },
  { id: "stress-test", label: "Stress-test" },
  { id: "use-cases", label: "Capture" },
  { id: "contract", label: "Verify" },
  { id: "receipt", label: "Receipt" },
] as const;

/**
 * Restrained long-scroll navigation (L5).
 *
 * Desktop: a small fixed rail of section dots. Mobile: a compact horizontal
 * jump list. No oversized chrome, and it stays out of the way of the sticky
 * header by sitting below it.
 */
export function LandingSectionNav() {
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    for (const section of SECTIONS) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <nav
        className="landing-rail"
        aria-label="Landing sections"
      >
        <ol>
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                data-active={active === section.id}
                aria-current={active === section.id ? "true" : undefined}
              >
                <span className="landing-rail-dot" aria-hidden="true" />
                <span className="landing-rail-label">{section.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <nav className="landing-jump" aria-label="Landing sections">
        {SECTIONS.map((section) => (
          <a key={section.id} href={`#${section.id}`} data-active={active === section.id}>
            {section.label}
          </a>
        ))}
      </nav>
    </>
  );
}
