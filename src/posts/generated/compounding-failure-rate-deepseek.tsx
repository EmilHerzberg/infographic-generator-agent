import { appear, revealStyle } from "@/lib/reveal";
import { colors, text, fonts } from "@/tokens/design";
import { PostFrame } from "@/components/layout/PostFrame";
import { MetricCard } from "@/components/primitives/MetricCard";

/* ─────────────────────────────────────────────
   Content Type: 4 — Bottleneck / Failure Point
   Visual Format: Pipeline (custom SVG) + Metric Cards
   Story Pattern: A — Problem → System → Result
   Color Roles:
     Primary:    System Cyan    (#59D8E6) — ideal 99% path
     Warm:       Friction Orange (#D9864D) — 90% failure collapse
     Warm alt:   Insight Amber   (#E7A95A) — the 95% "demo" illusion
     Differentiator: Success Mint (#6ED3A3) — verification / what works
   ───────────────────────────────────────────── */

const CYAN = colors.accent.cyan;
const AMBER = colors.accent.amber;
const ORANGE = colors.accent.burnt;
const MINT = colors.accent.mint;

/* ──────────────────────────────────────
   Compound Pipeline SVG
   ────────────────────────────────────── */
function CompoundPipelineSvg({ pipelineReveal }: { pipelineReveal: number }) {
  // Wide viewBox so endpoint labels fit inside without overflow
  const W = 960;
  const H = 320;
  const padL = 80;
  const padR = 170;
  const padTop = 34;
  const padBot = 50;
  const innerW = W - padL - padR;
  const innerH = H - padTop - padBot;

  const steps = 10;

  const rel99 = Array.from({ length: steps + 1 }, (_, i) => Math.pow(0.99, i));
  const rel95 = Array.from({ length: steps + 1 }, (_, i) => Math.pow(0.95, i));
  const rel90 = Array.from({ length: steps + 1 }, (_, i) => Math.pow(0.90, i));

  const xAt = (i: number) => padL + (i / steps) * innerW;
  const yAt = (v: number) => padTop + innerH - v * innerH;

  const pathD = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(v)}`).join(" ");

  const endLabelReveal = Math.max(0, Math.min(1, (pipelineReveal - 0.85) / 0.15));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto">
      {/* Grid */}
      {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((tick) => (
        <g key={`g-${tick}`}>
          <line x1={padL} x2={W - padR} y1={yAt(tick)} y2={yAt(tick)}
            stroke="rgba(184,178,167,0.08)" strokeWidth={1.5} />
          <text x={padL - 8} y={yAt(tick) + 7} textAnchor="end"
            fill={colors.text.tertiary} fontFamily={fonts.mono}
            fontSize={20} letterSpacing="0.14em">{Math.round(tick * 100)}%</text>
        </g>
      ))}

      {/* Lines */}
      <g opacity={pipelineReveal}>
        <path d={pathD(rel90)} fill="none" stroke={ORANGE} strokeWidth={4}
          strokeLinecap="round" strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 6px ${ORANGE}44)` }} />
        <path d={pathD(rel95)} fill="none" stroke={AMBER} strokeWidth={4}
          strokeLinecap="round" strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 6px ${AMBER}44)` }} />
        <path d={pathD(rel99)} fill="none" stroke={CYAN} strokeWidth={4}
          strokeLinecap="round" strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 8px ${CYAN}44)` }} />
      </g>

      {/* Legend */}
      <g opacity={Math.max(0, Math.min(1, (pipelineReveal - 0.6) / 0.12))}>
        <LegendSwatch x={padL} y={8} color={CYAN} label="99%/STEP" />
        <LegendSwatch x={padL + 150} y={8} color={AMBER} label="95%/STEP" />
        <LegendSwatch x={padL + 300} y={8} color={ORANGE} label="90%/STEP" />
      </g>

      {/* Endpoint labels at step 10 */}
      <g opacity={endLabelReveal}>
        <text x={W - padR - 8} y={yAt(rel99[10]) - 12} textAnchor="end"
          fill={MINT} fontFamily={fonts.display} fontWeight={700}
          fontSize={38} letterSpacing="-0.02em"
          style={{ filter: `drop-shadow(0 0 10px ${MINT}55)` }}>~90%</text>
        <text x={W - padR - 8} y={yAt(rel95[10]) + 22} textAnchor="end"
          fill={AMBER} fontFamily={fonts.display} fontWeight={700}
          fontSize={38} letterSpacing="-0.02em"
          style={{ filter: `drop-shadow(0 0 10px ${AMBER}55)` }}>~60%</text>
        <text x={W - padR - 8} y={yAt(rel90[10]) + 26} textAnchor="end"
          fill={ORANGE} fontFamily={fonts.display} fontWeight={700}
          fontSize={38} letterSpacing="-0.02em"
          style={{ filter: `drop-shadow(0 0 10px ${ORANGE}55)` }}>~35%</text>
      </g>

      {/* Demo vs Real callout */}
      <g opacity={Math.max(0, Math.min(1, (pipelineReveal - 0.55) / 0.08))}>
        <line x1={xAt(3)} x2={xAt(3)} y1={yAt(0.72)} y2={yAt(rel95[3]) - 4}
          stroke={AMBER} strokeWidth={2} strokeDasharray="4 4" opacity={0.5} />
        <text x={xAt(3)} y={yAt(0.72)} textAnchor="middle"
          fill={AMBER} fontFamily={fonts.mono} fontSize={18}
          fontWeight={600} letterSpacing="0.14em">DEMO · 3</text>

        <line x1={xAt(8)} x2={xAt(8)} y1={yAt(0.82)} y2={yAt(rel90[8]) - 4}
          stroke={ORANGE} strokeWidth={2} strokeDasharray="4 4" opacity={0.5} />
        <text x={xAt(8)} y={yAt(0.82)} textAnchor="middle"
          fill={ORANGE} fontFamily={fonts.mono} fontSize={18}
          fontWeight={600} letterSpacing="0.14em">REAL · 14+</text>
      </g>
    </svg>
  );
}

