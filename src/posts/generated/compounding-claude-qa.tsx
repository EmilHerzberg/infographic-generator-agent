import { appear, revealStyle } from "@/lib/reveal";
import { PostFrame } from "@/components/layout/PostFrame";
import { MetricCard } from "@/components/primitives/MetricCard";
import { colors, stroke, text } from "@/tokens/design";

/**
 * Content type: #17 Market/Trend Insight (change-over-sequential-steps).
 * Chart justified: the insight IS the curve shape — reliability decays
 * multiplicatively as steps accumulate. 3 series, each DIRECTLY labelled
 * with its per-step reliability beside the line (no separate legend).
 *
 * Color Role Plan:
 *   Primary  System Cyan   #59D8E6 — 99%/step, the survivable path
 *   Warm     Insight Amber #E7A95A — 95%/step, the headline 0.95^10=0.60 line
 *   Friction Burnt Orange  #D9864D — 90%/step, collapse to ~35%
 *   Distribution ~78% neutral · cyan ~9% · amber ~7% · burnt ~5%.
 *
 * Inline chart internal bbox audit (viewBox 980 x 560):
 *   y-axis ticks at x=80 (textAnchor=end) clear the safe margin.
 *   per-line block at x=cx+22: value baseline cy-4 (44px) then rate baseline
 *   cy+40 (22px) — vertical gap value-baseline→rate-cap-top ≈ 28px (>24 floor).
 */

const steps = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const curve = (p: number) => steps.map((s) => Math.pow(p, s));

const SERIES = [
  { rate: "99%/step", p: 0.99, color: colors.accent.cyan, end: "90%" },
  { rate: "95%/step", p: 0.95, color: colors.accent.amber, end: "60%" },
  { rate: "90%/step", p: 0.9, color: colors.accent.burnt, end: "35%" },
];

function ReliabilityChart({ reveal }: { reveal: number }) {
  const W = 980;
  const H = 560;
  const pad = { top: 40, right: 258, bottom: 52, left: 96 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const stepCount = steps.length - 1;
  const xAt = (i: number) => pad.left + (i / stepCount) * innerW;
  const yAt = (v: number) => pad.top + innerH - v * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1.0];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="end-to-end reliability vs sequential steps for three per-step reliabilities">
      {ticks.map((tk) => (
        <g key={tk}>
          <line x1={pad.left} x2={W - pad.right} y1={yAt(tk)} y2={yAt(tk)} stroke="rgba(184,178,167,0.10)" strokeWidth={stroke.grid} />
          <text x={pad.left - 16} y={yAt(tk) + 8} textAnchor="end" fill={colors.text.secondary} fontFamily="'JetBrains Mono', monospace" fontSize={text.axisLabel} letterSpacing="0.12em">
            {`${Math.round(tk * 100)}%`}
          </text>
        </g>
      ))}

      {["0", "5", "10"].map((lab, k) => {
        const i = [0, 5, 10][k];
        return (
          <text key={lab} x={xAt(i)} y={H - 16} textAnchor="middle" fill={colors.text.secondary} fontFamily="'JetBrains Mono', monospace" fontSize={text.axisLabel} letterSpacing="0.12em">
            {lab}
          </text>
        );
      })}

      {SERIES.map((s) => {
        const vals = curve(s.p);
        const d = vals.map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(v)}`).join(" ");
        const cx = xAt(10);
        const cy = yAt(vals[10]);
        return (
          <g key={s.rate}>
            <path d={d} fill="none" stroke={s.color} strokeWidth={stroke.chartLine} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - reveal} style={{ filter: `drop-shadow(0 0 10px ${s.color}55)` }} />
            <circle cx={cx} cy={cy} r={7} fill={s.color} opacity={reveal >= 1 ? 1 : 0} style={{ filter: `drop-shadow(0 0 10px ${s.color})` }} />
            {/* direct per-line block: endpoint value (big) above its identity (rate) */}
            <text x={cx + 22} y={cy - 4} fontFamily="'Space Grotesk', sans-serif" fontWeight={600} fontSize={text.chartEndValue} fill={s.color} letterSpacing="-0.01em" opacity={reveal >= 0.95 ? 1 : 0}>
              {s.end}
            </text>
            <text x={cx + 22} y={cy + 40} fontFamily="'JetBrains Mono', monospace" fontSize={22} fill={s.color} letterSpacing="0.04em" opacity={reveal >= 0.9 ? 1 : 0}>
              {s.rate}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Post({ t = 1 }: { t?: number }) {
  const chartReveal = appear(t, 0.35, 0.4);
  const sigEntrance = appear(t, 0.12, 0.16);
  const sigPulse = appear(t, 0.86, 0.14);

  const visualization = (
    <div className="flex flex-col justify-center" style={revealStyle(t, 0.3)}>
      <ReliabilityChart reveal={chartReveal} />
      <div
        className="mt-1 font-mono uppercase tracking-[0.20em] text-text-tertiary"
        style={{ fontSize: 22, opacity: appear(t, 0.5, 0.2) }}
      >
        end-to-end reliability vs. sequential steps
        <span className="ml-2 text-text-tertiary/70">· illustrative model</span>
      </div>
    </div>
  );

  const summary = (
    <div className="flex h-full items-center gap-6">
      <div className="flex-1" style={revealStyle(t, 0.6)}>
        <MetricCard
          label={"0.95\u00B9\u2070 over 10 steps"}
          value={"\u2192 0.60"}
          accent="amber"
        />
      </div>
      <div className="flex-1" style={revealStyle(t, 0.7)}>
        <MetricCard
          label="GenAI pilots, no measurable P&L"
          value="~95%"
          accent="burnt"
        />
      </div>
    </div>
  );

  return (
    <div className="h-full w-full" style={{ position: "relative" }}>
      <PostFrame
        eyebrow="WHY AGENTS FAIL IN PROD"
        headline="Failures compound. It's arithmetic."
        visualization={visualization}
        summary={summary}
        signal="FEWER STEPS + VERIFY"
        signalReveal={appear(t, 0.82, 0.16)}
        signatureEntranceProgress={sigEntrance}
        signaturePulseProgress={sigPulse}
      />
    </div>
  );
}
