// Funnel — a multi-stage process where an ABSOLUTE measured quantity DROPS OFF stage to stage
// (conversion funnels, pipeline yield, hiring funnels, retention cohorts). The narrowing
// magnitude + the per-stage drop-off ARE the story. PL-3.3.
//
//   funnel (default): stages as horizontal bands stacked vertically and CENTERED, each band's
//     width ∝ its value, with fill-only taper-wall polygons between consecutive bands → the
//     iconic funnel silhouette.
//   bars (mode knob): the same bands LEFT-anchored at LABEL_COL, no taper walls — a sorted
//     attrition list with more label room. Same plan/scale/caps/drop-off/motion.
//
// All layout comes from planFunnel (src/lib/funnel.ts) — the pure brain shared with the check
// suite. Geometry is a pure function of DATA, never `t` (C9): each band's final x/y/w/h is fixed
// by the plan and constant across the timeline. The funnel is ONE connected silhouette, so it
// builds via ONE eased leading edge descending top→down (memory feedback-continuous-edge-growth);
// each band's reveal is a per-band clip-rect whose height grows from the band's TOP (paint-only —
// the band's full geometry never moves). At settle the clip is OMITTED (the rect paints in full —
// never a 0.9997-height clip). Per-band value count-up via countup.ts; the drop-off % between two
// bands appears only after BOTH settle. Props default to t=1 (settled/static) so Path B can import
// and call it without animation; the <2-stage fallback is a caption-only panel.
//
// Source-pixel viewBox (1000×714 ≈ 7/5) scaled to the Panel content box inside the PL-0.8 overflow box,
// exactly like BarChart/Divergence — the inspector reads viewBox coordinates as the single
// deterministic system. The box is aspect-matched (aspect-[500/357]) so the funnel fills the panel
// with ~zero letterbox (Fix 3).
// Spec: planning/primitive-library/handoffs/PL-3.3-funnel.md §2.5 / §2.7, PM §3 (cap 5,
// label ALWAYS "above").

import { useId } from "react";
import type { Accent } from "@/posts/renderTypes";
import { colors } from "@/tokens/design";
import { planCountUp } from "@/lib/countup";
import {
  planFunnel,
  bandReveal,
  type FunnelStageInput,
  type FunnelMode,
  type PlannedBand,
  type PlannedDrop,
  VIEW_W,
  VIEW_H,
  BAND_RADIUS,
  TAPER_OPACITY,
  STAGE_LABEL_PX,
  VALUE_LABEL_PX,
  DROP_LABEL_PX,
  DROP_FADE_DUR,
} from "@/lib/funnel";

const accentHex = (a: string): string => colors.accent[a as Accent] ?? colors.accent.cyan;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const DROP_COLOR = colors.accent.burnt; // friction accent — attrition is the friction in the funnel

type Props = {
  stages: FunnelStageInput[];
  mode?: FunnelMode;
  unit?: string;
  dropLabels?: "auto" | "off";
  accent?: Accent;
  caption?: string;
  t?: number;
};

export function Funnel({ stages, mode = "funnel", unit, dropLabels = "auto", accent = "cyan", caption, t = 1 }: Props) {
  const uid = useId();
  const plan = planFunnel(stages, mode, unit, accent, dropLabels);

  // C2 — caption-only fallback (<2 renderable stages). A single stage can't express attrition; a
  // "no data" string reads as a bug in a published video (PL-3.2 empty-state ruling, §3 ruling 2).
  if (plan.fallback) {
    return (
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-full w-full"
        role="img"
        aria-label={caption ?? "process funnel"}
        data-funnel
        data-funnel-mode={plan.mode}
        data-funnel-empty
      />
    );
  }

  const frameOn = clamp01((t - 0.24) / 0.06); // panel/frame appear (Beat 1)

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full"
      role="img"
      aria-label={caption ?? "process funnel"}
      data-funnel
      data-funnel-mode={plan.mode}
    >
      {/* Taper walls (funnel mode only) — fill-only low-opacity polygons connecting band i's bottom
          edge to band i+1's top edge. They reveal with the SAME descending edge as the band below. */}
      {plan.mode === "funnel" &&
        plan.bands.slice(0, -1).map((band, i) => {
          const next = plan.bands[i + 1];
          return <TaperWall key={`${uid}-w${i}`} from={band} to={next} t={t} />;
        })}

      {/* Bands — each reveals via a per-band clip whose height grows top→down (paint-only). */}
      {plan.bands.map((band) => (
        <Band key={`${uid}-b${band.index}`} band={band} mode={plan.mode} uid={uid} t={t} frameOn={frameOn} />
      ))}

      {/* Drop-off % labels — friction accent, between consecutive bands, after both settle. */}
      {plan.drops.map((drop) =>
        drop.show ? <DropLabel key={`${uid}-d${drop.fromIndex}`} drop={drop} t={t} /> : null,
      )}
    </svg>
  );
}

