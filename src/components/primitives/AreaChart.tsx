// AreaChart — magnitude / volume under a curve over an ordered axis (PL-2.4, Epic PL-2 chart
// family). One (simple) or up to three (stacked) series filled from a 0 baseline.
//
//   simple (default): ONE series filled from 0 — the volume of a single quantity over the axis.
//   stacked (mode knob): ≤3 layers summed into a composition of a total over the ordered axis.
//
// All layout comes from planArea (src/lib/area.ts) — the pure brain shared with the check suite.
// Geometry is a pure function of DATA, never `t` (C10): every fill/stroke path's `d` is fixed by the
// plan and BYTE-IDENTICAL across the timeline. An area is CONNECTED geometry, so it builds as ONE
// left→right leading edge (the PL-1.3 continuous-edge rule) — NOT an overlapping per-series stagger.
//
// MECHANISM (§3 ruling 3): the reveal is a single expanding <clipPath> rect from PLOT_X0 to
// PLOT_X0 + areaEdge(t)·xSpan that clips the FINAL, static fill+stroke paths. The clip-rect WIDTH is
// the ONLY t-driven geometry (plus label opacity) — there is NO CSS transform on the area path at all,
// so the gate reads the path `d` as invariant and the only thing that changes is the clip width. At
// t ≥ EDGE_END the clip is fully open (width == full xSpan); the area is shown whole, never a lingering
// identity clip. Props default to t=1 (clip fully open + labels shown) so Path B imports it static.
//
// Source-px viewBox (1000×640) scaled to the Panel content box, exactly like BarChart/Divergence —
// the inspector reads viewBox coordinates as the single deterministic system.
// Spec: planning/primitive-library/handoffs/PL-2.4-area.md §2.5 / §2.7 / §3.

import { useId } from "react";
import type { Accent } from "@/posts/renderTypes";
import { colors, stroke } from "@/tokens/design";
import {
  planArea,
  areaEdge,
  endLabelStart,
  annotationOpacity,
  type AreaMode,
  type PlannedSeries,
  type PlannedAreaAnnotation,
  VIEW_W,
  VIEW_H,
  PLOT_X0,
  PLOT_X1,
  PLOT_Y0,
  BASELINE_Y,
  X_LABEL_Y,
  AREA_STROKE,
  FILL_OPACITY_SIMPLE,
  FILL_OPACITY_STACKED,
  AXIS_LABEL_PX,
  END_LABEL_PX,
  LABEL_STAMP_DUR,
  ANN_LABEL_PX,
  ANN_LEADER,
  ANN_LEADER_COLOR,
} from "@/lib/area";
import { formatTick } from "@/lib/bars";

const accentHex = (a: string): string => colors.accent[a as Accent] ?? colors.accent.cyan;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const GRID_COLOR = "rgba(184,178,167,0.30)";

type AreaSeriesProp = { label?: string; values?: number[]; accent?: Accent; endValueLabel?: string };
// PL-4.2 — ≤3 author callouts (OPTIONAL; default absent → no annotation nodes → byte-identical).
type AreaAnnotationInput = { seriesIndex?: number; x: number | string; label: string };

type Props = {
  series: AreaSeriesProp[];
  xLabels?: string[];
  mode?: AreaMode;
  valueLabels?: "auto" | "off";
  axisMin?: number;
  axisMax?: number;
  unit?: string;
  annotations?: AreaAnnotationInput[];
  caption?: string;
  t?: number;
};

