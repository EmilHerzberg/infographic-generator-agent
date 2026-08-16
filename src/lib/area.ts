// PL-2.4 — Area / stacked-area plan: the pure "area brain" shared by the renderer
// (PostRenderer → AreaChart) and the deterministic check suite (tools/qa-area.mjs). Like
// bars.ts / donut.ts it is dependency-light (only d3-scale's scaleLinear + estW from stack.ts
// + accentForIndex/niceMax/formatTick/formatValue from bars.ts — REUSED, never duplicated) so
// Node's native type-stripping can unit-test it without a DOM.
//
// `area` expresses MAGNITUDE / VOLUME under a curve over an ORDERED axis — the filled region
// between a series' trace and a 0 baseline. Two modes:
//   simple (default): ONE series filled from 0 — the volume of a single quantity over the axis.
//   stacked: 2–3 series summed into a COMPOSITION of a total over the ordered axis (manual
//            running sum; each layer's thickness is its contribution; the top edge is the total).
//
// `planArea` owns EVERY geometry decision — knob coercion → series cap → per-series stride
// downsample → truncate-to-common-MIN-length → negatives→0 → 0-baseline axis derivation + guard
// → manual stacked cumulative sums → per-series upper/lower edge points (normalized viewBox space)
// → the M…L…Z fill path + top-edge stroke path strings → every-k x-label fit-or-hide → end-label
// fit/collision → layer-thickness floor → degenerate flags — all from DATA only, never `t`. The
// reveal (the left→right clip wipe) is a pure function of `t` (areaEdge), shared with the renderer
// and the check so they agree. Spec: planning/primitive-library/handoffs/PL-2.4-area.md §2 / §3.

import { scaleLinear } from "d3-scale";
import { estW } from "./stack.ts";
import { accentForIndex, niceMax, formatValue, type AccentKey } from "./bars.ts";

// ── Fixed viewBox geometry (source px) — §2.4 ──────────────────────────────────────────────
export const VIEW_W = 1000;
export const VIEW_H = 640;

export const PLOT_X0 = 120; // left gutter for y-ticks (matches bars vertical)
export const PLOT_X1 = 980; // right edge of the plot; end labels live in [984, 996]
export const PLOT_Y0 = 70; // top of the fill height
export const BASELINE_Y = 560; // value baseline (axisMin=0); fill grows UP to here is the floor
export const X_LABEL_Y = 564; // x labels live in [564, 600] (REUSE bars CAT_LABEL_Y band)
export const GROW_HEIGHT = BASELINE_Y - PLOT_Y0; // 490

// Vertical-fill scaled geometry (Emil's 9:16 feedback; mirrors bars.ts `barsVGeom`). Every plot
// y-coordinate + the viewBox height multiplied by `vScale` (1 = the source 640-tall reference), so the
// area fills the tall frame. The component derives its own axis/label y from the SAME helper. x untouched.
// Default 1 ⇒ portrait/square + every deterministic check (which never passes a scale) stay byte-identical.
export type AreaVGeom = { VIEW_H: number; PLOT_Y0: number; BASELINE_Y: number; X_LABEL_Y: number; GROW_HEIGHT: number };
export function areaVGeom(vScale = 1): AreaVGeom {
  const s = Number.isFinite(vScale) && vScale > 0 ? vScale : 1;
  return { VIEW_H: Math.round(VIEW_H * s), PLOT_Y0: PLOT_Y0 * s, BASELINE_Y: BASELINE_Y * s, X_LABEL_Y: X_LABEL_Y * s, GROW_HEIGHT: GROW_HEIGHT * s };
}

export const MAX_SERIES = 3; // C1 — stacked bands get muddy fast; 3 accent-mapped layers is the ceiling
export const MAX_POINTS = 24; // C2 — x resolution; >24 reads as noise at mobile scale
export const TICK_COUNT = 4; // C3 — 5 gridlines incl. baseline (REUSE bars)

// C7 mobile floors (÷2.77; memory feedback_mobile_first_sizing). AREA_STROKE = 6 per §3 ruling 1:
// the top-edge rim is DECORATIVE (defines the fill edge / separates adjacent stacked layers), so it
// is NOT subject to the 3px DATA-bearing stroke floor (that floor is for data-carrying strokes like
// the LineChart trend line). 6px (≈2.2px @390) gives anti-alias definition without being a hairline.
// The BINDING legibility gates are the 14px min stacked-layer thickness (a thinner layer is dropped +
// surfaced — it cannot read as a band) AND the per-layer fill opacity that keeps adjacent stacked
// fills distinguishable by HUE (FILL_OPACITY_STACKED, distinct accents, lowContrast stays clean).
export const AREA_STROKE = 6;
export const SEG_THICKNESS_FLOOR = 14; // min painted stacked-layer thickness at its THICKEST x

