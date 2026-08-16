// BarChart — comparison of N labelled magnitudes on one 0-anchored value axis. PL-2.1, opens
// Epic PL-2 (the chart family). The workhorse "which is bigger, by how much" chart.
//
//   simple (default): one value per category.
//   grouped (mode knob): ≤4 series side-by-side per category (the same things across conditions).
//   stacked (mode knob): ≤5 ordered segments showing what each category's TOTAL is made of.
//   vertical (default) | horizontal (orientation knob): long category labels read better horizontal.
//
// All layout comes from planBars (src/lib/bars.ts) — the pure brain shared with the check suite.
// Geometry is a pure function of DATA, never `t` (C9): each bar's final x/y/w/h is fixed by the
// plan and constant across the timeline. Bars are DISCONNECTED → a per-bar overlapping stagger
// (the ClaimList/TierStack pop), each growing from the baseline. The grow is a baseline-anchored
// CSS `style.transform` (§3 ruling 1: a matrix getComputedStyle can read), OMITTED at settle
// (never scale(1) — the LC3/C12 transform-discipline rule), so the gate's parseMatrix reads it.
// A stacked bar's segments are connected, so the whole stacked column grows as ONE transform on
// the bar <g>. Props default to t=1 (settled/static) so Path B can import it without animation.
//
// Source-pixel viewBox (1000×640) scaled to the Panel content box, exactly like Divergence — the
// inspector reads viewBox coordinates as the single deterministic system.
// Spec: planning/primitive-library/handoffs/PL-2.1-bar-chart.md §2.5 / §2.7.

import { useContext, useId } from "react";
import type { Accent } from "@/posts/renderTypes";
import { colors, stroke, chartVScale } from "@/tokens/design";
import { FormatContext } from "@/components/layout/formatContext";
import { planCountUp } from "@/lib/countup";
import {
  planBars,
  barsVGeom,
  barGrow,
  labelStart,
  refLineReveal,
  formatTick,
  type BarCategoryInput,
  type BarMode,
  type BarOrientation,
  type ReferenceLineInput,
  type PlannedBar,
  type PlannedRect,
  type BarsPlan,
  VIEW_W,
  PLOT_X0_V,
  PLOT_X1_V,
  PLOT_X0_H,
  PLOT_X1_H,
  LABEL_ANCHOR_X,
  VALUE_LABEL_PX,
  CAT_LABEL_PX,
  REF_LINE_STROKE,
  REF_LABEL_PX,
} from "@/lib/bars";

const accentHex = (a: string): string => colors.accent[a as Accent] ?? colors.accent.cyan;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const GRID_COLOR = "rgba(184,178,167,0.30)";
// PL-4.2 referenceLine — NEUTRAL (a reference, not a data accent; the neutral-connector discipline).
const REF_LINE_COLOR = colors.text.tertiary; // #8D93A1 — sat ≈0.12 (never reads as an accent)
const REF_LABEL_COLOR = colors.text.secondary;

type Props = {
  categories: BarCategoryInput[];
  mode?: BarMode;
  orientation?: BarOrientation;
  valueLabels?: "auto" | "off";
  sort?: "none" | "desc" | "asc";
  seriesLabels?: string[];
  seriesAccents?: Accent[];
  axisMin?: number;
  axisMax?: number;
  unit?: string;
  referenceLine?: ReferenceLineInput;
  caption?: string;
  t?: number;
};

