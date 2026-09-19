import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import { TechnicalDetails } from "@/components/product-ui";
import { cn } from "@/lib/cn";
import { roleAccent, roleClass, type Severity } from "@/lib/tokens";

const ICONS: Record<Severity, typeof Info> = {
  neutral: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: OctagonAlert,
};

export type StatusBannerProps = {
  /** Eyebrow, e.g. "Confirming" or "Evidence committed". */
  status?: string;
  severity?: Severity;
  title: string;
  message: ReactNode;
  /** Rendered action(s). Any async action must use a loading Button. */
  action?: ReactNode;
  /** Raw protocol detail; collapsed behind Technical details. */
  technicalDetails?: ReactNode;
  children?: ReactNode;
  className?: string;
};

/**
 * THE single primary status surface for an operation.
 *
 * Exactly one of these may carry an operation's primary copy: route-level and
 * component-level errors must be passed in here rather than rendered beside it,
 * which is how duplicate reconciliation banners appeared (C1).
 */
export function StatusBanner({
  status,
  severity = "neutral",
  title,
  message,
  action,
  technicalDetails,
  children,
  className,
}: StatusBannerProps) {
  const Icon = ICONS[severity];
  return (
    <section
      className={cn("product-status paper-panel p-5", roleClass(severity), className)}
      style={{ borderLeftColor: roleAccent(severity) }}
      role="status"
      aria-live={severity === "neutral" ? undefined : "polite"}
      data-severity={severity}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {status ? (
            <p className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.15em] text-graphite">
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              {status}
            </p>
          ) : null}
          <h2 className="mt-2 font-display text-2xl tracking-tight">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">{message}</p>
        </div>
        {action ? <div className="mt-2 flex flex-wrap gap-2">{action}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
      {technicalDetails ? (
        <TechnicalDetails title="Technical details" className="mt-4">
          {technicalDetails}
        </TechnicalDetails>
      ) : null}
    </section>
  );
}
