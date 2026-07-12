// Color Role Plan for this post (content_type: myth_vs_reality):
//   Primary system accent  · systemCyan       — independent researchers (unbiased signal)
//                                                appears at: bottom lane bars, "INDEPENDENT" label,
//                                                "INDEPENDENT MEDIAN" metric card
//   Warm contrast accent   · insightAmber     — incentivized executives (the bias being highlighted)
//                                                appears at: top lane bars, "INCENTIVIZED" label,
//                                                eyebrow, "INCENTIVIZED MEDIAN" metric card
//   Differentiator accent  · strategicViolet  — aggregated prediction markets (strategic abstraction)
//                                                appears at: vertical 2030 dashed line, "MARKET
//                                                CONSENSUS" label, "MARKET CENTER" metric card
//   Distribution: ~70% neutral · ~10% cyan · ~10% amber · ~5% violet  →  anti-monochrome ✓
//   Note: cyan + amber intentionally equal-weight because the post IS a side-by-side comparison.
//   Violet differentiator provides asymmetric depth (the markets layer).

import { PostFrame } from "@/components/layout/PostFrame";
import { Panel } from "@/components/primitives/Panel";
import { MetricCard } from "@/components/primitives/MetricCard";
import { RangeBars } from "@/components/primitives/RangeBars";
import {
  incentivizedEntries,
  independentEntries,
  yearRange,
  marketConsensus,
} from "./incentivesVsTimelines.data";

type Props = {
  hookReveal?: number;
  axisReveal?: number;
  topLaneReveal?: number;
  bottomLaneReveal?: number;
  marketLineReveal?: number;
  metricsReveal?: number;
  contentDim?: number;
};

export function IncentivesVsTimelinesPost({
  hookReveal = 1,
  axisReveal = 1,
  topLaneReveal = 1,
  bottomLaneReveal = 1,
  marketLineReveal = 1,
  metricsReveal = 1,
  contentDim = 1,
}: Props) {
  return (
    <div style={{ opacity: hookReveal }}>
      <PostFrame
        eyebrow="agi timelines / incentive bias"
        headline="AGI timelines track valuations, not expertise."
        visualization={
          <Panel label="agi prediction range by group">
            <div style={{ opacity: contentDim }}>
              <RangeBars
                topGroupLabel="incentivized"
                bottomGroupLabel="independent"
                topEntries={incentivizedEntries}
                bottomEntries={independentEntries}
                topAccent="amber"
                bottomAccent="cyan"
                minYear={yearRange.min}
                maxYear={yearRange.max}
                marketLine={marketConsensus}
                axisReveal={axisReveal}
                topLaneReveal={topLaneReveal}
                bottomLaneReveal={bottomLaneReveal}
                marketLineReveal={marketLineReveal}
              />
            </div>
          </Panel>
        }
        summary={
          <div
            className="grid grid-cols-3 gap-3"
            style={{ opacity: metricsReveal }}
          >
            <MetricCard
              label="incentivized median"
              value="2026"
              delta="near-term"
              accent="amber"
            />
            <MetricCard
              label="market center"
              value="2030"
              delta="CI 2027–2043"
              accent="violet"
            />
            <MetricCard
              label="independent median"
              value="2035+"
              delta="decade later"
              accent="cyan"
            />
          </div>
        }
      />
    </div>
  );
}
