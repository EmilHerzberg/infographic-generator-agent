// RangeBars — two-lane horizontal range visualization on a shared date axis.
// Top lane and bottom lane each render N entries; each entry = labeled bar
// spanning [entry.start, entry.end] on the year axis.
//
// PL-4.3 retrofit: this is now a THIN PAINTER over the pure planRanges brain (src/lib/ranges.ts) —
// year→x scale, per-entry bar geometry, label fit-or-hide, the maxYear≤minYear guard, axis derivation,
// openEnd handling, marketLine x, and the defensive clamps all live in the planner; this component only
// paints what the plan describes. The external prop interface is PRESERVED (PostRenderer + Path B's
// IncentivesVsTimelines pass topEntries/bottomEntries/minYear/maxYear/marketLine/*Reveal unchanged), and
// the painted output is BYTE-IDENTICAL to the pre-retrofit code (gated by tools/qa-ranges.mjs against a
// captured baseline). Numbered constraints C1–C9 are declared in src/lib/ranges.ts.
//
// Internal bounding boxes (source pixels, viewBox 1000×560):
//   top group label:     x  20  y  18   w 280 h  34   (mono uppercase, 26px == text.eyebrow)
//   top bars (×3):       x 320  y  50–180  w varies h 32  (label left x 0–300)
//   axis baseline + ticks: x 320  y 200   w 660 h  40
//   market-consensus line: vertical dashed at year=marketLine, full height
//   bottom group label:  x  20  y 260   w 280 h  34
//   bottom bars (×3):    x 320  y 300–430  w varies h 32  (label left x 0–300)
//   axis tick labels:    x 320  y 240   w 660 h  24
// Spacing minimums: ≥40px between text and visual; ≥24px between row labels.

import { useContext, useId } from "react";
import type { AccentKey } from "@/content/schema";
import { colors, text, chartVScale } from "@/tokens/design";
import { FormatContext } from "@/components/layout/formatContext";
import { planRanges, laneItemOpacity, clampTickLabelX, type RangesPlanEntry } from "@/lib/ranges";
import { appear } from "@/lib/reveal";

const accentToColor: Record<AccentKey, string> = {
  cyan: colors.accent.cyan,
  amber: colors.accent.amber,
  violet: colors.accent.violet,
  mint: colors.accent.mint,
  burnt: colors.accent.burnt,
};

export type RangeEntry = {
  id: string;
  label: string;
  start: number;
  end: number;
  openEnd?: boolean;
};

type Props = {
  topGroupLabel: string;
  bottomGroupLabel: string;
  topEntries: RangeEntry[];
  bottomEntries: RangeEntry[];
  topAccent: AccentKey;
  bottomAccent: AccentKey;
  minYear: number;
  maxYear: number;
  marketLine?: { year: number; label: string };
  axisReveal?: number;
  topLaneReveal?: number;
  bottomLaneReveal?: number;
  marketLineReveal?: number;
  /** Global progress 0..1 — fills any OMITTED reveal prop via the standard schedule (so Path B can just pass t). Explicit props win. */
  t?: number;
  caption?: string;
};

