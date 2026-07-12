// HistogramChart — the SHAPE / SPREAD of ONE metric across many observations. PL-2.6, the fifth
// sprint of Epic PL-2 (the chart family). "How is X distributed?" — where the mass sits, how wide
// the tail is, skew/bimodality. Histogram = "bar, but contiguous bins on a numeric axis."
//
//   values (primary): raw observations the planner bins into clamped-Sturges [5,14] equal-width bins.
//   bins (escape hatch): pre-binned {x0,x1,count}; stat markers SUPPRESSED (no raw sample).
//   markers (off default | median | mean | medianMean | p95): NEUTRAL stat lines that DRAW ON after
//     the bins settle. markerLines[] (author override) when present.
//   valueLabels (auto default | off): per-bin count labels (fit-or-hide).
//
// All layout comes from planHistogram (src/lib/histogram.ts) — the pure brain shared with the check
// suite. Geometry is a pure function of DATA, never `t`: each bin's final x/y/w/h is fixed by the
// plan and constant across the timeline. Bins are CONTIGUOUS (gap=0, touching) but DISCONNECTED
// objects → a per-bin overlapping stagger (the BarChart pattern), left→right, each growing from the
// 0-count baseline. The grow is a baseline-anchored CSS `style.transform` (§3 ruling 1: a matrix
// getComputedStyle reads), OMITTED at settle (never scale(1)). The neutral stat-marker lines draw on
// via pathLength=1 + strokeDashoffset=1−reveal (the scatter trend mechanism), drawn AFTER the bins
// settle (§3 ruling 3); a marker <line> is ABSENT when off/suppressed. Props default to t=1
// (settled/static) so Path B can import it without animation (§3 ruling 5).
//
// Source-pixel viewBox (1000×640) scaled to the Panel content box, exactly like BarChart/Scatter —
// the inspector reads viewBox coordinates as the single deterministic system.
// Spec: planning/primitive-library/handoffs/PL-2.6-histogram.md §2.5 / §2.7.

import { useId } from "react";
import type { Accent } from "@/posts/renderTypes";
import { colors } from "@/tokens/design";
import {
  planHistogram,
  barGrow,
  markerReveal,
  formatTick,
  type HistogramBinInput,
  type HistogramMarkerInput,
  type HistKnobMarkers,
  type HistKnobLabels,
  type PlannedBin,
  type PlannedMarker,
  VIEW_W,
  VIEW_H,
  PLOT_X0,
  PLOT_X1,
  PLOT_Y0,
  BASELINE_Y,
  MARKER_STROKE,
  MARKER_LABEL_PX,
  BIN_LABEL_PX,
  AXIS_LABEL_PX,
} from "@/lib/histogram";

const accentHex = (a: string): string => colors.accent[a as Accent] ?? colors.accent.cyan;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const GRID_COLOR = "rgba(184,178,167,0.30)";
const MARKER_COLOR = colors.text.tertiary; // NEUTRAL (§3 ruling 3) — a reference, not a data accent

type Props = {
  values?: number[];
  bins?: HistogramBinInput[];
  binCount?: number;
  xLabel?: string;
  yLabel?: string;
  xUnit?: string;
  markers?: HistKnobMarkers;
  markerLines?: HistogramMarkerInput[];
  axisMin?: number;
  axisMax?: number;
  valueLabels?: HistKnobLabels;
  accent?: Accent;
  caption?: string;
  t?: number;
};

