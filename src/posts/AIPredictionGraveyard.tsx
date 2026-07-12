// Color Role Plan for this post (content_type: myth_vs_reality):
//   Primary system accent  · systemCyan       — source attribution (dates, IEEE anchor)
//                                                appears at: entry date labels,
//                                                "IEEE 2025" metric card
//   Warm contrast accent   · insightAmber     — the bold claims being highlighted
//                                                (warm contrast = the predictions
//                                                themselves, the centerpiece)
//                                                appears at: italic claim text on
//                                                each entry, left amber stripe on
//                                                each card, "from experts" metric
//   Differentiator/state   · frictionOrange   — the failure marker
//                                                appears at: × symbol on each entry,
//                                                "predictions held: 0/4" metric card
//   Distribution: ~70% neutral · ~10% amber · ~7% cyan · ~5% burnt → anti-monochrome ✓

import { PostFrame } from "@/components/layout/PostFrame";
import { Panel } from "@/components/primitives/Panel";
import { MetricCard } from "@/components/primitives/MetricCard";
import { ClaimList } from "@/components/primitives/ClaimList";
import { predictionEntries } from "./aiPredictionGraveyard.data";

type Props = {
  hookReveal?: number;
  entriesReveal?: number;
  contentDim?: number;
  metricsReveal?: number;
};

export function AIPredictionGraveyardPost({
  hookReveal = 1,
  entriesReveal = 1,
  contentDim = 1,
  metricsReveal = 1,
}: Props) {
  return (
    <div style={{ opacity: hookReveal }}>
      <PostFrame
        eyebrow="ai forecasting / track record"
        headline="A graveyard of confident AI predictions."
        visualization={
          <Panel label="confident claims · failed verification">
            <ClaimList
              entries={predictionEntries}
              entriesReveal={entriesReveal}
              dim={contentDim}
            />
          </Panel>
        }
        summary={
          <div
            className="grid grid-cols-3 gap-3"
            style={{ opacity: metricsReveal }}
          >
            <MetricCard
              label="predictions held"
              value="0 / 4"
              delta="track record"
              accent="burnt"
            />
            <MetricCard
              label="domain experts"
              value="100%"
              delta="lab founders"
              accent="amber"
            />
            <MetricCard
              label="ieee 2025"
              value="trough"
              delta="of disillusionment"
              accent="cyan"
            />
          </div>
        }
      />
    </div>
  );
}
