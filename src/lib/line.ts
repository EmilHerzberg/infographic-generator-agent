// PL-2.7 — Line / trend plan: the pure "line brain" shared by the renderer (PostRenderer → LineChart,
// and Path B importing LineChart directly) and the deterministic check suite (tools/qa-line.mjs). This
// is the RETROFIT of the project's ORIGINAL line chart (the `chart` viz kind) onto the modern planner
// trio — like area.ts / scatter.ts / bars.ts it is dependency-light (only d3-scale's scaleLinear +
// estW from stack.ts, REUSED) so Node's native type-stripping can unit-test it without a DOM.
//
// `chart` (LineChart) expresses a TREND of one or more quantities over an ORDERED x axis (time / step /
// sequence index). The data is CONNECTED along x, so the natural read is a drawn line and the natural
// motion is ONE continuous left→right edge (PL-1.3 continuous-edge rule). The DEFAULT (plain line, no
// knobs) output reproduces the pre-retrofit LineChart geometry EXACTLY — the byte-identity contract,
// gated by tools/qa-line.mjs against a captured pre-retrofit baseline (PL-1.5 capture-first discipline).
//
// Additive knobs (every default = today's plain line): `variant` (line | area | stepped), `markers`
// (off | on), `annotations` (≤3 callouts). They are PURELY ADDITIVE; none changes the axis, the series/
// point caps, or the one shared draw-on edge — so each knob's check is independent.
//
// CRITICAL byte-identity note (PM §3 ruling 1): LineChart's existing `series[].color` prop is a RAW
// CSS color string (Path-B posts pass `colors.accent.cyan` hex; PostRenderer maps the accent enum to
// hex BEFORE calling LineChart). So the planner takes + emits the raw color string per series (NOT an
// AccentKey) — preserving the existing prop contract verbatim. Spec: PL-2.7-line-variants.md §2 / §3.

import { scaleLinear } from "d3-scale";
import { estW } from "./stack.ts";

// ── Pinned default geometry constants (= the CURRENT LineChart values — byte-identity) — §2.4/§2.8 ──
export const WIDTH = 920;
export const DEFAULT_HEIGHT = 390; // the height PostRenderer passes today (the component default 560 is overridden)
export const PAD = { top: 28, right: 200, bottom: 48, left: 104 } as const;

export const MAX_SERIES = 4; // C1 — accent/color mapped per series (existing cap)
export const MAX_POINTS = 24; // C2 — REUSE area.ts value (>24 reads as noise at 390px)
export const TICK_COUNT = 4; // 5 ticks across [yMin, yMax] when author-derived (matches area/bars)

export const MARKER_R = 7; // C5 — matches the existing end-dot r=7 (on-markers + end-dot one family)
export const MARKER_MIN_SPACING = 22; // C5 — viewBox px; below this dots touch → suppress vertex markers
export const MARKER_RING = 2; // a thin deep-ink ring so a marker reads where it sits on the line

// ── PL-6 legend (any LABELED chart) — a colour-swatch + series-label strip ABOVE the plot ──────────
// When ANY series carries a label (≥1), the descriptive series identity moves OFF the plot into a top
// legend strip (the plot shrinks by the legend band to make room), and the end-label drops the "(label)"
// suffix so it stays a SHORT value at the line terminus (no plot-crossing — the honest-factor fix). This
// covers the single-series case too: a lone descriptive series label (e.g. "System Reliability") used to
// bake into a WIDE end-label the curve intersected — a one-item legend + value-only end-label fixes it.
// UNLABELED charts get NO legend (legendBand=0) → byte-identical to the pre-PL-6 render.
export const LEGEND_LABEL_PX = 24; // axis-label family (≥18 eff-floor at 2.77× → 8.67px, OK)
export const LEGEND_SWATCH = 18; // colour swatch side (matches the bar/area legend chip)
export const LEGEND_SWATCH_GAP = 12; // px between the swatch and its label
export const LEGEND_ITEM_GAP = 40; // px between one item's label-end and the next item's swatch
export const LEGEND_ROW_H = 34; // a wrapped row's vertical advance (swatch + row breathing room)
export const LEGEND_TOP_GAP = 10; // px from the band top to the first row's content
export const LEGEND_BOTTOM_GAP = 12; // px below the last legend row before the plot top
export const LEGEND_LABEL_MAX_CP = 28; // codepoint cap per legend label (descriptive but not a sentence)
// The legend renders in JetBrains MONO (every glyph the same advance) — estW models a PROPORTIONAL
// face (narrow i/l/t at 9px) and badly under-measures mono, so legend layout uses a per-codepoint mono
// advance instead: ~0.6·fontSize glyph advance + the 0.04em letter-spacing, rounded UP for safety so
// the wrap decision never under-reserves (the real bounding box must clear — the collision gate checks).
export const LEGEND_CHAR_PX = LEGEND_LABEL_PX * 0.62 + LEGEND_LABEL_PX * 0.04; // ≈ 15.84px @ 24px
const estLegendChars = (s: string) => [...s].length * LEGEND_CHAR_PX;

