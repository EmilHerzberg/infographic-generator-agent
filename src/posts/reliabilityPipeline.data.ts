import type { PipelineNodeSpec } from "@/components/primitives/Pipeline";

const STEPS = 10;
const PER_STEP = 0.95;

function cumulativeAt(i: number): number {
  return Math.pow(PER_STEP, i + 1);
}

export const reliabilityPipelineNodes: PipelineNodeSpec[] = Array.from(
  { length: STEPS },
  (_, i) => ({
    step: i + 1,
    cumulativeLabel: `${Math.round(cumulativeAt(i) * 100)}%`,
  }),
);
