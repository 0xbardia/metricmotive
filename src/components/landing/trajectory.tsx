import type { CSSProperties } from "react";
import { useId, useState } from "react";
import { HOSTED_GAMING } from "@/components/landing/cert-case";
import { cn } from "@/lib/cn";

const MARKERS = [
  {
    id: "meetings",
    x: 34,
    y: 43,
    tone: "metric" as const,
    label: "83 meetings",
    detail: "Metric satisfied. 83 booked against a target of 80.",
    mobile: true,
  },
  {
    id: "qualified",
    x: 53,
    y: 75,
    tone: "motive" as const,
    label: "9 qualified",
    detail: "Motive advanced for nine prospects that matched ICP and were unique.",
    mobile: true,
  },
  {
    id: "dupes",
    x: 60,
    y: 53,
    tone: "fault" as const,
    label: "17 duplicates",
    detail: "Same companies rebooked as new meetings.",
    mobile: false,
  },
  {
    id: "icp",
    x: 71,
    y: 34,
    tone: "fault" as const,
    label: "41 outside ICP",
    detail: "Leads outside the declared 50–500 B2B SaaS ICP.",
    mobile: true,
  },
  {
    id: "mislead",
    x: 84,
    y: 23,
    tone: "fault" as const,
    label: "12 misleading",
    detail: "Outreach that misstated the meeting purpose.",
    mobile: false,
  },
];

const STAGES = ["Evidence sufficient", "Constraint bypass detected", "Goal not advanced"] as const;

export function TrajectoryViz() {
  const captionId = useId();
  const [open, setOpen] = useState<string | null>("meetings");
  const [dossier, setDossier] = useState(false);
  const selected = MARKERS.find((m) => m.id === open);

  return (
    <figure className="control-room" aria-labelledby={captionId}>
      <figcaption id={captionId} className="sr-only">
        Two trajectories start together after Motive Lock. The metric path climbs to 83 meetings.
        The motive path stalls as duplicates, out-of-ICP bookings, and misleading outreach arrive.
        Guard 2 resolves to METRIC_GAMING. Hosted certification case, not live user activity.
      </figcaption>

      <header className="control-room-header flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-ochre">
            {HOSTED_GAMING.label}
          </p>
          <p className="mt-2 font-display text-xl leading-tight text-bone sm:text-2xl">
            Metric climbs. Motive does not.
          </p>
        </div>
        <div className="control-room-status shrink-0 text-right font-mono text-[0.62rem] uppercase tracking-[0.12em]">
          <span className="control-room-status-dot" aria-hidden="true" />
          <span>Guard #{HOSTED_GAMING.guardId}</span>
          <span className="hidden sm:block">Resolved</span>
        </div>
      </header>

      <div className="control-room-readouts mt-6 grid grid-cols-2 gap-4 border-y border-bone/10 py-3">
        <div>
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-bone/45">Metric</p>
          <p className="mt-1 font-mono text-lg text-ochre">
            83 <span className="text-sm text-bone/45">/ 80</span>
          </p>
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-bone/45">
            target crossed
          </p>
        </div>
        <div className="border-l border-bone/10 pl-4">
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-bone/45">Motive</p>
          <p className="mt-1 font-mono text-lg text-sage">
            9 <span className="text-sm text-bone/45">qualified</span>
          </p>
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-bone/45">
            of 83 booked
          </p>
        </div>
      </div>

      <div className="trajectory-wrap relative mt-5">
        <svg
          viewBox="0 0 100 80"
          className="trajectory-svg h-auto w-full"
          role="img"
          aria-hidden="true"
        >
          <line className="trajectory-gridline" x1="8" x2="94" y1="70" y2="70" />
          <line className="trajectory-gridline" x1="8" x2="8" y1="12" y2="70" />
          <line
            className="trajectory-gridline trajectory-gridline-dashed"
            x1="8"
            x2="94"
            y1="42"
            y2="42"
          />
          <path
            d="M8 62 C 26 61, 48 59, 92 56"
            fill="none"
            className="trajectory-path trajectory-path-motive"
            strokeWidth="1.4"
            strokeLinecap="round"
            pathLength={1}
          />
          <path
            d="M8 62 C 25 58, 46 40, 92 14"
            fill="none"
            className="trajectory-path trajectory-path-metric"
            strokeWidth="1.6"
            strokeLinecap="round"
            pathLength={1}
          />
          <circle className="trajectory-origin" cx="8" cy="62" r="2.2" />
          <text className="trajectory-text trajectory-text-axis" x="10" y="76">
            lock
          </text>
          <text className="trajectory-text trajectory-text-metric" x="78" y="11">
            metric
          </text>
          <text className="trajectory-text trajectory-text-motive" x="78" y="62">
            motive
          </text>
        </svg>

        {MARKERS.map((m, i) => (
          <button
            key={m.id}
            type="button"
            className={cn(
              "evidence-mark",
              `evidence-mark-${m.tone}`,
              !m.mobile && "evidence-mark-optional",
            )}
            style={
              {
                "--marker-x": `${m.x}%`,
                "--marker-y": `${m.y}%`,
                "--marker-delay": `${680 + i * 120}ms`,
              } as CSSProperties
            }
            aria-expanded={open === m.id}
            aria-controls="evidence-detail"
            onClick={() => setOpen(open === m.id ? null : m.id)}
          >
            <span className="evidence-mark-dot" />
            <span className="evidence-mark-label">{m.label}</span>
          </button>
        ))}
      </div>

      <div className="control-room-detail-region mt-4 min-h-16" aria-live="polite">
        {selected ? (
          <p
            id="evidence-detail"
            className="control-room-detail text-sm leading-relaxed text-bone/80"
          >
            <span
              className={cn(
                "control-room-detail-label font-mono text-[0.65rem] uppercase tracking-[0.12em]",
                selected.tone === "fault"
                  ? "is-fault"
                  : selected.tone === "motive"
                    ? "is-motive"
                    : "is-metric",
              )}
            >
              {selected.label}
            </span>
            <span className="mt-1 block">{selected.detail}</span>
          </p>
        ) : (
          <p className="text-sm text-bone/55">
            Select an evidence mark. Positive metric counts sit on the ochre path. Motive failures
            sit on the brick marks.
          </p>
        )}
      </div>

      <ol className="verdict-cascade mt-5" aria-label="Adjudication">
        {STAGES.map((stage) => (
          <li key={stage}>{stage}</li>
        ))}
        <li className="verdict-cascade-final">METRIC_GAMING</li>
      </ol>

      <button
        type="button"
        className="mt-5 min-h-11 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ochre underline-offset-4 hover:underline"
        aria-expanded={dossier}
        onClick={() => setDossier((v) => !v)}
      >
        {dossier ? "Hide Guard #2 dossier" : "Open Guard #2 dossier"}
      </button>
      {dossier ? (
        <dl
          id="guard-dossier"
          className="guard-dossier mt-3 grid gap-2 font-mono text-[0.7rem] text-bone/70"
        >
          <div className="flex justify-between gap-3">
            <dt>Pattern</dt>
            <dd>{HOSTED_GAMING.primaryPattern}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Evaluate tx</dt>
            <dd className="min-w-0 truncate">{HOSTED_GAMING.evaluateTx}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Evidence fingerprint</dt>
            <dd className="min-w-0 truncate">{HOSTED_GAMING.evidenceHash}</dd>
          </div>
        </dl>
      ) : null}
      <p className="control-room-note mt-4 font-mono text-[0.6rem] uppercase tracking-[0.1em] text-bone/35">
        Click a mark to inspect the evidence fragment
      </p>
    </figure>
  );
}
