import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { ReliabilityCompoundsPost } from "@/posts/ReliabilityCompounds";
import "@/index.css";

export function ReliabilityCompoundsComposition() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const intro = interpolate(frame, [0, fps * 0.8], [0, 1], {
    extrapolateRight: "clamp",
  });

  const drawStart = fps * 0.9;
  const drawEnd = fps * 5.5;
  const reveal = interpolate(frame, [drawStart, drawEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const metricsReveal = interpolate(
    frame,
    [drawEnd - fps * 0.2, drawEnd + fps * 0.6],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const outro = interpolate(
    frame,
    [durationInFrames - fps * 0.6, durationInFrames],
    [1, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0F1C" }}>
      <div style={{ opacity: intro * outro }}>
        <ReliabilityCompoundsPost reveal={reveal} metricsReveal={metricsReveal} />
      </div>
    </AbsoluteFill>
  );
}
