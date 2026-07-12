// Narrative: most workflows are sequential; multi-agent coordination breaks them
//            (36% failure vs 28/28 for single agent); the structural reason is
//            reliability compounding multiplicatively.
// Main motion event: the BL cell (multi-agent × sequential = −55%) revealing last
//            with a burnt-orange glow — the punchline that lands the argument.
// Eye path: headline → matrix structure (col + row headers) → TL win → BR legit
//           parallel use → TR baseline → BL FAILURE (the insight) → focus lock
//           dims surroundings → metric strip lands the math.
// Focus lock: 8.0–10.0s — non-failure cells dim to 0.7, BL stays full opacity.

import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { easings, beat } from "@/tokens/motion";
import { SingleVsMultiAgentPost } from "@/posts/SingleVsMultiAgent";
import "@/index.css";

export function SingleVsMultiAgentComposition() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const hookReveal = interpolate(frame, [0, fps * 0.6], [0, 1], {
    easing: easings.easeOutCubic,
    extrapolateRight: "clamp",
  });

  const headersReveal = interpolate(
    frame,
    [fps * beat.HOOK_END, fps * (beat.ORIENTATION_END - 0.2)],
    [0, 1],
    {
      easing: easings.easeOutCubic,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const cellReveal = (startSec: number, endSec: number) =>
    interpolate(frame, [fps * startSec, fps * endSec], [0, 1], {
      easing: easings.easeOutQuart,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  // Reveal order: TL win → BR legit use → TR baseline → BL failure (insight).
  const tlReveal = cellReveal(3.0, 4.2);
  const brReveal = cellReveal(4.2, 5.4);
  const trReveal = cellReveal(5.4, 6.4);
  const blReveal = cellReveal(6.4, 8.0);

  // Focus lock 8.0–10.0s: dim non-BL cells.
  const focusLockOpacity = interpolate(
    frame,
    [fps * 8.0, fps * 8.5, fps * 10.0, fps * 10.5],
    [1, 0.7, 0.7, 1],
    {
      easing: easings.easeInOutSine,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const focusOn = focusLockOpacity < 0.95 ? ("bl" as const) : null;

  const metricsReveal = interpolate(
    frame,
    [fps * 8.5, fps * 10.0],
    [0, 1],
    {
      easing: easings.easeOutCubic,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#0E1116" }}>
      <SingleVsMultiAgentPost
        hookReveal={hookReveal}
        headersReveal={headersReveal}
        tlReveal={tlReveal}
        trReveal={trReveal}
        blReveal={blReveal}
        brReveal={brReveal}
        focusOn={focusOn}
        focusLockOpacity={focusLockOpacity}
        metricsReveal={metricsReveal}
      />
    </AbsoluteFill>
  );
}
