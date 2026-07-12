// Narrative: incentivized AGI executives predict near-term timelines while independent
//            researchers predict far-term timelines — the gradient between the two groups,
//            plotted on a shared time axis, is the bias.
// Main motion event: the second lane of bars (independent) revealing visibly further right
//                    than the first lane (incentivized) — the gradient IS the proof.
// Eye path: headline (top) → date axis draws L→R → top lane reveals (amber, clusters left)
//           → bottom lane reveals (cyan, spreads right) → violet 2030 line drops in
//           → metric strip → signal callout.
// Focus lock: 9.0–10.5s — bars dim to 70% while the violet market-consensus line + metric
//             strip take dominance (the abstracted view becomes the lesson).

import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { easings, beat } from "@/tokens/motion";
import { IncentivesVsTimelinesPost } from "@/posts/IncentivesVsTimelines";
import "@/index.css";

export function IncentivesVsTimelinesComposition() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const hookReveal = interpolate(frame, [0, fps * 0.6], [0, 1], {
    easing: easings.easeOutCubic,
    extrapolateRight: "clamp",
  });

  const axisReveal = interpolate(
    frame,
    [fps * beat.HOOK_END, fps * (beat.ORIENTATION_END - 0.1)],
    [0, 1],
    {
      easing: easings.easeOutQuart,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const topLaneReveal = interpolate(
    frame,
    [fps * beat.ORIENTATION_END, fps * 5.5],
    [0, 1],
    {
      easing: easings.easeOutQuart,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const bottomLaneReveal = interpolate(
    frame,
    [fps * 5.5, fps * beat.MECHANISM_END],
    [0, 1],
    {
      easing: easings.easeOutQuart,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const marketLineReveal = interpolate(
    frame,
    [fps * (beat.MECHANISM_END - 0.4), fps * (beat.MECHANISM_END + 0.4)],
    [0, 1],
    {
      easing: easings.easeOutExpo,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const metricsReveal = interpolate(
    frame,
    [fps * (beat.MECHANISM_END + 0.2), fps * (beat.MECHANISM_END + 1.5)],
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

  return (
    <AbsoluteFill style={{ backgroundColor: "#0E1116" }}>
      <IncentivesVsTimelinesPost
        hookReveal={hookReveal}
        axisReveal={axisReveal}
        topLaneReveal={topLaneReveal}
        bottomLaneReveal={bottomLaneReveal}
        marketLineReveal={marketLineReveal}
        metricsReveal={metricsReveal}
        contentDim={contentDim}
      />
    </AbsoluteFill>
  );
}