// Per-layer fill opacity (§2.6 C6 / §3 ruling 1). simple: a single translucent fill under a full
// rim. stacked: each layer is near-opaque over its accent (NOT translucent-overlapping — adjacent
// bands stay distinguishable by hue, not transparency math), distinct accents per layer.
export const FILL_OPACITY_SIMPLE = 0.22;
export const FILL_OPACITY_STACKED = 0.85;

export const AXIS_LABEL_PX = 24; // y-tick + x-label source size (→ 8.7px @390; eff-font ≥ 18 gate)
export const END_LABEL_PX = 28; // per-series end label (→ 10.1px @390)
export const END_LABEL_MAX_CP = 8; // end-label codepoint cap

// ── PL-4.2 annotations (knob #2) — PORTED from src/lib/line.ts (the LineChart resolver), shared
//    constants + decision logic so the two siblings agree. ≤3 author callouts that name an event at
//    an x (peak / launch / outage). A NEUTRAL leader from the series' UPPER edge at that x to an offset
//    label box; placed ABOVE the anchor (BELOW when the anchor sits in the top 20% of the plot); fit-or-
//    hide by estW; a collision with a shown end-label / another shown annotation hides the LATER one.
//    Geometry is pure-from-DATA (never `t`); the callouts fade in AFTER the fill edge settles
//    (annotationOpacity, keyed off EDGE_END). DEFAULT (absent) ⇒ no annotation nodes ⇒ byte-identical.
export const MAX_ANNOTATIONS = 3; // mirrors line.ts C6
export const ANN_LABEL_MAX_CP = 18; // codepoint cap
export const ANN_LABEL_PX = 24; // axis-label family (→ 8.7px @390; eff-font ≥ 18 gate)
export const ANN_LEADER = 2; // leader stroke px (neutral connector — < the 2.5px occlusion-gate floor)
export const ANN_LEADER_COLOR = "rgba(184,178,167,0.6)"; // neutral-connector rule (184,178,167 → sat ≈0.09)
export const ANN_OFFSET = 56; // viewBox px the label box sits above (or below) its anchor

// X-label strategy (C8): show all if n ≤ 8, else every-k with k = ceil(n / 8) (first/last always).
const MAX_X_LABELS = 8;

// ── Animation timing (§2.5) — fill-rise via ONE left→right continuous edge ──────────────────────
export const EDGE_START = 0.34;
export const EDGE_DUR = 0.3;
export const EDGE_END = EDGE_START + EDGE_DUR; // 0.64 — well inside the 0.85 settle deadline
export const SETTLE_DEADLINE = 0.85;
export const LABEL_STAMP_DUR = 0.06; // end labels fade over [EDGE_END, EDGE_END + this] (done 0.70)
export const ANN_FADE_DUR = 0.06; // annotations fade over [EDGE_END, EDGE_END + this] (done 0.70) — AFTER the edge settles

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

// ── PL-0.8 row-aware bounds (the histogram/scatter/candlestick pattern) ─────────────────────────
// The renderer measures its row's px aspect and passes `viewH` so the viewBox aspect MATCHES the row
// and the SVG fills the FULL row width (a fixed 640-high box letterboxes into a short square row at a
// fraction of the width — Emil's format-bench feedback). The vScale-stretched geometry (areaVGeom) is
// the CEILING: vertical's tall rows keep the approved stretched fill byte-identically; only SHORTER
// rows compress the grow band (top air + the x-label band stay fixed px). viewH omitted or ≥ ceiling
// → areaVGeom verbatim (byte-identical; the check suites pass none).
export const MIN_VIEW_H = 320;
export function areaBounds(vScale = 1, viewH?: number): AreaVGeom {
  const AV = areaVGeom(vScale);
  if (!isNum(viewH)) return AV;
  const vH = Math.round(Math.max(MIN_VIEW_H, Math.min(AV.VIEW_H, viewH)));
  if (vH >= AV.VIEW_H) return AV;
  const baseline = vH - (AV.VIEW_H - AV.BASELINE_Y);
  return {
    VIEW_H: vH,
    PLOT_Y0: AV.PLOT_Y0,
    BASELINE_Y: baseline,
    X_LABEL_Y: baseline + (AV.X_LABEL_Y - AV.BASELINE_Y),
    GROW_HEIGHT: baseline - AV.PLOT_Y0,
  };
}

