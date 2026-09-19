import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { Wordmark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { GENLAYER } from "@/lib/domain";
import { lazy, Suspense } from "react";

const WalletControl = lazy(() =>
  import("@/components/wallet-control").then((mod) => ({ default: mod.WalletControl })),
);

const NAV = [
  { to: "/", hash: "product", label: "Product" },
  { to: "/", hash: "how-it-works", label: "How it works" },
  { to: "/", hash: "use-cases", label: "Use cases" },
  { to: "/docs", label: "Docs" },
] as const;

/**
 * Product navigation for authenticated/app routes (H1).
 *
 * App routes render THIS instead of the marketing links, so a page can never
 * stack two competing nav systems on one screen.
 */
const APP_NAV = [
  { to: "/app", label: "Cases" },
  { to: "/app/guards/new", label: "Build a Guard" },
  { to: "/contract", label: "Contract" },
  { to: "/docs", label: "Docs" },
] as const;

export function SiteHeader({
  invert = false,
  withWallet = false,
  app = false,
}: {
  invert?: boolean;
  withWallet?: boolean;
  /** Render product navigation instead of marketing navigation. */
  app?: boolean;
}) {
  const items = app ? APP_NAV : NAV;
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [sectionDark, setSectionDark] = useState(invert);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > 16);
      if (invert) {
        const underHeader = document
          .elementFromPoint(window.innerWidth / 2, Math.min(80, window.innerHeight - 1))
          ?.closest("section");
        if (underHeader) setSectionDark(underHeader.classList.contains("bg-carbon"));
      }
    };
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };
    update();
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [invert]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (headerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      window.requestAnimationFrame(() => menuButtonRef.current?.focus());
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const dark = invert && sectionDark;

  return (
    <header
      ref={headerRef}
      data-invert={invert}
      data-scrolled={scrolled}
      data-tone={dark ? "dark" : "light"}
      className={cn("site-header sticky top-0 z-30", dark ? "text-bone" : "text-carbon")}
    >
      <div className="header-inner mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/" aria-label="MetricMotive home">
          <Wordmark invert={dark} />
        </Link>
        <nav className="hidden items-center gap-5 lg:flex" aria-label="Primary">
          {items.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              hash={"hash" in item ? item.hash : undefined}
              data-active={pathname === item.to && !("hash" in item) ? "true" : "false"}
              className={cn(
                "nav-link text-sm",
                pathname === item.to && !("hash" in item) ? "text-ochre" : "",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {withWallet ? (
            <div className="hidden sm:block">
              <Suspense
                fallback={
                  <Button size="sm" variant="outline" disabled>
                    Connect wallet
                  </Button>
                }
              >
                <WalletControl />
              </Suspense>
            </div>
          ) : null}
          {app ? null : (
            <Link to="/app" preload="intent" className="hidden sm:block">
              <Button size="sm" variant={dark ? "inverse" : "primary"}>
                Open App
              </Button>
            </Link>
          )}
          <button
            type="button"
            ref={menuButtonRef}
            className="inline-flex size-11 items-center justify-center rounded-md lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="icon-swap" data-on={open ? "true" : "false"}>
              <span className="icon-swap-on">
                <X className="size-5" />
              </span>
              <span className="icon-swap-off">
                <Menu className="size-5" />
              </span>
            </span>
            <span className="sr-only">Menu</span>
          </button>
        </div>
      </div>
      {open ? (
        <nav
          id="mobile-nav"
          className="mobile-nav flex flex-col gap-1 border-t px-4 py-3 lg:hidden"
        >
          {items.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              hash={"hash" in item ? item.hash : undefined}
              className="min-h-11 py-2 text-sm"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          {withWallet ? (
            <div className="mt-2">
              <Suspense
                fallback={
                  <Button className="w-full" size="sm" variant="outline" disabled>
                    Connect wallet
                  </Button>
                }
              >
                <WalletControl />
              </Suspense>
            </div>
          ) : null}
          {app ? null : (
            <Link to="/app" preload="intent" onClick={() => setOpen(false)}>
              <Button className="mt-2 w-full" variant={dark ? "inverse" : "primary"}>
                Open App
              </Button>
            </Link>
          )}
        </nav>
      ) : null}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-rule bg-cream">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Wordmark />
          <p className="mt-3 max-w-sm text-sm text-graphite">
            Motive is what you wanted. Metric is what got counted. The verdict is the difference.
          </p>
        </div>
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-graphite">Product</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link to="/" hash="product">
                Product
              </Link>
            </li>
            <li>
              <Link to="/docs">Docs</Link>
            </li>
            <li>
              <Link to="/contract">Contract</Link>
            </li>
            <li>
              <Link to="/roadmap">Roadmap</Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-graphite">Open source</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link to="/docs" hash="security">
                Security
              </Link>
            </li>
            <li>
              <a href={GENLAYER.studioUrl} rel="noopener noreferrer" target="_blank">
                GenLayer Studio
              </a>
            </li>
            <li>Apache-2.0</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

export function AdvisoryNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-carbon" data-note="advisory">
      <span className="font-mono text-[0.625rem] uppercase tracking-[0.13em]">Advisory only · not a GenLayer finding.</span>{" "}
      {children}
    </p>
  );
}
