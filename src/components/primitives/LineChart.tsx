// LineChart — a TREND of one or more quantities over an ORDERED x axis (the project's ORIGINAL line
// chart, the `chart` viz kind). PL-2.7 RETROFIT: the hand-rolled scales are formalized into the pure
// planner src/lib/line.ts (the brain the renderer + the qa-line.mjs gate share), and constrained
// additive knobs are layered on — `variant` (line | area | stepped), `markers` (off | on),
// `annotations` (≤3 callouts). EVERY knob default is the pre-retrofit plain line, so the DEFAULT t=1
// frame is BYTE-IDENTICAL to today (gated against a captured pre-retrofit baseline, PL-1.5 discipline).
//
// The EXISTING prop interface is PRESERVED verbatim (PM §3 ruling 1): Path-B posts import LineChart
// directly and call it with `series / xLabels / yMin / yMax / yTicks / yFormat / height / reveal /
// caption`; `series[].color` is a RAW CSS color string (a hex), NOT an accent key. The new props
// (variant / markers / annotations) are OPTIONAL and default to the plain line.
//
// MOTION: an area is CONNECTED geometry → the trace draws on as ONE eased left→right edge — the
// EXISTING strokeDashoffset draw-on, formalized as lineReveal(t) (the linear `appear(t,0.35,0.45)`,
// PINNED for byte-identity). The DEFAULT path emits ZERO CSS transforms (the draw-on is dashoffset,
// not a transform). Variant motion syncs to that one edge: the `area` fill reveals UNDER the line via
// a left→right clip-wipe (the AreaChart mechanism, no transform on the fill); `markers` pop as the
// edge passes each vertex (omitted at settle); `annotations` fade in AFTER the line settles (DRAW_END).
// Spec: planning/primitive-library/handoffs/PL-2.7-line-variants.md §2.5 / §2.7 / §3.

import { useContext, useId } from "react";
import { stroke, text, chartVScale } from "@/tokens/design";
import { FormatContext } from "@/components/layout/formatContext";
import { appear } from "@/lib/reveal";
import {
  planLine,
  markerVisibleAt,
  type LineVariant,
  type PlannedLineSeries,
  type PlannedAnnotation,
  MARKER_R,
  MARKER_RING,
  ANN_LABEL_PX,
  ANN_LEADER,
  ANN_LEADER_COLOR,
  FILL_OPACITY_SIMPLE,
  PAD,
  WIDTH,
} from "@/lib/line";

export type LineSeries = {
  label: string;
  values: number[];
  color: string;
  endValueLabel?: string;
};

export type LineAnnotationInput = { seriesIndex?: number; x: number | string; label: string };

