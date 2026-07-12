// Spec 1 — Hero Banner (honest_factor_hero_v1)
// Variants from one component:
//   - portrait  1080×1350  (LinkedIn feed, supports animation)
//   - landscape 1280×640   (GitHub social preview, static)
//
// Color Role Plan:
//   primary    systemCyan       → "standard view" R² block (looks comprehensive)
//   warm       insightAmber     → eyebrow tag (the audit framework framing)
//   diff       strategicViolet  → STATISTICAL middle-trust academic factors
//   state      successMint      → DIRECT (trustworthy) — "green = safe"
//   state      frictionOrange   → DERIVED / mirror-suspect (the friction reveal)
//   neutral    taupe @ 22%      → unexplained

import { CreatorSignature } from "@/components/primitives/CreatorSignature";
import { DecompBar, type DecompSegment } from "@/components/primitives/DecompBar";
import { brandHonest, trustColors } from "./honestFactor.data";

type Variant = "portrait" | "landscape";

type AnimationProps = {
  // 0..1 drivers (default 1 = settled). All optional so the same component
  // works both as a still and an animated Remotion composition.
  headlineLine1?: number;
  headlineLine2?: number;
  headlineLine3?: number;
  eyebrowReveal?: number;
  decompLabelReveal?: number;
  standardBarReveal?: number;
  cap1Reveal?: number;
  honestSegMint?: number;
  honestSegViolet?: number;
  honestSegOrange?: number;
  honestSegGrey?: number;
  cap2Reveal?: number;
  legendReveal?: number;
  msg1Reveal?: number;
  msg2Reveal?: number;
  msg3Reveal?: number;
  urlReveal?: number;
  signatureEntranceProgress?: number;
  signaturePulseProgress?: number;
  /** opacity multiplier on the standard bar during focus lock */
  standardBarDim?: number;
};

type Props = {
  variant?: Variant;
} & AnimationProps;

const standardBarSegments: DecompSegment[] = [
  { width: 0.66, color: trustColors.systemCyan },
  { width: 0.34, color: trustColors.unexplained },
];

function CanvasShell({
  children,
  width,
  height,
}: {
  children: React.ReactNode;
  width: number;
  height: number;
}) {
  return (
    <div
      className="relative overflow-hidden bg-bg-warm-graphite text-text-primary"
      style={{ width, height, aspectRatio: `${width} / ${height}` }}
    >
      <div className="pointer-events-none absolute inset-0 bg-grid-faint bg-grid" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 75% 55% at 90% 0%, rgba(231,169,90,0.14), transparent 60%), radial-gradient(ellipse 100% 100% at 50% 110%, rgba(0,0,0,0.45), transparent 60%)",
        }}
      />
      {children}
    </div>
  );
}

function LegendStrip({ fontSize = 22 }: { fontSize?: number }) {
  return (
    <div
      className="flex items-center gap-6 font-mono uppercase tracking-[0.16em] text-text-secondary"
      style={{ fontSize }}
    >
      <Swatch color={trustColors.direct} label="DIRECT" />
      <Swatch color={trustColors.statistical} label="STATISTICAL" />
      <Swatch color={trustColors.derived} label="DERIVED" />
      <Swatch color={trustColors.unexplained} label="unexplained" />
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block"
        style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: color }}
      />
      <span>{label}</span>
    </div>
  );
}

/**
 * Honest decomp bar — 4 segments fade/scale in individually based on per-segment reveal.
 * Layout space is reserved from the start (segments always at their final
 * positions); only opacity + subtle Y-scale animate. No mount/unmount.
 */
function HonestBar({
  reveals,
  height = 64,
  radius = 10,
}: {
  reveals: [number, number, number, number];
  height?: number;
  radius?: number;
}) {
  const segs: { width: number; color: string }[] = [
    { width: 0.17, color: trustColors.direct },
    { width: 0.16, color: trustColors.statistical },
    { width: 0.33, color: trustColors.derived },
    { width: 0.34, color: trustColors.unexplained },
  ];

  return (
    <div
      className="flex w-full overflow-hidden"
      style={{
        height,
        borderRadius: radius,
        boxShadow: "0 0 0 1px rgba(244,241,234,0.08)",
      }}
    >
      {segs.map((s, i) => {
        const r = reveals[i];
        return (
          <div
            key={i}
            style={{
              flexBasis: `${s.width * 100}%`,
              backgroundColor: s.color,
              minWidth: 0,
              opacity: r,
              transform: `scaleY(${0.5 + 0.5 * r})`,
              transformOrigin: "center",
              transition: "none",
            }}
          />
        );
      })}
    </div>
  );
}

