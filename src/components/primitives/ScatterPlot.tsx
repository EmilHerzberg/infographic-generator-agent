// ScatterPlot — a RELATIONSHIP between two numeric variables across N items. PL-2.2, the second
// sprint of Epic PL-2 (the chart family). "As X rises, Y falls/rises", correlation, inverse
// relationships, 2-D positioning (cost vs value, risk vs reward).
//
//   points + two LINEAR axes (NO mandatory 0 baseline; both float to the data with an 8% pad).
//   trendLine (off default | fit): one auto-fit OLS least-squares line that DRAWS ON after the
//     points settle (supports inverse/negative slope automatically — the Peter case).
//   quadrants (off default | on): two reference dividers (author values or data means) + ≤4 region
//     labels splitting the plot into four labelled regions.
//   pointLabels (auto default | off): per-point text labels (fit-or-hide so they never overlap).
//
// All layout comes from planScatter (src/lib/scatter.ts) — the pure brain shared with the check
// suite. Geometry is a pure function of DATA, never `t`: each dot's final cx/cy is fixed by the plan
// and constant across the timeline. Points are DISCONNECTED → a per-point overlapping stagger of a
// scale-pop about each dot's own center, a baseline-style CSS `style.transform` (§3 ruling 2: the
// explicit translate·scale·translate in viewBox user units, default transform-box, no fill-box),
// OMITTED at settle (never scale(1)) so the gate's parseMatrix reads it. The optional trend line
// draws on via pathLength=1 + strokeDashoffset=1−reveal (the LineChart mechanism); its <path> is
// ABSENT (not opacity-0) when off or the fit is suppressed (§3 ruling 4). Props default to t=1
// (settled/static) so Path B can import it without animation (§3 ruling 5).
//
// Source-pixel viewBox (1000×640) scaled to the Panel content box, exactly like BarChart/Divergence
// — the inspector reads viewBox coordinates as the single deterministic system.
// Spec: planning/primitive-library/handoffs/PL-2.2-scatter.md §2.5 / §2.7.

import { useId, useLayoutEffect, useRef, useState } from "react";
import type { Accent } from "@/posts/renderTypes";
import { colors } from "@/tokens/design";
import {
  planScatter,
  pointPop,
  trendReveal,
  formatTick,
  clampViewH,
  type ScatterPointInput,
  type ScatterKnobTrend,
  type ScatterKnobQuad,
  type ScatterKnobLabels,
  type PlannedPoint,
  VIEW_W,
  VIEW_H,
  PLOT_X0,
  PLOT_X1,
  DOT_R,
  DOT_STROKE,
  TREND_STROKE,
  GRID_STROKE,
  DIVIDER_STROKE,
  AXIS_LABEL_PX,
  AXIS_TITLE_PX,
  POINT_LABEL_PX,
  QUAD_LABEL_PX,
} from "@/lib/scatter";

const accentHex = (a: string): string => colors.accent[a as Accent] ?? colors.accent.cyan;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const GRID_COLOR = "rgba(184,178,167,0.30)";
const DIVIDER_COLOR = colors.text.tertiary; // neutral dashed

type Props = {
  points: ScatterPointInput[];
  xLabel?: string;
  yLabel?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  xUnit?: string;
  yUnit?: string;
  trendLine?: ScatterKnobTrend;
  quadrants?: ScatterKnobQuad;
  xDivider?: number;
  yDivider?: number;
  quadrantLabels?: string[];
  pointLabels?: ScatterKnobLabels;
  caption?: string;
  t?: number;
};

