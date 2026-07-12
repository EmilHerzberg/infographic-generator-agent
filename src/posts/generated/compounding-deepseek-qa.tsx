/* ───────────────────────────────────────────────────────────────
   Content type:           4 — Bottleneck / Failure Point
   Primary visual format:  LineChart (genuine change-over-dimension:
     reliability decays multiplicatively with each additional step —
     the curve IS the insight.)
   Secondary supporting:   2 MetricCards + per-step legend + signal
   Story pattern:          A — Problem → System → Result

   Color Role Plan:
     Primary (System Cyan):     99%/step curve — engineered, achievable path
     Warm contrast (Insight Amber):  95%/step curve — the demo-to-production collapse
     Warm contrast alt (Friction Orange):  90%/step curve — worst-case descent
     Differentiator (Success Mint):  signal "SHORTEN THE CHAIN"

   Layout safety map (1080×1350 portrait):
     Top    64–300  · eyebrow (26px mono) + headline (68px, 2 lines max)
     Middle 320–1030 · caption + per-step legend + LineChart (920×500 viewBox, 3 series)
     Bottom 1050–1280 · 2 MetricCards + signal + signature
     No P1/P2 bbox overlap.

   Anti-repetition note:
     Unique per-step legend row directly maps each curve to its per-step
     reliability (v4 only showed endpoint values on the chart). Endpoint
     labels are bare numbers (y-axis gives % context) to fit viewBox.

   Beat map (12s):
     Beat 1 Hook        0.00–1.2s   eyebrow + headline reveal
     Beat 2 Orientation  1.2–3.0s   chart frame / axes + legend fade in
     Beat 3 Mechanism    3.0–7.5s   three decay curves draw (main motion event)
     Beat 4 Insight      7.5–9.5s   two metric cards appear (staggered)
     Beat 5 Memory       9.5–12.0s  signal + final hold (thumbnail-ready)

   One main motion event: the three decay curves drawing out over step count,
   showing 99% stays viable while 95% and 90% collapse.
   ─────────────────────────────────────────────────────────────── */

import { PostFrame } from "@/components/layout/PostFrame";
import { LineChart } from "@/components/primitives/LineChart";
import { MetricCard } from "@/components/primitives/MetricCard";
import { appear, revealStyle } from "@/lib/reveal";
import { colors } from "@/tokens/design";

/* ──────────────────────────────────────
   Decay data: 0..10 steps at 99% / 95% / 90%
   ────────────────────────────────────── */
const STEPS = [0, 2, 4, 6, 8, 10];

const series99 = STEPS.map((n) => Math.pow(0.99, n));
const series95 = STEPS.map((n) => Math.pow(0.95, n));
const series90 = STEPS.map((n) => Math.pow(0.90, n));

/* ──────────────────────────────────────
   Per-step legend swatch — directly labels
   each curve with its per-step reliability
   ────────────────────────────────────── */
function LegendSwatch({
  color,
  perStep,
  endpoint,
  reveal,
}: {
  color: string;
  perStep: string;
  endpoint: string;
  reveal: number;
}) {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        opacity: reveal,
        transform: `translateY(${(1 - reveal) * 8}px)`,
      }}
    >
      {/* Swatch line */}
      <div
        className="h-[5px] w-6 shrink-0 rounded-full"
        style={{
          backgroundColor: color,
          filter: `drop-shadow(0 0 6px ${color}66)`,
        }}
      />
      {/* Per-step → endpoint */}
      <span
        className="font-mono uppercase tracking-[0.14em]"
        style={{ fontSize: 20 }}
      >
        <span style={{ color }}>{perStep}/STEP</span>
        <span className="text-text-tertiary"> → </span>
        <span
          className="font-display font-semibold"
          style={{ fontSize: 22, color, letterSpacing: "-0.01em" }}
        >
          ~{endpoint}
        </span>
      </span>
    </div>
  );
}

/* ──────────────────────────────────────
   Main Post Component
   ────────────────────────────────────── */
export default function Post({ t = 1 }: { t?: number }) {
  /* ── Beat-level reveals ── */
  const chartFrameReveal = appear(t, 0.15, 0.12);   // Beat 2: axes + frame
  const legendReveal = appear(t, 0.18, 0.14);        // Legend appears with chart frame
  const curveDrawReveal = Math.max(0, Math.min(1, (t - 0.32) / 0.45)); // Beat 3: curves
  const signalReveal = appear(t, 0.82, 0.14);        // Beat 5: signal + hold

  /* ── Signature timing ── */
  const sigEntrance = appear(t, 0.08, 0.20);
  const sigPulse = appear(t, 0.88, 0.12);

  return (
    <PostFrame
      eyebrow="FAILURE COMPOUNDING"
      headline="0.95¹⁰ = 0.60"
      signal="SHORTEN THE CHAIN"
      signalReveal={signalReveal}
      signatureVariant="compact"
      signaturePlacement="bottomRight"
      signatureEntranceProgress={sigEntrance}
      signaturePulseProgress={sigPulse}
      visualization={
        <div
          className="flex flex-col justify-center"
          style={{ opacity: chartFrameReveal }}
        >
          {/* Chart caption */}
          <div
            className="mb-3 font-mono uppercase tracking-[0.18em] text-text-tertiary"
            style={{ fontSize: 22, opacity: chartFrameReveal }}
          >
            END-TO-END SUCCESS RATE BY PER-STEP RELIABILITY
          </div>

          {/* Per-step legend — directly labels each curve with its variable */}
          <div
            className="mb-4 flex items-center gap-8"
            style={{ opacity: legendReveal }}
          >
            <LegendSwatch
              color={colors.accent.cyan}
              perStep="99%"
              endpoint="90%"
              reveal={legendReveal}
            />
            <LegendSwatch
              color={colors.accent.amber}
              perStep="95%"
              endpoint="60%"
              reveal={legendReveal}
            />
            <LegendSwatch
              color={colors.accent.burnt}
              perStep="90%"
              endpoint="35%"
              reveal={legendReveal}
            />
          </div>

          <LineChart
            height={500}
            reveal={curveDrawReveal}
            yMin={0}
            yMax={1}
            yTicks={[0, 0.25, 0.5, 0.75, 1.0]}
            yFormat={(v) => `${Math.round(v * 100)}`}
            xLabels={["0", "2", "4", "6", "8", "10 steps"]}
            series={[
              {
                label: "99% / step",
                values: series99,
                color: colors.accent.cyan,
                endValueLabel: "90",
              },
              {
                label: "95% / step",
                values: series95,
                color: colors.accent.amber,
                endValueLabel: "60",
              },
              {
                label: "90% / step",
                values: series90,
                color: colors.accent.burnt,
                endValueLabel: "35",
              },
            ]}
          />
        </div>
      }
      summary={
        <div className="flex items-stretch gap-6">
          {/* Card 0: The hook number — success rate at 10 steps */}
          <div className="flex-1" style={revealStyle(t, 0.62, 0.12)}>
            <MetricCard
              label="10 STEPS @ 95%"
              value="~60%"
              accent="amber"
            />
          </div>

          {/* Card 1: The achievable target */}
          <div className="flex-1" style={revealStyle(t, 0.68, 0.12)}>
            <MetricCard
              label="10 STEPS @ 99%"
              value="~90%"
              accent="cyan"
            />
          </div>
        </div>
      }
    />
  );
}
