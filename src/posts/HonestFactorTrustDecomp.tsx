// Spec 2 — Trust Decomposition (honest_factor_trust_decomp_v1)
// Portrait 1080×1350. Two-panel comparison: Traditional R² vs Honest decomposition.
// Callout arrow points to the orange (mirror-suspect) segment.
//
// Color Role Plan:
//   primary    systemCyan       → Traditional R² bar (single block, undecomposed)
//   warm       frictionOrange   → DERIVED / sector-mirror (the friction insight)
//   diff       strategicViolet  → STATISTICAL middle-trust segment
//   state      successMint      → DIRECT (the part we can honestly defend)
//   neutral    taupe @ 22%      → unexplained / idiosyncratic

import { CreatorSignature } from "@/components/primitives/CreatorSignature";
import { DecompBar, type DecompSegment } from "@/components/primitives/DecompBar";
import { dukDecomp, trustColors } from "./honestFactor.data";

const traditionalSegments: DecompSegment[] = [
  {
    width: dukDecomp.standardR2,
    color: trustColors.systemCyan,
    label: `R² = ${dukDecomp.standardR2.toFixed(3)}`,
    labelInside: true,
    labelSize: 40,
  },
  {
    width: dukDecomp.segments.unexplained,
    color: trustColors.unexplained,
    label: dukDecomp.segments.unexplained.toFixed(3),
    labelInside: true,
    labelColor: "rgba(244,241,234,0.65)",
    labelSize: 24,
    labelWeight: 400,
  },
];

const honestSegments: DecompSegment[] = [
  { width: dukDecomp.segments.direct, color: trustColors.direct },
  { width: dukDecomp.segments.statistical, color: trustColors.statistical },
  { width: dukDecomp.segments.derived, color: trustColors.derived },
  { width: dukDecomp.segments.unexplained, color: trustColors.unexplained },
];

function CanvasShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative overflow-hidden bg-bg-warm-graphite text-text-primary"
      style={{ width: 1080, height: 1350, aspectRatio: "1080 / 1350" }}
    >
      <div className="pointer-events-none absolute inset-0 bg-grid-faint bg-grid" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 75% 55% at 90% 0%, rgba(231,169,90,0.12), transparent 60%), radial-gradient(ellipse 100% 100% at 50% 110%, rgba(0,0,0,0.45), transparent 60%)",
        }}
      />
      {children}
    </div>
  );
}

function Panel({
  x,
  y,
  w,
  h,
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute overflow-hidden rounded-[16px] bg-bg-soft-panel/85"
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        boxShadow:
          "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 0 0 1px rgba(244,241,234,0.06), 0 18px 40px -28px rgba(0,0,0,0.7)",
      }}
    >
      {/* per-panel subtle copper corner-glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 60% at 95% 0%, rgba(231,169,90,0.10), transparent 60%)",
        }}
      />
      {children}
    </div>
  );
}

export function HonestFactorTrustDecompPost() {
  return (
    <CanvasShell>
      {/* Headline + asset stamp */}
      <div className="absolute" style={{ left: 80, top: 96, width: 920 }}>
        <h1
          className="font-display font-semibold text-text-primary"
          style={{ fontSize: 60, lineHeight: 1.08, letterSpacing: "-0.015em" }}
        >
          When R² hides where
          <br />
          the explanation comes from.
        </h1>
        <div
          className="mt-5 font-mono uppercase tracking-[0.18em] text-text-tertiary"
          style={{ fontSize: 22 }}
        >
          {dukDecomp.ticker} (Duke Energy) · window ending {dukDecomp.windowEnd}
        </div>
      </div>

      {/* Top panel — Traditional R² */}
      <Panel x={80} y={280} w={920} h={380}>
        <div className="absolute" style={{ left: 40, top: 36, right: 40 }}>
          <div
            className="font-display font-semibold text-text-primary"
            style={{ fontSize: 26, letterSpacing: "-0.01em" }}
          >
            Traditional R²
          </div>
          <div
            className="mt-2 font-mono uppercase tracking-[0.18em] text-text-tertiary"
            style={{ fontSize: 20 }}
          >
            What you usually see
          </div>
        </div>
        <div className="absolute" style={{ left: 80, top: 156, right: 80 }}>
          <DecompBar segments={traditionalSegments} height={88} radius={16} />
        </div>
        <div className="absolute" style={{ left: 40, top: 320, right: 40 }}>
          <div
            className="font-display italic text-text-secondary"
            style={{ fontSize: 22, lineHeight: 1.3 }}
          >
            "DUK looks 66 % explained. Probably a high-quality fit."
          </div>
        </div>
      </Panel>

      {/* Bottom panel — Honest decomposition */}
      <Panel x={80} y={700} w={920} h={380}>
        <div className="absolute" style={{ left: 40, top: 36, right: 40 }}>
          <div
            className="font-display font-semibold text-text-primary"
            style={{ fontSize: 26, letterSpacing: "-0.01em" }}
          >
            Honest decomposition
          </div>
          <div
            className="mt-2 font-mono uppercase tracking-[0.18em] text-text-tertiary"
            style={{ fontSize: 20 }}
          >
            How much can we honestly defend?
          </div>
        </div>
        <div className="absolute" style={{ left: 80, top: 156, right: 80 }}>
          <DecompBar segments={honestSegments} height={88} radius={16} />
        </div>
        {/* Segment labels below */}
        <SegmentLabels />
        {/* Arrow callout */}
        <ArrowCallout />
      </Panel>

      {/* Takeaway */}
      <div className="absolute" style={{ left: 80, top: 1108, width: 920 }}>
        <div
          className="font-display font-semibold text-text-primary"
          style={{ fontSize: 28, lineHeight: 1.32 }}
        >
          Same asset. Same data.
        </div>
        <div
          className="mt-2 font-display text-text-secondary"
          style={{ fontSize: 24, lineHeight: 1.32 }}
        >
          Half the apparent R² may be the model
          <br />
          explaining DUK with a basket that contains DUK.
        </div>
      </div>

      {/* Signature in its own bottom row */}
      <div className="absolute flex justify-end" style={{ left: 80, right: 80, bottom: 32 }}>
        <CreatorSignature variant="compact" placement="inline" />
      </div>
    </CanvasShell>
  );
}