type Props = {
  series: LineSeries[];
  xLabels?: string[];
  yMin?: number;
  yMax?: number;
  yTicks?: number[];
  yFormat?: (v: number) => string;
  height?: number;
  reveal?: number;
  /** Global progress 0..1 — fills any OMITTED reveal prop via the standard schedule (so Path B can just pass t). Explicit props win. */
  t?: number;
  caption?: string;
  // ── PL-2.7 additive knobs (all OPTIONAL; every default reproduces the plain line) ──
  variant?: LineVariant;
  markers?: "on" | "off";
  annotations?: LineAnnotationInput[];
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function LineChart({
  series,
  xLabels,
  yMin = 0,
  yMax = 1,
  yTicks = [0, 0.25, 0.5, 0.75, 1.0],
  yFormat = (v) => `${Math.round(v * 100)}%`,
  height: heightProp = 560,
  reveal: revealProp,
  t = 1,
  caption,
  variant = "line",
  markers = "off",
  annotations,
}: Props) {
  // Strategy A t-fallback: an omitted reveal prop derives from the global t via the SAME
  // appear(t,start,dur) schedule PostRenderer passes explicitly; explicit props override
  // (byte-identical for Path A), and at the default t=1 every fallback is exactly 1 (settled —
  // backward compatible).
  const reveal = revealProp ?? appear(t, 0.35, 0.45);

  const uid = useId();

  // Vertical-fill (Emil's 9:16 feedback): stretch the plot height on the tall aspect so the trace fills the
  // frame instead of floating in a dead band. line.ts drives ALL vertical geometry off `height` with fixed
  // pads, so scaling the height in is the whole change; portrait/square (scale 1) stay byte-identical.
  const height = Math.round(heightProp * chartVScale(useContext(FormatContext)));

  const plan = planLine({
    series,
    xLabels,
    yMin,
    yMax,
    yTicks,
    yFormat,
    height,
    variant,
    markers,
    annotations,
  });

  const width = plan.width;
  const padding = plan.pad;
  // The draw-on edge ∈ [0,1]. PostRenderer/Path B pass `reveal` = appear(t,0.35,0.45) == lineReveal(t),
  // so the trace draws via strokeDashoffset exactly as today (byte-identity). The clip-wipe + marker
  // pop + annotation fade derive their t back out of `reveal` (reveal IS lineReveal(t)).
  const edge = clamp01(reveal);

  if (plan.empty) {
    // PL-0.9: render the svg as the root with `block h-full w-full` + preserveAspectRatio="meet" (the
    // RangeBars/Divergence pattern). In a width-only flow (Path B) the viewBox aspect still drives the
    // height; inside PostRenderer's aspect-matched box (height-constrained) `h-full` binds it to the row.
    return (
      <svg viewBox={`0 0 ${width} ${plan.height}`} className="block h-full w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label={caption ?? "line chart"} data-line data-line-empty />
    );
  }

  const xSpan = WIDTH - PAD.right - PAD.left;
  const clipW = edge * xSpan;
  const clipId = `${uid}-line-clip`;
  const hasFill = plan.variant === "area" && plan.series.some((s) => s.fillPath);

  // yAt for the gridline ticks — the planner pins the same closed form; recompute here for the tick
  // lines/labels (identical numbers to the pre-retrofit component). PL-6: a legend (any labeled chart)
  // pushes the plot top down (plan.plotTop = PAD.top + legendBand); unlabeled → plotTop == PAD.top so the
  // geometry is byte-identical.
  const plotTop = plan.plotTop;
  const innerH = plan.height - plotTop - padding.bottom;
  const yAtTick = (v: number) => plotTop + innerH - ((v - plan.yMin) / (plan.yMax - plan.yMin)) * innerH;

  return (
    <svg viewBox={`0 0 ${width} ${plan.height}`} className="block h-full w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label={caption ?? "line chart"} data-line data-line-variant={plan.variant}>
        {hasFill && (
          <defs>
            <clipPath id={clipId}>
              <rect data-line-clip data-line-clip-w={clipW} x={padding.left} y={plotTop} width={Math.max(0, clipW)} height={innerH} />
            </clipPath>
          </defs>
        )}

        {plan.tickLabels.map((tk, i) => (
          <g key={`${uid}-tk-${i}`}>
            <line x1={padding.left} x2={width - padding.right} y1={yAtTick(tk.value)} y2={yAtTick(tk.value)} stroke="rgba(184,178,167,0.10)" strokeWidth={stroke.grid} />
            {/* PL-0.9 declutter: hide a tick LABEL that collides with an x-label / annotation (the
                gridline stays). A no-op for in-band ticks — every fitting fixture keeps all labels. */}
            {tk.show && (
              <text x={padding.left - 14} y={yAtTick(tk.value) + 8} textAnchor="end" fill="#B8B2A7" fontFamily="'JetBrains Mono', monospace" fontSize={text.axisLabel} letterSpacing="0.04em">
                {plan.yFormat(tk.value)}
              </text>
            )}
          </g>
        ))}

        {plan.xLabels.map((xl) => (
          <text key={`${uid}-x-${xl.index}`} x={xl.x} y={plan.height - 14} textAnchor="middle" fill="#B8B2A7" fontFamily="'JetBrains Mono', monospace" fontSize={text.axisLabel} letterSpacing="0.16em">
            {xl.label}
          </text>
        ))}

        {/* PL-6 LEGEND — a colour-swatch + series-label strip ABOVE the plot, for ANY LABELED chart
            (≥1 labeled series; the descriptive series identity reads OFF the plot, so the end-label stays
            a short value at the line terminus — the honest-factor fix, including the single-series case).
            Layout-reserved chrome (present from frame 1, opacity 1, no mount/unmount). text-anchor="start"
            so it is NOT counted as an x-axis label by the inspector. Unlabeled charts emit an empty legend
            → nothing renders → byte-identical. */}
        {plan.legend.length > 0 && (
          <g data-line-legend>
            {plan.legend.map((leg, i) => (
              <g key={`${uid}-leg-${i}`} data-line-legend-item={i}>
                <rect x={leg.swatch.x} y={leg.swatch.y} width={leg.swatch.size} height={leg.swatch.size} rx={3} fill={leg.color} />
                <text
                  x={leg.text.x}
                  y={leg.text.y}
                  textAnchor="start"
                  fill="#B8B2A7"
                  fontFamily="'JetBrains Mono', monospace"
                  fontSize={text.axisLabel}
                  letterSpacing="0.04em"
                  data-line-legendlabel
                >
                  {leg.label}
                </text>
              </g>
            ))}
          </g>
        )}

        {plan.series.map((s, idx) => (
          <LineSeriesG key={`${uid}-s-${idx}`} s={s} index={idx} reveal={edge} clipId={hasFill && s.fillPath ? clipId : undefined} variant={plan.variant} />
        ))}

        {plan.annotations.map((a, i) =>
          a.show ? <Annotation key={`${uid}-a-${i}`} a={a} index={i} reveal={edge} /> : null,
        )}
    </svg>
  );
}

// One series: the draw-on trace (strokeDashoffset, NO CSS transform), the optional area fill (clip-
// wiped under the trace), the end-dot, the end-label, and the optional vertex markers (pop at the edge).
function LineSeriesG({ s, index, reveal, clipId, variant }: { s: PlannedLineSeries; index: number; reveal: number; clipId?: string; variant: LineVariant }) {
  const drawn = reveal >= 1;
  const stepCount = Math.max(1, s.values.length - 1);
  return (
    <g data-line-series={index}>
      {/* Area fill — clip-wiped under the trace (the AreaChart mechanism; NO CSS transform). */}
      {variant === "area" && s.fillPath && clipId && (
        <path d={s.fillPath} fill={s.color} fillOpacity={FILL_OPACITY_SIMPLE} stroke="none" clipPath={`url(#${clipId})`} data-line-fill />
      )}
      <path
        d={s.linePath}
        fill="none"
        stroke={s.color}
        strokeWidth={stroke.chartLine}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset={1 - reveal}
        opacity={0.98}
        style={{ filter: `drop-shadow(0 0 10px ${s.color}55)` }}
        data-line-path
      />
      {/* Vertex markers — ALWAYS mounted (layout reserved from frame 1, never mount/unmount — memory
          feedback_layout_stability_under_animation). They pop as the draw-on edge passes each vertex:
          opacity 0 until the edge arrives, then a brief scale pop settling to scale 1 (NO transform at
          settle). The end-dot is NOT a marker (always drawn below). */}
      {s.markers.map((m, k) => {
        const f = k / stepCount;
        const pop = markerVisibleAt(reveal, f); // ∈ [0,1]; 1 once the edge has passed (settled)
        const settled = pop >= 1;
        return (
          <circle
            key={`m-${k}`}
            data-line-marker={k}
            cx={m.x}
            cy={m.y}
            r={MARKER_R}
            fill={s.color}
            stroke="#1F1C1A"
            strokeWidth={MARKER_RING}
            opacity={pop > 0 ? 1 : 0}
            style={settled ? undefined : { transform: `scale(${pop})`, transformOrigin: `${m.x}px ${m.y}px`, transformBox: "fill-box" }}
          />
        );
      })}
      <circle cx={s.endDot.x} cy={s.endDot.y} r={7} fill={s.color} opacity={drawn ? 1 : 0} style={{ filter: `drop-shadow(0 0 10px ${s.color})` }} data-line-enddot />
      {s.endLabel.show && (
        <text
          x={s.endLabel.x}
          y={s.endLabel.y}
          textAnchor="end"
          fontFamily="'Space Grotesk', sans-serif"
          fontWeight={600}
          fontSize={28}
          fill={s.color}
          opacity={reveal >= 0.95 ? 1 : 0}
          letterSpacing="0.01em"
          data-line-endlabel
        >
          {s.endLabel.text}
        </text>
      )}
    </g>
  );
}

// An annotation: a neutral leader from the anchored vertex to an offset label box, fading in AFTER the
// line settles (annotationOpacity ramps from DRAW_END). Anchored to FINAL vertex positions (data-fixed).
function Annotation({ a, index, reveal }: { a: PlannedAnnotation; index: number; reveal: number }) {
  // reveal == lineReveal(t) saturates at 1 for t ≥ DRAW_END (0.80) — annotations fade in AFTER the
  // line settles, so they appear (opacity 1) once the edge completes and are 0 (hidden) while it draws.
  const opacity = reveal >= 1 ? 1 : 0;
  return (
    <g data-line-annotation={index} opacity={opacity}>
      <line x1={a.leader.x1} y1={a.leader.y1} x2={a.leader.x2} y2={a.leader.y2} stroke={ANN_LEADER_COLOR} strokeWidth={ANN_LEADER} />
      <text x={a.label.x} y={a.label.y} textAnchor={a.label.anchor} fill="#B8B2A7" fontFamily="'JetBrains Mono', monospace" fontSize={ANN_LABEL_PX} letterSpacing="0.02em" data-line-annlabel>
        {a.label.text}
      </text>
    </g>
  );
}
