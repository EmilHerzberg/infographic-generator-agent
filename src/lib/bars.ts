// PL-2.1 — BarChart plan: the pure "bar brain" shared by the renderer (PostRenderer →
// BarChart) and the deterministic check suite (tools/qa-bars.mjs). Like divergence.ts /
// stack.ts / tiers.ts it is dependency-light (only d3-scale + the estW char-class table
// reused from stack.ts) so Node's native type-stripping can unit-test it without a DOM.
//
// `bar` expresses the COMPARISON of N labelled magnitudes on one 0-anchored value axis —
// the workhorse "which is bigger, by how much". `planBars` owns EVERY geometry decision —
// knob coercion, sort, category/series/segment caps + surfaced drops, axis derivation +
// max>min guard, the scaleBand/scaleLinear layout (with paddingInner reduction before any
// thickness floor breach), the manual running-sum stacked offsets + per-bar sliver floor,
// the value-label placement + fit-or-hide and category-label fit-or-hide — all from DATA
// only, never from `t`, so its output feeds the static-geometry checks directly. Negatives
// clamp to 0 (magnitudes), every drop is surfaced via a counter (§2.6), never silent.
// Spec: planning/primitive-library/handoffs/PL-2.1-bar-chart.md §2.4 / §2.5 / §2.8 / C1–C6.

import { scaleBand, scaleLinear } from "d3-scale";
import { estW } from "./stack.ts";

export type BarMode = "simple" | "grouped" | "stacked";
export type BarOrientation = "vertical" | "horizontal";
export type BarSort = "none" | "desc" | "asc";
export type AccentKey = "cyan" | "amber" | "violet" | "mint" | "burnt";

// ── Fixed viewBox geometry (source px) — §2.4 ──────────────────────────────────────────────
export const VIEW_W = 1000;
export const VIEW_H = 640;

export const MIN_BAR_THICKNESS = 18; // C4 — matches the absolute type floor; thinner = hairline
export const MIN_BAR_GAP = 14; // C4 — the inspector's crampedPairs floor
export const SEG_SLIVER_PX = 14; // C3 — stacked-segment visibility floor (painted thickness)

export const MAX_CAT_V = 8; // C1 — vertical category cap
export const MAX_CAT_H = 10; // C1 — horizontal category cap
export const MAX_SERIES = 4; // C2 — grouped series cap (accent-mapped)
export const MAX_SEG = 5; // C3 — stacked segment cap

export const TICK_COUNT = 4; // C5 — 5 gridlines incl. baseline

// Vertical plot band (§2.4).
export const PLOT_X0_V = 120;
export const PLOT_X1_V = 980;
export const PLOT_Y0 = 70; // top of growth height
export const BASELINE_Y = 560; // value baseline (axisMin) — bars grow UP from here
export const CAT_LABEL_Y = 564; // vertical category labels live in [564, 600]

// Horizontal plot band (§2.4).
export const PLOT_X0_H = 300; // left baseline (axisMin) — bars grow RIGHT from here
export const PLOT_X1_H = 980;
export const PLOT_Y0_H = 70;
export const PLOT_Y1_H = 600;
export const LABEL_ANCHOR_X = 290; // right-anchored category labels (the Divergence convention)

// Label sizing + fit (§2.4 C6 / §2.6).
export const VALUE_LABEL_PX = 24; // value-label source size (axis floor)
export const CAT_LABEL_PX = 24; // category-label source size
const VALUE_LABEL_MAX_CP = 8; // §2.6.3
const CAT_LABEL_MAX_CP = 18; // §2.6.4
const LABEL_PAD = 12; // px of padding around a value label slot
// estW() is calibrated at 26px (stack.ts). Bar labels render at 24px → scale the estimate.
const EST_SCALE = VALUE_LABEL_PX / 26;

// PL-4.2 referenceLine (knob #1). NEUTRAL dashed reference (not an accent), ≥ the data-stroke floor;
// label in the axis-label family (≥18 eff-floor) with the same cp budget as a category label.
export const REF_LINE_STROKE = 4; // ≈1.4px@390 — matches the histogram neutral marker dash
export const REF_LABEL_PX = VALUE_LABEL_PX; // 24px — the value/axis label family
const REF_LABEL_MAX_CP = CAT_LABEL_MAX_CP; // 18cp — a short threshold name