export function RangeBars({
  topGroupLabel,
  bottomGroupLabel,
  topEntries,
  bottomEntries,
  topAccent,
  bottomAccent,
  minYear,
  maxYear,
  marketLine,
  axisReveal: axisRevealProp,
  topLaneReveal: topLaneRevealProp,
  bottomLaneReveal: bottomLaneRevealProp,
  marketLineReveal: marketLineRevealProp,
  t = 1,
  caption,
}: Props) {
  // Strategy A t-fallback: an omitted reveal prop derives from the global t via the SAME appear(t,start,dur) schedule PostRenderer passes explicitly; explicit props override (byte-identical for Path A), and at the default t=1 every fallback is exactly 1 (settled — backward compatible).
  const axisReveal = axisRevealProp ?? appear(t, 0.3, 0.3);
  const topLaneReveal = topLaneRevealProp ?? appear(t, 0.2, 0.5);
  const bottomLaneReveal = bottomLaneRevealProp ?? appear(t, 0.45, 0.5);
  const marketLineReveal = marketLineRevealProp ?? appear(t, 0.72, 0.28);

  const uid = useId();

  // The pure brain — all geometry/clamps/scale/label-fit decided ONCE, from DATA only (never reveal).
  // Vertical-fill (Emil's format-bench feedback): stretch the two-lane geometry + scale type on the
  // tall aspect so the block differs per format instead of rendering identically everywhere.
  const vScale = chartVScale(useContext(FormatContext));
  const plan = planRanges({
    topGroupLabel,
    bottomGroupLabel,
    topEntries,
    bottomEntries,
    topAccent,
    bottomAccent,
    minYear,
    maxYear,
    marketLine,
    vScale,
  });
  const G = plan.vgeom;

  const width = 1000;
  const height = G.VIEW_H;
  const barHeight = G.BAR_HEIGHT;
  const axisY = G.AXIS_Y;
  const fs = G.fontScale;

  const topColor = accentToColor[plan.topAccent];
  const bottomColor = accentToColor[plan.bottomAccent];
  const violetColor = colors.accent.violet;

  const renderLane = (
    entries: RangesPlanEntry[],
    laneReveal: number,
    color: string,
    prefix: string,
  ) =>
    entries.map((e, i) => {
      const opacity = laneItemOpacity(laneReveal, i, entries.length);
      return (
        <g key={`${uid}-${prefix}-${e.id}`} opacity={opacity} data-ranges-group={`${prefix}-row-${i}`}>
          {e.showLabel && (
            <text
              data-ranges-rowlabel=""
              x={plan.barAreaX - 20}
              y={e.labelY}
              textAnchor="end"
              fill={colors.text.primary}
              fontFamily="'Space Grotesk', sans-serif"
              fontSize={22 * fs}
              fontWeight={500}
            >
              {e.label}
            </text>
          )}
          <rect
            data-ranges-bar=""
            x={e.x}
            y={e.y}
            width={e.w}
            height={barHeight}
            rx={6}
            fill={color}
            opacity={0.85}
            style={{ filter: `drop-shadow(0 0 10px ${color}66)` }}
          />
          {e.openEnd && (
            <text
              x={e.openEndX}
              y={e.labelY}
              fill={color}
              fontFamily="'Space Grotesk', sans-serif"
              fontSize={22 * fs}
              fontWeight={600}
            >
              +
            </text>
          )}
        </g>
      );
    });

  return (
    <svg
      data-ranges=""
      viewBox={`0 0 ${width} ${height}`}
      className="block h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={caption ?? "two-group range comparison on date axis"}
    >
      {/* Top group label */}
      <text
        data-ranges-grouplabel="top"
        x={20}
        y={G.TOP_LABEL_Y}
        fill={topColor}
        fontFamily="'JetBrains Mono', monospace"
        fontSize={text.eyebrow * fs}
        fontWeight={600}
        letterSpacing="0.22em"
      >
        {plan.topGroupLabel}
      </text>

      {/* Top lane bars */}
      {renderLane(plan.topEntries, topLaneReveal, topColor, "top")}

      {/* Date axis baseline */}
      <g opacity={axisReveal} data-ranges-group="axis">
        <line
          x1={plan.barAreaX}
          x2={plan.barAreaX + plan.barAreaW * axisReveal}
          y1={axisY}
          y2={axisY}
          stroke="rgba(184,178,167,0.30)"
          strokeWidth={1.5}
        />
        {plan.ticks.map((t) => {
          const x = plan.yearToX(t);
          const visible = axisReveal > 0.5 ? 1 : 0;
          return (
            <g key={`${uid}-tick-${t}`} opacity={visible}>
              <line
                x1={x}
                x2={x}
                y1={axisY - 4}
                y2={axisY + 4}
                stroke="rgba(184,178,167,0.30)"
                strokeWidth={1.5}
              />
              <text
                x={clampTickLabelX(t, plan.yearToX, String(t), fs)}
                y={axisY + 28}
                textAnchor="middle"
                fill={colors.text.tertiary}
                fontFamily="'JetBrains Mono', monospace"
                fontSize={text.axisLabel * fs}
                letterSpacing="0.14em"
              >
                {t}
              </text>
            </g>
          );
        })}
      </g>

      {/* Bottom group label */}
      <text
        data-ranges-grouplabel="bottom"
        x={20}
        y={G.BOTTOM_LABEL_Y}
        fill={bottomColor}
        fontFamily="'JetBrains Mono', monospace"
        fontSize={text.eyebrow * fs}
        fontWeight={600}
        letterSpacing="0.22em"
      >
        {plan.bottomGroupLabel}
      </text>

      {/* Bottom lane bars */}
      {renderLane(plan.bottomEntries, bottomLaneReveal, bottomColor, "bot")}

      {/* Market consensus line (violet, dashed, full height) */}
      {plan.marketLine && (
        <g opacity={marketLineReveal} data-ranges-group="marketLine">
          {/* Line + label ys ride the vScale geometry: the label block sits BELOW the stretched
              bottom lane (it collided with the lane bars when only the lanes scaled). */}
          <line
            data-ranges-marketline=""
            x1={plan.marketLine.x}
            x2={plan.marketLine.x}
            y1={Math.round(20 * (G.VIEW_H / 560))}
            y2={Math.round(460 * (G.VIEW_H / 560))}
            stroke={violetColor}
            strokeWidth={2}
            strokeDasharray="6 6"
            opacity={0.85}
            style={{ filter: `drop-shadow(0 0 8px ${violetColor}66)` }}
          />
          <text
            x={plan.marketLine.labelX}
            textAnchor={plan.marketLine.labelAnchor}
            y={Math.round(490 * (G.VIEW_H / 560))}
            fill={violetColor}
            fontFamily="'JetBrains Mono', monospace"
            fontSize={text.axisLabel * fs}
            fontWeight={600}
            letterSpacing="0.18em"
          >
            {plan.marketLine.label.toUpperCase()}
          </text>
          <text
            x={plan.marketLine.labelX}
            textAnchor={plan.marketLine.labelAnchor}
            y={Math.round(518 * (G.VIEW_H / 560))}
            fill={colors.text.secondary}
            fontFamily="'JetBrains Mono', monospace"
            fontSize={20 * fs}
            letterSpacing="0.12em"
          >
            {plan.marketLine.year}
          </text>
        </g>
      )}
    </svg>
  );
}
