import type { Metric } from "@/content/schema";
import { text, colors } from "@/tokens/design";
import { appear } from "@/lib/reveal";
import { easingFor } from "@/tokens/motion";
import { planCountUp, deltaTrendRole } from "@/lib/countup";
import { FitLine } from "./FitLine";

const accentClass: Record<NonNullable<Metric["accent"]>, string> = {
  cyan: "text-accent-cyan",
  amber: "text-accent-amber",
  violet: "text-accent-violet",
  mint: "text-accent-mint",
  burnt: "text-accent-burnt",
};

// PL-1.1 count-up timing on the global `t` (handoff §2.5.3): card i counts from
// 0.62 + i·0.013 for 0.18 t-units, so even card 3 settles at 0.839 ≤ 0.85 (C11).
// Fixed module constants — deliberately NOT authoring knobs.
const COUNT_START = 0.62;
const COUNT_STAGGER = 0.013;
const COUNT_DUR = 0.18;
const OVERLAY_FADE = 0.04;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

type MetricCardProps = Metric & {
  /** Global post progress 0..1. Default 1 ⇒ settled/static — existing call sites unchanged. */
  t?: number;
  /** Card position in the row (0..3) — drives the count-up stagger. Clamped to 0..3. */
  index?: number;
  /** false ⇒ the value plain-fades in the same window (same path as a non-numeric value). */
  countUp?: boolean;
};

export function MetricCard({
  label,
  value,
  delta,
  accent = "cyan",
  deltaTrend,
  t = 1,
  index = 0,
  countUp = true,
}: MetricCardProps) {
  const i = Number.isFinite(index) ? Math.min(3, Math.max(0, Math.floor(index))) : 0;
  // PL-4.2 deltaTrend (color-only, pure-from-DATA): up → successMint, down → frictionOrange. `flat`
  // and absent resolve to null ⇒ no inline color ⇒ the delta keeps `text-text-secondary` (today's
  // neutral), byte-identical. Geometry/layout untouched — only the delta's paint color changes.
  const trendRole = deltaTrendRole(deltaTrend);
  const deltaColor = trendRole ? colors.semanticAccent[trendRole] : undefined;
  const start = COUNT_START + i * COUNT_STAGGER;
  const plan = countUp ? planCountUp(value) : null;
  // Eased count progress; pinned to exactly 0/1 outside the window so t=1 is always verbatim.
  const lin = clamp01((t - start) / COUNT_DUR);
  const p = lin <= 0 ? 0 : lin >= 1 ? 1 : easingFor("metricCountUp")(lin);
  return (
    <div
      className="rounded-card bg-bg-midnight-slate/80 px-5 py-5 shadow-card"
      data-metric-card={i}
      data-countup={plan?.animate ? "count" : "fade"}
    >
      <div
        className="font-mono uppercase tracking-[0.22em] text-text-tertiary"
        style={{ fontSize: text.metricLabel }}
      >
        {label}
      </div>
      <div className="mt-3" data-metric-value>
        <FitLine
          className={`font-display font-semibold leading-none ${accentClass[accent]}`}
          fontSize={text.metricValue}
        >
          {plan?.animate ? (
            // Reserved-width count-up (handoff §2.5.2): the in-flow GHOST is the final string at
            // every t — permanently invisible, it IS the layout, so FitLine's measured width (and
            // therefore its zoom) is a pure function of the final value. The absolute OVERLAY
            // renders the counting text inside that reserved box and inherits the same zoom.
            // Nothing mounts/unmounts across t — opacity/textContent only.
            <span style={{ position: "relative", display: "inline-block", fontVariantNumeric: "tabular-nums" }}>
              <span aria-hidden style={{ opacity: 0 }}>{value}</span>
              <span
                data-metric-value-text
                style={{
                  position: "absolute",
                  inset: 0,
                  textAlign: "left",
                  whiteSpace: "nowrap",
                  fontVariantNumeric: "tabular-nums",
                  opacity: appear(t, start, OVERLAY_FADE),
                }}
              >
                {plan.display(p)}
              </span>
            </span>
          ) : (
            // Fallback (parse fail / countUp:false): the static final string in normal flow —
            // trivially width-stable — fading in over the same window so mixed rows land together.
            <span data-metric-value-text style={{ opacity: appear(t, start, COUNT_DUR) }}>
              {value}
            </span>
          )}
        </FitLine>
      </div>
      {delta && (
        <div
          data-metric-delta
          data-delta-trend={deltaTrend ?? undefined}
          className="mt-2 font-mono text-text-secondary"
          style={{ fontSize: text.metricDelta, ...(deltaColor ? { color: deltaColor } : {}) }}
        >
          {delta}
        </div>
      )}
    </div>
  );
}