export function HistogramChart({
  values,
  bins,
  binCount,
  xLabel,
  yLabel,
  xUnit,
  markers = "off",
  markerLines,
  axisMin,
  axisMax,
  valueLabels = "auto",
  accent,
  caption,
  t = 1,
}: Props) {
  const uid = useId();
  const plan = planHistogram({ values, bins, binCount, xLabel, yLabel, xUnit, markers, markerLines, axisMin, axisMax, valueLabels, accent });

  const frameOn = clamp01((t - 0.26) / 0.08); // axis baseline + gridlines + ticks + titles appear

  // viewBox px of a count value along the y-axis (for gridlines + ticks).
  const growLen = BASELINE_Y - PLOT_Y0;
  const countPos = (c: number) => BASELINE_Y - (c / (plan.axisMaxCount || 1)) * growLen;

  if (plan.empty) {
    return (
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="block h-full w-full"
        role="img"
        aria-label={caption ?? "distribution histogram"}
        data-histogram
        data-histogram-empty
      />
    );
  }

  const reveal = markerReveal(t);
  const fill = accentHex(plan.accentKey);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="block h-full w-full"
      role="img"
      aria-label={caption ?? "distribution histogram"}
      data-histogram
    >
      {/* Axis baseline + count gridlines + count ticks + numeric x-edge ticks + titles. Opacity-only
          reveal; geometry reserved frame 1. */}
      <g opacity={frameOn} data-histogram-axis>
        {/* Count baseline (count = 0). */}
        <line x1={PLOT_X0} x2={PLOT_X1} y1={BASELINE_Y} y2={BASELINE_Y} stroke={GRID_COLOR} strokeWidth={1.5} data-histogram-baseline />
        {/* Count y-gridlines + ticks (left gutter, right-anchored at PLOT_X0−12). */}
        {plan.countTicks.map((tick, i) => {
          const y = countPos(tick);
          return (
            <g key={`${uid}-ct-${i}`} data-histogram-ytick={i}>
              <line x1={PLOT_X0} x2={PLOT_X1} y1={y} y2={y} stroke={GRID_COLOR} strokeWidth={1.5} opacity={i === 0 ? 1 : 0.5} />
              <text
                x={PLOT_X0 - 12}
                y={y + 8}
                textAnchor="end"
                fill={colors.text.tertiary}
                fontFamily="'JetBrains Mono', monospace"
                fontSize={AXIS_LABEL_PX}
                letterSpacing="0.04em"
              >
                {formatTick(tick, "")}
              </text>
            </g>
          );
        })}

        {/* Numeric x-edge ticks (every-k). Always first + last; outer ticks anchor inward. */}
        {plan.xTickIndices.map((ei) => {
          const edge = plan.edges[ei];
          const x = PLOT_X0 + ei * plan.binWidthPx;
          const anchor = ei === 0 ? "start" : ei === plan.edges.length - 1 ? "end" : "middle";
          return (
            <g key={`${uid}-xt-${ei}`} data-histogram-xtick={ei}>
              <line x1={x} x2={x} y1={BASELINE_Y} y2={BASELINE_Y + 8} stroke={GRID_COLOR} strokeWidth={1.5} />
              <text
                x={x}
                y={BASELINE_Y + 32}
                textAnchor={anchor}
                fill={colors.text.tertiary}
                fontFamily="'JetBrains Mono', monospace"
                fontSize={AXIS_LABEL_PX}
                letterSpacing="0.04em"
                data-histogram-xticklabel={ei}
              >
                {formatTick(edge, plan.xUnit)}
              </text>
            </g>
          );
        })}

        {/* Axis titles. xLabel centered under the x-ticks; yLabel chip at top-left of the plot. */}
        {plan.xLabel.trim().length > 0 && (
          <text
            x={(PLOT_X0 + PLOT_X1) / 2}
            y={VIEW_H - 8}
            textAnchor="middle"
            fill={colors.text.secondary}
            fontFamily="'Space Grotesk', sans-serif"
            fontSize={AXIS_LABEL_PX}
            fontWeight={500}
            data-histogram-axistitle="x"
          >
            {plan.xLabel}
          </text>
        )}
        {plan.yLabel.trim().length > 0 && (
          <text
            x={PLOT_X0}
            y={PLOT_Y0 - 18}
            textAnchor="start"
            fill={colors.text.secondary}
            fontFamily="'Space Grotesk', sans-serif"
            fontSize={AXIS_LABEL_PX}
            fontWeight={500}
            data-histogram-axistitle="y"
          >
            {plan.yLabel}
          </text>
        )}
      </g>

      {/* Bins — contiguous (gap=0), grow from the baseline; transform OMITTED at settle. */}
      {plan.bins.map((bin) => (
        <HistBin key={`${uid}-bin${bin.index}`} bin={bin} fill={fill} t={t} />
      ))}

      {/* Stat markers — NEUTRAL dashed vertical lines drawn AFTER bins settle (§3 ruling 3).
          ABSENT when off / suppressed. */}
      {plan.markers.map((m, i) => (
        <Marker key={`${uid}-m${i}`} marker={m} index={i} reveal={reveal} />
      ))}
    </svg>
  );
}

