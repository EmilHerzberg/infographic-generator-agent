import { PostFrame } from "@/components/layout/PostFrame";
import { LineChart } from "@/components/primitives/LineChart";
import { MetricCard } from "@/components/primitives/MetricCard";
import { appear, revealStyle } from "@/lib/reveal";
import { colors } from "@/tokens/design";

/**
 * Content type: #17 Market/Trend Insight + #9 Business Case.
 * Format: decay line chart (genuine change-over-a-dimension: end-to-end
 *   success vs. step count). Chart justified — the insight IS the shape of
 *   multiplicative decay; a workflow/matrix would lose the curve's punch.
 *
 * Color Role Plan:
 *   Primary  System Cyan   = 99%/step curve (engineered, achievable path)
 *   Warm     Friction Orange = 95%/step curve (the collapse — risk content)
 *   Differentiator Amber   = key takeaway emphasis (the MIT pilot share)
 *   Distribution ~75% neutral · cyan ~10% · orange ~7% · amber ~5%.
 *
 * Layout safety map (1080×1350):
 *   Top 64–300  · eyebrow + headline (2 lines)
 *   Middle 320–1030 · LineChart, 2 series, direct end-labels, 6 x-ticks
 *   Bottom 1050–1280 · 3 MetricCards (label + value, no delta so they sit
 *     inside the footer zone) + signal + signature
 *   No P1/P2 bbox overlap; signature in reserved footer row.
 *   y-axis uses bare numbers so the leftmost tick stays inside the margin.
 *
 * One main motion event: the two decay curves draw out over step count.
 */

// 0.95^n and 0.99^n over 0..10 steps.
const stepReliability95 = [0, 2, 4, 6, 8, 10].map((n) => Math.pow(0.95, n));
const stepReliability99 = [0, 2, 4, 6, 8, 10].map((n) => Math.pow(0.99, n));

export default function Post({ t = 1 }: { t?: number }) {
  // Beat 1 Hook: headline ~0.00 (PostFrame renders it)
  // Beat 2 Orientation: chart axes/frame fade ~0.15
  // Beat 3 Mechanism: curves draw ~0.35 (main motion event)
  // Beat 4 Insight: metric strip ~0.60
  // Beat 5 Memory anchor: signal/takeaway ~0.80
  const chartFrame = appear(t, 0.15, 0.12);
  const curveDraw = appear(t, 0.35, 0.4); // slow draw = the mechanism
  const metricsBase = 0.6;
  const signalReveal = appear(t, 0.8, 0.14);

  const sigEntrance = appear(t, 0.12, 0.2);
  const sigPulse = appear(t, 0.86, 0.14);

  const metrics = [
    { label: "0.95¹⁰ · 10 steps", value: "0.60", accent: "burnt" as const },
    { label: "5 agents @ 95%", value: "0.77", accent: "burnt" as const },
    { label: "MIT NANDA pilots", value: "~95%", accent: "amber" as const },
  ];

  return (
    <PostFrame
      eyebrow="AGENT RELIABILITY · COMPOUNDING FAILURE"
      headline="Reliability isn't a model problem — it's arithmetic"
      signal="FEWER STEPS + VERIFY"
      signalReveal={signalReveal}
      signatureVariant="compact"
      signaturePlacement="bottomRight"
      signatureEntranceProgress={sigEntrance}
      signaturePulseProgress={sigPulse}
      visualization={
        <div className="flex flex-col justify-center" style={{ opacity: chartFrame }}>
          <div
            className="mb-2 font-mono uppercase tracking-[0.18em] text-text-tertiary"
            style={{ fontSize: 22, opacity: chartFrame }}
          >
            END-TO-END SUCCESS %  ·  PER-STEP RELIABILITY × STEP COUNT
          </div>
          <LineChart
            height={540}
            reveal={curveDraw}
            yMin={0}
            yMax={1}
            yTicks={[0, 0.25, 0.5, 0.75, 1.0]}
            yFormat={(v) => `${Math.round(v * 100)}`}
            xLabels={["0", "2", "4", "6", "8", "10 steps"]}
            series={[
              {
                label: "99% / step",
                values: stepReliability99,
                color: colors.accent.cyan,
                endValueLabel: "90%",
              },
              {
                label: "95% / step",
                values: stepReliability95,
                color: colors.accent.burnt,
                endValueLabel: "60%",
              },
            ]}
          />
        </div>
      }
      summary={
        <div className="grid grid-cols-3 gap-6">
          {metrics.map((m, i) => (
            <div key={m.label} style={revealStyle(t, metricsBase + i * 0.06, 0.14)}>
              <MetricCard {...m} />
            </div>
          ))}
        </div>
      }
    />
  );
}
