import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { PostFrame } from "@/components/layout/PostFrame";
import { Panel } from "@/components/primitives/Panel";
import { MetricCard } from "@/components/primitives/MetricCard";
import "@/index.css";

type Props = {
  eyebrow?: string;
  headline: string;
  signal?: string;
};

export function BasePost({ eyebrow, headline, signal }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const intro = interpolate(frame, [0, fps * 0.8], [0, 1], {
    extrapolateRight: "clamp",
  });
  const nodeReveal = (delay: number) =>
    interpolate(frame, [fps * delay, fps * (delay + 0.6)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0E1116" }}>
      <div style={{ opacity: intro }}>
        <PostFrame
          eyebrow={eyebrow}
          headline={headline}
          signal={signal}
          visualization={
            <Panel label="system / topology">
              <div className="grid h-full grid-cols-3 gap-4">
                <AnimatedNode label="ingest" accent="text-accent-cyan" reveal={nodeReveal(0.6)} />
                <AnimatedNode
                  label="orchestrator"
                  accent="text-accent-violet"
                  reveal={nodeReveal(1.0)}
                />
                <AnimatedNode
                  label="render"
                  accent="text-accent-mint"
                  reveal={nodeReveal(1.4)}
                />
              </div>
            </Panel>
          }
          summary={
            <div className="grid grid-cols-3 gap-3" style={{ opacity: nodeReveal(2.0) }}>
              <MetricCard label="tokens" value="14" accent="cyan" />
              <MetricCard label="primitives" value="3" accent="violet" />
              <MetricCard label="pipelines" value="react · remotion" accent="mint" />
            </div>
          }
        />
      </div>
    </AbsoluteFill>
  );
}

function AnimatedNode({
  label,
  accent,
  reveal,
}: {
  label: string;
  accent: string;
  reveal: number;
}) {
  return (
    <div
      className="flex h-32 flex-col justify-between rounded-card bg-bg-midnight-slate/80 p-3 shadow-card"
      style={{
        opacity: reveal,
        transform: `translateY(${(1 - reveal) * 12}px)`,
      }}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-tertiary">
        node
      </span>
      <span className={`font-display text-lg font-semibold ${accent}`}>{label}</span>
    </div>
  );
}
