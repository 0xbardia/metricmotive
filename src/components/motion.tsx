import {
  type CSSProperties,
  type ElementType,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/cn";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: ElementType;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [phase, setPhase] = useState<"initial" | "watching" | "in">("initial");

  useClientLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("in");
      return;
    }
    if (!("IntersectionObserver" in window)) {
      setPhase("in");
      return;
    }

    setPhase("watching");
    const fallback = window.setTimeout(() => setPhase("in"), 900);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          window.clearTimeout(fallback);
          setPhase("in");
          io.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => {
      window.clearTimeout(fallback);
      io.disconnect();
    };
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={cn(
        "reveal",
        phase === "watching" && "reveal-watching",
        phase === "in" && "is-in",
        className,
      )}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
