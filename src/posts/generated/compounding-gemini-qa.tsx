
import { PostFrame } from "@/components/layout/PostFrame";
import { LineChart, type LineSeries } from "@/components/primitives/LineChart";
import { TextBox } from "@/components/primitives/TextBox";
import { revealStyle } from "@/lib/reveal";
import { colors } from "@/tokens/design";

const STEPS = 10;

function generateSeries(base: number, steps: number): number[] {
  const values: number[] = [];
  for (let i = 0; i <= steps; i++) {
    values.push(Math.pow(base, i));
  }
  return values;
}

const seriesData: LineSeries[] = [
  {
    label: "99% per-step reliability",
    values: generateSeries(0.99, STEPS),
    color: colors.accent.cyan,
  },
  {
    label: "95% per-step reliability",
    values: generateSeries(0.95, STEPS),
    color: colors.accent.amber,
  },
  {
    label: "90% per-step reliability",
    values: generateSeries(0.9, STEPS),
    color: colors.accent.burnt,
  },
];

export default function CompoundingFailurePost({ t = 1 }: { t?: number }) {
  const chartRevealProgress = (t - 0.35) / 0.4;
  const chartReveal = Math.max(0, Math.min(1, chartRevealProgress));

  return (
    <PostFrame
      eyebrow="COMPOUNDING FAILURE"
      headline="Why Most AI Agents Fail in Production"
      visualization={
        // FINAL FIX ATTEMPT: Add aggressive padding to a container div
        <div
          className="relative w-full h-full pl-8"
          style={revealStyle(t, 0.15)}
        >
          <LineChart
            series={seriesData}
            xLabels={['0', '5', '10']}
            yMin={0}
            yMax={1}
            reveal={chartReveal}
            caption="Chart showing exponential decay of reliability for AI agents."
          />
          {/* Manually added labels, adjusting position for new padding */}
          <TextBox
            role="annotation"
            className="text-accent-cyan"
            style={{ position: "absolute", top: "12%", left: "28%" }} // Adjusted left
          >
            99% p/step
          </TextBox>
          <TextBox
            role="annotation"
            className="text-accent-amber"
            style={{ position: "absolute", top: "38%", left: "28%" }} // Adjusted left
          >
            95% p/step
          </TextBox>
          <TextBox
            role="annotation"
            className="text-accent-burnt"
            style={{ position: "absolute", top: "56%", left: "28%" }} // Adjusted left
          >
            90% p/step
          </TextBox>
        </div>
      }
      summary={
        <div className="flex flex-col items-center justify-center gap-4">
          <div
            className="font-display text-7xl font-semibold text-warm-white"
            style={revealStyle(t, 0.7)}
          >
            0.95<sup className="text-5xl">10</sup>
            <span className="text-muted-stone"> ≈ </span>
            0.60
          </div>
          <TextBox
            role="finalTakeaway"
            className="text-muted-stone"
            style={revealStyle(t, 0.8)}
          >
            Fewer, verified steps beat better models.
          </TextBox>
        </div>
      }
    />
  );
}