// estW() is calibrated at 26px (stack.ts). X-labels render at AXIS_LABEL_PX → scale the estimate.
// (End labels are fit by codepoint cap + gutter collision, not estW width, so no end-label scale.)
const EST_SCALE_X = AXIS_LABEL_PX / 26;
const estXPx = (s: string) => estW(s) * EST_SCALE_X;
// Annotation labels render at ANN_LABEL_PX → scale the same 26px-calibrated estimate (mirror line.ts).
const EST_SCALE_ANN = ANN_LABEL_PX / 26;
const estAnnPx = (s: string) => estW(s) * EST_SCALE_ANN;

export type AreaMode = "simple" | "stacked";

export type PlanAreaInput = {
  series?: { label?: string; values?: number[]; accent?: string; endValueLabel?: string }[];
  xLabels?: string[];
  mode?: AreaMode | string;
  valueLabels?: "auto" | "off" | string;
  axisMin?: number;
  axisMax?: number;
  unit?: string;
  annotations?: { seriesIndex?: number; x?: number | string; label?: string }[]; // PL-4.2 — ≤3 callouts
  vScale?: number; // vertical-fill scale (default 1 → byte-identical); see areaVGeom
  /** PL-0.8 — row-aware viewBox height (renderer-measured). Omitted → the vScale ceiling. */
  viewH?: number;
};

export type Pt = { x: number; y: number }; // normalized viewBox space

// PL-4.2 — a resolved annotation: a neutral leader from a series' UPPER-edge vertex to an offset label
// box, with the placement + fit-or-hide decision (mirror of line.ts PlannedAnnotation). Pure-from-DATA.
export type PlannedAreaAnnotation = {
  seriesIndex: number;
  vertexIndex: number;
  anchor: Pt;
  leader: { x1: number; y1: number; x2: number; y2: number };
  label: { text: string; x: number; y: number; anchor: "start" | "middle" | "end" };
  show: boolean;
  hideReason?: string;
};

export type EndLabel = {
  text: string;
  x: number;
  y: number;
  show: boolean;
  hideReason?: "off" | "empty" | "tooLong" | "collide";
};

export type PlannedSeries = {
  accentKey: AccentKey;
  upper: Pt[]; // top edge (left→right) — viewBox coords, FINAL, never f(t)
  lower: Pt[]; // lower edge (baseline for simple; prev running-sum for stacked), left→right
  fillPath: string; // "M…L…Z" closed region (down the upper edge L→R, back along the lower edge R→L)
  edgePath: string; // upper polyline only (the stroked rim)
  values: number[]; // post-clamp data values (axis-correctness check + count-up)
  runningUpper?: number[]; // stacked: cumulative value at each x (axis check)
  endLabel: EndLabel;
  maxThicknessPx: number; // for the layer-floor check
};

export type XTick = { index: number; x: number; label: string; show: boolean };

export type AreaPlan = {
  mode: AreaMode;
  axisMin: 0;
  axisMax: number;
  ticks: number[];
  unit: string;
  series: PlannedSeries[];
  xTicks: XTick[]; // every-k applied
  legend: { label: string; accentKey: AccentKey }[];
  valueLabels: "auto" | "off";
  annotations: PlannedAreaAnnotation[]; // PL-4.2 — [] when absent (byte-identical default)
  vgeom: AreaVGeom; // the EFFECTIVE (vScale + row-aware) bounds the renderer must draw with
  dropped: {
    seriesDropped: number;
    pointsDropped: number;
    layersDropped: number;
    hiddenLabels: number;
    annotationsDropped: number; // over MAX_ANNOTATIONS
    annotationsUnresolved: number; // x didn't resolve to a vertex
    annotationsHidden: number; // resolved but hidden (tooLong / spill / collide)
  };
  empty: boolean;
  singlePoint: boolean;
};

// ── Continuous-edge timing (§2.5; mirror stack.ts / donut.ts) — shared by render + check ────────
// cubic-bezier(0.65,0,0.35,1) — easeInOutCubic, motionRole.chartGrow. Implemented locally (40-step
// bisection on the monotone x-polynomial) so render + check share one implementation, dependency-free
// for Node unit testing. The SAME ease bars.ts / stack.ts / donut.ts use.
const X1 = 0.65;
const X2 = 0.35;
const bez = (p: number, a1: number, a2: number) => (((1 - 3 * a2 + 3 * a1) * p + (3 * a2 - 6 * a1)) * p + 3 * a1) * p;
function chartGrowEase(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (bez(mid, X1, X2) < x) lo = mid;
    else hi = mid;
  }
  return bez((lo + hi) / 2, 0, 1);
}

