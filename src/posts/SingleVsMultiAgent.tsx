// Color Role Plan for this post (content_type: myth_vs_reality):
//   Primary system accent  · systemCyan       — single-agent (recommended architecture)
//                                                appears at: "SINGLE AGENT" row header,
//                                                TL "28/28" cell, TR "100%" cell,
//                                                "single-agent" metric card
//   Warm contrast accent   · insightAmber     — multi-agent + the math insight (warm
//                                                contrast = the architecture being
//                                                problematized AND the abstract reasoning)
//                                                appears at: "MULTI-AGENT" row header,
//                                                BR "+81%" cell (legit parallel use case),
//                                                "5 agents @ 95%" metric card
//   Differentiator/state   · frictionOrange   — the specific failure mode being argued
//                                                appears at: BL "−55%" cell (the
//                                                punchline, highlighted), "36% fail"
//                                                metric card
//   Distribution: ~70% neutral · ~10% cyan · ~7% amber · ~5% burnt → anti-monochrome ✓

import { PostFrame } from "@/components/layout/PostFrame";
import { Panel } from "@/components/primitives/Panel";
import { MetricCard } from "@/components/primitives/MetricCard";
import {
  ComparisonMatrix,
  type FocusKey,
} from "@/components/primitives/ComparisonMatrix";
import { matrixData } from "./singleVsMultiAgent.data";

type Props = {
  hookReveal?: number;
  headersReveal?: number;
  tlReveal?: number;
  trReveal?: number;
  blReveal?: number;
  brReveal?: number;
  focusOn?: FocusKey;
  focusLockOpacity?: number;
  metricsReveal?: number;
};

export function SingleVsMultiAgentPost({
  hookReveal = 1,
  headersReveal = 1,
  tlReveal = 1,
  trReveal = 1,
  blReveal = 1,
  brReveal = 1,
  focusOn = null,
  focusLockOpacity = 1,
  metricsReveal = 1,
}: Props) {
  return (
    <div style={{ opacity: hookReveal }}>
      <PostFrame
        eyebrow="agent orchestration / architecture mismatch"
        headline="One agent beats many on sequential work."
        visualization={
          <Panel label="performance by task type">
            <ComparisonMatrix
              rowHeaders={matrixData.rowHeaders}
              rowAccents={matrixData.rowAccents}
              colHeaders={matrixData.colHeaders}
              tl={matrixData.tl}
              tr={matrixData.tr}
              bl={matrixData.bl}
              br={matrixData.br}
              headersReveal={headersReveal}
              tlReveal={tlReveal}
              trReveal={trReveal}
              blReveal={blReveal}
              brReveal={brReveal}
              focusOn={focusOn}
              focusLockOpacity={focusLockOpacity}
              highlightCell="bl"
            />
          </Panel>
        }
        summary={
          <div
            className="grid grid-cols-3 gap-3"
            style={{ opacity: metricsReveal }}
          >
            <MetricCard
              label="single-agent"
              value="28/28"
              delta="McEntire study"
              accent="cyan"
            />
            <MetricCard
              label="multi-agent fails"
              value="36%"
              delta="same tasks"
              accent="burnt"
            />
            <MetricCard
              label="5 agents @ 95%"
              value="77%"
              delta="reliability compounds"
              accent="amber"
            />
          </div>
        }
      />
    </div>
  );
}
