import type { CSSProperties } from "react";
import { useId, useState } from "react";
import { HOSTED_GAMING, TRAJECTORY_MARKERS } from "@/components/landing/cert-case";
import { cn } from "@/lib/cn";

const MARKERS = TRAJECTORY_MARKERS;

const STAGES = ["Evidence sufficient", "Constraint bypass detected", "Goal not advanced"] as const;

export function TrajectoryViz() {
  const captionId = useId();
  const [open, setOpen] = useState<string | null>("meetings");
  const [dossier, setDossier] = useState(false);
  const selected = MARKERS.find((m) => m.id === open);

  return (
    <figure className="control-room" aria-labelledby={captionId}>
      <figcaption id={captionId} className="sr-only">
        Chart of two trajectories over one run, from Motive Lock to adjudication. The vertical axis is
        count of records; the horizontal axis is time through the run. The ochre metric line climbs
        past the dashed target line of {HOSTED_GAMING.target} booked meetings. The sage motive line
        stalls near {HOSTED_GAMING.counts.qualified}. Fault marks sit on the metric line where
        evidence recorded {HOSTED_GAMING.counts.duplicates} duplicates,
        {HOSTED_GAMING.counts.outsideIcp} bookings outside the declared ICP, and
        {HOSTED_GAMING.counts.misleading} misleading outreach events. Guard
        {HOSTED_GAMING.guardId} resolves to METRIC_GAMING. Hosted certification case, not live user
        activity.
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
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-bone/62">Metric</p>
          <p className="mt-1 font-mono text-lg text-ochre">
            {HOSTED_GAMING.counts.meetings}{" "}
            <span className="text-sm text-bone/62">/ {HOSTED_GAMING.target}</span>
          </p>
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-bone/62">
            target crossed
          </p>
        </div>
        <div className="border-l border-bone/10 pl-4">
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-bone/62">Motive</p>
          <p className="mt-1 font-mono text-lg text-[var(--color-sage-on-dark)]">
            {HOSTED_GAMING.counts.qualified}{" "}
            <span className="text-sm text-bone/62">qualified</span>
          </p>
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-bone/62">
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
          <text className="trajectory-text trajectory-text-axis" x="86" y="76">
            adjudicated
          </text>
          <text className="trajectory-text trajectory-text-metric" x="78" y="11">
            metric
          </text>
          <text className="trajectory-text trajectory-text-motive" x="78" y="62">
            motive
          </text>
          {/* Axis meaning + the target the metric had to reach. */}
          <text className="trajectory-text trajectory-text-axis" x="2" y="14">
            count
          </text>
          <text className="trajectory-text trajectory-text-axis" x="2" y="70">
            0
          </text>
          <text className="trajectory-text trajectory-text-target" x="24" y="40">
            target {HOSTED_GAMING.target}
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

      <ul className="trajectory-legend mt-4 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[0.62rem] uppercase tracking-[0.12em]">
        <li className="is-metric">Metric trajectory — measurable count</li>
        <li className="is-motive">Motive trajectory — eligible outcomes</li>
        <li className="is-target">Dashed line — declared target</li>
        <li className="is-fault">Fault marks — recorded evidence</li>
      </ul>

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

      <ul className="trajectory-mobile-list mt-5 sm:hidden" aria-label="Evidence marks">
        {MARKERS.map((m) => (
          <li key={`mobile-${m.id}`} className={`is-${m.tone}`}>
            <span className="font-mono text-[0.66rem] uppercase tracking-[0.1em]">{m.label}</span>
            <span className="mt-1 block text-sm text-bone/75">{m.detail}</span>
          </li>
        ))}
      </ul>

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
        {dossier ? "Hide technical details" : "Technical details · Guard #2"}
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
      <p className="control-room-note mt-4 font-mono text-[0.6rem] uppercase tracking-[0.1em] text-bone/60">
        Select an evidence mark to see the recorded fragment
      </p>
    </figure>
  );
}