function LegendSwatch({ x, y, color, label }: {
  x: number; y: number; color: string; label: string;
}) {
  return (
    <g>
      <line x1={x} x2={x + 16} y1={y + 7} y2={y + 7}
        stroke={color} strokeWidth={3} strokeLinecap="round" />
      <text x={x + 22} y={y + 11} fill={colors.text.secondary}
        fontFamily={fonts.mono} fontSize={18} letterSpacing="0.10em">{label}</text>
    </g>
  );
}

/* ──────────────────────────────────────
   Takeaways List
   ────────────────────────────────────── */
function TakeawaysList({ t }: { t: number }) {
  const items = [
    "Count and shorten steps — every step compounds",
    "Use deterministic code where logic is not fuzzy",
    "Treat >5 sequential AI calls as research, not product",
    "Add cheap verification to detect and retry",
  ];

  return (
    <div className="flex flex-col gap-1 w-full">
      {items.map((item, i) => {
        const start = 0.68 + i * 0.06;
        const a = Math.max(0, Math.min(1, (t - start) / 0.1));
        return (
          <div key={item} className="flex items-center gap-2"
            style={{ opacity: a, transform: `translateY(${(1 - a) * 6}px)` }}>
            <span className="shrink-0 font-mono font-bold"
              style={{ fontSize: 20, color: MINT,
                filter: `drop-shadow(0 0 4px ${MINT}44)` }}>+</span>
            <span className="font-display text-text-primary"
              style={{ fontSize: 22, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
              {item}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────
   Main Post Component
   ────────────────────────────────────── */
export default function Post({ t = 1 }: { t?: number }) {
  const headlineReveal = appear(t, 0, 0.14);
  const pipelineReveal = Math.max(0, Math.min(1, (t - 0.2) / 0.55));
  const metricCardReveal = Math.max(0, Math.min(1, (t - 0.6) / 0.15));
  const takeawayReveal = Math.max(0, Math.min(1, (t - 0.76) / 0.15));
  const signatureReveal = appear(t, 0.05, 0.2);
  const signaturePulse = Math.max(0, Math.min(1, (t - 0.92) / 0.08));

  return (
    <PostFrame
      eyebrow=""
      headline=""
      visualization={
        <div className="flex flex-col h-full w-full overflow-hidden">
          {/* Eyebrow */}
          <div className="flex items-center gap-3 mb-2"
            style={revealStyle(t, 0.05, 0.12, 8)}>
            <span className="font-mono uppercase tracking-[0.24em] text-accent-amber"
              style={{ fontSize: text.eyebrow }}>
              COMPOUNDING FAILURE RATE
            </span>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>

          {/* Headline */}
          <h1 className="font-display font-semibold tracking-tight text-text-primary mb-1"
            style={{ fontSize: text.headline, lineHeight: 1.05,
              opacity: headlineReveal,
              transform: `translateY(${(1 - headlineReveal) * 12}px)` }}>
            0.95<sup>10</sup> = 0.60
          </h1>

          {/* Sub-headline */}
          <div className="font-display text-text-secondary mb-2 max-w-[85%]"
            style={{ fontSize: 24, letterSpacing: "-0.01em", lineHeight: 1.2,
              ...revealStyle(t, 0.1, 0.12) }}>
            Why most AI deployments fail
          </div>

          {/* Chart */}
          <div className="flex-1 flex items-center justify-center"
            style={{ opacity: pipelineReveal }}>
            <CompoundPipelineSvg pipelineReveal={pipelineReveal} />
          </div>
        </div>
      }
      summary={
        <div className="flex flex-col w-full h-full justify-center gap-1.5">
          {/* Metric cards row */}
          <div className="flex gap-2"
            style={{ opacity: metricCardReveal,
              transform: `translateY(${(1 - metricCardReveal) * 8}px)` }}>
            <MetricCard label="95%/STEP · 10" value="~60%"
              delta="40% fail" accent="amber" />
            <MetricCard label="99%/STEP · 10" value="~90%"
              delta="10% fail" accent="cyan" />
            <MetricCard label="90%/STEP · 10" value="~35%"
              delta="65% fail" accent="burnt" />
            <MetricCard label="REAL PROCESS" value="14+"
              delta="collapse" accent="burnt" />
          </div>

          {/* Takeaways */}
          <div style={{ opacity: takeawayReveal,
            transform: `translateY(${(1 - takeawayReveal) * 8}px)` }}>
            <TakeawaysList t={t} />
          </div>
        </div>
      }
      signal="COMPOUND FAIL"
      signalReveal={Math.max(0, Math.min(1, (t - 0.3) / 0.15))}
      signatureVariant="compact"
      signaturePlacement="bottomRight"
      signatureEntranceProgress={signatureReveal}
      signaturePulseProgress={signaturePulse}
    />
  );
}
