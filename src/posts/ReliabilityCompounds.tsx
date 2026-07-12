import { PostFrame } from "@/components/layout/PostFrame";
import { Panel } from "@/components/primitives/Panel";
import { MetricCard } from "@/components/primitives/MetricCard";
import { LineChart } from "@/components/primitives/LineChart";
import {
  reliabilitySeries,
  reliabilityXLabels,
} from "./reliabilityCompounds.data";

type Props = {
  reveal?: number;
  metricsReveal?: number;
};

export function ReliabilityCompoundsPost({
  reveal = 1,
  metricsReveal = 1,
}: Props) {
  return (
    <PostFrame
      eyebrow="agent reliability / compounding"
      headline="It's not a model problem. It's arithmetic."
      signal="MIT NANDA · 5% of 300"
      visualization={
        <Panel label="end-to-end success vs. step count">
          <div className="flex flex-col gap-4">
            <LineChart
              series={reliabilitySeries}
              xLabels={reliabilityXLabels}
              reveal={reveal}
            />
            <div
              className="flex items-center justify-between font-mono uppercase tracking-[0.22em] text-text-tertiary"
              style={{ fontSize: 22 }}
            >
              <span>steps in workflow →</span>
              <span>n = 10</span>
            </div>
          </div>
        </Panel>
      }
      summary={
        <div
          className="grid grid-cols-3 gap-3 transition-opacity"
          style={{ opacity: metricsReveal }}
        >
          <MetricCard
            label="99% × 10 steps"
            value="90%"
            delta="manageable"
            accent="mint"
          />
          <MetricCard
            label="95% × 10 steps"
            value="60%"
            delta="below threshold"
            accent="cyan"
          />
          <MetricCard
            label="90% × 10 steps"
            value="35%"
            delta="collapse"
            accent="burnt"
          />
        </div>
      }
    />
  );
}