// Animation timing (§2.5).
export const GROW_START = 0.34;
export const SETTLE_DEADLINE = 0.85;
export const BAR_GROW_DUR = 0.3;
const MAX_STAGGER = 0.06;

// Padding (§2.4 C4).
const PAD_INNER = 0.28;
const PAD_OUTER = 0.14;
const GROUP_PAD_INNER = 0.18;

const ACCENT_BY_INDEX: AccentKey[] = ["cyan", "amber", "violet", "mint", "burnt"];
const KNOWN_ACCENTS = new Set<AccentKey>(["cyan", "amber", "violet", "mint", "burnt"]);

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Map an author accent (or undefined/unknown) to a key, falling back to a position default. */
export function accentForIndex(author: string | undefined, index: number): AccentKey {
  if (author && KNOWN_ACCENTS.has(author as AccentKey)) return author as AccentKey;
  return ACCENT_BY_INDEX[index % ACCENT_BY_INDEX.length];
}

export type BarCategoryInput = {
  label: string;
  value?: number;
  values?: number[];
  valueText?: string;
  accent?: string;
};

export type PlannedRect = {
  /** Normalized viewBox-space FINAL geometry (the renderer reads verbatim; constant across t). */
  x: number;
  y: number;
  w: number;
  h: number;
  accentKey: AccentKey;
  value: number; // true data value (drives the count-up + value-label string)
  valueText: string; // displayed value string
  showValue: boolean;
  valuePlacement: "end" | "inside";
  valueHideReason?: "off" | "empty" | "tooLong" | "tooThin";
  seriesIndex: number; // grouped: which series; stacked: which segment; simple: 0
  /** Stacked only: running-sum offsets (value units) for the value-axis-correctness check. */
  segStart?: number;
  segEnd?: number;
};

export type PlannedBar = {
  catIndex: number;
  label: string;
  showLabel: boolean;
  labelHideReason?: "empty" | "tooLong" | "tooThin";
  rects: PlannedRect[];
  barStart: number; // overlapping-stagger animation start, shared by a category's sub-bars
};

// PL-4.2 knob #1 — a single NEUTRAL threshold line on the VALUE axis (target / SLA / break-even).
// Geometry is pure-from-DATA (never `t`): the line position is `value(clamp(value, axisMin, axisMax))`
// (REUSES the bars' out-of-axis clamp so it can never exit the plot band), and the right-anchored
// label's show/hide is decided here (fit-or-hide + hide-on-collision-with-a-value-label, line kept).
export type ReferenceLineInput = { value?: number; label?: string };
export type PlannedReferenceLine = {
  value: number; // the TRUE author value (display + the check's value-axis anchor)
  lenPx: number; // painted px from the baseline along the value axis (clamped to [0, growLen])
  x1: number;
  y1: number;
  x2: number;
  y2: number; // line endpoints (viewBox px) — horizontal (vertical bars) or vertical (horizontal bars)
  label: string;
  showLabel: boolean;
  labelHideReason?: "empty" | "tooLong" | "collision";
  labelX: number; // right-anchored (textAnchor="end") label baseline anchor
  labelY: number;
};

export type BarsPlan = {
  mode: BarMode;
  orientation: BarOrientation;
  axisMin: number;
  axisMax: number;
  ticks: number[];
  bars: PlannedBar[];
  seriesLabels: string[]; // legend (grouped/stacked)
  seriesAccents: AccentKey[];
  unit: string;
  valueLabels: "auto" | "off";
  referenceLine: PlannedReferenceLine | null; // PL-4.2 — null = absent ⇒ byte-identical to today
  stagger: number;
  barGrowDur: number;
  dropped: { categoriesDropped: number; seriesDropped: number; segmentsDropped: number; hiddenLabels: number };
  empty: boolean;
};

export type PlanBarsInput = {
  categories?: BarCategoryInput[];
  mode?: BarMode | string;
  orientation?: BarOrientation | string;
  valueLabels?: "auto" | "off" | string;
  sort?: BarSort | string;
  seriesLabels?: string[];
  seriesAccents?: string[];
  axisMin?: number;
  axisMax?: number;
  unit?: string;
  referenceLine?: ReferenceLineInput;
  /** Vertical-fill scale (Emil's 9:16 feedback). Multiplies EVERY plot y-coordinate + the viewBox height so
   *  the bars/spacing fill the tall frame. Default 1 ⇒ portrait/square geometry byte-identical (the checks
   *  never pass it). See `chartVScale` in tokens/design. */
  vScale?: number;
};

