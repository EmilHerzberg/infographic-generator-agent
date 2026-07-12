// Narrative: a 95%-reliable workflow compounds to 60% over 10 steps —
//            the math behind the demo-to-prod gap.
// Main motion event: a signal dot traveling left-to-right through 10 pipeline nodes
//                    while each step's cumulative reliability erodes.
// Eye path: headline → pipeline reveals L→R → signal travels L→R → endpoint emerges
//           (right of pipeline) → comparison strip drops in → MIT NANDA anchor lands.
// Focus lock: 8.5–10.5s — pipeline dims to 70% while comparison cards stand out.

import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { easings, beat } from "@/tokens/motion";
import { ReliabilityPipelinePost } from "@/posts/ReliabilityPipeline";
import "@/index.css";

export function ReliabilityPipelineComposition() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const hookReveal = interpolate(frame, [0, fps * 0.6], [0, 1], {
    easing: easings.easeOutCubic,
    extrapolateRight: "clamp",
  });

  const nodesReveal = interpolate(
    frame,
    [fps * beat.HOOK_END, fps * beat.ORIENTATION_END],
    [0, 1],
    {
      easing: easings.easeOutQuart,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const signalProgress = interpolate(
    frame,
    [fps * (beat.ORIENTATION_END + 0.2), fps * (beat.MECHANISM_END - 0.3)],
    [0, 1],
    {
      easing: easings.easeInOutCubic,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const endpointReveal = interpolate(
    frame,
    [fps * (beat.MECHANISM_END - 0.6), fps * (beat.MECHANISM_END + 0.2)],
    [0, 1],
    {
      easing: easings.easeOutExpo,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const metricsReveal = interpolate(
    frame,
    [fps * (beat.MECHANISM_END + 0.2), fps * (beat.MECHANISM_END + 1.4)],
    [0, 1],
    {
      easing: easings.easeOutCubic,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const pipelineDim = interpolate(
    frame,
    [fps * 8.5, fps * 9.0, fps * 10.0, fps * 10.5],
    [1, 0.7, 0.7, 1],
    {
      easing: easings.easeInOutSine,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const signalAnchorReveal = interpolate(
    frame,
    [fps * beat.INSIGHT_END, fps * (beat.INSIGHT_END + 0.7)],
    [0, 1],
    {
      easing: easings.easeOutExpo,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#0E1116" }}>
      <ReliabilityPipelinePost
        hookReveal={hookReveal}
        nodesReveal={nodesReveal}
        signalProgress={signalProgress}
        endpointReveal={endpointReveal}
        metricsReveal={metricsReveal}
        pipelineDim={pipelineDim}
        signalAnchorReveal={signalAnchorReveal}
      />
    </AbsoluteFill>
  );
}