/** Standard bar — reveals left-to-right via clip-path inset. */
function StandardBar({
  reveal,
  height = 64,
  radius = 10,
}: {
  reveal: number;
  height?: number;
  radius?: number;
}) {
  return (
    <div
      style={{ clipPath: `inset(0 ${(1 - reveal) * 100}% 0 0)` }}
    >
      <DecompBar segments={standardBarSegments} height={height} radius={radius} />
    </div>
  );
}

export function HonestFactorHeroPost(props: Props) {
  return props.variant === "landscape" ? <Landscape /> : <Portrait {...props} />;
}

function Portrait({
  headlineLine1 = 1,
  headlineLine2 = 1,
  headlineLine3 = 1,
  eyebrowReveal = 1,
  decompLabelReveal = 1,
  standardBarReveal = 1,
  cap1Reveal = 1,
  honestSegMint = 1,
  honestSegViolet = 1,
  honestSegOrange = 1,
  honestSegGrey = 1,
  cap2Reveal = 1,
  legendReveal = 1,
  msg1Reveal = 1,
  msg2Reveal = 1,
  msg3Reveal = 1,
  urlReveal = 1,
  signatureEntranceProgress = 1,
  signaturePulseProgress = 0,
  standardBarDim = 1,
}: AnimationProps) {
  return (
    <CanvasShell width={1080} height={1350}>
      {/* hero_top: eyebrow + headline */}
      <div className="absolute" style={{ left: 80, top: 128, width: 920 }}>
        <div
          className="font-mono uppercase tracking-[0.22em] text-accent-cyan"
          style={{
            fontSize: 26,
            opacity: eyebrowReveal,
            transform: `translateY(${(1 - eyebrowReveal) * 6}px)`,
          }}
        >
          {brandHonest.eyebrowHero}
        </div>
        <h1
          className="mt-7 font-display font-semibold text-text-primary"
          style={{ fontSize: 78, lineHeight: 1.06, letterSpacing: "-0.015em" }}
        >
          <span
            style={{
              display: "block",
              opacity: headlineLine1,
              transform: `translateY(${(1 - headlineLine1) * 10}px)`,
            }}
          >
            Most stock factor
          </span>
          <span
            style={{
              display: "block",
              opacity: headlineLine2,
              transform: `translateY(${(1 - headlineLine2) * 10}px)`,
            }}
          >
            models look smarter
          </span>
          <span
            style={{
              display: "block",
              opacity: headlineLine3,
              transform: `translateY(${(1 - headlineLine3) * 10}px)`,
            }}
          >
            than they really are.
          </span>
        </h1>
      </div>

      {/* hero_middle: decomp metaphor */}
      <div className="absolute" style={{ left: 80, top: 500, width: 920 }}>
        <div
          className="font-mono uppercase tracking-[0.20em] text-text-tertiary"
          style={{ fontSize: 24, opacity: decompLabelReveal }}
        >
          What "R² = 0.66" actually contains
        </div>

        {/* Bar 1 — standard view (dims during focus lock on Bar 2) */}
        <div
          className="mt-9"
          style={{ paddingLeft: 40, paddingRight: 40, opacity: standardBarDim }}
        >
          <StandardBar reveal={standardBarReveal} height={64} radius={10} />
        </div>
        <div
          className="mt-4 font-mono uppercase tracking-[0.18em] text-text-secondary"
          style={{ fontSize: 22, paddingLeft: 40, opacity: cap1Reveal * standardBarDim }}
        >
          standard view  →  looks like 66 % explained
        </div>

        {/* Bar 2 — honest decomposition */}
        <div className="mt-12" style={{ paddingLeft: 40, paddingRight: 40 }}>
          <HonestBar
            reveals={[
              honestSegMint,
              honestSegViolet,
              honestSegOrange,
              honestSegGrey,
            ]}
            height={64}
            radius={10}
          />
        </div>
        <div
          className="mt-4 font-mono uppercase tracking-[0.18em] text-text-secondary"
          style={{ fontSize: 22, paddingLeft: 40, opacity: cap2Reveal }}
        >
          honest decomposition  →  only ~17 % really direct, ~33 % may be sector-mirror
        </div>

        {/* Legend */}
        <div className="mt-10" style={{ paddingLeft: 40, opacity: legendReveal }}>
          <LegendStrip />
        </div>
      </div>

      {/* hero_bottom: 3-line message + URL */}
      <div className="absolute" style={{ left: 80, top: 1050, width: 920 }}>
        <div
          className="font-display text-text-primary"
          style={{
            fontSize: 28,
            lineHeight: 1.4,
            fontWeight: 600,
            opacity: msg1Reveal,
            transform: `translateY(${(1 - msg1Reveal) * 8}px)`,
          }}
        >
          {brandHonest.threeLine[0]}
        </div>
        <div
          className="font-display text-text-primary"
          style={{
            fontSize: 28,
            lineHeight: 1.4,
            opacity: msg2Reveal,
            transform: `translateY(${(1 - msg2Reveal) * 8}px)`,
          }}
        >
          {brandHonest.threeLine[1]}
        </div>
        <div
          className="font-display text-text-primary"
          style={{
            fontSize: 28,
            lineHeight: 1.4,
            opacity: msg3Reveal,
            transform: `translateY(${(1 - msg3Reveal) * 8}px)`,
          }}
        >
          {brandHonest.threeLine[2]}
        </div>
        <div
          className="mt-5 font-mono text-text-tertiary"
          style={{ fontSize: 18, letterSpacing: "0.08em", opacity: urlReveal }}
        >
          {brandHonest.url}
        </div>
      </div>

      {/* Signature bottom row */}
      <div
        className="absolute flex justify-end"
        style={{ left: 80, right: 80, bottom: 40 }}
      >
        <CreatorSignature
          variant="compact"
          placement="inline"
          entranceProgress={signatureEntranceProgress}
          pulseProgress={signaturePulseProgress}
        />
      </div>
    </CanvasShell>
  );
}

