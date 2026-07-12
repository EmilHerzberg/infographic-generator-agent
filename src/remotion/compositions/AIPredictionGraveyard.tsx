// Narrative: 4 confident AI predictions from top experts, each contradicted by
//            reality — the cumulative list IS the argument for using track record
//            as evidence against urgency rhetoric.
// Main motion event: the 4-entry cascade — entries reveal one by one, each adding
//            weight to the case. The list itself is the visual proof.
// Eye path: headline → panel + label → entry 1 → entry 2 → entry 3 → entry 4
//           (each with date·source then claim then × reality) → metric strip lands
//           the meta-pattern.
// Focus lock: 9.0–10.5s — entries dim to 0.7, metric strip dominates as the lesson.

import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { easings, beat } from "@/tokens/motion";
import { AIPredictionGraveyardPost } from "@/posts/AIPredictionGraveyard";
import "@/index.css";

export function AIPredictionGraveyardComposition() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const hookReveal = interpolate(frame, [0, fps * 0.6], [0, 1], {
    easing: easings.easeOutCubic,
    extrapolateRight: "clamp",
  });

  const entriesReveal = interpolate(
    frame,
    [fps * beat.ORIENTATION_END, fps * 7.5],
    [0, 1],
    {
      easing: easings.easeOutCubic,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const contentDim = interpolate(
    frame,
    [fps * 9.0, fps * 9.5, fps * 10.5, fps * 11.0],
    [1, 0.7, 0.7, 1],
    {
      easing: easings.easeInOutSine,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const metricsReveal = interpolate(
    frame,
    [fps * 8.0, fps * 9.5],
    [0, 1],
    {
      easing: easings.easeOutCubic,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#0E1116" }}>
      <AIPredictionGraveyardPost
        hookReveal={hookReveal}
        entriesReveal={entriesReveal}
        contentDim={contentDim}
        metricsReveal={metricsReveal}
      />
    </AbsoluteFill>
  );
}