// Format-scaled vertical geometry: every plot y-coordinate + the viewBox height multiplied by `vScale`
// (1 = the source 640-tall reference). The component MUST derive its own axis/label y-positions from the
// SAME helper so the render matches the plan. x-geometry (bands, horizontal growth) is untouched.
export type BarsVGeom = { VIEW_H: number; PLOT_Y0: number; BASELINE_Y: number; CAT_LABEL_Y: number; PLOT_Y0_H: number; PLOT_Y1_H: number };
export function barsVGeom(vScale = 1): BarsVGeom {
  const s = Number.isFinite(vScale) && vScale > 0 ? vScale : 1;
  return { VIEW_H: Math.round(VIEW_H * s), PLOT_Y0: PLOT_Y0 * s, BASELINE_Y: BASELINE_Y * s, CAT_LABEL_Y: CAT_LABEL_Y * s, PLOT_Y0_H: PLOT_Y0_H * s, PLOT_Y1_H: PLOT_Y1_H * s };
}

/** Pure stagger-vs-N (§2.5): the last bar must finish growing by the 0.85 settle deadline. */
export function staggerForN(n: number): number {
  if (n <= 1) return MAX_STAGGER;
  return Math.min(MAX_STAGGER, (SETTLE_DEADLINE - GROW_START - BAR_GROW_DUR) / (n - 1));
}

// cubic-bezier(0.65,0,0.35,1) — easeInOutCubic, motionRole.chartGrow. Implemented locally
// (40-step bisection on the monotone x-polynomial) so render + check share one implementation,
// dependency-free for Node unit testing. Mirrors stack.ts.
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

/** Per-bar grow progress ∈ [0,1] — eased, clamped. The renderer's scale factor. */
export function barGrow(t: number, barStart: number): number {
  return chartGrowEase(clamp01((t - barStart) / BAR_GROW_DUR));
}

/** When a bar's value label fades in — the instant the bar finishes growing (§2.5 beat 3). */
export function labelStart(barStart: number): number {
  return barStart + BAR_GROW_DUR;
}

// PL-4.2 — the referenceLine draws on AFTER the bars settle (attention-choreography: bars grow,
// THEN the threshold lands, so the eye reads "which clear it"). Opacity-only ramp; geometry is
// pure-from-DATA. Fully on by t=1 (final frame == the settled reference), so it is thumbnail-safe.
export const REF_LINE_REVEAL_START = SETTLE_DEADLINE; // 0.85
export const REF_LINE_REVEAL_DUR = 0.1;
/** Reference-line fade-in opacity ∈ [0,1] — 0 until the bars settle, 1 by t≈0.95 (and at t=1). */
export function refLineReveal(t: number): number {
  return clamp01((t - REF_LINE_REVEAL_START) / REF_LINE_REVEAL_DUR);
}