function SegmentLabels() {
  // Single horizontal legend row below the bar — bar segments are too narrow
  // (especially DIRECT at 17.3% × 760px = 131px) to hold their own labels
  // centered. The single-row legend with color-coded text + middle-dot
  // separators is mobile-readable AND keeps the bar visually clean.
  const segs = dukDecomp.segments;
  const items = [
    {
      label: "DIRECT",
      value: segs.direct.toFixed(3),
      color: trustColors.direct,
    },
    {
      label: "+ STAT",
      value: `+${segs.statistical.toFixed(3)}`,
      color: trustColors.statistical,
    },
    {
      label: "+ DERIVED",
      value: `+${segs.derived.toFixed(3)}`,
      color: trustColors.derived,
    },
    {
      label: "noise",
      value: segs.unexplained.toFixed(3),
      color: "rgba(184,178,167,0.85)",
    },
  ];

  return (
    <div
      className="absolute flex items-center justify-center gap-5"
      style={{ left: 40, top: 256, width: 840 }}
    >
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-4">
          {i > 0 && (
            <span
              className="font-mono text-text-tertiary"
              style={{ fontSize: 18 }}
            >
              ·
            </span>
          )}
          <div className="flex items-center gap-2.5">
            <span
              className="inline-block shrink-0"
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                backgroundColor: it.color,
                boxShadow: `0 0 8px ${it.color}55`,
              }}
            />
            <span
              className="font-mono uppercase tracking-[0.10em]"
              style={{ fontSize: 18, color: it.color, whiteSpace: "nowrap" }}
            >
              {it.label} {it.value}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ArrowCallout() {
  // Inside the bottom panel (which is at y=700-1080, x=80-1000 in canvas coords).
  // The bar (after panel padding 80) is at x_panel=80..840 inside panel.
  // The DERIVED (orange) segment starts at x_panel = 80 + (0.169+0.160)*760
  //   = 80 + 250 = 330, ends at 330 + 0.330*760 = 330 + 250.8 = 580.8
  //   mid_x_panel ≈ 455
  // Bar top y_panel = 156, bar bottom y_panel = 244
  // Arrow goes from a callout box BELOW the segment labels UP to the bar.
  //
  // We position the callout box at bottom-right of the panel and draw an SVG
  // arrow that originates from the callout's top edge and terminates at the
  // bar's bottom edge above the orange segment.
  return (
    <>
      {/* SVG arrow inside panel */}
      <svg
        className="pointer-events-none absolute"
        style={{ left: 0, top: 0, width: 920, height: 380 }}
        viewBox="0 0 920 380"
      >
        {/* Curve from callout top-left (around x=545, y=312) to bar bottom (455, 245) */}
        <path
          d="M 545 312 C 530 290, 480 270, 455 254"
          fill="none"
          stroke={trustColors.derived}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        {/* Arrowhead triangle */}
        <polygon
          points="455,244 463,256 449,258"
          fill={trustColors.derived}
        />
      </svg>
      {/* Callout box */}
      <div
        className="absolute rounded-[12px] bg-bg-midnight-slate/85"
        style={{
          left: 530,
          top: 312,
          width: 380,
          padding: "14px 18px",
          boxShadow:
            "0 0 0 1px rgba(217,134,77,0.35), 0 8px 18px -10px rgba(217,134,77,0.45)",
        }}
      >
        <div
          className="font-mono uppercase tracking-[0.12em] text-accent-burnt"
          style={{ fontSize: 20, lineHeight: 1.35, fontWeight: 600 }}
        >
          49 % of explained R²
          <br />
          is sector-mirror
        </div>
        <div
          className="mt-1 font-mono text-text-secondary"
          style={{ fontSize: 16, letterSpacing: "0.06em" }}
        >
          (DUK is in XLU)
        </div>
      </div>
    </>
  );
}
