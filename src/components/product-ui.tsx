import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function TechnicalDetails({
  children,
  title = "Technical details",
  defaultOpen = false,
  className,
}: {
  children: ReactNode;
  title?: string;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details className={cn("technical-details", className)} open={defaultOpen || undefined}>
      <summary>{title}</summary>
      <div className="technical-details-body">{children}</div>
    </details>
  );
}

export function FlowRail({
  steps,
  current,
}: {
  steps: readonly string[];
  current: number;
}) {
  return (
    <ol className="flow-rail" aria-label="Product flow">
      {steps.map((step, index) => (
        <li
          key={step}
          className="flow-rail-step"
          data-state={index === current ? "current" : index < current ? "complete" : "upcoming"}
        >
          <span className="flow-rail-number">{String(index + 1).padStart(2, "0")}</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

export function HumanStatus({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section className="product-status paper-panel p-5" aria-labelledby="product-status-title">
      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.15em] text-graphite">
        {eyebrow}
      </p>
      <h2 id="product-status-title" className="mt-2 font-display text-3xl tracking-tight">
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">{description}</p>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}
