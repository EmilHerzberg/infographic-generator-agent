// PL-2.6 — Histogram plan: the pure "histogram brain" shared by the renderer (PostRenderer →
// HistogramChart) and the deterministic check suite (tools/qa-histogram.mjs). Fifth chart sprint of
// Epic PL-2. Histogram = "bar, but contiguous bins on a numeric axis." Like bars.ts / scatter.ts it
// is dependency-light (only d3-scale + the estW/accentForIndex/niceMax/formatTick + grow-timing
// helpers REUSED from bars.ts) so Node's native type-stripping can unit-test it without a DOM.
//
// `histogram` expresses the SHAPE / SPREAD of ONE metric across many observations — where the mass
// sits, how wide the tail is, skew/bimodality. planHistogram owns EVERY geometry decision — knob
// coercion, the values-XOR-bins resolution, the ~8-line equal-width binning (last-bin-inclusive via
// floor+clamp, all-same-value guard), the count axis (0-baseline + niceMax), the numeric x edges via
// scaleLinear, per-bin normalized rects (REUSE the bars geometry model, gap=0, 8px nonzero sliver
// floor, zero-count→0), the stat markers (median/mean/p95 + author markerLines ≤3, NEUTRAL,
// suppressed in bins-only mode), the every-k x-ticks, and label fit-or-hide — all from DATA only,
// never from `t`. Every drop is surfaced via a counter (§2.6), never silent.
// Spec: planning/primitive-library/handoffs/PL-2.6-histogram.md §2.4 / §2.5 / §2.6 / §2.8.

import { scaleLinear } from "d3-scale";
import { estW } from "./stack.ts";
import {
  accentForIndex,
  formatTick,
  niceMax,
  staggerForN,
  barGrow,
  labelStart,
  type AccentKey,
} from "./bars.ts";

// ── Fixed viewBox geometry (source px) — §2.4. REUSE the BarChart vertical band. ─────────────
export const VIEW_W = 1000;
export const VIEW_H = 640;
export const PLOT_X0 = 120;
export const PLOT_X1 = 980;
export const PLOT_Y0 = 70; // top of growth height
export const BASELINE_Y = 560; // count = 0; bins grow UP from here

export const MIN_BINS = 5; // §2.4 — fewer than 5 isn't a distribution
export const MAX_BINS = 14; // §2.4 — 15+ becomes a picket fence below the mobile bin-width floor
export const MIN_BIN_WIDTH = 40; // §2.4 — contiguous bin-width floor (source px) ≈14.4px@390
export const MIN_BIN_PX = 8; // §2.4 — min painted height for a count≥1 bin (≈2.9px@390)
export const MAX_X_TICKS = 6; // §2.4 — ≤6 numeric edge labels fit [120,980]

export const TICK_COUNT = 4; // 5 horizontal gridlines incl. baseline (REUSE BarChart C5)
export const MARKER_STROKE = 4; // §2.4 — neutral reference dash (≈1.4px@390)
export const MARKER_LABEL_PX = 22; // §2.4 — marker label source size
export const BIN_LABEL_PX = 22; // §2.4 — per-bin count label source size
export const AXIS_LABEL_PX = 24; // §2.4 — x-tick + axis-title labels (axis floor)

// REUSE bars timing verbatim (GROW_START 0.34, BAR_GROW_DUR 0.30, SETTLE_DEADLINE 0.85). Markers
// fade/draw AFTER the bins settle (the scatter trend pattern).
export const MARKER_START = 0.86; // §2.5 — marker draw-on begins the frame the last bin settles
export const MARKER_DUR = 0.1; // §2.5 — fully drawn by 0.96
const X1C = 0.65;
const X2C = 0.35;
const MAX_MARKERS = 3; // §2.4 — ≤3 marker lines total

const MARKER_LABEL_MAX_CP = 16; // marker label cp budget
const BIN_LABEL_MAX_CP = 8; // per-bin count label cp budget (counts are short)
const LABEL_PAD = 10; // px gap a label needs from a neighbour / plot edge
// estW() is calibrated at 26px (stack.ts). Histogram labels render at 22px → scale the estimate.
const BIN_EST_SCALE = BIN_LABEL_PX / 26;
const MARKER_EST_SCALE = MARKER_LABEL_PX / 26;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