export function AreaChart({
  series,
  xLabels,
  mode = "simple",
  valueLabels = "auto",
  axisMin,
  axisMax,
  unit,
  annotations,
  caption,
  t = 1,
}: Props) {
  const uid = useId();
  const plan = planArea({ series, xLabels, mode, valueLabels, axisMin, axisMax, unit, annotations });

  const frameOn = clamp01((t - 0.26) / 0.08); // axis/gridlines/x-labels/legend appear (opacity-only)

  // viewBox px position of a value along the value axis (gridlines + ticks). axisMin is 0.
  const span = plan.axisMax - plan.axisMin || 1;
  const growLen = BASELINE_Y - PLOT_Y0;
  const valueY = (v: number) => BASELINE_Y - ((v - plan.axisMin) / span) * growLen;

  if (plan.empty) {
    return (
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="block h-full w-full"
        role="img"
        aria-label={caption ?? "magnitude over an ordered axis"}
        data-area
        data-area-mode={plan.mode}
        data-area-empty
      />
    );
  }

  // ── The reveal clip-rect (§3 ruling 3) — the ONLY t-driven geometry. Width = areaEdge(t)·xSpan,
  //    from PLOT_X0. At t ≥ EDGE_END the edge is 1 → full width (clip fully open). NO CSS transform.
  const xSpan = PLOT_X1 - PLOT_X0;
  const edge = areaEdge(t); // ∈ [0,1]
  const clipW = edge * xSpan;
  const clipId = `${uid}-area-clip`;
  // A tiny top/bottom pad so the rim stroke isn't clipped along the top edge.
  const clipPadY = AREA_STROKE;

  const labelStart = endLabelStart();

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="block h-full w-full"
      role="img"
      aria-label={caption ?? "magnitude over an ordered axis"}
      data-area
      data-area-mode={plan.mode}
    >
      <defs>
        {/* The single left→right reveal clip shared by every series (ONE continuous edge). */}
        <clipPath id={clipId}>
          <rect
            data-area-clip
            data-area-clip-w={clipW}
            x={PLOT_X0}
            y={PLOT_Y0 - clipPadY}
            width={Math.max(0, clipW)}
            height={growLen + clipPadY * 2}
          />
        </clipPath>
      </defs>

      {/* Axis baseline + ticks + gridlines (opacity-only reveal; geometry reserved frame 1). */}
      <g opacity={frameOn} data-area-axis>
        <line x1={PLOT_X0} x2={PLOT_X1} y1={BASELINE_Y} y2={BASELINE_Y} stroke={GRID_COLOR} strokeWidth={stroke.grid} data-area-baseline />
        {plan.ticks.map((tick, i) => {
          const p = valueY(tick);
          return (
            <g key={`${uid}-tick-${i}`} data-area-tick={i}>
              <line x1={PLOT_X0} x2={PLOT_X1} y1={p} y2={p} stroke={GRID_COLOR} strokeWidth={stroke.grid} opacity={i === 0 ? 1 : 0.5} />
              {/* The baseline (i===0) value label is omitted: it is 0 by construction (magnitude axis)
                  and its row is where the x-axis labels live — drawing it would collide with the first
                  x-label sitting at PLOT_X0. The baseline GRIDLINE still renders. */}
              {i !== 0 && (
                <text x={PLOT_X0 - 12} y={p + 8} textAnchor="end" fill={colors.text.tertiary} fontFamily="'JetBrains Mono', monospace" fontSize={AXIS_LABEL_PX} letterSpacing="0.04em">
                  {formatTick(tick, plan.unit)}
                </text>
              )}
            </g>
          );
        })}
      </g>

      {/* X-axis labels (every-k, fit-or-hide) — opacity-only reveal, slots reserved frame 1. The
          first/last labels anchor inward (start/end) so a wide label at PLOT_X0/PLOT_X1 never spills
          past the viewBox edge (the bars outer-tick convention). */}
      <g opacity={frameOn} data-area-xaxis>
        {plan.xTicks.map((xt) => {
          if (!xt.show) return null;
          const isFirst = xt.index === 0;
          const isLast = xt.index === plan.xTicks.length - 1;
          const anchor: "start" | "middle" | "end" = isFirst ? "start" : isLast ? "end" : "middle";
          return (
            <text
              key={`${uid}-x-${xt.index}`}
              x={xt.x}
              y={X_LABEL_Y + AXIS_LABEL_PX}
              textAnchor={anchor}
              fill={colors.text.primary}
              fontFamily="'JetBrains Mono', monospace"
              fontSize={AXIS_LABEL_PX}
              letterSpacing="0.04em"
              data-area-xlabel
            >
              {xt.label}
            </text>
          );
        })}
      </g>

      {/* Legend (stacked, ≥1 non-empty label) — top band, opacity-only. */}
      {plan.mode === "stacked" && plan.legend.some((l) => l.label.trim().length > 0) && (
        <g opacity={frameOn} data-area-legend>
          {plan.legend.map((leg, i) => {
            const chipX = PLOT_X0 + i * 200;
            if (chipX > VIEW_W - 80 || leg.label.trim().length === 0) return null;
            return (
              <g key={`${uid}-leg-${i}`} transform={`translate(${chipX} 40)`}>
                <rect x={0} y={-14} width={18} height={18} rx={3} fill={accentHex(leg.accentKey)} />
                <text x={26} y={2} fill={colors.text.secondary} fontFamily="'JetBrains Mono', monospace" fontSize={AXIS_LABEL_PX} letterSpacing="0.06em">
                  {leg.label.slice(0, 14)}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* Fills + top-edge rims — clipped by the ONE reveal rect. STACKED: drawn back-to-front (base
          layer first) so opaque bands stack correctly. The FINAL path `d` is constant across t. */}
      <g clipPath={`url(#${clipId})`}>
        {plan.series.map((s, i) => (
          <AreaLayer key={`${uid}-s-${i}`} s={s} index={i} stacked={plan.mode === "stacked"} />
        ))}
      </g>

      {/* End labels — fade in after the edge passes (right gutter, fit-or-hide via the plan). */}
      {plan.series.map((s, i) =>
        s.endLabel.show ? (
          <EndLabel key={`${uid}-end-${i}`} s={s} t={t} labelStart={labelStart} />
        ) : null,
      )}

      {/* Annotations (≤3) — a NEUTRAL leader from the upper edge to an offset label, fading in AFTER the
          fill edge settles (annotationOpacity, keyed off EDGE_END). Hidden ones (fit/collision) are NOT
          rendered. Absent ⇒ nothing here ⇒ byte-identical default (PL-4.2). */}
      {plan.annotations.map((a, i) =>
        a.show ? <AreaAnnotation key={`${uid}-ann-${i}`} a={a} index={i} t={t} /> : null,
      )}
    </svg>
  );
}

// ── One annotation: a neutral leader from the anchored upper-edge vertex to an offset label box; fades
//    in AFTER the fill edge settles. Anchored to FINAL vertex positions (data-fixed, never f(t)). ──────
function AreaAnnotation({ a, index, t }: { a: PlannedAreaAnnotation; index: number; t: number }) {
  const opacity = annotationOpacity(t); // 0 until the edge settles (EDGE_END), 1 by ~0.70 and at t=1
  return (
    <g data-area-annotation={index} opacity={opacity}>
      <line
        x1={a.leader.x1}
        y1={a.leader.y1}
        x2={a.leader.x2}
        y2={a.leader.y2}
        stroke={ANN_LEADER_COLOR}
        strokeWidth={ANN_LEADER}
        data-area-annleader
      />
      <text
        x={a.label.x}
        y={a.label.y}
        textAnchor={a.label.anchor}
        fill="#B8B2A7"
        fontFamily="'JetBrains Mono', monospace"
        fontSize={ANN_LABEL_PX}
        letterSpacing="0.02em"
        data-area-annlabel
      >
        {a.label.text}
      </text>
    </g>
  );
}

// ── One filled layer: the fill region + the decorative top-edge rim (AREA_STROKE=6) ──────────────
function AreaLayer({ s, index, stacked }: { s: PlannedSeries; index: number; stacked: boolean }) {
  if (!s.fillPath) return null; // single-point guard — no degenerate path
  const hex = accentHex(s.accentKey);
  const fillOpacity = stacked ? FILL_OPACITY_STACKED : FILL_OPACITY_SIMPLE;
  return (
    <g data-area-series={index} data-area-accent={s.accentKey}>
      <path d={s.fillPath} fill={hex} fillOpacity={fillOpacity} stroke="none" data-area-path />
      {/* Decorative rim — defines the fill edge / separates adjacent stacked layers (§3 ruling 1). */}
      <path
        d={s.edgePath}
        fill="none"
        stroke={hex}
        strokeWidth={AREA_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-area-edge
      />
    </g>
  );
}

// ── Per-series end label (right gutter, right-anchored) — fades in after the edge passes ─────────
function EndLabel({ s, t, labelStart }: { s: PlannedSeries; t: number; labelStart: number }) {
  const op = clamp01((t - labelStart) / LABEL_STAMP_DUR);
  // Clamp the baseline inside the plot so a low-ending series never drops into the x-label band.
  const y = Math.max(PLOT_Y0 + END_LABEL_PX, Math.min(s.endLabel.y + 9, BASELINE_Y - 4));
  return (
    <text
      x={s.endLabel.x}
      y={y}
      textAnchor="end"
      fill={accentHex(s.accentKey)}
      fontFamily="'Space Grotesk', sans-serif"
      fontWeight={600}
      fontSize={END_LABEL_PX}
      opacity={op}
      data-area-endlabel
    >
      {s.endLabel.text}
    </text>
  );
}
