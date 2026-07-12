import { PostFrame } from "@/components/layout/PostFrame";
import { appear, revealStyle } from "@/lib/reveal";
import { colors, fonts, stroke } from "@/tokens/design";

const steps = Array.from({ length: 11 }, (_, i) => i);

function curve(rate: number) {
  return steps.map((step) => Math.pow(rate, step));
}

function pathFor(values: number[], xAt: (i: number) => number, yAt: (v: number) => number) {
  return values.map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(" ");
}

function ReliabilityChart({ reveal }: { reveal: number }) {
  const width = 860;
  const height = 430;
  const pad = { left: 88, right: 230, top: 26, bottom: 58 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const xAt = (step: number) => pad.left + (step / 10) * innerW;
  const yAt = (value: number) => pad.top + innerH - value * innerH;

  const series = [
    { label: "99%/step · 90%", rate: 0.99, color: colors.accent.mint },
    { label: "95%/step · 60%", rate: 0.95, color: colors.accent.cyan },
    { label: "90%/step · 35%", rate: 0.9, color: colors.accent.burnt },
  ];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Sequential agent reliability decays multiplicatively as step count rises">
      {[1, 0.75, 0.5, 0.25].map((tick) => (
        <g key={tick} opacity={0.85}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={yAt(tick)}
            y2={yAt(tick)}
            stroke={colors.text.secondary}
            strokeOpacity={0.11}
            strokeWidth={stroke.grid}
          />
          <text
            x={pad.left - 16}
            y={yAt(tick) + 8}
            textAnchor="end"
            fill={colors.text.secondary}
            opacity={0.78}
            fontFamily={fonts.mono}
            fontSize={22}
            letterSpacing="0.14em"
          >
            {Math.round(tick * 100)}%
          </text>
        </g>
      ))}

      {[0, 5, 10].map((step) => (
        <g key={step}>
          <line
            x1={xAt(step)}
            x2={xAt(step)}
            y1={pad.top}
            y2={height - pad.bottom}
            stroke={colors.text.secondary}
            strokeOpacity={0.07}
            strokeWidth={stroke.grid}
          />
          <text
            x={xAt(step)}
            y={height - 18}
            textAnchor="middle"
            fill={colors.text.secondary}
            opacity={0.76}
            fontFamily={fonts.mono}
            fontSize={22}
            letterSpacing="0.14em"
          >
            {step}
          </text>
        </g>
      ))}

      {series.map((s, idx) => {
        const values = curve(s.rate);
        const endY = yAt(values[10]);
        const lineReveal = Math.max(0, Math.min(1, reveal - idx * 0.08));
        return (
          <g key={s.label}>
            <path
              d={pathFor(values, xAt, yAt)}
              fill="none"
              stroke={s.color}
              strokeWidth={idx === 1 ? 6 : 5}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={1 - lineReveal}
              opacity={idx === 1 ? 1 : 0.88}
              style={{ filter: `drop-shadow(0 0 10px ${s.color}55)` }}
            />
            <circle
              cx={xAt(10)}
              cy={endY}
              r={idx === 1 ? 8 : 6}
              fill={s.color}
              opacity={appear(reveal, 0.72, 0.18)}
              style={{ filter: `drop-shadow(0 0 10px ${s.color})` }}
            />
            <text
              x={xAt(10) + 20}
              y={endY + 8}
              fill={s.color}
              opacity={appear(reveal, 0.78, 0.16)}
              fontFamily={fonts.display}
              fontWeight={650}
              fontSize={28}
              letterSpacing="-0.01em"
            >
              {s.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Visualization({ t }: { t: number }) {
  const chartReveal = appear(t, 0.34, 0.28);

  return (
    <div className="h-full rounded-panel border border-white/[0.08] bg-bg-soft-panel/60 p-6 shadow-panel backdrop-blur-sm">
      <div className="grid h-full grid-rows-[148px_1fr] gap-5">
        <div className="grid grid-cols-[1fr_300px] gap-5" style={revealStyle(t, 0.18, 0.12, 10)}>
          <div className="rounded-[18px] border border-white/[0.08] bg-bg-midnight-slate/80 px-7 py-5 shadow-card">
            <div className="font-mono uppercase leading-snug tracking-[0.22em] text-text-tertiary" style={{ fontSize: 22 }}>
              ten sequential AI calls
            </div>
            <div className="mt-2 flex items-baseline gap-4 font-display font-semibold tracking-tight text-text-primary" style={{ fontSize: 74, lineHeight: 0.95 }}>
              <span>0.95<sup className="relative -top-8 ml-1 text-[38px] text-accent-cyan">10</sup></span>
              <span className="text-text-secondary">=</span>
              <span className="text-accent-burnt">0.60</span>
            </div>
          </div>
          <div className="rounded-[18px] border border-accent-burnt/30 bg-bg-midnight-slate/70 px-5 py-5 shadow-card">
            <div className="font-display font-semibold text-accent-burnt" style={{ fontSize: 34, lineHeight: 1.04 }}>
              Multiplicative failure, not model magic.
            </div>
            <div className="mt-3 font-mono uppercase tracking-[0.16em] text-text-secondary" style={{ fontSize: 18, lineHeight: 1.35 }}>
              shorten chains · verify cheaply
            </div>
          </div>
        </div>

        <div className="rounded-[18px] border border-white/[0.07] bg-bg-midnight-slate/55 px-6 py-4" style={revealStyle(t, 0.34, 0.16, 10)}>
          <ReliabilityChart reveal={chartReveal} />
        </div>
      </div>
    </div>
  );
}

function Summary({ t }: { t: number }) {
  return (
    <div
      className="rounded-[18px] border border-white/[0.08] bg-bg-soft-panel/65 px-6 py-4 shadow-card"
      style={revealStyle(t, 0.8, 0.13, 10)}
    >
      <div className="font-display font-semibold tracking-tight text-text-primary" style={{ fontSize: 38, lineHeight: 1.08 }}>
        Reliable teams run fewer verified steps, not longer chains with better models.
      </div>
    </div>
  );
}

export default function Post({ t = 1 }: { t?: number }) {
  const signatureEntrance = appear(t, 0.05, 0.1);
  const pulse = Math.sin(Math.max(0, t - 0.86) * Math.PI * 2) > 0 ? appear(t, 0.86, 0.08) * 0.35 : 0;

  return (
    <PostFrame
      headline="AI agents fail when reliability compounds across steps"
      visualization={<Visualization t={t} />}
      summary={<Summary t={t} />}
      signatureVariant="compact"
      signaturePlacement="bottomRight"
      signatureEntranceProgress={signatureEntrance}
      signaturePulseProgress={pulse}
    />
  );
}
