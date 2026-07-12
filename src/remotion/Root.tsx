import { Composition } from "remotion";
import { BasePost } from "./compositions/BasePost";
import { ReliabilityCompoundsComposition } from "./compositions/ReliabilityCompounds";
import { ReliabilityPipelineComposition } from "./compositions/ReliabilityPipeline";
import { IncentivesVsTimelinesComposition } from "./compositions/IncentivesVsTimelines";
import { SingleVsMultiAgentComposition } from "./compositions/SingleVsMultiAgent";
import { AIPredictionGraveyardComposition } from "./compositions/AIPredictionGraveyard";
import {
  HonestFactorHeroPortrait,
  HonestFactorHeroPortraitAnimated,
  HonestFactorHeroLandscape,
  HonestFactorTrustDecompComposition,
  HonestFactorPipelineComposition,
} from "./compositions/HonestFactor";
import { formats, layout, motion } from "@/tokens/design";

const FPS = 30;
const fmt = formats[layout.defaultFormat];

export function RemotionRoot() {
  return (
    <>
      {/* Honest Factor Research — static stills */}
      <Composition
        id="HonestFactorHeroPortrait"
        component={HonestFactorHeroPortrait}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1350}
      />
      <Composition
        id="HonestFactorHeroPortraitAnimated"
        component={HonestFactorHeroPortraitAnimated}
        durationInFrames={Math.round(14 * 30)}
        fps={30}
        width={1080}
        height={1350}
      />
      <Composition
        id="HonestFactorHeroLandscape"
        component={HonestFactorHeroLandscape}
        durationInFrames={1}
        fps={30}
        width={1280}
        height={640}
      />
      <Composition
        id="HonestFactorTrustDecomp"
        component={HonestFactorTrustDecompComposition}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1350}
      />
      <Composition
        id="HonestFactorPipeline"
        component={HonestFactorPipelineComposition}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1350}
      />

      <Composition
        id="AIPredictionGraveyard"
        component={AIPredictionGraveyardComposition}
        durationInFrames={Math.round(14 * FPS)}
        fps={FPS}
        width={fmt.width}
        height={fmt.height}
      />
      <Composition
        id="SingleVsMultiAgent"
        component={SingleVsMultiAgentComposition}
        durationInFrames={Math.round(14 * FPS)}
        fps={FPS}
        width={fmt.width}
        height={fmt.height}
      />
      <Composition
        id="IncentivesVsTimelines"
        component={IncentivesVsTimelinesComposition}
        durationInFrames={Math.round(14 * FPS)}
        fps={FPS}
        width={fmt.width}
        height={fmt.height}
      />
      <Composition
        id="ReliabilityPipeline"
        component={ReliabilityPipelineComposition}
        durationInFrames={Math.round(14 * FPS)}
        fps={FPS}
        width={fmt.width}
        height={fmt.height}
      />
      <Composition
        id="ReliabilityCompounds"
        component={ReliabilityCompoundsComposition}
        durationInFrames={Math.round(motion.defaultDurationSec * FPS)}
        fps={FPS}
        width={fmt.width}
        height={fmt.height}
      />
      <Composition
        id="BasePost"
        component={BasePost}
        durationInFrames={Math.round(motion.defaultDurationSec * FPS)}
        fps={FPS}
        width={fmt.width}
        height={fmt.height}
        defaultProps={{
          eyebrow: "system / scaffold",
          headline:
            "Pipeline online. Tokens, layout, and motion share one source of truth.",
          signal: "ready",
        }}
      />
    </>
  );
}
