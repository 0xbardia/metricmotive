import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { MarketingShell } from "@/components/marketing-shell";
import { LandingHero } from "@/components/landing/hero";
import { ProblemSection } from "@/components/landing/problem";
import { LandingSectionNav } from "@/components/landing/section-nav";
import { pageHead } from "@/lib/site";

const Case = lazy(() => import("@/components/landing/case"));
const HowItWorks = lazy(() => import("@/components/landing/how-it-works"));
const Audience = lazy(() => import("@/components/landing/audience"));
const Trust = lazy(() => import("@/components/landing/trust"));
const Cta = lazy(() => import("@/components/landing/cta"));

export const Route = createFileRoute("/")({ head: () => pageHead({ path: "/" }), component: Home });

/**
 * Same id/tone/background as the real section, with a fixed height, so lazy loading does not shift layout.
 * The chunk is requested and mounted only when the placeholder nears the viewport, so below-the-fold sections
 * cost nothing in the first seconds (TBT). contain-intrinsic-size keeps the placeholder's height while skipped.
 */
function Hold({ id, tone, h, children }: { id: string; tone: "light" | "dark"; h: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    if (!("IntersectionObserver" in window)) {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          io.disconnect();
          setNear(true);
        }
      },
      { rootMargin: "0px 0px 300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  const placeholder = (
    <section
      ref={ref}
      id={id}
      data-tone={tone}
      aria-busy="true"
      className={tone === "dark" ? "ambient-dark" : "ambient"}
      style={{ minHeight: h, containIntrinsicSize: `auto ${h}` }}
    />
  );
  return near ? <Suspense fallback={placeholder}>{children}</Suspense> : placeholder;
}

function Home() {
  return (
    <MarketingShell invert>
      <LandingSectionNav />
      <LandingHero />
      <ProblemSection />
      <Hold id="case" tone="dark" h="90rem">
        <Case />
      </Hold>
      <Hold id="how-it-works" tone="light" h="34rem">
        <HowItWorks />
      </Hold>
      <Hold id="audience" tone="light" h="26rem">
        <Audience />
      </Hold>
      <Hold id="trust" tone="dark" h="28rem">
        <Trust />
      </Hold>
      <Hold id="cta" tone="light" h="24rem">
        <Cta />
      </Hold>
    </MarketingShell>
  );
}
