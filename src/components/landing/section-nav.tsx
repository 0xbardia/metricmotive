import { useEffect, useState } from "react";
import { LANDING_SECTIONS } from "@/lib/site";

/**
 * Jump strip (phones/tablets) and section rail (desktop), both from LANDING_SECTIONS.
 * The strip overlays the hero (negative margin in styles.css), so it adds no height above it.
 * Active section and tone come from IntersectionObservers on section[data-tone] (no layout work per scroll).
 */
export function LandingSectionNav() {
  const [active, setActive] = useState<string | null>(null);
  const [tone, setTone] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const sections = () => Array.from(document.querySelectorAll<HTMLElement>("section[data-tone]"));
    // Once-only synchronous probe (mount, and per animation frame in the no-IntersectionObserver fallback).
    const probe = () => {
      const at = (y: number) =>
        document.elementFromPoint(window.innerWidth / 2, Math.min(y, window.innerHeight - 1))?.closest<HTMLElement>("section[data-tone]");
      const t = at(110);
      if (t) setTone(t.dataset.tone === "dark" ? "dark" : "light");
      const a = at(window.innerHeight / 2);
      setActive(a && LANDING_SECTIONS.some((s) => s.id === a.id) ? a.id : null);
    };
    probe();

    if (typeof IntersectionObserver === "undefined") {
      let raf = 0;
      const onScroll = () => {
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; probe(); });
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => {
        window.removeEventListener("scroll", onScroll);
        cancelAnimationFrame(raf);
      };
    }

    // Each observer's root is a zero/1px band (y=110 for tone, mid-viewport for active); a section is "hit" while it crosses that band.
    let toneIo: IntersectionObserver, activeIo: IntersectionObserver;
    let toneHit = new Set<HTMLElement>();
    let activeHit = new Set<HTMLElement>();
    const first = (hit: Set<HTMLElement>) => sections().find((el) => hit.has(el));
    const watch = (rootMargin: string, hit: Set<HTMLElement>, onChange: () => void) => {
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting) hit.add(e.target as HTMLElement);
          else hit.delete(e.target as HTMLElement);
        }
        onChange();
      }, { rootMargin });
      return io;
    };
    const onTone = () => {
      const t = first(toneHit);
      if (t) setTone(t.dataset.tone === "dark" ? "dark" : "light");
    };
    const onActive = () => {
      const a = first(activeHit);
      setActive(a && LANDING_SECTIONS.some((s) => s.id === a.id) ? a.id : null);
    };
    const start = () => {
      toneHit = new Set();
      activeHit = new Set();
      toneIo = watch(`-110px 0px -${Math.max(0, window.innerHeight - 111)}px 0px`, toneHit, onTone);
      activeIo = watch("-50% 0px -50% 0px", activeHit, onActive);
      for (const el of sections()) { toneIo.observe(el); activeIo.observe(el); }
    };
    const stop = () => { toneIo.disconnect(); activeIo.disconnect(); };
    start();

    // Lazy placeholders get replaced by real sections: observe new ones, drop removed ones.
    const mo = new MutationObserver(() => {
      const live = new Set(sections());
      for (const hit of [toneHit, activeHit]) for (const el of hit) if (!live.has(el)) hit.delete(el);
      for (const el of live) { toneIo.observe(el); activeIo.observe(el); } // observe() on a watched element is a no-op
      onTone();
      onActive();
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // The tone band is in px, so rebuild observers on resize (observe() re-fires an initial callback).
    const onResize = () => { stop(); start(); };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      mo.disconnect();
      stop();
    };
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
