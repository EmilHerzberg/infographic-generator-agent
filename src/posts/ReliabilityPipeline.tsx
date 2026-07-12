// Color Role Plan for this post (content_type: bottleneck_failure_point / signal_vs_noise mix):
//   Primary system accent  · systemCyan       — the pipeline as designed (system signal)
//                                                appears at: node borders, connector trail,
//                                                signal dot, panel status dot
//   Warm contrast accent   · insightAmber     — the headline insight: "60% is the conclusion"
//                                                appears at: pipeline endpoint "60%",
//                                                middle metric card (95% × 10 = 60%),
//                                                MIT NANDA signal callout, eyebrow
//   Differentiator states  · successMint      — best-case "manageable" (90%)
//                          · frictionOrange   — worst-case "collapse" (35%)
//   Distribution: ~70% neutral · ~10% cyan · ~8% amber · ~4% mint + ~3% burnt → anti-monochrome ✓

import { PostFrame } from "@/components/layout/PostFrame";
import { Panel } from "@/components/primitives/Panel";
import { MetricCard } from "@/components/primitives/MetricCard";
import { Pipeline } from "@/components/primitives/Pipeline";
import { reliabilityPipelineNodes } from "./reliabilityPipeline.data";

type Props = {
  hookReveal?: number;
  nodesReveal?: number;
  signalProgress?: number;
  endpointReveal?: number;
  metricsReveal?: number;
  pipelineDim?: number;
  signalAnchorReveal?: number;
};

export function ReliabilityPipelinePost({
  hookReveal = 1,
  nodesReveal = 1,
  signalProgress = 1,
  endpointReveal = 1,
  metricsReveal = 1,
  pipelineDim = 1,
  signalAnchorReveal = 1,
}: Props) {
  return (
    <div style={{ opacity: hookReveal }}>
      <PostFrame
        eyebrow="agent reliability / compounding"
        headline="It's not a model problem. It's arithmetic."
        signal="MIT NANDA · 5% of 300"
        signalReveal={signalAnchorReveal}
        visualization={
          <Panel label="end-to-end success vs. 10-step workflow">
            <div style={{ opacity: pipelineDim }}>
              <Pipeline
                nodes={reliabilityPipelineNodes}
                perStepLabel="0.95 PER STEP × 10 STEPS"
                endLabel="60%"
                endAccent="amber"
                nodesReveal={nodesReveal}
                signalProgress={signalProgress}
                endpointReveal={endpointReveal}
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
              label="99% × 10 steps"
              value="90%"
              delta="manageable"
              accent="mint"
            />
            <MetricCard
              label="95% × 10 steps"
              value="60%"
              delta="below threshold"
              accent="amber"
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
    </div>
  );
}