// ── One bin: contiguous rect with a baseline-anchored CSS grow (§3 ruling 1) ────────────────
function HistBin({ bin, fill, t }: { bin: PlannedBin; fill: string; t: number }) {
  const grow = barGrow(t, bin.binStart);
  const settled = grow >= 1;
  // Baseline-anchored grow transform (§3 ruling 1): scale Y about BASELINE_Y. OMITTED at settle
  // (never scale(1)). CSS style.transform so getComputedStyle().transform returns a matrix the
  // gate's parseMatrix reads.
  const transform = settled ? undefined : `translate(0px, ${BASELINE_Y}px) scale(1, ${grow}) translate(0px, ${-BASELINE_Y}px)`;
  // Per-bin count label fades in as the bin finishes growing.
  const labelP = clamp01((t - (bin.binStart + 0.3)) / 0.12);

  return (
    <g data-histogram-bin={bin.index}>
      <g style={{ transform }} data-histogram-grow>
        {bin.h > 0 && (
          <rect x={bin.x} y={bin.y} width={Math.max(0, bin.w)} height={Math.max(0, bin.h)} fill={fill} stroke={colors.bg.deepInk} strokeWidth={1} data-histogram-rect />
        )}
      </g>
      {bin.showCount && (
        <text
          x={bin.x + bin.w / 2}
          y={bin.y - 8}
          textAnchor="middle"
          fill={colors.text.primary}
          fontFamily="'JetBrains Mono', monospace"
          fontSize={BIN_LABEL_PX}
          fontWeight={600}
          opacity={labelP}
          data-histogram-binlabel
        >
          {bin.countText}
        </text>
      )}
    </g>
  );
}

// ── One stat marker: neutral dashed vertical line (draw-on) + a small label ─────────────────
function Marker({ marker, index, reveal }: { marker: PlannedMarker; index: number; reveal: number }) {
  // Draw-on via pathLength=1 + strokeDashoffset=1−reveal (the scatter trend mechanism). The line
  // draws bottom→top is approximated by the dash reveal; fully drawn (offset 0) at t=1.
  return (
    <g data-histogram-marker={index} data-histogram-marker-kind={marker.kind}>
      <line
        x1={marker.xPx}
        x2={marker.xPx}
        y1={BASELINE_Y}
        y2={PLOT_Y0}
        stroke={MARKER_COLOR}
        strokeWidth={MARKER_STROKE}
        strokeLinecap="round"
        strokeDasharray="8 6"
        pathLength={1}
        strokeDashoffset={1 - reveal}
        opacity={0.9}
        data-histogram-marker-line
        data-histogram-marker-reveal={reveal.toFixed(3)}
      />
      {marker.showLabel && (
        <text
          x={marker.anchor === "end" ? marker.xPx - 6 : marker.xPx + 6}
          y={PLOT_Y0 - 6}
          textAnchor={marker.anchor}
          fill={colors.text.secondary}
          fontFamily="'JetBrains Mono', monospace"
          fontSize={MARKER_LABEL_PX}
          letterSpacing="0.04em"
          opacity={reveal}
          data-histogram-marker-label
        >
          {marker.label}
        </text>
      )}
    </g>
  );
}