/** The fraction of the x-span revealed by the left→right leading edge ∈ [0,1] — eased, =1 at
 *  t ≥ EDGE_END. ALL series share ONE edge (connected geometry, same x domain). */
export function areaEdge(t: number): number {
  return chartGrowEase(clamp01((t - EDGE_START) / EDGE_DUR));
}

/** When end labels begin to fade in — the instant the edge completes (labels follow the edge). */
export function endLabelStart(): number {
  return EDGE_END;
}

/** PL-4.2 — annotation fade-in opacity ∈ [0,1]: ramps from EDGE_END over ANN_FADE_DUR, so callouts
 *  appear AFTER the fill edge settles. =0 at/below EDGE_END, =1 by ~0.70 (and at t=1 → thumbnail-safe).
 *  Mirrors line.ts annotationOpacity (which keys off DRAW_END, the line's settle instant). */
export function annotationOpacity(t: number): number {
  return clamp01((t - EDGE_END) / ANN_FADE_DUR);
}

/**
 * The pure area layout brain. Coerces knobs, caps series, stride-downsamples + truncates to a common
 * length, clamps negatives, derives the 0-baseline axis (per-x TOTAL for stacked / max for simple),
 * builds the manual stacked cumulative sums → per-series upper/lower edges → fill+edge path strings,
 * applies the layer-thickness floor, every-k x-label fit-or-hide, and end-label fit/collision — all
 * from DATA, never `t`.
 */