function Landscape() {
  return (
    <CanvasShell width={1280} height={640}>
      {/* Left column: eyebrow + headline + 3-line + url */}
      <div className="absolute" style={{ left: 80, top: 64, width: 660 }}>
        <div
          className="font-mono uppercase tracking-[0.20em] text-accent-cyan"
          style={{ fontSize: 22 }}
        >
          {brandHonest.eyebrowHero}
        </div>
        <h1
          className="mt-7 font-display font-semibold text-text-primary"
          style={{ fontSize: 64, lineHeight: 1.06, letterSpacing: "-0.015em" }}
        >
          Most stock factor
          <br />
          models look smarter
          <br />
          than they really are.
        </h1>
        <div className="mt-10">
          {brandHonest.threeLine.map((line, i) => (
            <div
              key={i}
              className="font-display text-text-primary"
              style={{ fontSize: 22, lineHeight: 1.4, fontWeight: i === 0 ? 600 : 400 }}
            >
              {line}
            </div>
          ))}
        </div>
        <div
          className="mt-7 font-mono text-text-tertiary"
          style={{ fontSize: 16, letterSpacing: "0.06em" }}
        >
          {brandHonest.url}
        </div>
      </div>

      {/* Right column: compact decomp metaphor */}
      <div className="absolute" style={{ right: 80, top: 64, width: 420 }}>
        <div
          className="font-mono uppercase tracking-[0.20em] text-text-tertiary"
          style={{ fontSize: 20 }}
        >
          What "R² = 0.66" contains
        </div>

        <div className="mt-6">
          <DecompBar segments={standardBarSegments} height={48} radius={8} />
          <div
            className="mt-3 font-mono uppercase tracking-[0.18em] text-text-secondary"
            style={{ fontSize: 18 }}
          >
            standard  →  looks 66 % explained
          </div>
        </div>

        <div className="mt-7">
          <HonestBar reveals={[1, 1, 1, 1]} height={48} radius={8} />
          <div
            className="mt-3 font-mono uppercase tracking-[0.18em] text-text-secondary"
            style={{ fontSize: 18 }}
          >
            honest  →  ~17 % direct, ~33 % may be mirror
          </div>
        </div>

        <div className="mt-7">
          <LegendStrip fontSize={16} />
        </div>
      </div>

      {/* Signature bottom-right */}
      <div className="absolute" style={{ right: 80, bottom: 32 }}>
        <CreatorSignature variant="minimal" placement="inline" />
      </div>
    </CanvasShell>
  );
}
