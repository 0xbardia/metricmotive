export function DivergenceViz({ mode = "split" }: { mode?: "split" | "align" }) {
  const metricD =
    mode === "split" ? "M24 140 C 80 138, 140 70, 220 36" : "M24 140 C 90 136, 160 128, 280 120";
  const motiveD = "M24 140 C 90 142, 170 148, 280 152";
  return (
    <figure className="divergence-figure relative overflow-hidden rounded-[28px] bg-carbon px-4 py-8 text-bone sm:px-8">
      <figcaption className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-ochre">
            Divergence mark
          </p>
          <p className="mt-1 font-display text-2xl">Metric versus Motive</p>
        </div>
        <p className="hidden max-w-xs text-right text-sm text-bone/70 sm:block">
          {mode === "split"
            ? "The number climbs. The objective is left behind."
            : "The trajectories stay together."}
        </p>
      </figcaption>
      <svg
        viewBox="0 0 320 180"
        className="h-auto w-full"
        role="img"
        aria-label="Two trajectories sharing an origin. One is the metric, the other the motive."
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <line
            key={i}
            x1="24"
            x2="300"
            y1={28 + i * 18}
            y2={28 + i * 18}
            stroke="#F3F0E6"
            strokeOpacity="0.06"
          />
        ))}
        <path
          d={motiveD}
          fill="none"
          stroke="#74866A"
          strokeWidth="3"
          strokeLinecap="round"
          pathLength={1}
          className="path-draw"
        />
        <path
          d={metricD}
          fill="none"
          stroke="#D79A2B"
          strokeWidth="3"
          strokeLinecap="round"
          pathLength={1}
          className="path-draw"
          style={{ animationDelay: "120ms" }}
        />
        <circle cx="24" cy="140" r="9" fill="#D79A2B" className="origin-pulse" opacity="0.35" />
        <circle cx="24" cy="140" r="5" fill="#F3F0E6" />
        <text
          x="28"
          y="168"
          fill="#F3F0E6"
          fontSize="11"
          fontFamily="IBM Plex Mono, monospace"
          className="viz-label"
        >
          lock
        </text>
        <text
          x="222"
          y="28"
          fill="#D79A2B"
          fontSize="11"
          fontFamily="IBM Plex Mono, monospace"
          className="viz-label"
        >
          metric
        </text>
        <text
          x="232"
          y="172"
          fill="#74866A"
          fontSize="11"
          fontFamily="IBM Plex Mono, monospace"
          className="viz-label"
        >
          motive
        </text>
      </svg>
    </figure>
  );
}