export function planArea(input: PlanAreaInput): AreaPlan {
  // 1. Coerce knobs (unknown → default).
  const mode: AreaMode = input.mode === "stacked" ? "stacked" : "simple";
  const valueLabels: "auto" | "off" = input.valueLabels === "off" ? "off" : "auto";
  const unit = typeof input.unit === "string" ? input.unit : "";
  // Vertical-fill scaled + row-aware geometry (defaults → byte-identical). Used for EVERY plot y below.
  const AV = areaBounds(input.vScale, input.viewH);

  const dropped = {
    seriesDropped: 0,
    pointsDropped: 0,
    layersDropped: 0,
    hiddenLabels: 0,
    annotationsDropped: 0,
    annotationsUnresolved: 0,
    annotationsHidden: 0,
  };

  // 2. Normalize series → { label, values[], accent, endValueLabel }.
  const rawSeries = Array.isArray(input.series) ? input.series : [];
  type NormSeries = { label: string; values: number[]; accent?: string; endValueLabel?: string };
  let series: NormSeries[] = rawSeries.map((s) => ({
    label: typeof s?.label === "string" ? s.label : "",
    values: Array.isArray(s?.values) ? s!.values!.map((v) => (isNum(v) ? Math.max(0, v) : 0)) : [],
    accent: typeof s?.accent === "string" ? s.accent : undefined,
    endValueLabel: typeof s?.endValueLabel === "string" ? s.endValueLabel : undefined,
  }));

  // Drop series with no points up-front (an empty values[] cannot form a layer).
  series = series.filter((s) => s.values.length > 0);

  const emptyPlan = (): AreaPlan => ({
    mode,
    axisMin: 0,
    axisMax: 1,
    ticks: [0, 0.25, 0.5, 0.75, 1],
    unit,
    series: [],
    xTicks: [],
    legend: [],
    valueLabels,
    annotations: [],
    vgeom: AV,
    dropped,
    empty: true,
    singlePoint: false,
  });

  if (series.length === 0) return emptyPlan();

  // 3. Series cap (C1). simple = series[0] only (rest dropped + surfaced). stacked = ≤3 (tail-first).
  const maxSeries = mode === "stacked" ? MAX_SERIES : 1;
  if (series.length > maxSeries) {
    dropped.seriesDropped = series.length - maxSeries;
    series = series.slice(0, maxSeries);
  }

  // 4. Per-series stride decimation to ≤ MAX_POINTS (always keeps first & last, deterministic).
  series = series.map((s) => {
    const N = s.values.length;
    if (N <= MAX_POINTS) return s;
    dropped.pointsDropped += N - MAX_POINTS;
    const kept: number[] = [];
    for (let i = 0; i < MAX_POINTS; i++) {
      const idx = Math.round((i * (N - 1)) / (MAX_POINTS - 1));
      kept.push(s.values[idx]);
    }
    return { ...s, values: kept };
  });

  // 5. Truncate ALL series to the common MIN length (NOT pad — padding a short series with 0 invents
  //    a fake decline). The truncated tail counts as dropped points. Simple (1 series) is unaffected.
  const commonLen = Math.min(...series.map((s) => s.values.length));
  series = series.map((s) => {
    if (s.values.length > commonLen) dropped.pointsDropped += s.values.length - commonLen;
    return { ...s, values: s.values.slice(0, commonLen) };
  });

  const singlePoint = commonLen < 2;

  // 6. Axis derivation + guard (C3). axisMin = 0 always (magnitude). rawMax = simple max value /
  //    stacked max per-x column TOTAL (manual cumulative sum). axisMax = author ?? niceMax(rawMax).
  const axisMin = 0 as const;
  let rawMax = 0;
  if (mode === "stacked") {
    for (let xi = 0; xi < commonLen; xi++) {
      let colTotal = 0;
      for (const s of series) colTotal += s.values[xi] ?? 0;
      if (colTotal > rawMax) rawMax = colTotal;
    }
  } else {
    rawMax = Math.max(0, ...series[0].values, 0);
  }
  let axisMax = isNum(input.axisMax) ? input.axisMax : niceMax(rawMax);
  if (axisMax <= 0) axisMax = 1;
  if (axisMax <= axisMin) axisMax = axisMin + 1; // max>min guard

  const ticks: number[] = [];
  for (let i = 0; i <= TICK_COUNT; i++) ticks.push(axisMin + ((axisMax - axisMin) * i) / TICK_COUNT);

  // 7. Scales. x over the index domain [0, commonLen-1]; y (linear) over [axisMin, axisMax].
  const lastIdx = Math.max(1, commonLen - 1); // span || 1 — a single point would give 0 width
  const xScale = scaleLinear().domain([0, lastIdx]).range([PLOT_X0, PLOT_X1]);
  const yScale = scaleLinear().domain([axisMin, axisMax]).range([AV.BASELINE_Y, AV.PLOT_Y0]);
  const xAt = (i: number): number => xScale(i) ?? PLOT_X0;
  const yAt = (v: number): number => {
    const clamped = Math.max(axisMin, Math.min(axisMax, v));
    return yScale(clamped) ?? AV.BASELINE_Y;
  };

  // 8. Manual stacked cumulative sums → per-series upper/lower edge points (normalized viewBox space).
  //    simple: lower = baseline; upper = the value trace. stacked: layer[i].lower = the running sum
  //    BELOW it (== layer[i-1].upper), layer[i].upper = the running sum INCLUDING it.
  const xs: number[] = [];
  for (let xi = 0; xi < commonLen; xi++) xs.push(xAt(xi));

  type Built = {
    norm: NormSeries;
    upper: Pt[];
    lower: Pt[];
    runningUpper: number[]; // cumulative value at each x (top of this layer)
    maxThicknessPx: number;
  };

  const cumulativeBelow: number[] = new Array(commonLen).fill(0); // running sum below the current layer
  const built: Built[] = series.map((s) => {
    const upper: Pt[] = [];
    const lower: Pt[] = [];
    const runningUpper: number[] = [];
    let maxThicknessPx = 0;
    for (let xi = 0; xi < commonLen; xi++) {
      const v = s.values[xi] ?? 0;
      const below = mode === "stacked" ? cumulativeBelow[xi] : 0;
      const above = below + v;
      const xPx = xs[xi];
      const yUpper = yAt(above);
      const yLower = yAt(below);
      upper.push({ x: xPx, y: yUpper });
      lower.push({ x: xPx, y: yLower });
      runningUpper.push(above);
      const thickness = yLower - yUpper; // px (yLower is lower on screen → larger y)
      if (thickness > maxThicknessPx) maxThicknessPx = thickness;
    }
    // advance the running sum below for the NEXT layer (stacked only).
    if (mode === "stacked") for (let xi = 0; xi < commonLen; xi++) cumulativeBelow[xi] += s.values[xi] ?? 0;
    return { norm: s, upper, lower, runningUpper, maxThicknessPx };
  });

  // 9. Layer-thickness floor (C7) — stacked only. A layer whose max thickness across x < 14px viewBox
  //    is dropped (it can't read as a band) + surfaced. Simple has no layer floor (one fill is its own
  //    magnitude). Dropping a middle layer would corrupt the cumulative sums, so the floor is applied
  //    by REBUILDING from the surviving layers (re-running the cumulative sum) — keeps the stack honest.
  //    EXCEPTION (§2.6.7 all-zero): when the whole stack sums to 0 everywhere (rawMax === 0), every
  //    layer is genuinely 0-thickness — the floor is SKIPPED so a flat baseline strip renders (not empty).
  let survivors = built;
  if (mode === "stacked" && rawMax > 0) {
    const keep = built.filter((b) => b.maxThicknessPx >= SEG_THICKNESS_FLOOR - 1e-6);
    if (keep.length < built.length) {
      dropped.layersDropped += built.length - keep.length;
      // Rebuild cumulative sums from the survivors only.
      const below2: number[] = new Array(commonLen).fill(0);
      survivors = keep.map((b) => {
        const upper: Pt[] = [];
        const lower: Pt[] = [];
        const runningUpper: number[] = [];
        let maxThicknessPx = 0;
        for (let xi = 0; xi < commonLen; xi++) {
          const v = b.norm.values[xi] ?? 0;
          const lo = below2[xi];
          const up = lo + v;
          const yUpper = yAt(up);
          const yLower = yAt(lo);
          upper.push({ x: xs[xi], y: yUpper });
          lower.push({ x: xs[xi], y: yLower });
          runningUpper.push(up);
          const thickness = yLower - yUpper;
          if (thickness > maxThicknessPx) maxThicknessPx = thickness;
        }
        for (let xi = 0; xi < commonLen; xi++) below2[xi] += b.norm.values[xi] ?? 0;
        return { ...b, upper, lower, runningUpper, maxThicknessPx };
      });
    }
  }

  // If every layer was dropped, fall to empty.
  if (survivors.length === 0) return emptyPlan();

  // 10. Path strings + accents + end labels. Build the M…L…Z fill (down the upper edge L→R, back
  //     along the lower edge R→L) and the top-edge stroke polyline. The single-point guard: a series
  //     with < 2 x positions has no width → a flat zero-width fill guard (no degenerate one-vertex path).
  const plannedSeries: PlannedSeries[] = [];
  const legend: { label: string; accentKey: AccentKey }[] = [];

  survivors.forEach((b, i) => {
    const accentKey = accentForIndex(b.norm.accent, i);
    const { fillPath, edgePath } = buildPaths(b.upper, b.lower, singlePoint);
    plannedSeries.push({
      accentKey,
      upper: b.upper,
      lower: b.lower,
      fillPath,
      edgePath,
      values: b.norm.values,
      ...(mode === "stacked" ? { runningUpper: b.runningUpper } : {}),
      endLabel: { text: "", x: 0, y: 0, show: false }, // filled below (needs collision pass)
      maxThicknessPx: b.maxThicknessPx,
    });
    legend.push({ label: b.norm.label, accentKey });
  });

  // 11. End labels (C9) — one right-anchored label per series in the [984, 996] gutter (valueLabels
  //     auto). Hidden if: off, empty, > END_LABEL_MAX_CP codepoints, or its y-anchor collides with
  //     another shown end label (< END_LABEL_PX + 6 apart) → the lower-priority (smaller end value)
  //     one is hidden + surfaced.
  const END_X = 984;
  const lastX = commonLen - 1;
  const shown: { idx: number; y: number; endVal: number }[] = [];
  survivors.forEach((b, i) => {
    const ps = plannedSeries[i];
    const text = b.norm.endValueLabel != null ? b.norm.endValueLabel : formatValue(b.norm.values[lastX] ?? 0, unit);
    const yAnchor = ps.upper[ps.upper.length - 1]?.y ?? AV.BASELINE_Y;
    let hideReason: EndLabel["hideReason"];
    if (valueLabels === "off") hideReason = "off";
    else if (text.trim().length === 0) hideReason = "empty";
    else if ([...text.trim()].length > END_LABEL_MAX_CP) hideReason = "tooLong";
    ps.endLabel = { text, x: END_X, y: yAnchor, show: hideReason === undefined, ...(hideReason ? { hideReason } : {}) };
    if (hideReason === undefined) shown.push({ idx: i, y: yAnchor, endVal: b.norm.values[lastX] ?? 0 });
  });
  // Collision resolution: among shown labels, if two anchors are < END_LABEL_PX + 6 apart, hide the
  // one with the SMALLER end value (lower priority). Greedy by descending end value.
  const MIN_GAP = END_LABEL_PX + 6;
  shown.sort((a, b) => b.endVal - a.endVal);
  const accepted: { y: number }[] = [];
  for (const cand of shown) {
    if (accepted.some((a) => Math.abs(a.y - cand.y) < MIN_GAP)) {
      const ps = plannedSeries[cand.idx];
      ps.endLabel.show = false;
      ps.endLabel.hideReason = "collide";
    } else {
      accepted.push({ y: cand.y });
    }
  }
  // Count hidden labels (off is NOT a defect).
  for (const ps of plannedSeries) {
    if (!ps.endLabel.show && ps.endLabel.hideReason && ps.endLabel.hideReason !== "off") dropped.hiddenLabels++;
  }

  // 12. X-label every-k + fit-or-hide (C8). Show every label if n ≤ 8, else every-k (k = ceil(n/8)),
  //     first/last always; each shown label fit-or-hide by estW against the per-step slot.
  const rawXLabels = Array.isArray(input.xLabels) ? input.xLabels : [];
  const n = commonLen;
  const k = n <= MAX_X_LABELS ? 1 : Math.ceil(n / MAX_X_LABELS);
  const stepSlot = n > 1 ? (PLOT_X1 - PLOT_X0) / (n - 1) : PLOT_X1 - PLOT_X0;
  const xTicks: XTick[] = [];
  for (let xi = 0; xi < n; xi++) {
    const label = typeof rawXLabels[xi] === "string" ? rawXLabels[xi] : "";
    const everyK = xi % k === 0 || xi === n - 1; // first/last always; every-k between
    let show = everyK && label.trim().length > 0;
    if (show && estXPx(label.trim()) > stepSlot * 0.94) show = false; // fit-or-hide (hide, don't bend)
    if (everyK && label.trim().length > 0 && !show) dropped.hiddenLabels++;
    xTicks.push({ index: xi, x: xs[xi], label, show });
  }

  // 13. Annotation resolution + placement + fit-or-hide (PL-4.2; PORTED from line.ts step 11). x as a
  //     number → rounded index in [0, commonLen-1]; as a string → the FIRST matching x-label. Unresolved
  //     → drop + count. Over MAX_ANNOTATIONS → drop the tail. seriesIndex out of range → series[0]. The
  //     anchor is the series' UPPER edge at that x; placed ABOVE (BELOW when the anchor is in the top 20%
  //     of the plot); fit-or-hide by estW; the box is clamped horizontally into the plot band; a
  //     collision with a shown end-label / another shown annotation (> 4px) hides the LATER one. All from
  //     DATA, never `t`. Empty annotations ⇒ [] ⇒ no nodes ⇒ byte-identical default.
  type Box = { x: number; y: number; w: number; h: number };
  const annotations: PlannedAreaAnnotation[] = [];
  const rawAnns = Array.isArray(input.annotations) ? input.annotations : [];
  const topZone = AV.PLOT_Y0 + AV.GROW_HEIGHT * 0.2;
  const shownBoxes: Box[] = [];
  // Seed with the SHOWN end-label boxes so callouts avoid the right value gutter. Use the renderer's
  // painted-y clamp (AreaChart EndLabel) so the avoid-box matches what is actually drawn.
  for (const ps of plannedSeries) {
    if (!ps.endLabel.show) continue;
    const yPainted = Math.max(AV.PLOT_Y0 + END_LABEL_PX, Math.min(ps.endLabel.y + 9, AV.BASELINE_Y - 4));
    shownBoxes.push({ x: END_X - 80, y: yPainted - END_LABEL_PX, w: 80, h: END_LABEL_PX + 8 });
  }

  let resolvedAnn = 0;
  for (const a of rawAnns) {
    if (resolvedAnn >= MAX_ANNOTATIONS) {
      dropped.annotationsDropped++;
      continue;
    }
    // resolve the vertex index.
    let vertexIndex = -1;
    if (isNum(a?.x)) {
      const idx = Math.round(a.x as number);
      if (idx >= 0 && idx <= commonLen - 1) vertexIndex = idx;
    } else if (typeof a?.x === "string") {
      const found = xTicks.findIndex((xt) => xt.label === a.x);
      if (found >= 0) vertexIndex = found;
    }
    if (vertexIndex < 0) {
      dropped.annotationsUnresolved++;
      continue;
    }
    let seriesIndex = isNum(a?.seriesIndex) ? Math.trunc(a.seriesIndex as number) : 0;
    if (seriesIndex < 0 || seriesIndex >= plannedSeries.length) seriesIndex = 0;
    const ps = plannedSeries[seriesIndex];
    const anchor: Pt = ps.upper[vertexIndex] ?? ps.upper[ps.upper.length - 1] ?? { x: xs[0] ?? PLOT_X0, y: AV.BASELINE_Y };
    resolvedAnn++;

    const text = typeof a?.label === "string" ? a.label.trim() : "";
    // STACKED: the label must clear the whole ENVELOPE (the TOP layer's upper edge) at that x, not
    // just its own band's edge — a mid-band anchor otherwise puts the text ON the fill stacked above
    // it, half-hidden (Emil's format-bench feedback). Simple mode / top-layer anchor: envY == anchor.y
    // → byte-identical placement.
    const topLayer = plannedSeries[plannedSeries.length - 1];
    const envY = mode === "stacked" ? Math.min(anchor.y, topLayer.upper[vertexIndex]?.y ?? anchor.y) : anchor.y;
    // Envelope near the top → place the box BELOW (into open plot). ALSO fall back to below when the
    // above-box would spill past the plot top (compressed short rows: the fixed 80px reservation can
    // exceed the shrunken headroom) — showing below beats silently hiding the author's callout.
    const below = envY <= topZone || envY - ANN_OFFSET - ANN_LABEL_PX < AV.PLOT_Y0;
    const labelY = below ? anchor.y + ANN_OFFSET : envY - ANN_OFFSET;
    const leader = { x1: anchor.x, y1: anchor.y, x2: anchor.x, y2: labelY + (below ? -ANN_LABEL_PX : 6) };
    const est = estAnnPx(text);
    const halfW = est / 2;
    // Keep the label box inside the plot horizontally — anchor "middle", clamp the center. HALO_PAD
    // reserves the renderer's paint-order halo (stroke 7 → ~3.5px beyond the glyphs each side) so the
    // PAINTED extent stays inside the plot/gutter bounds the checks measure, not just the glyphs.
    const HALO_PAD = 4;
    const cx = Math.max(PLOT_X0 + halfW + HALO_PAD, Math.min(PLOT_X1 - halfW - HALO_PAD, anchor.x));
    const box: Box = { x: cx - halfW - HALO_PAD, y: labelY - ANN_LABEL_PX, w: est + HALO_PAD * 2, h: ANN_LABEL_PX + 6 };

    let show = text.length > 0;
    let hideReason: string | undefined;
    if (!show) hideReason = "empty";
    else if ([...text].length > ANN_LABEL_MAX_CP) {
      show = false;
      hideReason = "tooLong";
    } else if (box.y < AV.PLOT_Y0 || box.y + box.h > AV.BASELINE_Y) {
      // keep the callout strictly inside the plot frame (above the x-label band, below the plot top).
      show = false;
      hideReason = "spill";
    } else if (shownBoxes.some((b) => boxOverlap(b, box) > 4)) {
      show = false;
      hideReason = "collide";
    }
    if (!show && hideReason && hideReason !== "empty") dropped.annotationsHidden++;
    if (show) shownBoxes.push(box);

    annotations.push({
      seriesIndex,
      vertexIndex,
      anchor,
      leader,
      label: { text, x: cx, y: labelY, anchor: "middle" },
      show,
      ...(hideReason ? { hideReason } : {}),
    });
  }

  return {
    mode,
    axisMin,
    axisMax,
    ticks,
    unit,
    series: plannedSeries,
    xTicks,
    legend,
    valueLabels,
    annotations,
    vgeom: AV,
    dropped,
    empty: false,
    singlePoint,
  };
}