const estBinPx = (s: string) => estW(s) * BIN_EST_SCALE;
const estMarkerPx = (s: string) => estW(s) * MARKER_EST_SCALE;

export type HistKnobMarkers = "off" | "median" | "mean" | "medianMean" | "p95";
export type HistKnobLabels = "auto" | "off";

export type HistogramBinInput = { x0: number; x1: number; count: number };
export type HistogramMarkerInput = { value: number; label?: string };

export type PlannedBin = {
  index: number;
  x0: number; // data-space edges (for the x-tick + correctness checks)
  x1: number;
  count: number;
  x: number; // FINAL viewBox rect (constant across t)
  y: number;
  w: number;
  h: number; // floored to MIN_BIN_PX for count≥1; 0 for count==0
  showCount: boolean;
  countText: string;
  countHideReason?: "off" | "empty" | "tooLong" | "tooThin";
  binStart: number; // grow stagger start (REUSE staggerForN)
};

export type PlannedMarker = {
  kind: "median" | "mean" | "p95" | "custom";
  value: number;
  xPx: number; // clamped to [PLOT_X0, PLOT_X1]
  label: string;
  showLabel: boolean;
  anchor: "start" | "end";
};

export type HistogramPlan = {
  bins: PlannedBin[];
  edges: number[];
  xTickIndices: number[]; // every-k edge indices to label
  axisMinX: number;
  axisMaxX: number;
  axisMaxCount: number;
  countTicks: number[];
  binWidthPx: number;
  markers: PlannedMarker[];
  xLabel: string;
  yLabel: string;
  xUnit: string;
  accentKey: AccentKey;
  markersKnob: HistKnobMarkers;
  valueLabels: HistKnobLabels;
  stagger: number;
  barGrowDur: number;
  dropped: {
    invalidValues: number;
    invalidBins: number;
    binsIgnored: number;
    nonContiguousBins: number;
    clampedValues: number;
    clampedMarkers: number;
    flooredBins: number;
    markersSuppressed: number;
    markersDropped: number;
    hiddenBinLabels: number;
    hiddenMarkerLabels: number;
  };
  degenerate?: "single-value";
  empty: boolean;
};

export type PlanHistogramInput = {
  values?: number[];
  bins?: HistogramBinInput[];
  binCount?: number;
  xLabel?: string;
  yLabel?: string;
  xUnit?: string;
  markers?: HistKnobMarkers | string;
  markerLines?: HistogramMarkerInput[];
  axisMin?: number;
  axisMax?: number;
  valueLabels?: HistKnobLabels | string;
  accent?: string;
};

// ── REUSED grow easing exports (markers add a draw-on reveal mirroring scatter trendReveal) ──
const bez = (p: number, a1: number, a2: number) => (((1 - 3 * a2 + 3 * a1) * p + (3 * a2 - 6 * a1)) * p + 3 * a1) * p;
function solveBez(x: number, x1: number, x2: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (bez(mid, x1, x2) < x) lo = mid;
    else hi = mid;
  }
  return bez((lo + hi) / 2, 0, 1);
}
/** Marker draw-on reveal ∈ [0,1] — easeInOutCubic over [MARKER_START, MARKER_START+MARKER_DUR]
 *  (mirror scatter's trendReveal; begins AFTER the last bin settles at SETTLE_DEADLINE). */
export function markerReveal(t: number): number {
  return clamp01(solveBez(clamp01((t - MARKER_START) / MARKER_DUR), X1C, X2C));
}

// ── NEW pure helpers (the binning + statistics math; no dep) ─────────────────────────────────
/** Sturges-ish, the no-dependency default bin count: ceil(log2(n)) + 1, clamped [5,14] downstream. */
export function sturges(n: number): number {
  if (n <= 1) return MIN_BINS;
  return Math.ceil(Math.log2(n)) + 1;
}

