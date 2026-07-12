import { PostFrame } from "@/components/layout/PostFrame";
import { Panel } from "@/components/primitives/Panel";
import { appear, revealStyle } from "@/lib/reveal";
import { colors, text } from "@/tokens/design";

type PostProps = { t?: number };

const checkpoints = [
  { step: "01", label: "95%", sub: "one call", x: 8 },
  { step: "03", label: "86%", sub: "demo chain", x: 31 },
  { step: "05", label: "77%", sub: "risk line", x: 54 },
  { step: "10", label: "60%", sub: "prod chain", x: 77 },
];

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function localProgress(t: number, start: number, dur: number) {
  return clamp01((t - start) / dur);
}

function ReliabilityVisualization({ t }: { t: number }) {
  const equationReveal = appear(t, 0.2, 0.16);
  const pathReveal = appear(t, 0.36, 0.26);
  const resultReveal = appear(t, 0.6, 0.14);
  const guardrailReveal = appear(t, 0.68, 0.14);
  const signalProgress = localProgress(t, 0.38, 0.24);

  return (
    <Panel label="conceptual reliability math" className="h-full" style={revealStyle(t, 0.14, 0.14, 10)}>
      <div className="grid h-full grid-rows-[235px_232px_1fr] gap-4">
        <div className="grid grid-cols-[1.05fr_0.95fr] gap-5">
          <div
            className="relative overflow-hidden rounded-card bg-bg-midnight-slate/80 px-7 py-6 shadow-card"
            style={{ opacity: equationReveal, transform: `translateY(${(1 - equationReveal) * 10}px)` }}
          >
            <div
              className="font-mono uppercase tracking-[0.22em] text-accent-cyan"
              style={{ fontSize: text.panelLabel }}
            >
              per-step reliability
            </div>
            <div className="mt-4 flex items-end gap-4 font-display font-semibold leading-none tracking-tight">
              <span className="text-text-primary" style={{ fontSize: 76 }}>0.95</span>
              <span className="text-accent-cyan" style={{ fontSize: 44, transform: "translateY(-20px)" }}>10</span>
              <span className="text-text-secondary" style={{ fontSize: 58 }}>=</span>
              <span className="text-accent-burnt" style={{ fontSize: 82, filter: `drop-shadow(0 0 18px ${colors.glow.orange})` }}>0.60</span>
            </div>
            <div className="mt-4 font-mono uppercase tracking-[0.18em] text-text-secondary" style={{ fontSize: 24 }}>
              multiplication, not model vibes
            </div>
          </div>

          <div
            className="relative overflow-hidden rounded-card border border-white/[0.07] bg-bg-midnight-slate/55 px-7 py-6"
            style={{ opacity: resultReveal, transform: `translateY(${(1 - resultReveal) * 10}px)` }}
          >
            <div className="font-mono uppercase tracking-[0.22em] text-text-tertiary" style={{ fontSize: text.panelLabel }}>
              production failure mode
            </div>
            <div className="mt-5 font-display font-semibold leading-[1.03] text-text-primary" style={{ fontSize: 40 }}>
              Demos stop at 3 steps.
              <br />
              Real workflows run ~14.
            </div>
            <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-accent-burnt"
                style={{ width: `${60 + 28 * resultReveal}%`, boxShadow: `0 0 18px ${colors.glow.orange}` }}
              />
            </div>
          </div>
        </div>

        <div
          className="relative rounded-card border border-white/[0.07] bg-bg-midnight-slate/55 px-8 py-6"
          style={{ opacity: pathReveal }}
        >
          <div className="mb-5 flex items-center justify-between">
            <span className="font-mono uppercase tracking-[0.22em] text-text-tertiary" style={{ fontSize: 22 }}>
              sequential ai calls
            </span>
          </div>

          <div className="relative h-[138px]">
            <div className="absolute left-[8%] right-[15%] top-[44px] h-px bg-white/[0.14]" />
            <div
              className="absolute left-[8%] top-[43px] h-[3px] rounded-full bg-accent-cyan"
              style={{
                width: `${69 * signalProgress}%`,
                boxShadow: `0 0 14px ${colors.glow.cyan}`,
              }}
            />
            <div
              className="absolute top-[35px] h-[18px] w-[18px] rounded-full bg-accent-mint"
              style={{
                left: `calc(${8 + 69 * signalProgress}% - 9px)`,
                opacity: pathReveal,
                boxShadow: `0 0 18px ${colors.glow.mint}`,
              }}
            />

            {checkpoints.map((node, i) => {
              const nodeReveal = appear(t, 0.38 + i * 0.045, 0.12);
              const isFinal = i === checkpoints.length - 1;
              const accent = isFinal ? colors.accent.burnt : colors.accent.cyan;
              return (
                <div
                  key={node.step}
                  className="absolute top-0 flex w-[138px] -translate-x-1/2 flex-col items-center"
                  style={{ left: `${node.x}%`, opacity: nodeReveal, transform: `translateX(-50%) translateY(${(1 - nodeReveal) * 8}px)` }}
                >
                  <div
                    className="flex h-[84px] w-[108px] flex-col items-center justify-center rounded-[18px] bg-bg-soft-panel/90"
                    style={{ border: `1px solid ${isFinal ? "rgba(217,134,77,0.56)" : "rgba(89,216,230,0.34)"}` }}
                  >
                    <div className="font-mono text-text-tertiary" style={{ fontSize: 18, letterSpacing: "0.18em" }}>
                      {node.step}
                    </div>
                    <div className="font-display font-semibold leading-none" style={{ color: accent, fontSize: 42 }}>
                      {node.label}
                    </div>
                  </div>
                  <div className="mt-3 text-center font-mono uppercase tracking-[0.16em] text-text-secondary" style={{ fontSize: 22 }}>
                    {node.sub}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <GuardrailCard
            reveal={guardrailReveal}
            accent="mint"
            label="what works"
            text="Count and shorten steps before tuning the model."
          />
          <GuardrailCard
            reveal={appear(t, 0.72, 0.14)}
            accent="cyan"
            label="production rule"
            text="Reliable teams run fewer steps with verification."
          />
        </div>
      </div>
    </Panel>
  );
}

function GuardrailCard({
  reveal,
  accent,
  label,
  text: body,
}: {
  reveal: number;
  accent: "mint" | "cyan";
  label: string;
  text: string;
}) {
  const color = accent === "mint" ? colors.accent.mint : colors.accent.cyan;
  return (
    <div
      className="rounded-card bg-bg-midnight-slate/65 px-6 py-5 shadow-card"
      style={{ opacity: reveal, transform: `translateY(${(1 - reveal) * 8}px)`, border: `1px solid ${color}33` }}
    >
      <div className="font-mono uppercase tracking-[0.22em]" style={{ color, fontSize: 22 }}>
        {label}
      </div>
      <div className="mt-3 font-display font-semibold leading-[1.08] text-text-primary" style={{ fontSize: 33 }}>
        {body}
      </div>
    </div>
  );
}

function CompactMetric({ label, value, accent }: { label: string; value: string; accent: "burnt" | "amber" | "mint" }) {
  const color = colors.accent[accent];
  return (
    <div className="rounded-card bg-bg-midnight-slate/80 px-5 py-3 shadow-card" style={{ border: `1px solid ${color}26` }}>
      <div className="font-mono uppercase tracking-[0.2em] text-text-tertiary" style={{ fontSize: 22 }}>
        {label}
      </div>
      <div className="mt-1 font-display font-semibold leading-none" style={{ fontSize: 64, color }}>
        {value}
      </div>
    </div>
  );
}

function Summary({ t }: { t: number }) {
  const a = appear(t, 0.6, 0.18);
  return (
    <div className="grid grid-cols-3 gap-4" style={{ opacity: a, transform: `translateY(${(1 - a) * 10 - 44}px)` }}>
      <CompactMetric label="90% / step" value="35%" accent="burnt" />
      <CompactMetric label="95% / step" value="60%" accent="amber" />
      <CompactMetric label="99% / step" value="90%" accent="mint" />
    </div>
  );
}

export default function Post({ t = 1 }: PostProps) {
  const signatureEntrance = appear(t, 0.06, 0.12);
  const finalPulse = appear(t, 0.86, 0.14) * (1 - appear(t, 0.98, 0.02));

  return (
    <PostFrame
      eyebrow="agent reliability · production math"
      headline="Agent reliability collapses when small failures compound across steps"
      visualization={<ReliabilityVisualization t={t} />}
      summary={<Summary t={t} />}
      signatureVariant="compact"
      signaturePlacement="bottomRight"
      signatureEntranceProgress={signatureEntrance}
      signaturePulseProgress={finalPulse}
    />
  );
}