/** Build the closed fill path (M baseline → L up the upper edge L→R → L back along the lower edge
 *  R→L → Z) and the top-edge stroke polyline (upper edge only). Single-point guard: < 2 vertices →
 *  empty strings (no degenerate one-vertex path / no NaN). */
function buildPaths(upper: Pt[], lower: Pt[], singlePoint: boolean): { fillPath: string; edgePath: string } {
  if (singlePoint || upper.length < 2) return { fillPath: "", edgePath: "" };
  const fmt = (p: Pt) => `${round(p.x)},${round(p.y)}`;
  // Top edge polyline (the stroked rim).
  const edge = upper.map((p, i) => `${i === 0 ? "M" : "L"} ${fmt(p)}`).join(" ");
  // Fill: start at the lower edge's first point, up to the upper edge, across L→R, then back along
  // the lower edge R→L, close. (Drawing the lower edge back lets stacked layers sit on the prev edge.)
  const up = upper.map((p, i) => `${i === 0 ? "M" : "L"} ${fmt(p)}`).join(" ");
  const back = [...lower].reverse().map((p) => `L ${fmt(p)}`).join(" ");
  const fill = `${up} ${back} Z`;
  return { fillPath: fill, edgePath: edge };
}

// PL-4.2 — axis-aligned box overlap (the smaller overlapping dimension), for the annotation collision
// pass (mirror of line.ts boxOverlap). 0 when the boxes don't overlap.
function boxOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? Math.min(ox, oy) : 0;
}

const round = (x: number) => Math.round(x * 100) / 100;