// ── A stage band ──────────────────────────────────────────────────────────────────────────────
function Band({
  band,
  mode,
  uid,
  t,
  frameOn,
}: {
  band: PlannedBand;
  mode: FunnelMode;
  uid: string;
  t: number;
  frameOn: number;
}) {
  // Continuous-edge reveal: the band fills from its TOP as the descending edge crosses it. g is the
  // visible fraction of the band height. At settle (g >= 1) the clip is OMITTED — the rect paints
  // in full (never a 0.9997-height clip), so t=1 rasterizes identical to a static SVG (C12).
  const g = bandReveal(t, band.yTop, band.bandH);
  const settled = g >= 1;
  const clipId = `${uid}-clip-${band.index}`;
  const fill = accentHex(band.accentKey);

  // Value count-up runs over the band's fill window [bandStart, bandSettle]; the label fades in as
  // the band completes (ending exactly at settle → opacity 1, so t=1 shows the final string).
  const fillSpan = Math.max(1e-6, band.bandSettle - band.bandStart);
  const countP = clamp01((t - band.bandStart) / fillSpan);
  const valueFade = clamp01((t - (band.bandSettle - 0.06)) / 0.06);
  // Stage label rides the frame (declared with the panel), opacity-only.
  const labelOpacity = frameOn;

  // Count-up display string (numeric → counts; non-numeric valueText → static/fade).
  let valueDisplay = band.valueText;
  if (band.valueCountText) {
    const cup = planCountUp(band.valueCountText);
    valueDisplay = cup.animate ? cup.display(countP) : band.valueText;
  }

  const cx = band.cx;

  return (
    <g data-funnel-band={band.index} data-funnel-band-w={band.paintedW.toFixed(2)} data-funnel-clamp={band.monotonicClampApplied ? "1" : "0"}>
      {/* Clip-rect grows from the band TOP downward — REVEALS the already-final-geometry band
          (paint-only). Geometry of the band rect itself never changes (C9). The <defs>/<clipPath>
          are ALWAYS mounted (so the SVG node count is constant across t — nothing mounts/unmounts,
          C9); only the rect's `clipPath` reference is OMITTED once settled (so getComputedStyle
          reports clipPath:"none" and t=1 rasterizes identical to a static SVG, C12). */}
      <defs>
        <clipPath id={clipId}>
          <rect x={band.xLeft} y={band.yTop} width={band.paintedW} height={Math.max(0, band.bandH * g)} />
        </clipPath>
      </defs>
      <rect
        x={band.xLeft}
        y={band.yTop}
        width={band.paintedW}
        height={band.bandH}
        rx={BAND_RADIUS}
        fill={fill}
        clipPath={settled ? undefined : `url(#${clipId})`}
        data-funnel-rect
      />

      {/* Stage label — ALWAYS above the band (PM §3). funnel: centered above; bars: right-anchored
          in the left column at its vertical center. */}
      {band.showLabel &&
        (mode === "bars" ? (
          <text
            x={300}
            y={band.yTop + band.bandH / 2 + 8}
            textAnchor="end"
            fill={colors.text.primary}
            fontFamily="'Space Grotesk', sans-serif"
            fontSize={STAGE_LABEL_PX}
            fontWeight={500}
            opacity={labelOpacity}
            data-funnel-label
          >
            {band.label}
          </text>
        ) : (
          <text
            x={cx}
            y={band.yTop - 8}
            textAnchor="middle"
            fill={colors.text.primary}
            fontFamily="'Space Grotesk', sans-serif"
            fontSize={STAGE_LABEL_PX}
            fontWeight={500}
            opacity={labelOpacity}
            data-funnel-label
          >
            {band.label}
          </text>
        ))}

      {/* Value label — the hero number, centered INSIDE the band; fades in as the band completes. */}
      {band.showValue && (
        <text
          x={mode === "bars" ? band.xLeft + 16 : cx}
          y={band.yTop + band.bandH / 2 + VALUE_LABEL_PX / 3}
          textAnchor={mode === "bars" ? "start" : "middle"}
          fill={colors.bg.deepInk}
          fontFamily="'JetBrains Mono', monospace"
          fontSize={VALUE_LABEL_PX}
          fontWeight={600}
          opacity={valueFade}
          data-funnel-value
        >
          {valueDisplay}
        </text>
      )}
    </g>
  );
}

// ── Taper wall (funnel mode) ────────────────────────────────────────────────────────────────────
function TaperWall({ from, to, t }: { from: PlannedBand; to: PlannedBand; t: number }) {
  // The wall connects band `from`'s bottom edge to band `to`'s top edge. It reveals with the SAME
  // descending edge as the band below it (paint-only: a clip from its top), so the silhouette draws
  // as one continuous edge. Fill-only (PM §3 minor note: no invented stroke), low-opacity accent.
  const points = [
    `${from.cx - from.paintedW / 2},${from.yBottom}`,
    `${from.cx + from.paintedW / 2},${from.yBottom}`,
    `${to.cx + to.paintedW / 2},${to.yTop}`,
    `${to.cx - to.paintedW / 2},${to.yTop}`,
  ].join(" ");

  // Reveal the wall as the edge crosses the gap between the two bands.
  const gapTop = from.yBottom;
  const gapH = Math.max(1e-6, to.yTop - from.yBottom);
  const g = bandReveal(t, gapTop, gapH);
  const opacity = g <= 0 ? 0 : TAPER_OPACITY;

  return (
    <polygon
      points={points}
      fill={accentHex(from.accentKey)}
      opacity={opacity}
      data-funnel-wall
    />
  );
}

// ── Drop-off % label ────────────────────────────────────────────────────────────────────────────
function DropLabel({ drop, t }: { drop: PlannedDrop; t: number }) {
  // Appears only after BOTH adjacent bands settle (drop.revealT), then a short fade (§2.5.3).
  const opacity = clamp01((t - drop.revealT) / DROP_FADE_DUR);
  // Placement comes from the plan (§2.5.1 Fix 1): funnel mode right-anchors in the right gutter at
  // PLOT_X1 (textAnchor="end") so it never stacks on the CX-centered stage label of the band below;
  // bars mode starts to the right of the upper band's right edge.
  return (
    <text
      x={drop.cx}
      y={drop.cy + DROP_LABEL_PX / 3}
      textAnchor={drop.anchor}
      fill={DROP_COLOR}
      fontFamily="'JetBrains Mono', monospace"
      fontSize={DROP_LABEL_PX}
      fontWeight={600}
      opacity={opacity}
      data-funnel-drop
    >
      {drop.text}
    </text>
  );
}
