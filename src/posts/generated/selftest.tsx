import { PostFrame } from "@/components/layout/PostFrame";
import { Panel } from "@/components/primitives/Panel";
import { MetricCard } from "@/components/primitives/MetricCard";

export default function Post() {
  return (
    <PostFrame
      eyebrow="systems / reliability"
      headline="Reliability compounds. Fragility compounds faster."
      visualization={
        <Panel label="why small per-step failure explodes">
          <div
            className="flex h-full items-center justify-center text-center text-text-secondary"
            style={{ fontSize: 30, lineHeight: 1.3 }}
          >
            99% per step → 90% over 10 steps → 61% over 50 steps.
          </div>
        </Panel>
      }
      summary={
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="per-step success" value="99%" delta="looks safe" accent="cyan" />
          <MetricCard label="over 50 steps" value="61%" delta="compounded" accent="burnt" />
        </div>
      }
    />
  );
}
