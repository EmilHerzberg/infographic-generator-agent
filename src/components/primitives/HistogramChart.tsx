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

import { useId, useLayoutEffect, useRef, useState } from "react";
import type { Accent } from "@/posts/renderTypes";
import { colors } from "@/tokens/design";
import {
  planHistogram,
  barGrow,
  markerReveal,
  formatTick,
  clampViewH,
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

  // PL-0.8 — row-aware viewBox (the ScatterPlot/Candlestick pattern): measure the row's px aspect so
  // the viewBox aspect MATCHES it and the SVG fills the FULL row width instead of letterboxing the
  // fixed 640-high box into a short square row at half width. Synchronous useLayoutEffect measure
  // (applied before paint → Remotion captures the settled frame) + a ResizeObserver for later
  // resizes. Pre-measure default = 640 (today's geometry) ⇒ static/SSR import byte-identical.
  const boxRef = useRef<HTMLDivElement>(null);
  const [viewH, setViewH] = useState(VIEW_H);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      const w = box.clientWidth;
      const h = box.clientHeight;
      if (!w || !h) return;
      const next = clampViewH((VIEW_W * h) / w);
      setViewH((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  const plan = planHistogram({ values, bins, binCount, xLabel, yLabel, xUnit, markers, markerLines, axisMin, axisMax, valueLabels, accent, viewH });
  const { plotY0, baselineY, viewH: vbH } = plan;

  const frameOn = clamp01((t - 0.26) / 0.08); // axis baseline + gridlines + ticks + titles appear

  // viewBox px of a count value along the y-axis (for gridlines + ticks).
  const growLen = baselineY - plotY0;
  const countPos = (c: number) => baselineY - (c / (plan.axisMaxCount || 1)) * growLen;

  if (plan.empty) {
    return (
      <div ref={boxRef} className="relative h-full w-full">
        <svg
          viewBox={`0 0 ${VIEW_W} ${vbH}`}
          className="block h-full w-full"
          role="img"
          aria-label={caption ?? "distribution histogram"}
          data-histogram
          data-histogram-empty
        />
      </div>
    );
  }

  const reveal = markerReveal(t);
  const fill = accentHex(plan.accentKey);

  return (
    <div ref={boxRef} className="relative h-full w-full">
    <svg
      viewBox={`0 0 ${VIEW_W} ${vbH}`}
      className="block h-full w-full"
      role="img"
      aria-label={caption ?? "distribution histogram"}
      data-histogram
    >
      {/* Axis baseline + count gridlines + count ticks + numeric x-edge ticks + titles. Opacity-only
          reveal; geometry reserved frame 1. */}
      <g opacity={frameOn} data-histogram-axis>
        {/* Count baseline (count = 0). */}
        <line x1={PLOT_X0} x2={PLOT_X1} y1={baselineY} y2={baselineY} stroke={GRID_COLOR} strokeWidth={1.5} data-histogram-baseline />
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
              <line x1={x} x2={x} y1={baselineY} y2={baselineY + 8} stroke={GRID_COLOR} strokeWidth={1.5} />
              <text
                x={x}
                y={baselineY + 32}
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
            y={vbH - 8}
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
            y={plotY0 - 18}
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
        <HistBin key={`${uid}-bin${bin.index}`} bin={bin} fill={fill} baselineY={baselineY} t={t} />
      ))}

      {/* Stat markers — NEUTRAL dashed vertical lines drawn AFTER bins settle (§3 ruling 3).
          ABSENT when off / suppressed. */}
      {plan.markers.map((m, i) => (
        <Marker key={`${uid}-m${i}`} marker={m} index={i} reveal={reveal} plotY0={plotY0} baselineY={baselineY} />
      ))}
    </svg>
    </div>
  );
}

// ── One bin: contiguous rect with a baseline-anchored CSS grow (§3 ruling 1) ────────────────
function HistBin({ bin, fill, baselineY, t }: { bin: PlannedBin; fill: string; baselineY: number; t: number }) {
  const grow = barGrow(t, bin.binStart);
  const settled = grow >= 1;
  // Baseline-anchored grow transform (§3 ruling 1): scale Y about the row-aware baseline. OMITTED at
  // settle (never scale(1)). CSS style.transform so getComputedStyle().transform returns a matrix the
  // gate's parseMatrix reads.
  const transform = settled ? undefined : `translate(0px, ${baselineY}px) scale(1, ${grow}) translate(0px, ${-baselineY}px)`;
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
function Marker({ marker, index, reveal, plotY0, baselineY }: { marker: PlannedMarker; index: number; reveal: number; plotY0: number; baselineY: number }) {
  // Draw-on via pathLength=1 + strokeDashoffset=1−reveal (the scatter trend mechanism). The line
  // draws bottom→top is approximated by the dash reveal; fully drawn (offset 0) at t=1.
  return (
    <g data-histogram-marker={index} data-histogram-marker-kind={marker.kind}>
      <line
        x1={marker.xPx}
        x2={marker.xPx}
        y1={baselineY}
        y2={plotY0}
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
          y={plotY0 - 6}
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
