// Honest Factor Research — static stills (no animation, just rendered PNGs)
// + the animated portrait composition for LinkedIn.

import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { easings } from "@/tokens/motion";
import { HonestFactorHeroPost } from "@/posts/HonestFactorHero";
import { HonestFactorTrustDecompPost } from "@/posts/HonestFactorTrustDecomp";
import { HonestFactorPipelinePost } from "@/posts/HonestFactorPipeline";
import "@/index.css";

export function HonestFactorHeroPortrait() {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0E1116" }}>
      <HonestFactorHeroPost variant="portrait" />
    </AbsoluteFill>
  );
}

/**
 * HonestFactorHeroPortraitAnimated — 14s LinkedIn motion graphic.
 *
 * Narrative: a factor model that *looks* 66 % explained is mostly the sector
 *            ETF mirroring the very stock it claims to explain — only ~17 %
 *            is honestly defensible, ~33 % may be sector-mirror.
 * Main motion event: the honest-decomposition bar building segment-by-segment
 *            (mint → violet → orange → grey) — the visual moment where a
 *            single cyan bar splits into 4 differently-trusted components.
 * Eye path: headline (top) → "what R²=0.66 contains" label → standard bar
 *           (cyan, fills L→R) → honest bar segments place one-by-one →
 *           legend → 3-line message + URL → final hold.
 */
export function HonestFactorHeroPortraitAnimated() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const easeIn = (start: number, end: number) =>
    interpolate(frame, [fps * start, fps * end], [0, 1], {
      easing: easings.easeOutCubic,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  const easeInQuart = (start: number, end: number) =>
    interpolate(frame, [fps * start, fps * end], [0, 1], {
      easing: easings.easeOutQuart,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  // BEAT 1 — Hook (0–1.2s): eyebrow + headline reveal line-by-line
  const eyebrowReveal = easeIn(0.0, 0.35);
  const headlineLine1 = easeIn(0.3, 0.7);
  const headlineLine2 = easeIn(0.55, 0.95);
  const headlineLine3 = easeIn(0.8, 1.2);

  // BEAT 2 — Orientation (1.2–3.0s): decomp label + standard bar + caption
  const decompLabelReveal = easeIn(1.3, 1.7);
  const standardBarReveal = easeIn(1.6, 2.5);
  const cap1Reveal = easeIn(2.4, 2.9);

  // BEAT 3 — Mechanism (3.0–8.0s): honest bar segments build, then caption + legend
  // Focus lock 5.6–7.4s: standard bar dims to 35 %
  const honestSegMint = easeInQuart(3.0, 3.55);
  const honestSegViolet = easeInQuart(3.5, 4.05);
  const honestSegOrange = easeInQuart(4.0, 4.65);
  const honestSegGrey = easeInQuart(4.6, 5.15);
  const cap2Reveal = easeIn(5.2, 5.7);
  const legendReveal = easeIn(5.9, 6.6);

  // BEAT 4 — Insight (8.0–11.5s): 3-line message reveals + URL
  const msg1Reveal = easeIn(8.0, 8.5);
  const msg2Reveal = easeIn(8.6, 9.1);
  const msg3Reveal = easeIn(9.2, 9.7);
  const urlReveal = easeIn(10.1, 10.7);

  // Creator signature: settle by 1.2s, subtle amber pulse during Memory Anchor
  const signatureEntranceProgress = interpolate(
    frame,
    [fps * 0.6, fps * 1.2],
    [0, 1],
    {
      easing: easings.easeOutQuart,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const signaturePulseProgress = interpolate(
    frame,
    [fps * 11.5, fps * 12.2, fps * 13.5],
    [0, 1, 0],
    {
      easing: easings.easeInOutSine,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#0E1116" }}>
      <HonestFactorHeroPost
        variant="portrait"
        eyebrowReveal={eyebrowReveal}
        headlineLine1={headlineLine1}
        headlineLine2={headlineLine2}
        headlineLine3={headlineLine3}
        decompLabelReveal={decompLabelReveal}
        standardBarReveal={standardBarReveal}
        cap1Reveal={cap1Reveal}
        honestSegMint={honestSegMint}
        honestSegViolet={honestSegViolet}
        honestSegOrange={honestSegOrange}
        honestSegGrey={honestSegGrey}
        cap2Reveal={cap2Reveal}
        legendReveal={legendReveal}
        msg1Reveal={msg1Reveal}
        msg2Reveal={msg2Reveal}
        msg3Reveal={msg3Reveal}
        urlReveal={urlReveal}
        signatureEntranceProgress={signatureEntranceProgress}
        signaturePulseProgress={signaturePulseProgress}
      />
    </AbsoluteFill>
  );
}

export function HonestFactorHeroLandscape() {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0E1116" }}>
      <HonestFactorHeroPost variant="landscape" />
    </AbsoluteFill>
  );
}

export function HonestFactorTrustDecompComposition() {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0E1116" }}>
      <HonestFactorTrustDecompPost />
    </AbsoluteFill>
  );
}

export function HonestFactorPipelineComposition() {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0E1116" }}>
      <HonestFactorPipelinePost />
    </AbsoluteFill>
  );
}