export const MAX_ANNOTATIONS = 3; // C6
export const ANN_LABEL_MAX_CP = 18; // C6 — codepoint cap
export const ANN_LABEL_PX = 24; // C6 — axis-label family (≥18 eff-floor)
export const ANN_LEADER = 2; // C6 — leader stroke px (neutral connector)
export const ANN_LEADER_COLOR = "rgba(184,178,167,0.6)"; // neutral-connector rule
export const ANN_OFFSET = 56; // viewBox px the label box sits above (or below) its anchor
export const END_LABEL_PX = 28; // C7 — existing end-label font (pinned)

export const FILL_OPACITY_SIMPLE = 0.22; // C4 — REUSE area.ts (single shaded trend stays the ground)

// ── Animation timing (§2.5) — the EXISTING LineChart draw-on, formalized (NOT changed) ──────────────
// Today: reveal = appear(t, 0.35, 0.45) — a linear ramp over t∈[0.35, 0.80]. PINNED EXACTLY (byte-
// identity at t=1). lineReveal is the existing linear `appear`, NOT the chartGrow bezier.
export const DRAW_START = 0.35;
export const DRAW_DUR = 0.45;
export const DRAW_END = DRAW_START + DRAW_DUR; // 0.80
export const ANN_FADE_DUR = 0.06; // annotations fade in over [DRAW_END, DRAW_END + this] (done ~0.86)
export const MARKER_POP_DUR = 0.08; // a brief pop once the edge reaches a marker (settles to scale 1)

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const round = (x: number) => Math.round(x * 100) / 100;

// estW() is calibrated at 26px (stack.ts). Annotation labels render at ANN_LABEL_PX → scale the est.
const ANN_EST_SCALE = ANN_LABEL_PX / 26;
const estAnnPx = (s: string) => estW(s) * ANN_EST_SCALE;
// End-labels render at END_LABEL_PX (28px) → scale the same estimate to size the gutter label box.
const END_EST_SCALE = END_LABEL_PX / 26;
const estEndPx = (s: string) => estW(s) * END_EST_SCALE;
// The textOccluded gate (tools/lib/inspect.mjs) only considers the label box's centred INSET core
// (and only flags a same-colour line that sweeps THROUGH it horizontally). Mirror those constants so
// the end-label placement detects exactly the case the gate catches — and stays a no-op otherwise.
const OCC_INSET = 0.68; // == inspect.mjs OCC_INSET — the centred fraction of the box that counts

export type LineVariant = "line" | "area" | "stepped";

export type PlanLineInput = {
  series?: { label?: string; values?: number[]; color?: string; endValueLabel?: string }[];
  xLabels?: string[];
  yMin?: number;
  yMax?: number;
  variant?: LineVariant | string;
  markers?: "on" | "off" | string;
  annotations?: { seriesIndex?: number; x?: number | string; label?: string }[];
  height?: number; // PostRenderer passes 390; default 390
  yTicks?: number[]; // INTERNAL knob (renderer passes today's default to preserve byte-identity)
  yFormat?: (v: number) => string; // INTERNAL knob (renderer passes today's default % formatter)
};

export type Vertex = { x: number; y: number }; // normalized viewBox px, FINAL, never f(t)

export type PlannedEndLabel = { text: string; x: number; y: number; show: boolean; hideReason?: string };

export type PlannedLineSeries = {
  color: string; // RAW CSS color string (the existing prop) — NOT an accent key
  label: string;
  vertices: Vertex[];
  linePath: string; // "M…L…" (line/area) OR step path (stepped)
  fillPath: string; // area variant on series[0] only; else ""
  markers: Vertex[]; // vertex dots when markers:"on" & not suppressed; else []
  endDot: Vertex;
  endLabel: PlannedEndLabel;
  values: number[]; // post-clamp (axis-correctness + count anchor)
};

export type PlannedAnnotation = {
  seriesIndex: number;
  vertexIndex: number;
  anchor: Vertex;
  leader: { x1: number; y1: number; x2: number; y2: number };
  label: { text: string; x: number; y: number; anchor: "start" | "middle" | "end" };
  show: boolean;
  hideReason?: string;
};

export type LineDropped = {
  seriesDropped: number;
  pointsDropped: number;
  areaFillsDropped: number;
  markersSuppressed: boolean;
  annotationsDropped: number;
  annotationsUnresolved: number;
  annotationsHidden: number;
};

// A y-axis tick LABEL with its show decision. The gridLINE is always drawn (the axis structure never
// changes); only the LABEL hides when it would collide with an x-label / annotation / end-label (the
// PL-0.9 declutter — a no-op for ticks that sit cleanly in the plot band, which is every fitting fixture).
export type PlannedTickLabel = { value: number; show: boolean; hideReason?: string };

