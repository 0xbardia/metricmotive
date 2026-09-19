import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Reveal } from "@/components/motion";

export function MotiveLockSection() {
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setLocked(true), 900);
    return () => window.clearTimeout(timer);
  }, []);

  function replayLock() {
    setLocked(false);
    window.setTimeout(() => setLocked(true), 720);
  }

  return (
    <section id="how-it-works" className="bg-carbon text-bone">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
        <Reveal>
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-ochre">
            02 — Lock
          </p>
          <h2 className="mt-3 font-display text-4xl tracking-tight">
            Once locked, the target cannot be rewritten after seeing the result.
          </h2>
          <p className="mt-5 max-w-lg text-bone/75">
            Draft is editable. Armed is not. A new specification is a new Guard version — not a
            quiet edit of history.
          </p>
        </Reveal>
        <Reveal delay={100}>
          <div className="lock-demo" data-locked={locked}>
            <header className="lock-demo-header">
              <div>
                <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-bone/62">
                  Guard #2 / specification
                </p>
                <p className="mt-1 text-sm text-bone/65">
                  The definition moves once. Then it holds.
                </p>
              </div>
              <button
                type="button"
                className="lock-replay min-h-11 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-[var(--color-warning-on-dark)] underline-offset-4 hover:underline"
                onClick={replayLock}
              >
                Replay lock
              </button>
            </header>

            <div className="lock-spec-grid mt-7">
              <div className="lock-spec-pane lock-spec-draft">
                <p className="lock-pane-label font-mono text-[0.62rem] uppercase tracking-[0.14em]">
                  Draft / editable
                </p>
                <p className="mt-3 font-display text-xl text-bone/68">
                  Book 80 meetings this week.
                </p>
                <p className="mt-3 text-sm text-bone/52">
                  A target without its motive is a loose instruction.
                </p>
              </div>
              <div className="lock-transition" aria-hidden="true">
                <span className="lock-transition-line" />
                <span className="lock-transition-arrow">→</span>
              </div>
              <div className="lock-spec-pane lock-spec-armed">
                <p className="lock-pane-label font-mono text-[0.62rem] uppercase tracking-[0.14em]">
                  Armed / immutable
                </p>
                <p className="mt-3 font-display text-xl text-ochre">Motive + metric + rails</p>
                <p className="mt-3 text-sm text-bone/68">
                  Edits become a new Guard version, never a rewrite.
                </p>
              </div>
            </div>

            <div className="lock-lifecycle mt-7" aria-label="Guard lifecycle">
              {[
                ["DRAFT", 0],
                ["ARMED", 1],
                ["EVIDENCE_SUBMITTED", 2],
                ["RESOLVED", 3],
              ].map(([state, index]) => (
                <span
                  key={state}
                  className="lock-lifecycle-item"
                  data-state={
                    state === "ARMED" && locked
                      ? "active"
                      : state === "DRAFT" && !locked
                        ? "active"
                        : ""
                  }
                  style={{ "--state-index": index } as CSSProperties}
                >
                  {state}
                </span>
              ))}
            </div>
            <p
              className="lock-fingerprint mt-5 font-mono text-[0.68rem] uppercase tracking-[0.1em] text-ochre"
              aria-live="polite"
            >
              {locked ? "ARMED · immutable fingerprint issued" : "DRAFT · preparing the lock"}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