/** The ~8-line equal-width bin loop. last-bin-inclusive via floor + final clamp: a value === hi
 *  lands in bin binCount−1 (the standard right-closed-last-bin rule). Returns per-bin counts +
 *  how many values were clamped in from outside [lo,hi] (author-tight axis). */
export function binValues(
  values: number[],
  lo: number,
  hi: number,
  binCount: number,
): { counts: number[]; clamped: number } {
  const counts = new Array(binCount).fill(0);
  const binWidth = (hi - lo) / binCount;
  let clamped = 0;
  for (const v of values) {
    if (v < lo || v > hi) clamped++;
    const raw = Math.floor((v - lo) / binWidth);
    const i = clamp(raw, 0, binCount - 1); // floor + clamp ⇒ last bin inclusive of hi
    counts[i]++;
  }
  return { counts, clamped };
}

export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/** Linear-interpolation percentile on a SORTED ascending array. p ∈ [0,1]. p95 → p=0.95. */
export function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0];
  const idx = p * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] + frac * (sorted[hi] - sorted[lo]);
}

export function median(sorted: number[]): number {
  return percentile(sorted, 0.5);
}

/** Every-k edge indices to label: k = ceil((binCount+1)/MAX_X_TICKS); always first + last. A strided
 *  index closer than k to the forced last edge is dropped (it would collide with the last label). */
export function everyKEdges(binCount: number, maxTicks: number): number[] {
  const edgeCount = binCount + 1;
  const last = edgeCount - 1;
  const k = Math.max(1, Math.ceil(edgeCount / maxTicks));
  const idx = new Set<number>();
  idx.add(0);
  // Strided ticks, but never within k of the last edge (collision guard) — and never on the last
  // edge's slot (added explicitly below).
  for (let i = 0; i < last; i += k) {
    if (last - i < k) break;
    idx.add(i);
  }
  idx.add(last); // always label the last edge (the range is unambiguous)
  return [...idx].sort((a, b) => a - b);
}

const emptyDropped = () => ({
  invalidValues: 0,
  invalidBins: 0,
  binsIgnored: 0,
  nonContiguousBins: 0,
  clampedValues: 0,
  clampedMarkers: 0,
  flooredBins: 0,
  markersSuppressed: 0,
  markersDropped: 0,
  hiddenBinLabels: 0,
  hiddenMarkerLabels: 0,
});

/**
 * The pure histogram layout brain. Coerces knobs, resolves values-XOR-bins, bins raw values into
 * clamped-Sturges equal-width bins (or accepts pre-binned), derives the count axis (0-baseline +
 * niceMax) and numeric x edges via scaleLinear, builds per-bin normalized rects (gap=0, 8px sliver
 * floor, zero-count→0), computes stat-marker x-positions (NEUTRAL, ≤3, suppressed in bins-only
 * mode), the every-k x-ticks, and every label show/hide — all from DATA, never `t`.
 */