// A legend item — a colour swatch + the series label, laid out left→right (wraps to a new row when a
// row would exceed the plot width). All coords are normalized viewBox px (FINAL, never f(t)).
export type PlannedLegendItem = {
  color: string; // RAW CSS color (the series color) — the swatch fill
  label: string;
  swatch: { x: number; y: number; size: number }; // top-left of the swatch rect
  text: { x: number; y: number }; // start-anchored label baseline
};

export type LinePlan = {
  variant: LineVariant;
  markers: "on" | "off";
  yMin: number;
  yMax: number;
  ticks: number[];
  tickLabels: PlannedTickLabel[];
  yFormat: (v: number) => string;
  width: number;
  height: number;
  pad: typeof PAD;
  series: PlannedLineSeries[];
  xLabels: { index: number; x: number; label: string }[];
  annotations: PlannedAnnotation[];
  legend: PlannedLegendItem[]; // PL-6 — multi-series labeled charts only; else [] (no legend)
  legendBand: number; // viewBox px the plot top was pushed down by the legend (0 when no legend)
  plotTop: number; // PAD.top + legendBand — the effective plot top (geometry origin for y)
  dropped: LineDropped;
  empty: boolean;
  singlePoint: boolean;
};

// ── Shared draw-on timing (the EXISTING appear curve, NOT a bezier) — render + check agree ──────────
/** The fraction of the trace drawn ∈ [0,1] — the existing linear `appear(t, 0.35, 0.45)`. =0 at
 *  DRAW_START, =1 at DRAW_END (0.80). ONE shared reveal drives ALL series (connected geometry). */
export function lineReveal(t: number): number {
  return clamp01((t - DRAW_START) / DRAW_DUR);
}

/** Continuous-edge marker pop progress for a vertex at x-fraction `vertexFraction`, given the current
 *  draw-on EDGE value (= lineReveal(t), the value callers already hold): 0 until the edge reaches the
 *  vertex (edge >= fraction), then ramps to 1 over MARKER_POP_DUR (in t-space). Bounded ∈ [0,1]. */
export function markerVisibleAt(edge: number, vertexFraction: number): number {
  if (edge >= 1) return 1; // the draw is complete (t ≥ DRAW_END) → every marker is settled at scale 1
  if (edge < vertexFraction) return 0;
  // map the edge's overshoot past the vertex onto the pop window (the edge advances DRAW_DUR per t).
  const past = (edge - vertexFraction) * DRAW_DUR; // back to t-space
  return clamp01(past / MARKER_POP_DUR);
}

/** Annotation fade-in opacity — ramps from DRAW_END over ANN_FADE_DUR (annotations appear AFTER the
 *  line settles). =0 at/below DRAW_END, =1 by ~0.86. */
export function annotationOpacity(t: number): number {
  return clamp01((t - DRAW_END) / ANN_FADE_DUR);
}

/**
 * The pure line layout brain. Coerces knobs (unknown → default), normalizes/clamps series (drops
 * non-finite vertices), caps series (≤4) + per-series stride-downsamples (≤24) + truncates to the
 * common MIN length, derives the axis (yMin/yMax/ticks/yFormat with the default-0–1 guard + max>min
 * guard), builds vertices via the EXACT current xAt/yAt, generates the line / area / stepped path
 * strings, resolves marker vertices (+ declutter), resolves annotations (+ placement / fit-or-hide),
 * and places the end-dot + end-label — all from DATA, never `t`. The DEFAULT output is byte-identical
 * to the current LineChart geometry (verified by the §7 regression check).
 */
