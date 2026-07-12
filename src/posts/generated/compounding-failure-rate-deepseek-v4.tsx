
/* ───────────────────────────────────────────────────────────────
   Content type:           4 — Bottleneck / Failure Point
   Primary visual format:  LineChart (genuine change-over-dimension:
     reliability decays multiplicatively with each additional step —
     the curve IS the insight.)
   Secondary supporting:   2 MetricCards + signal line
   Story pattern:          A — Problem → System → Result

   Color Role Plan:
     Primary (System Cyan):    99%/step curve — the engineered, achievable path
     Warm contrast (Friction Orange):  95%/step curve — the demo-to-production collapse
     Warm contrast (Friction Orange):  90%/step curve — worst-case descent
     Differentiator (Insight Amber):  key metric labels + signal dot
     Distribution: ~78% neutral · 10% cyan · 8% orange · 4% amber

   Layout safety map (1080×1350 portrait):
     Top    64–300  · eyebrow (26px mono) + headline (68px, 2 lines max)
     Middle 320–1030 · LineChart (920×540 viewBox, 3 series, 6 x-ticks)
     Bottom 1050–1280 · 2 MetricCards + signal "FEWER STEPS + VERIFY" + signature
     No P1/P2 bbox overlap. Cards sit in PostFrame summary slot (grid-managed).

   Anti-repetition note:
     Differs from earlier compounding-failure-rate posts by using only 2
     MetricCards (not 3), and the cards contrast demo-step-count vs
     real-step-count instead of agent-count or MIT stats.

   Beat map (12s):
     Beat 1 Hook        0.00–1.2s   headline + eyebrow reveal
     Beat 2 Orientation  1.2–3.0s   chart frame / axes fade in
     Beat 3 Mechanism    3.0–7.5s   three decay curves draw (main motion event)
     Beat 4 Insight      7.5–9.5s   two metric cards appear
     Beat 5 Memory       9.5–12.0s  signal + final hold (thumbnail-ready)

   One main motion event: the three decay curves drawing out over step count,
   showing how 99% stays viable while 95% and 90% collapse.
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
   Demo vs Real step-count reliability
   ────────────────────────────────────── */
const demoReliability = Math.pow(0.95, 3);  // ~86%
const realReliability = Math.pow(0.95, 14); // ~49%

/* ──────────────────────────────────────
   Main Post Component
   ────────────────────────────────────── */
export default function Post({ t = 1 }: { t?: number }) {
  /* ── Beat-level reveals ── */
  const chartFrameReveal = appear(t, 0.15, 0.12);   // Beat 2: axes + frame
  const curveDrawReveal = Math.max(0, Math.min(1, (t - 0.32) / 0.45)); // Beat 3: curves
  const signalReveal = appear(t, 0.82, 0.14);        // Beat 5: signal + hold

  /* ── Signature timing ── */
  const sigEntrance = appear(t, 0.08, 0.20);
  const sigPulse = appear(t, 0.88, 0.12);

  return (
    <PostFrame
      eyebrow="COMPOUNDING FAILURE RATE"
      headline="0.95^10 = 0.60"
      signal="FEWER STEPS + VERIFY"
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
            className="mb-1 font-mono uppercase tracking-[0.18em] text-text-tertiary"
            style={{ fontSize: 22, opacity: chartFrameReveal }}
          >
            END-TO-END SUCCESS · PER-STEP RELIABILITY × STEP COUNT
          </div>

          <LineChart
            height={540}
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
                endValueLabel: "90%",
              },
              {
                label: "95% / step",
                values: series95,
                color: colors.accent.burnt,
                endValueLabel: "60%",
              },
              {
                label: "90% / step",
                values: series90,
                color: colors.accent.burnt,
                endValueLabel: "35%",
              },
            ]}
          />
        </div>
      }
      summary={
        <div className="flex items-stretch gap-6">
          {/* Card 0: Demo illusion */}
          <div
            className="flex-1"
            style={revealStyle(t, 0.62, 0.12)}
          >
            <MetricCard
              label="DEMO · 3 STEPS"
              value={`~${Math.round(demoReliability * 100)}%`}
              delta="looks fine @95%/step"
              accent="amber"
            />
          </div>

          {/* Card 1: Real collapse */}
          <div
            className="flex-1"
            style={revealStyle(t, 0.68, 0.12)}
          >
            <MetricCard
              label="REAL · 14+ STEPS"
              value={`~${Math.round(realReliability * 100)}%`}
              delta="collapses @95%/step"
              accent="burnt"
            />
          </div>
        </div>
      }
    />
  );
}