/** niceMax — round v UP to a 1/2/2.5/5 × 10ⁿ step (a tiny pure helper, §2.4 C5). */
export function niceMax(v: number): number {
  if (!isNum(v) || v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const f = v / base;
  let nice: number;
  if (f <= 1) nice = 1;
  else if (f <= 2) nice = 2;
  else if (f <= 2.5) nice = 2.5;
  else if (f <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

/** Tick formatter — ≤ 2 decimals, trailing-zero-trimmed, unit suffix appended (§2.4 C5). */
export function formatTick(v: number, unit?: string): string {
  if (!isNum(v)) return "";
  const r = Math.round(v * 100) / 100;
  const s = Number.isInteger(r) ? String(r) : String(r);
  return unit ? `${s}${unit}` : s;
}

/** Default numeric value formatter (the value-label string when no override). */
export function formatValue(v: number, unit?: string): string {
  if (!isNum(v)) return "";
  const r = Math.round(v * 100) / 100;
  const s = Number.isInteger(r) ? String(r) : String(r);
  return unit ? `${s}${unit}` : s;
}

const estPxAt = (s: string) => estW(s) * EST_SCALE;

/**
 * The pure bar layout brain. Coerces knobs, sorts, caps, derives the axis, builds the
 * scaleBand/scaleLinear geometry, runs the manual stacked running-sum + sliver floor, and
 * decides every label show/hide — all from DATA, never `t`.
 */
export function planBars(input: PlanBarsInput): BarsPlan {
  // 1. Coerce knobs (unknown → default).
  const mode: BarMode = input.mode === "grouped" ? "grouped" : input.mode === "stacked" ? "stacked" : "simple";
  const orientation: BarOrientation = input.orientation === "horizontal" ? "horizontal" : "vertical";
  const valueLabels: "auto" | "off" = input.valueLabels === "off" ? "off" : "auto";
  const sort: BarSort = input.sort === "desc" ? "desc" : input.sort === "asc" ? "asc" : "none";
  const unit = typeof input.unit === "string" ? input.unit : "";

  const dropped = { categoriesDropped: 0, seriesDropped: 0, segmentsDropped: 0, hiddenLabels: 0 };

  // 2. Normalize categories → { label, values[] }. simple: [value]; clamp negatives → 0.
  const rawCats = Array.isArray(input.categories) ? input.categories : [];
  type NormCat = { label: string; values: number[]; valueText?: string; accent?: string; order: number };
  let cats: NormCat[] = rawCats.map((c, i) => {
    const label = typeof c?.label === "string" ? c.label : "";
    let values: number[];
    if (mode === "simple") {
      const v = isNum(c?.value) ? c!.value! : Array.isArray(c?.values) && isNum(c!.values![0]) ? c!.values![0] : 0;
      values = [Math.max(0, v)];
    } else {
      const src = Array.isArray(c?.values) ? c!.values! : isNum(c?.value) ? [c!.value!] : [];
      values = src.map((v) => (isNum(v) ? Math.max(0, v) : 0));
      if (values.length === 0) values = [0]; // empty values[] in a multi mode → single zero bar
    }
    return { label, values, valueText: typeof c?.valueText === "string" ? c.valueText : undefined, accent: typeof c?.accent === "string" ? c.accent : undefined, order: i };
  });

  // The "relevant" magnitude of a category for sort + axis: value (simple), max single series
  // (grouped — bars share a scale, the tallest sub-bar must fit), category total (stacked).
  const relevant = (c: NormCat): number =>
    mode === "stacked" ? c.values.reduce((s, v) => s + v, 0) : Math.max(0, ...c.values, 0);

  // 3. Sort (stable for ties — preserve author order) — BEFORE the cap so cap keeps the most relevant.
  if (sort !== "none") {
    cats = cats
      .map((c) => ({ c, key: relevant(c) }))
      .sort((a, b) => (sort === "desc" ? b.key - a.key : a.key - b.key) || a.c.order - b.c.order)
      .map((x) => x.c);
  }

  // 4. Cap categories (C1, drop tail + count).
  const maxCat = orientation === "horizontal" ? MAX_CAT_H : MAX_CAT_V;
  if (cats.length > maxCat) {
    dropped.categoriesDropped = cats.length - maxCat;
    cats = cats.slice(0, maxCat);
  }

  // 5. Cap series / segments (C2 / C3).
  const seriesCount = mode === "simple" ? 1 : Math.max(1, ...cats.map((c) => c.values.length), 1);
  const maxSeries = mode === "grouped" ? MAX_SERIES : mode === "stacked" ? MAX_SEG : 1;
  const keptSeries = Math.min(seriesCount, maxSeries);
  if (mode !== "simple") {
    let droppedHere = 0;
    cats = cats.map((c) => {
      if (c.values.length > keptSeries) droppedHere += c.values.length - keptSeries;
      return { ...c, values: c.values.slice(0, keptSeries) };
    });
    if (mode === "grouped") dropped.seriesDropped = droppedHere;
    else dropped.segmentsDropped = droppedHere;
  }

  // Legend labels / accents (grouped/stacked).
  const seriesLabels: string[] = [];
  const seriesAccents: AccentKey[] = [];
  if (mode !== "simple") {
    for (let s = 0; s < keptSeries; s++) {
      const lbl = Array.isArray(input.seriesLabels) && typeof input.seriesLabels[s] === "string" ? input.seriesLabels[s] : "";
      seriesLabels.push(lbl);
      seriesAccents.push(accentForIndex(Array.isArray(input.seriesAccents) ? input.seriesAccents[s] : undefined, s));
    }
  }

  // Empty state — 0 renderable categories after clamp.
  if (cats.length === 0) {
    return {
      mode, orientation, axisMin: 0, axisMax: 1, ticks: [0, 0.25, 0.5, 0.75, 1].map((f) => f),
      bars: [], seriesLabels, seriesAccents, unit, valueLabels, referenceLine: null,
      stagger: staggerForN(0), barGrowDur: BAR_GROW_DUR, dropped, empty: true,
    };
  }

  // 6. Derive axis + guard (C5). Baseline forced to min(0, dataMin) unless author overrides.
  const dataMin = Math.min(0, ...cats.flatMap((c) => c.values));
  const axisMin = isNum(input.axisMin) ? input.axisMin : Math.min(0, dataMin);
  const maxRelevant = Math.max(0, ...cats.map(relevant), 0);
  let axisMax = isNum(input.axisMax) ? input.axisMax : niceMax(maxRelevant);
  if (axisMax <= axisMin) axisMax = axisMin + 1; // max>min guard

  const ticks: number[] = [];
  for (let i = 0; i <= TICK_COUNT; i++) ticks.push(axisMin + ((axisMax - axisMin) * i) / TICK_COUNT);

  // 7. Build scales. Category band over the cross axis; value (linear) over the growth axis.
  // Vertical-fill: every plot y-coordinate is scaled by vScale (default 1 → byte-identical). For VERTICAL
  // bars that stretches the growth axis (taller bars); for HORIZONTAL bars it stretches the cross axis (more
  // row spacing) — exactly the two things Emil asked for on 9:16.
  const V = barsVGeom(input.vScale);
  const isV = orientation === "vertical";
  const plotX0 = isV ? PLOT_X0_V : PLOT_X0_H;
  const plotX1 = isV ? PLOT_X1_V : PLOT_X1_H;
  const crossLo = isV ? plotX0 : V.PLOT_Y0_H;
  const crossHi = isV ? plotX1 : V.PLOT_Y1_H;
  const growLen = isV ? V.BASELINE_Y - V.PLOT_Y0 : plotX1 - plotX0; // value-axis pixel span
  const value = scaleLinear().domain([axisMin, axisMax]).range([0, growLen]);
  // Painted length of a single bar from the baseline (C5 out-of-axis clamp: never exits the plot).
  const barLen = (v: number) => clamp(value(clamp(v, axisMin, axisMax)) ?? 0, 0, growLen);

  // Category band — reduce paddingInner toward 0 before any thickness drops below the floor (C4).
  const n = cats.length;
  const subN = mode === "grouped" ? keptSeries : 1;
  let padInner = PAD_INNER;
  const bandThickness = (pi: number) => {
    const band = scaleBand<number>().domain(cats.map((_, i) => i)).range([crossLo, crossHi]).paddingInner(pi).paddingOuter(PAD_OUTER);
    const bw = band.bandwidth();
    const sub = mode === "grouped" ? scaleBand<number>().domain(Array.from({ length: subN }, (_, i) => i)).range([0, bw]).paddingInner(GROUP_PAD_INNER) : null;
    return mode === "grouped" && sub ? sub.bandwidth() : bw;
  };
  while (padInner > 0 && bandThickness(padInner) < MIN_BAR_THICKNESS) padInner = Math.max(0, padInner - 0.02);
  const band = scaleBand<number>().domain(cats.map((_, i) => i)).range([crossLo, crossHi]).paddingInner(padInner).paddingOuter(PAD_OUTER);
  const bw = band.bandwidth();
  const subBand = mode === "grouped" ? scaleBand<number>().domain(Array.from({ length: subN }, (_, i) => i)).range([0, bw]).paddingInner(GROUP_PAD_INNER) : null;

  const stagger = staggerForN(n);

  // 8–10. Per-bar / segment normalized rects + label decisions.
  const bars: PlannedBar[] = cats.map((c, ci) => {
    const bandStart = band(ci) ?? crossLo;
    const barStart = GROW_START + stagger * ci;
    const rects: PlannedRect[] = [];

    if (mode === "stacked") {
      // Manual running-sum offsets, then a per-bar sliver floor in PAINTED px (each bar = its own
      // 100%): a segment below SEG_SLIVER_PX is floored, surplus taken proportionally from this
      // bar's larger segments only. Done in value-px space along the growth axis.
      // Segment px length = (value / axis span) × growth px. value→px is linear from axisMin.
      const segPx = c.values.map((v) => (Math.max(0, v) / (axisMax - axisMin)) * growLen);
      const total = segPx.reduce((s, p) => s + p, 0);
      const floored = applySliverFloor(segPx, total);
      let cursor = 0; // px from the baseline
      c.values.forEach((v, si) => {
        // Clamp the stack to the plot (C5: an explicit too-small axisMax never lets a stack exit).
        const segStart = Math.min(cursor, growLen);
        const segEnd = Math.min(cursor + floored[si], growLen);
        const h = segEnd - segStart;
        cursor += floored[si];
        const accentKey = accentForIndex(Array.isArray(input.seriesAccents) ? input.seriesAccents[si] : undefined, si);
        rects.push(buildRect({ isV, bandStart, bw, growLen, lengthPx: h, offsetPx: segStart, baselineY: V.BASELINE_Y, accentKey, value: v, seriesIndex: si }));
        rects[si].segStart = segStart;
        rects[si].segEnd = segEnd;
      });
    } else if (mode === "grouped") {
      c.values.forEach((v, si) => {
        const len = barLen(v);
        const subOff = subBand!(si) ?? 0;
        const subW = subBand!.bandwidth();
        const accentKey = seriesAccents[si] ?? accentForIndex(undefined, si);
        rects.push(buildRect({ isV, bandStart: bandStart + subOff, bw: subW, growLen, lengthPx: len, offsetPx: 0, baselineY: V.BASELINE_Y, accentKey, value: v, seriesIndex: si }));
      });
    } else {
      const v = c.values[0] ?? 0;
      const len = barLen(v);
      const accentKey = accentForIndex(c.accent, ci);
      rects.push(buildRect({ isV, bandStart, bw, growLen, lengthPx: len, offsetPx: 0, baselineY: V.BASELINE_Y, accentKey, value: v, seriesIndex: 0 }));
    }

    // Value-label placement + fit-or-hide per rect.
    for (const r of rects) {
      decideValueLabel(r, { isV, valueLabels, unit, customText: mode === "simple" ? c.valueText : undefined, plotX1, growLen, plotY0: V.PLOT_Y0 });
      if (!r.showValue && r.valueHideReason && r.valueHideReason !== "off") dropped.hiddenLabels++;
    }

    // Category-label fit-or-hide.
    const trimmed = c.label.trim();
    let labelHideReason: "empty" | "tooLong" | "tooThin" | undefined;
    const catSlot = isV ? bw : LABEL_ANCHOR_X;
    if (trimmed.length === 0) labelHideReason = "empty";
    else if ([...trimmed].length > CAT_LABEL_MAX_CP) labelHideReason = "tooLong";
    else if (estPxAt(trimmed) > catSlot) labelHideReason = "tooThin";
    const showLabel = labelHideReason === undefined;
    if (!showLabel && labelHideReason !== "empty") dropped.hiddenLabels++;

    return { catIndex: c.order, label: c.label, showLabel, ...(showLabel ? {} : { labelHideReason }), rects, barStart };
  });

  // 11. Reference line (PL-4.2 knob #1). Resolve AFTER the value labels so the label's hide-on-
  //     collision pass can see every shown value-label box. Geometry pure-from-DATA (REUSES barLen's
  //     out-of-axis clamp → the line never exits the plot band); absent input ⇒ null ⇒ byte-identical.
  const valueLabelBoxes = bars.flatMap((b) =>
    b.rects.map((r) => valueLabelBox(r, isV)).filter((box): box is Box => box !== null),
  );
  const referenceLine = planReferenceLine(input.referenceLine, { isV, barLen, plotX0, plotX1, valueLabelBoxes, baselineY: V.BASELINE_Y, plotY0: V.PLOT_Y0, plotY0H: V.PLOT_Y0_H, plotY1H: V.PLOT_Y1_H });

  return {
    mode, orientation, axisMin, axisMax, ticks, bars, seriesLabels, seriesAccents, unit, valueLabels, referenceLine,
    stagger, barGrowDur: BAR_GROW_DUR, dropped, empty: false,
  };
}

type Box = { x: number; y: number; w: number; h: number };
const boxOverlap = (a: Box, b: Box): number => {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? Math.min(ox, oy) : 0;
};

/** The viewBox-space box of a SHOWN value label — mirrors BarChart's ValueLabel placement exactly so
 *  the planner's reference-label collision pass sees the same geometry the renderer paints. */
function valueLabelBox(r: PlannedRect, isV: boolean): Box | null {
  if (!r.showValue) return null;
  const w = estPxAt(r.valueText.trim());
  const h = REF_LABEL_PX + 6;
  if (isV) {
    const cx = r.x + r.w / 2; // textAnchor="middle"
    const baseline = r.valuePlacement === "end" ? r.y - 8 : r.y + VALUE_LABEL_PX + 6;
    return { x: cx - w / 2, y: baseline - VALUE_LABEL_PX, w, h };
  }
  const baseline = r.y + r.h / 2 + 8;
  const x = r.valuePlacement === "end" ? r.x + r.w + 10 : r.x + r.w - 10 - w; // start vs end anchor
  return { x, y: baseline - VALUE_LABEL_PX, w, h };
}

/** Resolve the reference line + its right-anchored label (fit-or-hide; hide-on-collision keeps the
 *  line). `barLen` REUSES the bars' out-of-axis clamp, so lenPx ∈ [0, growLen] — never exits the band. */
function planReferenceLine(
  input: ReferenceLineInput | undefined,
  ctx: { isV: boolean; barLen: (v: number) => number; plotX0: number; plotX1: number; valueLabelBoxes: Box[]; baselineY: number; plotY0: number; plotY0H: number; plotY1H: number },
): PlannedReferenceLine | null {
  if (!input || !isNum(input.value)) return null;
  const { isV, barLen, plotX0, plotX1, valueLabelBoxes, baselineY, plotY0, plotY0H, plotY1H } = ctx;
  const value = input.value;
  const lenPx = barLen(value); // value(clamp(value, axisMin, axisMax)) — clamped into the plot band

  let x1: number, y1: number, x2: number, y2: number, labelX: number, labelY: number;
  if (isV) {
    const yRef = baselineY - lenPx; // horizontal line at the value
    x1 = plotX0;
    x2 = plotX1;
    y1 = yRef;
    y2 = yRef;
    labelX = plotX1; // right-anchored at the line's right end
    labelY = yRef - 8; // just above the line…
    if (labelY - REF_LABEL_PX < plotY0) labelY = yRef + REF_LABEL_PX + 6; // …flip below if it'd exit the top
  } else {
    const xRef = PLOT_X0_H + lenPx; // vertical line at the value
    x1 = xRef;
    x2 = xRef;
    y1 = plotY0H;
    y2 = plotY1H;
    labelX = xRef; // right-anchored at the line top
    labelY = plotY0H - 8;
  }

  const label = typeof input.label === "string" ? input.label.trim() : "";
  let showLabel = label.length > 0;
  let labelHideReason: "empty" | "tooLong" | "collision" | undefined;
  if (!showLabel) labelHideReason = "empty";
  else if ([...label].length > REF_LABEL_MAX_CP) {
    showLabel = false;
    labelHideReason = "tooLong";
  }
  const w = estPxAt(label);
  const box: Box = { x: labelX - w, y: labelY - REF_LABEL_PX, w, h: REF_LABEL_PX + 6 }; // textAnchor="end" → extends LEFT
  // Width fit: the right-anchored label must stay inside the plot band; too wide ⇒ hide (the line stays).
  if (showLabel && box.x < plotX0 - 0.5) {
    showLabel = false;
    labelHideReason = "tooLong";
  }
  // Hide-don't-bend: a collision with any shown value label hides the LABEL, the line is KEPT.
  if (showLabel && valueLabelBoxes.some((b) => boxOverlap(b, box) > 4)) {
    showLabel = false;
    labelHideReason = "collision";
  }

  return { value, lenPx, x1, y1, x2, y2, label, showLabel, ...(labelHideReason ? { labelHideReason } : {}), labelX, labelY };
}

/** Per-bar sliver floor (mirrors planStack): raise tiny positive segments to SEG_SLIVER_PX,
 *  take the surplus proportionally from the larger segments of THIS bar only; total preserved. */
function applySliverFloor(segPx: number[], total: number): number[] {
  if (total <= 0) return segPx.map(() => 0);
  const out = segPx.slice();
  const pinned = out.map(() => false);
  for (let pass = 0; pass < segPx.length; pass++) {
    const tiny = out.map((p, i) => !pinned[i] && p > 0 && p < SEG_SLIVER_PX);
    if (!tiny.some(Boolean)) break;
    tiny.forEach((isTiny, i) => {
      if (isTiny) {
        out[i] = SEG_SLIVER_PX;
        pinned[i] = true;
      }
    });
    const sumPinned = out.reduce((s, p, i) => s + (pinned[i] ? p : 0), 0);
    const sumOthers = out.reduce((s, p, i) => s + (!pinned[i] && p > 0 ? p : 0), 0);
    if (sumOthers <= 0) break;
    const scale = (total - sumPinned) / sumOthers;
    if (scale <= 0) break;
    out.forEach((p, i) => {
      if (!pinned[i] && p > 0) out[i] = p * scale;
    });
  }
  return out;
}

/** Build a normalized viewBox-space FINAL rect for one bar/sub-bar/segment. */
function buildRect(args: {
  isV: boolean;
  bandStart: number;
  bw: number;
  growLen: number;
  lengthPx: number; // painted extent along the growth axis
  offsetPx: number; // offset from the baseline (stacked segment start)
  baselineY: number; // vertical growth baseline (BASELINE_Y × vScale)
  accentKey: AccentKey;
  value: number;
  seriesIndex: number;
}): PlannedRect {
  const { isV, bandStart, bw, lengthPx, offsetPx, baselineY, accentKey, value, seriesIndex } = args;
  if (isV) {
    // vertical: x = band, width = bw; bar grows UP from the baseline. y = baseline − offset − length.
    return {
      x: bandStart,
      y: baselineY - offsetPx - lengthPx,
      w: bw,
      h: lengthPx,
      accentKey, value, valueText: "", showValue: false, valuePlacement: "end", seriesIndex,
    };
  }
  // horizontal: y = band, height = bw; bar grows RIGHT from PLOT_X0_H. x = baseline + offset.
  return {
    x: PLOT_X0_H + offsetPx,
    y: bandStart,
    w: lengthPx,
    h: bw,
    accentKey, value, valueText: "", showValue: false, valuePlacement: "end", seriesIndex,
  };
}

/** Decide a rect's value label: string, placement (end vs inside), and show/hide (§2.6.3). */
function decideValueLabel(
  r: PlannedRect,
  ctx: { isV: boolean; valueLabels: "auto" | "off"; unit: string; customText?: string; plotX1: number; growLen: number; plotY0: number },
) {
  const text = ctx.customText != null ? ctx.customText : formatValue(r.value, ctx.unit);
  r.valueText = text;
  if (ctx.valueLabels === "off") {
    r.showValue = false;
    r.valueHideReason = "off";
    return;
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    r.showValue = false;
    r.valueHideReason = "empty";
    return;
  }
  if ([...trimmed].length > VALUE_LABEL_MAX_CP) {
    r.showValue = false;
    r.valueHideReason = "tooLong";
    return;
  }
  const estPx = estPxAt(trimmed);
  // The bar's painted extent along the growth axis, and the gap to the plot edge.
  const extent = ctx.isV ? r.h : r.w;
  const barEnd = ctx.isV ? r.y : r.x + r.w; // vertical: top y (smaller=higher); horizontal: right x
  // End-placement slot: vertical = space above the bar top to the (scaled) plot top; horizontal = space right of bar end to plotX1.
  const endSlot = ctx.isV ? barEnd - ctx.plotY0 : ctx.plotX1 - barEnd;
  // For vertical, an end label sits ABOVE the bar; its width must fit the band, height ~the slot.
  // For horizontal, an end label sits to the right; width must fit endSlot.
  const endFits = ctx.isV ? endSlot >= VALUE_LABEL_PX + LABEL_PAD : endSlot >= estPx + LABEL_PAD;
  if (endFits) {
    r.showValue = true;
    r.valuePlacement = "end";
    return;
  }
  // Inside placement: the label sits within the bar's own extent minus padding.
  const insideSlot = extent - LABEL_PAD;
  const insideFits = ctx.isV ? insideSlot >= VALUE_LABEL_PX + LABEL_PAD : insideSlot >= estPx;
  if (insideFits) {
    r.showValue = true;
    r.valuePlacement = "inside";
    return;
  }
  r.showValue = false;
  r.valueHideReason = "tooThin";
}