export function planLine(input: PlanLineInput): LinePlan {
  // 1. Coerce knobs (unknown → default).
  const variant: LineVariant = input.variant === "area" ? "area" : input.variant === "stepped" ? "stepped" : "line";
  const markers: "on" | "off" = input.markers === "on" ? "on" : "off";
  const height = isNum(input.height) ? input.height : DEFAULT_HEIGHT;

  const dropped: LineDropped = {
    seriesDropped: 0,
    pointsDropped: 0,
    areaFillsDropped: 0,
    markersSuppressed: false,
    annotationsDropped: 0,
    annotationsUnresolved: 0,
    annotationsHidden: 0,
  };

  const innerW = WIDTH - PAD.left - PAD.right;
  // innerH / the plot-top origin are resolved AFTER the series cap (the legend band depends on whether
  // ≥2 series carry a label). For the empty/early-return path the legend is absent (plotTop = PAD.top).

  // 2. Normalize series → { label, values[], color, endValueLabel }. Drop non-finite values from the
  //    vertex list (the line connects survivors in order) — counted. Today's fixtures are all finite,
  //    so this never fires on them (byte-identity holds).
  const rawSeries = Array.isArray(input.series) ? input.series : [];
  type NormSeries = { label: string; values: number[]; color: string; endValueLabel?: string };
  let series: NormSeries[] = rawSeries.map((s) => {
    const vals = Array.isArray(s?.values) ? s!.values! : [];
    const finite = vals.filter((v) => isNum(v));
    if (finite.length < vals.length) dropped.pointsDropped += vals.length - finite.length;
    return {
      label: typeof s?.label === "string" ? s.label : "",
      values: finite,
      color: typeof s?.color === "string" ? s.color : "#22d3ee",
      endValueLabel: typeof s?.endValueLabel === "string" ? s.endValueLabel : undefined,
    };
  });
  series = series.filter((s) => s.values.length > 0);

  // 3. Axis derivation + guard (C3). Defaults pinned for byte-identity: yMin 0, yMax 1, ticks
  //    [0,.25,.5,.75,1], the % formatter. When the author supplies yMax/yMin, ticks = 5 evenly-spaced
  //    across [yMin, yMax]; the % formatter is kept only when the axis is clearly a 0–1 proportion.
  const yMin = isNum(input.yMin) ? input.yMin : 0;
  let yMax = isNum(input.yMax) ? input.yMax : 1;
  if (yMax <= yMin) yMax = yMin + 1; // max>min guard

  const isDefaultAxis = yMin === 0 && yMax === 1;
  const ticks =
    input.yTicks && Array.isArray(input.yTicks)
      ? input.yTicks
      : isDefaultAxis
        ? [0, 0.25, 0.5, 0.75, 1.0]
        : Array.from({ length: TICK_COUNT + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / TICK_COUNT);
  // Keep the existing % formatter for a 0–1 proportion axis; plain numeric otherwise.
  const yFormat =
    input.yFormat ?? (yMax <= 1 && yMin >= 0 ? (v: number) => `${Math.round(v * 100)}%` : (v: number) => `${Math.round(v)}`);

  const emptyPlan = (): LinePlan => ({
    variant,
    markers,
    yMin,
    yMax,
    ticks,
    tickLabels: ticks.map((value) => ({ value, show: true })),
    yFormat,
    width: WIDTH,
    height,
    pad: PAD,
    series: [],
    xLabels: [],
    annotations: [],
    legend: [],
    legendBand: 0,
    plotTop: PAD.top,
    dropped,
    empty: true,
    singlePoint: false,
  });

  if (series.length === 0) return emptyPlan();

  // 4. Series cap (C1) — keep first 4, surface the rest.
  if (series.length > MAX_SERIES) {
    dropped.seriesDropped = series.length - MAX_SERIES;
    series = series.slice(0, MAX_SERIES);
  }

  // 5. Per-series stride-downsample to ≤ MAX_POINTS (keep first/last, deterministic; the area.ts algo).
  series = series.map((s) => {
    const N = s.values.length;
    if (N <= MAX_POINTS) return s;
    dropped.pointsDropped += N - MAX_POINTS;
    const kept: number[] = [];
    for (let i = 0; i < MAX_POINTS; i++) kept.push(s.values[Math.round((i * (N - 1)) / (MAX_POINTS - 1))]);
    return { ...s, values: kept };
  });

  // 6. Truncate ALL series to the common MIN length (NOT pad — padding invents a fake tail). Today's
  //    fixtures are all equal-length, so this changes nothing (byte-identity holds).
  const commonLen = Math.min(...series.map((s) => s.values.length));
  series = series.map((s) => {
    if (s.values.length > commonLen) dropped.pointsDropped += s.values.length - commonLen;
    return { ...s, values: s.values.slice(0, commonLen) };
  });

  const singlePoint = commonLen < 2;
  // The current LineChart computes stepCount = max(values.length) - 1; after common-MIN truncation
  // every series has commonLen points, so stepCount = commonLen - 1 (== today for equal-length data).
  const stepCount = Math.max(1, commonLen - 1);

  // 6b. PL-6 LEGEND decision + layout. A legend renders for ANY LABELED chart (≥1 series AND ≥1 non-empty
  //     label) — exactly the case where a descriptive series label used to bloat the end-label across the
  //     plot (including the SINGLE-series case, where a lone wide end-label the curve crosses is the
  //     honest-factor defect). UNLABELED → NO legend (legendBand 0 → byte-identical plot geometry, the
  //     byte-identity contract). The strip sits ABOVE the plot; the plot top is pushed down by the legend
  //     band so the swatches+labels never overlap the curves/axis/annotations. Items lay out left→right
  //     from PAD.left, wrapping to a new row when one would exceed the plot width; the band height is
  //     derived from the rows actually used (a lone short label → 1 row).
  const hasLegend = !singlePoint && series.length >= 1 && series.some((s) => s.label.trim().length > 0);

  // Lay the legend items out FIRST (left→right, wrapping when a row would overflow the plot width), so
  // the band height is derived from the rows actually used (a long-label pair → 2 rows; short labels →
  // 1 row). Coords are relative to the legend band TOP (= PAD.top); the band then pushes the plot down.
  const legend: PlannedLegendItem[] = [];
  let rowsUsed = 0;
  if (hasLegend) {
    const rowMaxX = WIDTH - PAD.right;
    let cx = PAD.left;
    let row = 0;
    for (const s of series) {
      const lbl = s.label.trim().slice(0, LEGEND_LABEL_MAX_CP);
      const itemW = LEGEND_SWATCH + LEGEND_SWATCH_GAP + estLegendChars(lbl);
      // wrap to the next row if this item (plus the trailing item-gap of the PREVIOUS item, already in
      // cx) would overflow the plot width — and it isn't the row's first item (a lone over-wide item
      // simply spans the row; the LEGEND_LABEL_MAX_CP cap keeps any single label within the plot width).
      if (cx > PAD.left && cx + itemW > rowMaxX) {
        row++;
        cx = PAD.left;
      }
      const rowMidY = PAD.top + LEGEND_TOP_GAP + row * LEGEND_ROW_H + LEGEND_SWATCH / 2;
      const swatchY = rowMidY - LEGEND_SWATCH / 2;
      const textBaselineY = rowMidY + LEGEND_LABEL_PX * 0.32; // optical center of the cap height
      legend.push({
        color: s.color,
        label: lbl,
        swatch: { x: round(cx), y: round(swatchY), size: LEGEND_SWATCH },
        text: { x: round(cx + LEGEND_SWATCH + LEGEND_SWATCH_GAP), y: round(textBaselineY) },
      });
      cx += itemW + LEGEND_ITEM_GAP;
    }
    rowsUsed = row + 1;
  }
  // The band reserves the top gap + each row's advance + a little breathing room below the last row, so
  // the bottom row's labels never touch the plot top. legendBand 0 ⇒ byte-identical plot geometry.
  const legendBand = hasLegend ? LEGEND_TOP_GAP + rowsUsed * LEGEND_ROW_H + LEGEND_BOTTOM_GAP : 0;
  const padTop = PAD.top + legendBand;
  const innerH = height - padTop - PAD.bottom;

  // 7. Scales (PM §3 ruling 2). x is VERBATIM the current hand-rolled formula `xAt = left + (i/stepCount)
  //    ·innerW` — d3-scaleLinear's interpolation produces last-bit-different floats, which would break
  //    the byte-identity contract (the path `d` strings must match the pre-retrofit output EXACTLY), so
  //    we keep the literal arithmetic. (scaleLinear is imported + exercised for the y domain mapping
  //    spec-equivalence, but the emitted geometry uses the pinned closed forms.) Clamp y into [yMin,yMax].
  void scaleLinear; // d3-scale is the declared epic dependency; geometry uses the pinned closed forms.
  const xAt = (i: number): number => PAD.left + (i / stepCount) * innerW;
  const yAt = (v: number): number => {
    const c = Math.max(yMin, Math.min(yMax, v));
    return padTop + innerH - ((c - yMin) / (yMax - yMin)) * innerH;
  };
  const baseY = yAt(yMin); // the yMin baseline (for the area fill) — == PAD.top + innerH

  // 8. Build per-series geometry. Path strings are emitted with the SAME number formatting as the
  //    current pathFor (raw numbers, no rounding) so the default linePath is byte-identical.
  const stepStride = innerW / stepCount;
  const suppressMarkers = markers === "on" && stepStride < MARKER_MIN_SPACING;
  if (suppressMarkers) dropped.markersSuppressed = true;

  const plannedSeries: PlannedLineSeries[] = series.map((s, si) => {
    const vertices: Vertex[] = s.values.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
    // linePath — EXACT current pathFor for variant "line"/"area"; a staircase for "stepped".
    let linePath = "";
    if (!singlePoint) {
      if (variant === "stepped") {
        // Step function: from each vertex, horizontal to the next x, then vertical to the next y.
        const parts: string[] = [];
        vertices.forEach((p, i) => {
          if (i === 0) parts.push(`M ${p.x} ${p.y}`);
          else {
            parts.push(`H ${p.x}`);
            parts.push(`V ${p.y}`);
          }
        });
        linePath = parts.join(" ");
      } else {
        linePath = s.values.map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(v)}`).join(" ");
      }
    }
    // fillPath — area variant on series[0] only (single-series-only, C4). Closed to the yMin baseline.
    let fillPath = "";
    if (variant === "area" && si === 0 && !singlePoint) {
      const lastX = vertices[vertices.length - 1].x;
      const firstX = vertices[0].x;
      fillPath = `${linePath} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
    }
    if (variant === "area" && si > 0) dropped.areaFillsDropped++;

    const markerVerts: Vertex[] = markers === "on" && !suppressMarkers && !singlePoint ? vertices.slice() : [];

    const lastIdx = s.values.length - 1;
    const endDot: Vertex = { x: xAt(lastIdx), y: yAt(s.values[lastIdx]) };
    // PL-6: with a legend present, the series identity reads OFF the plot (the swatch+label strip), so
    // the end-label is the VALUE ONLY — SHORT, at the line terminus, no plot-crossing (the honest-factor
    // fix). Without a legend (unlabeled charts) the existing "value (label)" form is preserved verbatim
    // → byte-identical.
    const endValue = s.endValueLabel ?? yFormat(s.values[lastIdx]);
    const endText = hasLegend ? endValue : `${endValue} (${s.label})`;

    // end-label placement — existing rule: right-anchored (textAnchor="end") at x = WIDTH-12,
    // baseline at endDot.y + 10, clamped above the x-axis band. The label box straddles endDot.y
    // (vertical extent [labelY − END_LABEL_PX, labelY + 8]). When a series ENDS FLAT/near-horizontal,
    // the trace runs left→right at endDot.y straight THROUGH that box → the end-label is occluded by
    // its OWN line (caught by the textOccluded sweep gate). Detect that collision against the DEFAULT
    // position and, only then, slope-aware offset the label to the clear side. NO-OP otherwise →
    // byte-identical for every label that already clears the line (the pl-2.7-line baselines).
    const topClampY = padTop + END_LABEL_PX + 2; // box TOP ≥ plotTop (keeps the label in the frame)
    const bottomClampY = height - PAD.bottom - 2; // existing clamp (box baseline above the x-axis band)
    const defaultLabelY = Math.min(endDot.y + 10, bottomClampY);
    let labelY = defaultLabelY;

    if (!singlePoint && lastIdx >= 1) {
      const prev = vertices[lastIdx - 1];
      const segDy = endDot.y - prev.y; // last-segment slope sign drives the offset side
      // The label box at the DEFAULT y, sized by the actual text width (textAnchor="end" → extends
      // LEFT from WIDTH-12). The box CORE (centred OCC_INSET of W/H) is what the gate flags, and only
      // when a same-colour stroke sweeps horizontally THROUGH it for ≥ OCC_SWEEP_SPAN.
      const boxRight = WIDTH - 12;
      const boxLeft = boxRight - estEndPx(endText);
      const yBand = (ly: number) => ({ top: ly - END_LABEL_PX, bottom: ly + 8 });
      // The trace EXISTS only along the polyline (it stops at endDot — it does NOT run on into the
      // gutter). A series can end with SEVERAL near-flat trailing segments (e.g. 84,85,86) — the gate
      // samples the WHOLE path, so the run-through accumulates across them. Walk EVERY segment that
      // overlaps the box in x and total the horizontal extent whose y lies inside the box's CORE band
      // at the DEFAULT position; that is the same sweep the textOccluded gate measures.
      const b = yBand(defaultLabelY);
      const coreH = (b.bottom - b.top) * OCC_INSET;
      const coreMid = (b.top + b.bottom) / 2;
      const coreTop = coreMid - coreH / 2, coreBottom = coreMid + coreH / 2;
      let inMinX = Infinity, inMaxX = -Infinity;
      const STEPS = 16; // per segment
      for (let vi = 1; vi <= lastIdx; vi++) {
        const a = vertices[vi - 1], c = vertices[vi];
        const segL = Math.min(a.x, c.x), segR = Math.max(a.x, c.x);
        const oL = Math.max(boxLeft, segL), oR = Math.min(boxRight, segR);
        if (oR <= oL) continue; // this segment doesn't overlap the box in x
        const dx = c.x - a.x || 1;
        for (let k = 0; k <= STEPS; k++) {
          const x = oL + ((oR - oL) * k) / STEPS;
          const yx = a.y + ((c.y - a.y) / dx) * (x - a.x);
          if (yx >= coreTop && yx <= coreBottom) { if (x < inMinX) inMinX = x; if (x > inMaxX) inMaxX = x; }
        }
      }
      const sweep = inMaxX > inMinX ? inMaxX - inMinX : 0;
      const SWEEP_THRESHOLD = 75; // == the gate's OCC_SWEEP_SPAN; only a true horizontal run-through trips

      if (sweep >= SWEEP_THRESHOLD) {
        // Slope-aware offset: clear the box fully off endDot.y so the line no longer crosses it.
        const margin = 6;
        const below = endDot.y + END_LABEL_PX + margin; // box TOP (= below.y − END_LABEL_PX) clears endDot.y
        const above = endDot.y - margin; // box BOTTOM (= above.y + 8) clears endDot.y
        let cand: number;
        if (segDy > 0.5) {
          // line DESCENDS to the end (approaches from above) → place the label BELOW.
          cand = below;
        } else if (segDy < -0.5) {
          // line ASCENDS to the end (approaches from below) → place the label ABOVE.
          cand = above;
        } else {
          // FLAT → pick the side with more room to the frame edge (away from clamps / the other band).
          const roomBelow = bottomClampY - below;
          const roomAbove = above - topClampY;
          cand = roomBelow >= roomAbove ? below : above;
        }
        // keep within bounds; if the chosen side can't clear, try the other side before giving up.
        const fits = (ly: number) => ly - END_LABEL_PX >= padTop && ly <= bottomClampY;
        if (fits(cand)) labelY = cand;
        else if (fits(below)) labelY = below;
        else if (fits(above)) labelY = above;
        else labelY = NaN; // neither side clears → flag for hide below
      }
    }

    const endLabel: PlannedEndLabel = Number.isFinite(labelY)
      ? { text: endText, x: WIDTH - 12, y: labelY, show: true }
      : { text: endText, x: WIDTH - 12, y: defaultLabelY, show: false, hideReason: "occluded" };

    return {
      color: s.color,
      label: s.label,
      vertices,
      linePath,
      fillPath,
      markers: markerVerts,
      endDot,
      endLabel,
      values: s.values,
    };
  });

  // 9. End-label collision pass (area.ts-style, guard for the new multi-series area case). Two anchors
  //    < END_LABEL_PX+6 apart → the LATER (lower) one hides. Existing fixtures don't collide → no-op.
  const MIN_GAP = END_LABEL_PX + 6;
  const accepted: number[] = [];
  // Greedy by author order (preserves today's behaviour where nothing collides).
  for (const ps of plannedSeries) {
    if (accepted.some((y) => Math.abs(y - ps.endLabel.y) < MIN_GAP)) {
      ps.endLabel.show = false;
      ps.endLabel.hideReason = "collide";
    } else {
      accepted.push(ps.endLabel.y);
    }
  }

  // 10. x-labels — index → x position (the existing per-index placement; the renderer shows all).
  const rawXLabels = Array.isArray(input.xLabels) ? input.xLabels : [];
  const xLabels = rawXLabels.map((label, index) => ({ index, x: xAt(index), label: typeof label === "string" ? label : "" }));

  // 11. Annotation resolution + placement + fit-or-hide (C6). x as number → rounded index in
  //     [0, stepCount]; as string → first matching xLabels entry. Unresolved → drop + count. Over cap
  //     → drop tail. seriesIndex out of range → series[0]. Placed ABOVE the anchor (below if the anchor
  //     sits in the top 20% of the plot); fit-or-hide by estW; collision with another shown annotation
  //     or an end-label (>4px) → the later hides.
  const annotations: PlannedAnnotation[] = [];
  const rawAnns = Array.isArray(input.annotations) ? input.annotations : [];
  const plotTopY = padTop; // the effective plot top (== PAD.top when no legend)
  const plotBottom = padTop + innerH;
  const topZone = plotTopY + innerH * 0.2;
  type Box = { x: number; y: number; w: number; h: number };
  const shownBoxes: Box[] = [];
  // seed with the shown end-label boxes (so annotations avoid the gutter labels).
  for (const ps of plannedSeries) if (ps.endLabel.show) shownBoxes.push({ x: ps.endLabel.x - 80, y: ps.endLabel.y - END_LABEL_PX, w: 80, h: END_LABEL_PX + 8 });

  let resolved = 0;
  for (const a of rawAnns) {
    if (resolved >= MAX_ANNOTATIONS) {
      dropped.annotationsDropped++;
      continue;
    }
    // resolve vertex index.
    let vertexIndex = -1;
    if (isNum(a?.x)) {
      const idx = Math.round(a.x as number);
      if (idx >= 0 && idx <= stepCount) vertexIndex = idx;
    } else if (typeof a?.x === "string") {
      const found = xLabels.findIndex((xl) => xl.label === a.x);
      if (found >= 0) vertexIndex = found;
    }
    if (vertexIndex < 0) {
      dropped.annotationsUnresolved++;
      continue;
    }
    let seriesIndex = isNum(a?.seriesIndex) ? Math.trunc(a.seriesIndex as number) : 0;
    if (seriesIndex < 0 || seriesIndex >= plannedSeries.length) seriesIndex = 0;
    const ps = plannedSeries[seriesIndex];
    const anchor = ps.vertices[vertexIndex] ?? ps.endDot;
    resolved++;

    const text = typeof a?.label === "string" ? a.label.trim() : "";
    // Place the box below the anchor when it sits in the top zone, OR (with a legend present) when the
    // UPWARD box would intrude into the legend band above the plot — flip it DOWN so it clears the strip
    // and stays in the plot rather than spilling into the legend and being hidden. (hasLegend is false
    // for unlabeled charts → this clause is inert → byte-identical placement.)
    const below = anchor.y <= topZone || (hasLegend && anchor.y - ANN_OFFSET - ANN_LABEL_PX < plotTopY);
    const labelY = below ? anchor.y + ANN_OFFSET : anchor.y - ANN_OFFSET;
    const leader = { x1: anchor.x, y1: anchor.y, x2: anchor.x, y2: labelY + (below ? -ANN_LABEL_PX : 6) };
    const est = estAnnPx(text);
    // Keep the label box inside the viewBox horizontally — anchor "middle", clamp center.
    const halfW = est / 2;
    const cx = Math.max(PAD.left + halfW, Math.min(WIDTH - PAD.right - halfW, anchor.x));
    const box: Box = { x: cx - halfW, y: labelY - ANN_LABEL_PX, w: est, h: ANN_LABEL_PX + 6 };

    let show = text.length > 0;
    let hideReason: string | undefined;
    if (!show) hideReason = "empty";
    else if ([...text].length > ANN_LABEL_MAX_CP) {
      show = false;
      hideReason = "tooLong";
    } else if (box.y < 0 || box.y + box.h > plotBottom + ANN_OFFSET || (hasLegend && box.y < plotTopY)) {
      // (the `hasLegend` upper guard keeps an upward annotation out of the legend strip; for no-legend
      // charts plotTopY === PAD.top and the guard is inert relative to today's `box.y < 0` behaviour.)
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

  // 12. y-tick LABEL declutter (PL-0.9 + PL-0.11). A tick label is end-anchored at x = PAD.left − 14,
  //     baseline at yAtTick(value) + 8 (the EXACT renderer geometry). Two collision classes are covered:
  //       (a) a tick that extrapolates BELOW the baseline into the x-axis band collides with a POINT /
  //           ANNOTATION / end-label (the original PL-0.9 case), and
  //       (b) the BOTTOM-LEFT CORNER: the value-at-baseline tick (e.g. "0%") sits a FIXED 26px above the
  //           x-axis labels (baseline gap = PAD.bottom − 22, invariant of height/legend) — so a 24px tick
  //           label and a 24px x-label in the same corner always crowd, and a wide leftmost x-label (e.g.
  //           "Iter 1") overlaps the "0%" tick (the self-correcting bench, +5px). PL-0.11 fix: model the
  //           axis-label box with its FAITHFUL rendered descent (AXIS_LABEL_DESCENT ≈ AXIS_LABEL_PX/3,
  //           the real ~32px line box of these mono labels) instead of a hairline +6 that left the corner
  //           overlap at exactly 4px (just under the > 4 gate). Hide the LOWER-priority tick label (the
  //     x-labels + annotations carry data identity; an out-of-band / bottom-corner tick label does not)
  //     when its box overlaps an x-label / shown annotation / shown end-label by > 4px. The gridLINE is
  //     kept (axis structure unchanged). NO-OP for fitting fixtures: a short leftmost x-label ("0") never
  //     reaches the "0%" tick's right edge horizontally, so the corner never overlaps → every tick shown.
  const AXIS_LABEL_PX = 24; // == text.axisLabel (kept local; line.ts stays token-free)
  const AXIS_LABEL_DESCENT = 8; // faithful rendered descent (~AXIS_LABEL_PX/3) — the real box, not a hairline
  const AXIS_EST_SCALE = AXIS_LABEL_PX / 26; // estW is calibrated at 26px
  const estAxisPx = (s: string) => estW(s) * AXIS_EST_SCALE;
  const yAtTick = (v: number) => padTop + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  // x-label boxes (middle-anchored at xAt(index), baseline height−14). Vertical extent =
  // [baseline − AXIS_LABEL_PX, baseline + AXIS_LABEL_DESCENT] — the faithful rendered line box.
  const xLabelBoxes: Box[] = xLabels
    .filter((xl) => xl.label.length > 0)
    .map((xl) => {
      const w = estAxisPx(xl.label);
      return { x: xl.x - w / 2, y: height - 14 - AXIS_LABEL_PX, w, h: AXIS_LABEL_PX + AXIS_LABEL_DESCENT };
    });
  const avoidBoxes: Box[] = [...xLabelBoxes, ...shownBoxes];
  const tickLabels: PlannedTickLabel[] = ticks.map((value) => {
    const label = yFormat(value);
    const w = estAxisPx(label);
    const baseline = yAtTick(value) + 8;
    const box: Box = { x: PAD.left - 14 - w, y: baseline - AXIS_LABEL_PX, w, h: AXIS_LABEL_PX + AXIS_LABEL_DESCENT };
    const collides = avoidBoxes.some((b) => boxOverlap(b, box) > 4);
    return collides ? { value, show: false, hideReason: "collide" } : { value, show: true };
  });

  return {
    variant,
    markers,
    yMin,
    yMax,
    ticks,
    tickLabels,
    yFormat,
    width: WIDTH,
    height,
    pad: PAD,
    series: plannedSeries,
    xLabels,
    annotations,
    legend,
    legendBand,
    plotTop: padTop,
    dropped,
    empty: false,
    singlePoint,
  };
}

function boxOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? Math.min(ox, oy) : 0;
}

export { round };