export function ScatterPlot({
  points,
  xLabel,
  yLabel,
  xMin,
  xMax,
  yMin,
  yMax,
  xUnit,
  yUnit,
  trendLine = "off",
  quadrants = "off",
  xDivider,
  yDivider,
  quadrantLabels,
  pointLabels = "auto",
  caption,
  t = 1,
}: Props) {
  const uid = useId();

  // PL-0.8 — row-aware viewBox: measure the row's px aspect so the viewBox aspect MATCHES it and the
  // SVG fills the FULL row width (uniform scale ⇒ circular, width-driven dots that clear the 6px
  // mobile floor even in a wide-short row, with no overflow). FitZone's proven pattern: a SYNCHRONOUS
  // measure inside useLayoutEffect (applied before paint, so Remotion captures the settled frame —
  // PL-0.3 render-truth parity), plus a ResizeObserver for later resizes. Pre-measure default = 640
  // (today's geometry) ⇒ static/SSR import byte-identical.
  const boxRef = useRef<HTMLDivElement>(null);
  const [viewH, setViewH] = useState(VIEW_H);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      const w = box.clientWidth;
      const h = box.clientHeight;
      if (!w || !h) return;
      const next = clampViewH((VIEW_W * h) / w); // viewH = 1000 / aspect, clamped to [MIN_VIEW_H, 640]
      setViewH((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  const plan = planScatter({
    points,
    xLabel,
    yLabel,
    xMin,
    xMax,
    yMin,
    yMax,
    xUnit,
    yUnit,
    trendLine,
    quadrants,
    xDivider,
    yDivider,
    quadrantLabels,
    pointLabels,
    viewH,
  });
  // Row-aware plot band (from the plan — the single geometry source shared with qa-scatter).
  const { plotY0, plotY1, titleY, viewH: vbH } = plan;

  const frameOn = clamp01((t - 0.26) / 0.08); // axes/gridlines/titles/dividers appear (chrome)

  // viewBox px position along each axis (for gridlines + ticks). y inverted (axisMax at the top).
  const xSpan = plan.xMax - plan.xMin || 1;
  const ySpan = plan.yMax - plan.yMin || 1;
  const xPos = (v: number) => PLOT_X0 + ((v - plan.xMin) / xSpan) * (PLOT_X1 - PLOT_X0);
  const yPos = (v: number) => plotY1 - ((v - plan.yMin) / ySpan) * (plotY1 - plotY0);

  if (plan.empty) {
    return (
      <div ref={boxRef} className="relative h-full w-full">
        <svg
          viewBox={`0 0 ${VIEW_W} ${vbH}`}
          className="block h-full w-full"
          role="img"
          aria-label={caption ?? "relationship scatter"}
          data-scatter
          data-scatter-empty
        />
      </div>
    );
  }

  const reveal = trendReveal(t);

  return (
    <div ref={boxRef} className="relative h-full w-full">
    <svg
      viewBox={`0 0 ${VIEW_W} ${vbH}`}
      className="block h-full w-full"
      role="img"
      aria-label={caption ?? "relationship scatter"}
      data-scatter
    >
      {/* Chrome — gridlines, ticks, axis titles, quadrant dividers + labels. Opacity-only reveal;
          geometry reserved from frame 1 (the Bar/Divergence frame-in beat). */}
      <g opacity={frameOn} data-scatter-axis>
        {/* x gridlines + ticks (under the plot). Outer ticks anchor inward (BarChart rule). */}
        {plan.xTicks.map((tick, i) => {
          const x = xPos(tick);
          const anchor = i === 0 ? "start" : i === plan.xTicks.length - 1 ? "end" : "middle";
          return (
            <g key={`${uid}-xt-${i}`} data-scatter-tick={`x${i}`}>
              <line x1={x} x2={x} y1={plotY0} y2={plotY1} stroke={GRID_COLOR} strokeWidth={GRID_STROKE} opacity={0.5} />
              <text
                x={x}
                y={plotY1 + 32}
                textAnchor={anchor}
                fill={colors.text.tertiary}
                fontFamily="'JetBrains Mono', monospace"
                fontSize={AXIS_LABEL_PX}
                letterSpacing="0.04em"
              >
                {formatTick(tick, plan.xUnit)}
              </text>
            </g>
          );
        })}
        {/* y gridlines + ticks (left gutter, right-anchored at PLOT_X0−12). */}
        {plan.yTicks.map((tick, i) => {
          const y = yPos(tick);
          return (
            <g key={`${uid}-yt-${i}`} data-scatter-tick={`y${i}`}>
              <line x1={PLOT_X0} x2={PLOT_X1} y1={y} y2={y} stroke={GRID_COLOR} strokeWidth={GRID_STROKE} opacity={0.5} />
              <text
                x={PLOT_X0 - 12}
                y={y + 8}
                textAnchor="end"
                fill={colors.text.tertiary}
                fontFamily="'JetBrains Mono', monospace"
                fontSize={AXIS_LABEL_PX}
                letterSpacing="0.04em"
              >
                {formatTick(tick, plan.yUnit)}
              </text>
            </g>
          );
        })}

        {/* Axis titles. xLabel centered under the x-ticks; yLabel rotated up the left edge. */}
        {plan.xLabel.trim().length > 0 && (
          <text
            x={(PLOT_X0 + PLOT_X1) / 2}
            y={titleY}
            textAnchor="middle"
            fill={colors.text.secondary}
            fontFamily="'Space Grotesk', sans-serif"
            fontSize={AXIS_TITLE_PX}
            fontWeight={500}
            data-scatter-axistitle="x"
          >
            {plan.xLabel}
          </text>
        )}
        {plan.yLabel.trim().length > 0 && (
          <text
            x={26}
            y={(plotY0 + plotY1) / 2}
            textAnchor="middle"
            fill={colors.text.secondary}
            fontFamily="'Space Grotesk', sans-serif"
            fontSize={AXIS_TITLE_PX}
            fontWeight={500}
            transform={`rotate(-90 26 ${(plotY0 + plotY1) / 2})`}
            data-scatter-axistitle="y"
          >
            {plan.yLabel}
          </text>
        )}
      </g>

      {/* Quadrant dividers + region labels (frame-in beat). */}
      {plan.quadrants === "on" && (
        <g opacity={frameOn} data-scatter-quad>
          {plan.quadrant.xDivPx != null && (
            <line
              x1={plan.quadrant.xDivPx}
              x2={plan.quadrant.xDivPx}
              y1={plotY0}
              y2={plotY1}
              stroke={DIVIDER_COLOR}
              strokeWidth={DIVIDER_STROKE}
              strokeDasharray="6 6"
              data-scatter-divider="x"
            />
          )}
          {plan.quadrant.yDivPx != null && (
            <line
              x1={PLOT_X0}
              x2={PLOT_X1}
              y1={plan.quadrant.yDivPx}
              y2={plan.quadrant.yDivPx}
              stroke={DIVIDER_COLOR}
              strokeWidth={DIVIDER_STROKE}
              strokeDasharray="6 6"
              data-scatter-divider="y"
            />
          )}
          {plan.quadrant.labels.map((lbl, i) =>
            lbl.show ? (
              <text
                key={`${uid}-ql-${i}`}
                x={lbl.x}
                y={lbl.y}
                textAnchor={lbl.anchor}
                fill={colors.text.tertiary}
                fontFamily="'JetBrains Mono', monospace"
                fontSize={QUAD_LABEL_PX}
                letterSpacing="0.04em"
                data-scatter-quadlabel={i}
              >
                {lbl.text}
              </text>
            ) : null,
          )}
        </g>
      )}

      {/* Trend line — ABSENT when off / fitted:null (§3 ruling 4). Draws on after points settle. */}
      {plan.trendLine === "fit" && plan.fitted && (
        <line
          x1={plan.fitted.x1}
          y1={plan.fitted.y1}
          x2={plan.fitted.x2}
          y2={plan.fitted.y2}
          stroke={colors.text.secondary}
          strokeWidth={TREND_STROKE}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={1 - reveal}
          opacity={0.85}
          data-scatter-trend
          data-scatter-trend-reveal={reveal.toFixed(3)}
        />
      )}

      {/* Points — pop/fade-in with the overlapping stagger; transform OMITTED at settle. */}
      {plan.points.map((pt) => (
        <ScatterDot key={`${uid}-p${pt.index}`} pt={pt} t={t} />
      ))}
    </svg>
    </div>
  );
}

// ── One point: dot (CSS-transform pop) + optional fit-or-hide label ─────────────────────────
function ScatterDot({ pt, t }: { pt: PlannedPoint; t: number }) {
  const pop = pointPop(t, pt.popStart); // clamped ∈ [0,1]
  const settled = pop >= 1;
  // §3 ruling 2: CSS style.transform — translate(cx,cy)·scale(pop)·translate(-cx,-cy) in viewBox
  // user units (default transform-box, NO fill-box), OMITTED at settle so getComputedStyle reads
  // a matrix the gate's parseMatrix consumes, and never identity once settled (the LC3/C12 rule).
  const transform = settled
    ? undefined
    : `translate(${pt.cx}px, ${pt.cy}px) scale(${pop}) translate(${-pt.cx}px, ${-pt.cy}px)`;
  const opacity = clamp01((t - pt.popStart) / 0.06);
  // The label fades in as the point settles.
  const labelP = clamp01((t - (pt.popStart + 0.08)) / 0.1);

  return (
    <g data-scatter-point={pt.index}>
      <g style={{ transform, opacity }} data-scatter-dot>
        <circle
          cx={pt.cx}
          cy={pt.cy}
          r={DOT_R}
          fill={accentHex(pt.accentKey)}
          stroke={colors.bg.deepInk}
          strokeWidth={DOT_STROKE}
        />
      </g>
      {pt.showLabel && (
        <text
          x={pt.cx + DOT_R + 6}
          y={pt.cy + POINT_LABEL_PX / 2 - 4}
          textAnchor="start"
          fill={colors.text.primary}
          fontFamily="'Space Grotesk', sans-serif"
          fontSize={POINT_LABEL_PX}
          fontWeight={500}
          opacity={labelP}
          data-scatter-plabel
        >
          {pt.label}
        </text>
      )}
    </g>
  );
}