export function planHistogram(input: PlanHistogramInput): HistogramPlan {
  // 1. Coerce knobs (unknown → default).
  const markersKnob: HistKnobMarkers =
    input.markers === "median" || input.markers === "mean" || input.markers === "medianMean" || input.markers === "p95"
      ? input.markers
      : "off";
  const valueLabels: HistKnobLabels = input.valueLabels === "off" ? "off" : "auto";
  const xUnit = typeof input.xUnit === "string" ? input.xUnit : "";
  const xLabel = typeof input.xLabel === "string" ? input.xLabel : "";
  const yLabel = typeof input.yLabel === "string" ? input.yLabel : "count";
  const accentKey = accentForIndex(input.accent, 0);
  const dropped = emptyDropped();

  const hasValues = Array.isArray(input.values) && input.values.length > 0;
  const hasBins = Array.isArray(input.bins) && input.bins.length > 0;

  // 2. Resolve the data: values WIN if both present (§2.6).
  let edges: number[] = [];
  let counts: number[] = [];
  let axisMinX = 0;
  let axisMaxX = 1;
  let binCount = 0;
  let degenerate: "single-value" | undefined;
  // statistics sample (only available in raw-values mode) → markers.
  let sortedSample: number[] | null = null;
  let binsOnly = false;

  if (hasValues) {
    if (hasBins) dropped.binsIgnored = (input.bins as HistogramBinInput[]).length;
    // Filter non-finite values.
    const raw = input.values as number[];
    const finite = raw.filter((v) => {
      if (isNum(v)) return true;
      dropped.invalidValues++;
      return false;
    });
    if (finite.length === 0) return emptyPlan(xLabel, yLabel, xUnit, accentKey, markersKnob, valueLabels, dropped);

    binCount = clamp(isNum(input.binCount) ? Math.round(input.binCount) : sturges(finite.length), MIN_BINS, MAX_BINS);

    const dataMin = Math.min(...finite);
    const dataMax = Math.max(...finite);
    // All-same-value: every observation is identical (a single mass). Honest single-value histogram,
    // not an error — surfaced as degenerate so the caller knows. Only flagged when the AUTHOR has
    // not pinned a wider axis (an author range makes it a normal, non-degenerate plot).
    const allSame = dataMin === dataMax;
    let lo = isNum(input.axisMin) ? input.axisMin : dataMin;
    // The VALUE (x) axis spans the DATA range (§ design U3 "x lo/hi from data") — NOT niceMax'd.
    // niceMax is for the COUNT (y) axis only (below); applying it here padded the x-axis to a round
    // number (e.g. dataMax 12 → 20), leaving empty trailing bins and cramming the distribution into
    // the left of the plot. Bins must tile the data's actual extent.
    let hi = isNum(input.axisMax) ? input.axisMax : dataMax;
    if (allSame && !isNum(input.axisMin) && !isNum(input.axisMax)) {
      const v = dataMin;
      lo = v - 0.5;
      hi = v + 0.5;
      degenerate = "single-value";
    }
    // Numerical guard: any other case where hi ≤ lo (e.g. an inverted author range) → widen by 1.
    if (hi <= lo) {
      hi = lo + 1;
      if (!degenerate && allSame) degenerate = "single-value";
    }
    axisMinX = lo;
    axisMaxX = hi;

    const binned = binValues(finite, lo, hi, binCount);
    counts = binned.counts;
    dropped.clampedValues = binned.clamped;
    const binWidth = (hi - lo) / binCount;
    edges = Array.from({ length: binCount + 1 }, (_, i) => lo + i * binWidth);

    sortedSample = finite.slice().sort((a, b) => a - b);
  } else if (hasBins) {
    binsOnly = true;
    // Validate each {x0<x1, count≥0, finite}; drop invalid; sort by x0.
    const valid = (input.bins as HistogramBinInput[]).filter((b) => {
      const ok = b && isNum(b.x0) && isNum(b.x1) && isNum(b.count) && b.x1 > b.x0 && b.count >= 0;
      if (!ok) dropped.invalidBins++;
      return ok;
    });
    if (valid.length === 0) return emptyPlan(xLabel, yLabel, xUnit, accentKey, markersKnob, valueLabels, dropped);
    const sorted = valid.slice().sort((a, b) => a.x0 - b.x0);
    // Honor the cap (use the first MAX_BINS); flag any gaps/overlaps but render edges verbatim.
    const kept = sorted.slice(0, MAX_BINS);
    binCount = kept.length;
    let nonContig = 0;
    for (let i = 0; i + 1 < kept.length; i++) {
      if (Math.abs(kept[i].x1 - kept[i + 1].x0) > 1e-9) nonContig++;
    }
    dropped.nonContiguousBins = nonContig;
    counts = kept.map((b) => b.count);
    edges = [kept[0].x0, ...kept.map((b) => b.x1)];
    axisMinX = edges[0];
    axisMaxX = edges[edges.length - 1];
    // Markers suppressed in bins-only mode (no raw sample → no honest statistic).
    if (markersKnob !== "off") dropped.markersSuppressed++;
  } else {
    return emptyPlan(xLabel, yLabel, xUnit, accentKey, markersKnob, valueLabels, dropped);
  }

  // 3. Count (y) axis — 0-baseline + niceMax(maxBinCount). REUSE bars.
  const maxBinCount = Math.max(0, ...counts);
  const axisMaxCount = niceMax(Math.max(1, maxBinCount));
  const countTicks: number[] = [];
  for (let i = 0; i <= TICK_COUNT; i++) countTicks.push((axisMaxCount * i) / TICK_COUNT);

  // 4. Numeric x edges via scaleLinear → equal-width bin pixel positions (gap=0, contiguous).
  const xScale = scaleLinear().domain([axisMinX, axisMaxX]).range([PLOT_X0, PLOT_X1]);
  const binWidthPx = (PLOT_X1 - PLOT_X0) / binCount;

  // 5. Count scale → bin heights (REUSE the bars geometry model: grow UP from BASELINE_Y).
  const growLen = BASELINE_Y - PLOT_Y0;
  const countScale = scaleLinear().domain([0, axisMaxCount]).range([0, growLen]);

  const stagger = staggerForN(binCount);

  const bins: PlannedBin[] = counts.map((count, i) => {
    const x = PLOT_X0 + i * binWidthPx;
    let h = countScale(count) ?? 0;
    h = clamp(h, 0, growLen);
    // 8px sliver floor for a count≥1 bin; zero-count bin paints NOTHING (height 0).
    if (count >= 1 && h < MIN_BIN_PX) {
      h = MIN_BIN_PX;
      dropped.flooredBins++;
    } else if (count === 0) {
      h = 0;
    }
    const y = BASELINE_Y - h;
    // Per-bin count label fit-or-hide.
    const countText = String(count);
    let showCount = false;
    let countHideReason: PlannedBin["countHideReason"];
    if (valueLabels === "off") {
      countHideReason = "off";
    } else if (count === 0 || countText.length === 0) {
      countHideReason = "empty";
    } else if ([...countText].length > BIN_LABEL_MAX_CP) {
      countHideReason = "tooLong";
      dropped.hiddenBinLabels++;
    } else if (estBinPx(countText) > binWidthPx - 4) {
      countHideReason = "tooThin";
      dropped.hiddenBinLabels++;
    } else {
      showCount = true;
    }
    return {
      index: i,
      x0: edges[i],
      x1: edges[i + 1],
      count,
      x,
      y,
      w: binWidthPx,
      h,
      showCount,
      countText,
      ...(showCount ? {} : { countHideReason }),
      binStart: 0.34 + stagger * i, // GROW_START + stagger·i (REUSE bars timing)
    };
  });

  // 6. Stat markers (REUSE the scatter stat-math precedent). Suppressed in bins-only mode.
  const markers: PlannedMarker[] = [];
  const hasAuthorLines = Array.isArray(input.markerLines) && input.markerLines.length > 0;
  type RawMarker = { kind: PlannedMarker["kind"]; value: number; label?: string; priority: number };
  const raws: RawMarker[] = [];

  if (hasAuthorLines) {
    // Explicit author lines OVERRIDE the enum (author knows better). Highest priority.
    for (const ml of input.markerLines as HistogramMarkerInput[]) {
      if (!ml || !isNum(ml.value)) continue;
      raws.push({ kind: "custom", value: ml.value, label: typeof ml.label === "string" ? ml.label : undefined, priority: 3 });
    }
  } else if (!binsOnly && sortedSample) {
    // Derived stat lines (priority: p95 > median > mean — §2.4 label-collision order).
    const wantMedian = markersKnob === "median" || markersKnob === "medianMean";
    const wantMean = markersKnob === "mean" || markersKnob === "medianMean";
    const wantP95 = markersKnob === "p95";
    if (wantP95) raws.push({ kind: "p95", value: percentile(sortedSample, 0.95), priority: 2 });
    if (wantMedian) raws.push({ kind: "median", value: median(sortedSample), priority: 1 });
    if (wantMean) raws.push({ kind: "mean", value: mean(sortedSample), priority: 0 });
  }

  // ≤3 cap (keep the highest-priority).
  raws.sort((a, b) => b.priority - a.priority);
  if (raws.length > MAX_MARKERS) {
    dropped.markersDropped = raws.length - MAX_MARKERS;
    raws.length = MAX_MARKERS;
  }

  // Build markers: clamp value to axis (line stays in band; label shows true value), label fit.
  type MBox = { x: number; w: number };
  const placedLabelBoxes: MBox[] = [];
  for (const r of raws) {
    const clampedVal = clamp(r.value, axisMinX, axisMaxX);
    if (r.value < axisMinX || r.value > axisMaxX) dropped.clampedMarkers++;
    const xPx = clamp(xScale(clampedVal) ?? PLOT_X0, PLOT_X0, PLOT_X1);
    // Default label: "<kind> <value><unit>" for derived; the author label (or the value) for custom.
    const valText = formatTick(r.value, xUnit);
    const defaultLabel =
      r.kind === "custom" ? (r.label && r.label.trim().length > 0 ? r.label : valText) : `${r.kind} ${valText}`;
    const label = defaultLabel;
    // Anchor: right third → end (label hugs left of the line), else start.
    const anchor: "start" | "end" = xPx > PLOT_X0 + ((PLOT_X1 - PLOT_X0) * 2) / 3 ? "end" : "start";
    let showLabel = label.trim().length > 0 && [...label].length <= MARKER_LABEL_MAX_CP;
    const est = estMarkerPx(label);
    // Room to the chosen plot edge.
    const room = anchor === "end" ? xPx - PLOT_X0 - LABEL_PAD : PLOT_X1 - xPx - LABEL_PAD;
    if (showLabel && est > room) showLabel = false;
    // The label box (anchored at xPx).
    const lx = anchor === "end" ? xPx - est : xPx;
    if (showLabel) {
      const overlaps = placedLabelBoxes.some((b) => Math.min(b.x + b.w, lx + est) - Math.max(b.x, lx) > 4);
      if (overlaps) showLabel = false; // lower-priority label hides on >4px overlap
    }
    if (label.trim().length > 0 && !showLabel) dropped.hiddenMarkerLabels++;
    if (showLabel) placedLabelBoxes.push({ x: lx, w: est });
    markers.push({ kind: r.kind, value: r.value, xPx, label, showLabel, anchor });
  }

  const xTickIndices = everyKEdges(binCount, MAX_X_TICKS);

  return {
    bins,
    edges,
    xTickIndices,
    axisMinX,
    axisMaxX,
    axisMaxCount,
    countTicks,
    binWidthPx,
    markers,
    xLabel,
    yLabel,
    xUnit,
    accentKey,
    markersKnob,
    valueLabels,
    stagger,
    barGrowDur: 0.3, // BAR_GROW_DUR (REUSE bars)
    dropped,
    ...(degenerate ? { degenerate } : {}),
    empty: false,
  };
}

function emptyPlan(
  xLabel: string,
  yLabel: string,
  xUnit: string,
  accentKey: AccentKey,
  markersKnob: HistKnobMarkers,
  valueLabels: HistKnobLabels,
  dropped: HistogramPlan["dropped"],
): HistogramPlan {
  const countTicks: number[] = [];
  for (let i = 0; i <= TICK_COUNT; i++) countTicks.push(i / TICK_COUNT);
  return {
    bins: [],
    edges: [],
    xTickIndices: [],
    axisMinX: 0,
    axisMaxX: 1,
    axisMaxCount: 1,
    countTicks,
    binWidthPx: 0,
    markers: [],
    xLabel,
    yLabel,
    xUnit,
    accentKey,
    markersKnob,
    valueLabels,
    stagger: staggerForN(0),
    barGrowDur: 0.3,
    dropped,
    empty: true,
  };
}

// REUSED helpers re-exported so the renderer + qa import one source of truth.
export { niceMax, formatTick, accentForIndex, staggerForN, barGrow, labelStart };
export type { AccentKey };