export function BarChart({
  categories,
  mode = "simple",
  orientation = "vertical",
  valueLabels = "auto",
  sort = "none",
  seriesLabels,
  seriesAccents,
  axisMin,
  axisMax,
  unit,
  referenceLine,
  caption,
  t = 1,
}: Props) {
  const uid = useId();
  // Vertical-fill (Emil's 9:16 feedback): stretch every plot y-coordinate + the viewBox height on the tall
  // aspect so the bars/spacing fill the frame. The SAME vScale drives the plan (bar rects) AND the axis/label
  // geometry below — read from FormatContext, 1 on portrait/square (byte-identical, checks never pass it).
  const vScale = chartVScale(useContext(FormatContext));
  const V = barsVGeom(vScale);
  const plan = planBars({ categories, mode, orientation, valueLabels, sort, seriesLabels, seriesAccents, axisMin, axisMax, unit, referenceLine, vScale });

  const frameOn = clamp01((t - 0.26) / 0.08); // panel/axis/legend/category labels appear

  const isV = plan.orientation === "vertical";
  const plotX0 = isV ? PLOT_X0_V : PLOT_X0_H;
  const plotX1 = isV ? PLOT_X1_V : PLOT_X1_H;

  // viewBox px position of a value along the value axis (for gridlines + ticks).
  const span = plan.axisMax - plan.axisMin || 1;
  const growLen = isV ? V.BASELINE_Y - V.PLOT_Y0 : plotX1 - plotX0;
  const valuePos = (v: number) => {
    const px = ((v - plan.axisMin) / span) * growLen;
    return isV ? V.BASELINE_Y - px : plotX0 + px; // vertical: y; horizontal: x
  };

  if (plan.empty) {
    return <svg viewBox={`0 0 ${VIEW_W} ${V.VIEW_H}`} className="block h-full w-full" role="img" aria-label={caption ?? "magnitude comparison"} data-bar data-bar-mode={plan.mode} data-bar-orientation={plan.orientation} data-bar-empty />;
  }

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${V.VIEW_H}`}
      className="block h-full w-full"
      role="img"
      aria-label={caption ?? "magnitude comparison"}
      data-bar
      data-bar-mode={plan.mode}
      data-bar-orientation={plan.orientation}
    >
      {/* Axis baseline + ticks + gridlines (opacity-only reveal; geometry reserved frame 1). */}
      <g opacity={frameOn} data-bar-axis>
        {/* Baseline along the value=axisMin edge. */}
        {isV ? (
          <line x1={plotX0} x2={plotX1} y1={V.BASELINE_Y} y2={V.BASELINE_Y} stroke={GRID_COLOR} strokeWidth={stroke.grid} data-bar-baseline />
        ) : (
          <line x1={plotX0} x2={plotX0} y1={V.PLOT_Y0_H} y2={V.PLOT_Y1_H} stroke={GRID_COLOR} strokeWidth={stroke.grid} data-bar-baseline />
        )}
        {plan.ticks.map((tick, i) => {
          const p = valuePos(tick);
          if (isV) {
            return (
              <g key={`${uid}-tick-${i}`} data-bar-tick={i}>
                <line x1={plotX0} x2={plotX1} y1={p} y2={p} stroke={GRID_COLOR} strokeWidth={stroke.grid} opacity={i === 0 ? 1 : 0.5} />
                <text x={plotX0 - 12} y={p + 8} textAnchor="end" fill={colors.text.tertiary} fontFamily="'JetBrains Mono', monospace" fontSize={CAT_LABEL_PX} letterSpacing="0.04em">
                  {formatTick(tick, plan.unit)}
                </text>
              </g>
            );
          }
          // Outer ticks anchor inward so a wide label (e.g. "1000ms") never clips the viewBox edge.
          const tickAnchor = i === 0 ? "start" : i === plan.ticks.length - 1 ? "end" : "middle";
          return (
            <g key={`${uid}-tick-${i}`} data-bar-tick={i}>
              <line x1={p} x2={p} y1={V.PLOT_Y0_H} y2={V.PLOT_Y1_H} stroke={GRID_COLOR} strokeWidth={stroke.grid} opacity={i === 0 ? 1 : 0.5} />
              <text x={p} y={V.PLOT_Y1_H + 28} textAnchor={tickAnchor} fill={colors.text.tertiary} fontFamily="'JetBrains Mono', monospace" fontSize={CAT_LABEL_PX} letterSpacing="0.04em">
                {formatTick(tick, plan.unit)}
              </text>
            </g>
          );
        })}
      </g>

      {/* Legend (grouped/stacked) — top band [20,56], opacity-only, ≤4 chips (§3 ruling 3). */}
      {plan.mode !== "simple" && plan.seriesLabels.some((l) => l.trim().length > 0) && (
        <g opacity={frameOn} data-bar-legend>
          {plan.seriesLabels.map((lbl, i) => {
            const chipX = plotX0 + i * 200;
            if (chipX > VIEW_W - 80 || lbl.trim().length === 0) return null;
            return (
              <g key={`${uid}-leg-${i}`} transform={`translate(${chipX} 40)`}>
                <rect x={0} y={-14} width={18} height={18} rx={3} fill={accentHex(plan.seriesAccents[i])} />
                <text x={26} y={2} fill={colors.text.secondary} fontFamily="'JetBrains Mono', monospace" fontSize={CAT_LABEL_PX} letterSpacing="0.06em">
                  {lbl.slice(0, 14)}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* Bars. */}
      {plan.bars.map((bar) => (
        <BarGroup key={`${uid}-b${bar.catIndex}`} bar={bar} plan={plan} isV={isV} t={t} frameOn={frameOn} baselineY={V.BASELINE_Y} catLabelY={V.CAT_LABEL_Y} />
      ))}

      {/* Reference line (PL-4.2 knob #1) — NEUTRAL dashed threshold drawn ON TOP, fading in AFTER the
          bars settle (so the eye reads "which clear it"). Always mounted when present (opacity-only
          reveal → layout reserved, never mounts/unmounts across t). Absent ⇒ nothing rendered. */}
      {plan.referenceLine && (
        <g opacity={refLineReveal(t)} data-bar-refline>
          <line
            x1={plan.referenceLine.x1}
            y1={plan.referenceLine.y1}
            x2={plan.referenceLine.x2}
            y2={plan.referenceLine.y2}
            stroke={REF_LINE_COLOR}
            strokeWidth={REF_LINE_STROKE}
            strokeLinecap="round"
            strokeDasharray="10 7"
            data-bar-refline-line
          />
          {plan.referenceLine.showLabel && (
            <text
              x={plan.referenceLine.labelX}
              y={plan.referenceLine.labelY}
              textAnchor="end"
              fill={REF_LABEL_COLOR}
              fontFamily="'JetBrains Mono', monospace"
              fontSize={REF_LABEL_PX}
              letterSpacing="0.04em"
              data-bar-refline-label
            >
              {plan.referenceLine.label}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}

// ── A category's bar(s) ─────────────────────────────────────────────────────────────────────
function BarGroup({ bar, plan, isV, t, frameOn, baselineY, catLabelY }: { bar: PlannedBar; plan: BarsPlan; isV: boolean; t: number; frameOn: number; baselineY: number; catLabelY: number }) {
  const grow = barGrow(t, bar.barStart);
  const settled = grow >= 1;

  // Baseline-anchored grow transform (§3 ruling 1). Vertical: scale Y about the (scaled) baseline. Horizontal:
  // scale X about PLOT_X0_H. OMITTED entirely at settle (never scale(1)). CSS style.transform so
  // getComputedStyle().transform returns a matrix the gate's parseMatrix reads.
  const anchor = isV ? baselineY : PLOT_X0_H;
  const transform = settled
    ? undefined
    : isV
      ? `translate(0px, ${anchor}px) scale(1, ${grow}) translate(0px, ${-anchor}px)`
      : `translate(${anchor}px, 0px) scale(${grow}, 1) translate(${-anchor}px, 0px)`;

  // Category label slot (vertical: under the band; horizontal: the right-anchored left column).
  const firstRect = bar.rects[0];
  const bandCenterCross = isV
    ? Math.min(...bar.rects.map((r) => r.x)) + (Math.max(...bar.rects.map((r) => r.x + r.w)) - Math.min(...bar.rects.map((r) => r.x))) / 2
    : Math.min(...bar.rects.map((r) => r.y)) + (Math.max(...bar.rects.map((r) => r.y + r.h)) - Math.min(...bar.rects.map((r) => r.y))) / 2;

  return (
    <g data-bar-cat={bar.catIndex}>
      {/* The grown rect(s). For stacked, all segments share ONE transform on this <g>. The
          baseline-anchored translate·scale·translate is expressed in viewBox user units, so we
          keep the SVG default transform-box (view-box) — NOT fill-box (which would reinterpret the
          px against the group's own bbox and let the baseline edge drift). §3 ruling 1 reads
          getComputedStyle().transform either way. */}
      <g style={{ transform }} data-bar-grow>
        {bar.rects.map((r, i) => (
          <rect
            key={i}
            x={r.x}
            y={r.y}
            width={Math.max(0, r.w)}
            height={Math.max(0, r.h)}
            rx={isV ? 4 : 4}
            fill={accentHex(r.accentKey)}
            data-bar-rect
            data-bar-series={r.seriesIndex}
            {...(plan.mode === "stacked" ? { "data-bar-seg": r.seriesIndex } : {})}
          />
        ))}
      </g>

      {/* Value labels — fade in as each bar finishes growing; count-up for numeric values. */}
      {bar.rects.map((r, i) => (
        <ValueLabel key={`v${i}`} rect={r} isV={isV} barStart={bar.barStart} t={t} />
      ))}

      {/* Category label. */}
      {bar.showLabel &&
        (isV ? (
          <text
            x={bandCenterCross}
            y={catLabelY + CAT_LABEL_PX}
            textAnchor="middle"
            fill={colors.text.primary}
            fontFamily="'Space Grotesk', sans-serif"
            fontSize={CAT_LABEL_PX}
            fontWeight={500}
            opacity={frameOn}
            data-bar-catlabel
          >
            {bar.label}
          </text>
        ) : (
          <text
            x={LABEL_ANCHOR_X}
            y={bandCenterCross + 8}
            textAnchor="end"
            fill={colors.text.primary}
            fontFamily="'Space Grotesk', sans-serif"
            fontSize={CAT_LABEL_PX}
            fontWeight={500}
            opacity={frameOn}
            data-bar-catlabel
          >
            {bar.label}
          </text>
        ))}
      {/* firstRect referenced to keep types honest for empty-rect categories (zero bars still render). */}
      {firstRect ? null : null}
    </g>
  );
}

// ── Value label ─────────────────────────────────────────────────────────────────────────────
function ValueLabel({ rect, isV, barStart, t }: { rect: PlannedRect; isV: boolean; barStart: number; t: number }) {
  if (!rect.showValue) return null;
  const start = labelStart(barStart);
  const p = clamp01((t - start) / 0.12);

  // Count-up for numeric values; otherwise the static string.
  const plan = planCountUp(rect.valueText);
  const display = plan.animate ? plan.display(p) : rect.valueText;

  // Placement.
  let x: number;
  let y: number;
  let anchor: "start" | "middle" | "end";
  let fill: string = colors.text.primary;
  if (isV) {
    x = rect.x + rect.w / 2;
    anchor = "middle";
    if (rect.valuePlacement === "end") {
      y = rect.y - 8; // just above the bar top
    } else {
      y = rect.y + VALUE_LABEL_PX + 6; // inside, near the top of the bar
      fill = colors.bg.deepInk;
    }
  } else {
    y = rect.y + rect.h / 2 + 8;
    if (rect.valuePlacement === "end") {
      x = rect.x + rect.w + 10;
      anchor = "start";
    } else {
      x = rect.x + rect.w - 10;
      anchor = "end";
      fill = colors.bg.deepInk;
    }
  }

  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fill={fill}
      fontFamily="'JetBrains Mono', monospace"
      fontSize={VALUE_LABEL_PX}
      fontWeight={600}
      opacity={p}
      data-bar-vlabel
    >
      {display}
    </text>
  );
}
