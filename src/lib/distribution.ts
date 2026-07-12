// PL-3.5 — Distribution / box-plot plan: the pure "distribution brain" shared by the renderer
// (PostRenderer → Distribution) and the deterministic check suite (tools/qa-distribution.mjs).
// The quantile/spread-structure gap (median + IQR + range + outliers for one or a few GROUPS on a
// SHARED value axis). Like bars.ts / scatter.ts / candlestick.ts it is dependency-light (only
// d3-scale `scalePoint`+`scaleLinear` + the estW/accentForIndex/formatTick helpers reused from
// stack.ts/bars.ts + the hand-rolled percentile/median/mean REUSED from histogram.ts) so Node's
// native type-stripping can unit-test it without a DOM. FRAMEWORKS §A binding: quantiles are
// hand-rolled (sort + linear-interpolation order statistics, the histogram precedent), so NO new
// dependency (NO d3-array) is added.
//
// `distribution` expresses the FIVE-NUMBER summary (min·q1·median·q3·max) + outliers of one or a few
// groups laid out as ROWS on a shared value axis — the IQR spread + median is the point. The value
// axis is NOT 0-anchored — it is a value WINDOW derived `[min(all), max(all)] + 8% pad` exactly like
// scatter/candlestick (a 0-anchored distribution crushes a far-from-0 latency window into a sliver,
// C5). `planDistribution` owns EVERY geometry decision — knob coercion, the raw-`values`-OR-precomputed
// resolution (values win; <MIN_SAMPLES → tiny-n reduced glyph; precomputed → C6 sanitation so a broken
// box is impossible), the §3 DYNAMIC render cap on the RENDERED viewH (even-stride downsample, surfaced),
// C5 axis derivation + max>min guard, the scalePoint rows + scaleLinear value layout, per-group
// box/whisker/median/outlier/mean geometry, the C-ZIQR 6px zero-IQR floor, the outlier cap 8 +
// downsample, mean suppression, and the row-label fit-or-hide — all from DATA only, never from `t`, so
// its output feeds the static-geometry checks directly. Every drop is surfaced via a counter (§2.6).
//
// PL-0.8 ROW-AWARE viewBox (the §2.10 decision + §3 BINDING CORRECTION): width is FIXED (1000); height
// is row-aware — the renderer measures its row's aspect and passes a `viewH` so the viewBox aspect
// MATCHES the row → the SVG fills the full row WIDTH (uniform scale, scaleX==scaleY) so the outlier
// dots (a scatter-class fixed-radius fragile feature) stay full-width (~6.5px@390) instead of being
// height-bounded-and-shrunk in a wide-short row. BUT a row-aware short viewH cannot fit 5 rows at the
// pitch floor, so the RENDER group cap is DYNAMIC on the rendered viewH (the §3 correction): a tall row
// shows all 5, a short row shows fewer, each ≥ MIN_ROW_PITCH apart. The strict schema stays maxItems:5.
// viewH defaults to 640 ⇒ every already-fitting render is byte-identical.
// Spec: planning/primitive-library/handoffs/PL-3.5-distribution.md §2.4 / §2.5 / §2.6 / §3.

import { scalePoint, scaleLinear } from "d3-scale";
import { estW } from "./stack.ts";
import { accentForIndex, formatTick, type AccentKey } from "./bars.ts";
import { percentile, median, mean } from "./histogram.ts"; // hand-rolled stats — NO d3-array

export type DistMode = "box" | "rangeMarkers";
export type DistMeanKnob = "off" | "on";

// ── viewBox geometry (source px) — §2.4. Width FIXED (1000); height ROW-AWARE (PL-0.8). ───────────
export const VIEW_W = 1000;
export const VIEW_H = 640; // default / max viewBox height
// Floor — covers a row aspect ≤ 1000/280 ≈ 3.57:1 (the realistic distribution-row range: a viz row with
// metrics + a normal headline measures ~2.8–3.5:1). Below this the box letterboxes by width (the rare
// pathological short row); above it the viewBox aspect MATCHES the row so the SVG fills the WIDTH exactly
// (scaleX==scaleY, outlier dots full-size). Lower than scatter/candlestick's 320 because distribution's
// LOAD-BEARING axis is the rows AND its typical row is a touch wider than candlestick's 2.95:1.
export const MIN_VIEW_H = 280;
export const PLOT_X0 = 150; // value-axis plot band x — 818 wide; left gutter <150 holds the group-ROW labels
export const PLOT_X1 = 968;
// Chrome overhead is LEANER than scatter/candlestick (56+64=120 vs 70+84=154): the row band's vertical
// extent is load-bearing for the dynamic cap, and the fixed 154 overhead ate too much of a short viewBox
// (a 3.5:1 row → viewH ~285 → only 131px band → the cap collapsed to 1). With 120 overhead the §3 fit
// proof holds at viewH {320,480,640} → caps {2,4,5}, pitch {100,90,104} ≥ MIN_ROW_PITCH 80.
export const PLOT_TOP = 56; // top air (fixed px, independent of viewH)
export const PLOT_BOTTOM_BAND = 64; // value-axis ticks + axis title band below the plot (fixed px)
export const PLOT_Y0 = PLOT_TOP; // 56 — default-viewH bounds (back-compat export; unit checks use these)
export const PLOT_Y1 = VIEW_H - PLOT_BOTTOM_BAND; // 576 at viewH 640 — the row band bottom

// §3 RECOMPUTED MIN_ROW_PITCH (the binding correction). The §2 value 96 fails: even 2 groups don't fit
// a short row at 96. Re-derived from the box-label stack against the rendered row band
// `rowBand(viewH) = viewH − PLOT_TOP − PLOT_BOTTOM_BAND` (with the LEANER 120 overhead: 200 @320, 360
// @480, 520 @640) and the scalePoint pitch `band / (N − 1 + 2·ROW_PAD_OUTER)`. The DYNAMIC render cap is
// chosen so the RENDERED scalePoint pitch is ALWAYS ≥ MIN_ROW_PITCH (not just band/PITCH ≥ N). With
// ROW_PAD_OUTER 0.5:
//   viewH 280 (the floor) → cap 2, rendered pitch 80.0  (≥2 fit — the §3 short-row requirement)
//   viewH 320 → cap 2, rendered pitch 100.0
//   viewH 480 → cap 4, rendered pitch 90.0
//   viewH 640 → cap 5, rendered pitch 104.0  (all 5 fit — the §3 tall-row requirement)
// Each row's box thickness clamp(round(pitch·0.55), 28, 96) ⇒ boxH 50–57px, inter-row gap ≥ 40px ⇒ no
// row-row collision at any cap (proven in qa-distribution U-rowpitch). 80 sits in the §3 ~72–84 band.
export const MIN_ROW_PITCH = 80; // C1/C4 — min center-to-center distance between group rows (RECOMPUTED)
export const MIN_BOX_H = 28; // C4 — IQR box band thickness floor (→ 10.1px@390, ≥ the type floor)
export const MAX_BOX_H = 96; // C4 — box thickness cap (a pleasant aspect for 1–2 groups)
export const ZERO_IQR_PX = 6; // C-ZIQR — q1==q3 → box floored to a 6px-wide flat block, NEVER hidden
export const WHISKER_STROKE = 4; // C-WHISK — whisker / cap / range-line / tick stroke (→ 1.44px@390)
export const MEDIAN_STROKE = 6; // C-MED — median line THICKER than the whisker (the dominant read) → 2.2px@390
export const CAP_LEN_FRAC = 0.5; // whisker end-cap length = 0.5·box thickness (centered on the row)
export const OUTLIER_R = 9; // C-OUT — outlier dot radius (source px) → ~6.5px@390 diameter floor
export const OUTLIER_STROKE = 1; // 1px deepInk halo so overlapping outliers stay separable
export const GRID_STROKE = 1.5; // value-axis gridlines + baseline (reused from bars)
export const AXIS_LABEL_PX = 24; // value-axis tick labels + group-row labels (the 18px floor parent)
export const MED_LABEL_PX = 22; // per-group median value label (chartSeriesSubtitle)
export const TICK_COUNT = 4; // 5 value gridlines incl. both ends
export const ROW_PAD_OUTER = 0.5; // scalePoint outer padding (air above first / below last row)
export const AXIS_PAD_FRACTION = 0.08; // 8% value-window pad each end (NOT 0-anchored) — scatter convention

// ── Caps + label limits ────────────────────────────────────────────────────────────────────────
export const MAX_GROUPS = 5; // C1 — SCHEMA/strict cap (the RENDER cap is dynamic on viewH, §3)
export const MAX_VALUES_PER_GROUP = 200; // C2 — raw-values cap (schema byte budget)
export const MAX_OUTLIERS = 8; // C2 — outlier render cap per group
export const MIN_SAMPLES = 4; // C-TINYN — min raw values for an honest five-number summary
export const LABEL_MAX_CP = 14; // C3 — group-row label char cap
export const WHISKER_FENCE = 1.5; // C-QUANT — Tukey 1.5·IQR fence
const ROW_LABEL_GAP = 12; // px between the plot band left edge and the right-anchored row label
export const ROW_LABEL_X = PLOT_X0 - ROW_LABEL_GAP; // 138 — right-anchored group-row label x

// ── Animation timing (§2.5) — exported so renderer + qa share one source of truth ──────────────
export const GROUP_START = 0.34; // first group begins its reveal (after the frame-in beat)
export const GROUP_DUR = 0.3; // per-group reveal window (whisker draw → box grow → median/mean pop)
export const SETTLE_DEADLINE = 0.85; // the LAST group must settle by here
export const MAX_STAGGER = 0.1; // wider than candlestick (N ≤ 5 rows) — a deliberate top→down reveal
export const WHISK_FRAC = 0.35; // whisker draws over the first 35% of the per-group window
export const BOX_FRAC = 0.45; // box grows over the next 45%
export const MED_FRAC = 0.2; // median/mean/outliers pop over the last 20%

// estW() is calibrated at 26px (stack.ts). Row labels render at 24px → scale the estimate.
const LABEL_EST_SCALE = AXIS_LABEL_PX / 26;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

const estLabelPx = (s: string) => estW(s) * LABEL_EST_SCALE;

export type PlotBounds = { viewH: number; y0: number; y1: number; titleY: number };

/** Clamp an aspect-derived viewBox height into the supported band [MIN_VIEW_H, VIEW_H]. */
export function clampViewH(viewH: number): number {
  return clamp(Math.round(isNum(viewH) ? viewH : VIEW_H), MIN_VIEW_H, VIEW_H);
}

/**
 * Pure plot-band bounds for a (clamped) viewBox height — the single source of truth shared by the
 * renderer (Distribution), the check (qa-distribution recomputes from the rendered viewBox), and the
 * planner. Top air + bottom band are FIXED px (so axis chrome stays the same physical size under the
 * uniform scale); only the row band's vertical extent compresses. viewH 640 → {70, 556, 632} = today.
 */
export function plotBounds(viewH: number): PlotBounds {
  const vH = clampViewH(viewH);
  return { viewH: vH, y0: PLOT_TOP, y1: vH - PLOT_BOTTOM_BAND, titleY: vH - 8 };
}

/** The row band height (px) at a (clamped) viewH — the vertical space the group rows are laid into. */
export function rowBand(viewH: number): number {
  const { y0, y1 } = plotBounds(viewH);
  return y1 - y0;
}

/**
 * §3 DYNAMIC render group cap. The rendered scalePoint pitch is `band / (N − 1 + 2·ROW_PAD_OUTER)`; we
 * pick the largest N ≤ MAX_GROUPS whose pitch is still ≥ MIN_ROW_PITCH (so the floor holds at the
 * RENDERED viewH, the candlestick painted-floor analog for the vertical axis), but never below 2 — a
 * single distribution is still a valid render, and a short row downsamples to the most legible few.
 *   N ≤ band/MIN_ROW_PITCH − 2·ROW_PAD_OUTER + 1.
 * Clamped to [2, MAX_GROUPS]. (The clamp-to-2 floor means a pathologically short row may show a pitch
 * slightly under the floor only when forced to 2; in practice band ≥ 166 @320 → pitch 83 ≥ 80.)
 */
export function effectiveMaxGroups(viewH: number): number {
  const band = rowBand(viewH);
  const raw = Math.floor(band / MIN_ROW_PITCH - 2 * ROW_PAD_OUTER + 1);
  return clamp(raw, 2, MAX_GROUPS);
}

export type DistributionGroupInput = {
  label?: string;
  values?: number[]; // RAW — planner computes the five-number summary
  min?: number;
  q1?: number;
  median?: number;
  q3?: number;
  max?: number; // PRE-COMPUTED
  mean?: number;
  outliers?: number[];
};

export type PlannedGroup = {
  index: number; // original (post-drop) author index → stagger order
  cy: number; // row-center y (constant across t)
  halfH: number; // half the box thickness (box y = cy ± halfH)
  q1X: number;
  q3X: number; // FINAL viewBox-x of the IQR box (q1→q3), ZERO-IQR-floored
  medX: number; // median x (∈ [q1X,q3X]); the box grow-anchor
  loX: number;
  hiX: number; // whisker extent (lo'→hi')
  meanX: number | null; // mean diamond x (or null when off/suppressed)
  outlierXs: number[]; // ≤ 8 outlier dot xs (axis-clamped)
  tinyN: boolean; // < MIN_SAMPLES raw → range+median glyph, no box
  accentKey: AccentKey;
  corrected: boolean;
  zeroIqrFloored: boolean;
  label: string;
  showLabel: boolean;
  labelHideReason?: "empty" | "tooLong" | "tooThin";
  medianValue: number;
  medText: string;
  showMed: boolean; // optional median value label
  groupStart: number; // GROUP_START + stagger·k (overlap-stagger top→down)
};

export type DistributionPlan = {
  mode: DistMode;
  axisMin: number;
  axisMax: number;
  ticks: number[];
  groups: PlannedGroup[];
  unit: string;
  stagger: number;
  groupDur: number;
  dropped: {
    groupsDropped: number;
    invalidGroups: number;
    hiddenLabels: number;
    correctedGroups: number;
    zeroIqrFloored: number;
    tinyGroups: number;
    outliersDropped: number;
    valuesTruncated: number;
    meanSuppressed: number;
    clampedStats: number;
  };
  empty: boolean;
  // PL-0.8 row-aware viewBox geometry (default viewH 640 ⇒ {640,70,556,632} = byte-identical).
  viewH: number;
  plotY0: number;
  plotY1: number;
  titleY: number;
};

export type PlanDistributionInput = {
  groups?: DistributionGroupInput[];
  mode?: DistMode | string;
  axisMin?: number;
  axisMax?: number;
  showMean?: DistMeanKnob | string;
  accent?: string;
  groupAccents?: string[];
  unit?: string;
  /** PL-0.8 — row-aware viewBox height (renderer-measured). Omitted/invalid → VIEW_H (640). */
  viewH?: number;
};

/** Pure stagger-vs-N (§2.5): the last group must settle by SETTLE_DEADLINE (0.85). */
export function staggerForN(n: number): number {
  if (n <= 1) return MAX_STAGGER;
  return Math.min(MAX_STAGGER, (SETTLE_DEADLINE - GROUP_START - GROUP_DUR) / (n - 1));
}

// cubic-bezier(0.65,0,0.35,1) — easeInOutCubic, motionRole.chartGrow (the BarChart body-grow ease).
// Local 40-step bisection on the monotone x-polynomial so render + check share one implementation,
// dependency-free for Node unit testing. Mirrors bars.ts / candlestick.ts.
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

/**
 * Per-group reveal progress: { whisker, box, pop } each ∈ [0,1], eased + clamped. The whisker draws
 * over the first WHISK_FRAC; the box grows about the median over the next BOX_FRAC; the median/mean/
 * outliers pop over the last MED_FRAC. The renderer applies `whisker` to the whisker strokeDashoffset
 * (1−whisker), `box` to the box scaleX about medX (OMITTED at settle), and `pop` to the median/mean/
 * outlier opacity. For rangeMarkers mode the range line draws on (whisker), then the ticks pop.
 */
export function groupReveal(t: number, groupStart: number): { whisker: number; box: number; pop: number } {
  const local = (t - groupStart) / GROUP_DUR; // ∈ [0,1] over the window
  const whiskP = clamp01(local / WHISK_FRAC);
  const boxP = clamp01((local - WHISK_FRAC) / BOX_FRAC);
  const popP = clamp01((local - WHISK_FRAC - BOX_FRAC) / MED_FRAC);
  return { whisker: chartGrowEase(whiskP), box: chartGrowEase(boxP), pop: chartGrowEase(popP) };
}

/**
 * Hand-rolled five-number summary of a SORTED-ascending sample (C-QUANT, NO d3-array — the histogram
 * percentile precedent extended to q1/q3/whiskers). q1/median/q3 via linear-interpolation order
 * statistics; whiskers use the Tukey 1.5·IQR fence (the whisker ENDS at the most extreme sample STILL
 * inside the fence; any sample outside is an outlier). Monotone by construction (q1 ≤ median ≤ q3,
 * whiskers ⊇ box). `mean` is the arithmetic mean.
 */
export function fiveNumber(sorted: number[]): {
  q1: number;
  median: number;
  q3: number;
  lo: number;
  hi: number;
  outliers: number[];
  mean: number;
} {
  const q1 = percentile(sorted, 0.25);
  const med = percentile(sorted, 0.5);
  const q3 = percentile(sorted, 0.75);
  const iqr = q3 - q1;
  const fenceLo = q1 - WHISKER_FENCE * iqr;
  const fenceHi = q3 + WHISKER_FENCE * iqr;
  let lo = q3; // start at the box; the loop below pulls it down to the smallest in-fence sample
  let hi = q1;
  const outliers: number[] = [];
  for (const v of sorted) {
    if (v < fenceLo || v > fenceHi) {
      outliers.push(v);
    } else {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  // Degenerate guard: if EVERY sample is an outlier (impossible for finite IQR, but defensive), the
  // whisker collapses to the box. Ensure whisker ⊇ box always.
  lo = Math.min(lo, q1);
  hi = Math.max(hi, q3);
  return { q1, median: med, q3, lo, hi, outliers, mean: mean(sorted) };
}

/**
 * NICE round value-axis tick VALUES (the candlestick Fix-3 precedent). The axis DOMAIN
 * [axisMin,axisMax] still scales the glyphs (unchanged, non-0-anchored); only the DISPLAYED tick labels
 * become short round numbers via d3's `scaleLinear().ticks()`. Ticks are clamped to the domain and
 * de-duplicated on the formatted label; we always keep ≥ 2 (fall back to the two bounds for a tiny span).
 */
export function niceTicks(axisMin: number, axisMax: number): number[] {
  if (!(axisMax > axisMin)) return [axisMin, axisMax];
  const raw = scaleLinear().domain([axisMin, axisMax]).ticks(TICK_COUNT);
  const inDomain = raw.filter((v) => v >= axisMin - 1e-9 && v <= axisMax + 1e-9);
  const seen = new Set<string>();
  const out: number[] = [];
  for (const v of inDomain) {
    const key = v.toFixed(6);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.length >= 2 ? out : [axisMin, axisMax];
}

const KNOWN_ACCENTS = new Set<AccentKey>(["cyan", "amber", "violet", "mint", "burnt"]);
function accentOr(author: string | undefined, fallback: AccentKey): AccentKey {
  if (author && KNOWN_ACCENTS.has(author as AccentKey)) return author as AccentKey;
  return fallback;
}

/** Even-stride downsample keeping first+last (the funnel/candlestick fitNodes pattern). */
function evenStride<T>(arr: T[], m: number): T[] {
  const n = arr.length;
  if (n <= m) return arr;
  const idxs = new Set<number>();
  for (let k = 0; k < m; k++) idxs.add(Math.round((k * (n - 1)) / (m - 1)));
  if (idxs.size < m) {
    for (let i = 0; i < n && idxs.size < m; i++) idxs.add(i);
  }
  return [...idxs].sort((a, b) => a - b).map((i) => arr[i]);
}

type ResolvedStats = {
  q1: number;
  median: number;
  q3: number;
  lo: number;
  hi: number;
  outliers: number[];
  meanVal: number | null; // null when no honest mean is available (precomputed-no-mean)
  tinyN: boolean;
  corrected: boolean;
};

/** Resolve ONE group's five-number summary: raw values (≥ MIN_SAMPLES) WIN over precomputed; tiny-n
 *  reduced; precomputed → C6 sanitize. Returns null when neither form is usable (→ dropped). */
function resolveStats(
  g: { values?: number[]; min?: number; q1?: number; median?: number; q3?: number; max?: number; mean?: number; outliers?: number[] },
  dropped: DistributionPlan["dropped"],
): ResolvedStats | null {
  const rawAll = Array.isArray(g.values) ? g.values.filter(isNum) : [];
  const hasRaw = rawAll.length >= 1;

  if (hasRaw) {
    // values WIN if present (the histogram values-XOR-bins rule). Truncate to MAX_VALUES_PER_GROUP
    // (schema-capped; defensive for a Path-B caller) BEFORE the summary, then sort.
    let sample = rawAll;
    if (sample.length > MAX_VALUES_PER_GROUP) {
      sample = sample.slice(0, MAX_VALUES_PER_GROUP);
      dropped.valuesTruncated++;
    }
    const sorted = sample.slice().sort((a, b) => a - b);
    if (sorted.length >= MIN_SAMPLES) {
      const fn = fiveNumber(sorted);
      return { ...fn, meanVal: fn.mean, tinyN: false, corrected: false };
    }
    // tiny-n reduced glyph (C-TINYN): a range+median, NO IQR box. min=median=max for 1 value.
    const lo = sorted[0];
    const hi = sorted[sorted.length - 1];
    const med = median(sorted);
    return { q1: med, median: med, q3: med, lo, hi, outliers: [], meanVal: mean(sorted), tinyN: true, corrected: false };
  }

  // PRE-COMPUTED form: need at least `median` + one box/range bound finite to place a glyph.
  const med = isNum(g.median) ? g.median : NaN;
  const bounds = [g.min, g.q1, g.q3, g.max].filter(isNum);
  if (!isNum(med) || bounds.length === 0) {
    return null; // neither usable raw nor usable precomputed → drop
  }
  // C6 sanitation — a broken/inverted box is IMPOSSIBLE BY CONSTRUCTION.
  // 1. q1' = min(q1,q3), q3' = max(q1,q3) (transposed quartile pair self-corrects). Fall back to the
  //    median when a quartile is missing (degenerate, but never a NaN box).
  const q1in = isNum(g.q1) ? g.q1 : med;
  const q3in = isNum(g.q3) ? g.q3 : med;
  const q1p = Math.min(q1in, q3in);
  const q3p = Math.max(q1in, q3in);
  // 2. median' = clamp(median, q1', q3') — the median can NEVER sit outside the box.
  const medp = clamp(med, q1p, q3p);
  // 3. lo' = min(min, q1'), hi' = max(max, q3') — the whisker always spans AT LEAST the box.
  const minIn = isNum(g.min) ? g.min : q1p;
  const maxIn = isNum(g.max) ? g.max : q3p;
  const lop = Math.min(minIn, q1p);
  const hip = Math.max(maxIn, q3p);
  // `corrected` iff the inputs were not already a valid five-number set.
  const wasValid =
    isNum(g.min) && isNum(g.q1) && isNum(g.median) && isNum(g.q3) && isNum(g.max) &&
    g.min <= g.q1 && g.q1 <= g.median && g.median <= g.q3 && g.q3 <= g.max;
  const corrected = !wasValid;
  if (corrected) dropped.correctedGroups++;
  const outliers = Array.isArray(g.outliers) ? g.outliers.filter(isNum) : [];
  return {
    q1: q1p,
    median: medp,
    q3: q3p,
    lo: lop,
    hi: hip,
    outliers,
    meanVal: isNum(g.mean) ? g.mean : null,
    tinyN: false,
    corrected,
  };
}

/**
 * The pure distribution layout brain. Coerces knobs, resolves each group's five-number summary
 * (raw values win; tiny-n reduced; precomputed C6-sanitized; neither → drop), even-stride-downsamples
 * to the §3 DYNAMIC render cap on the rendered viewH, derives the NON-0-anchored value axis (+8% pad
 * +max>min guard), builds the scalePoint rows + scaleLinear value geometry, floors zero-IQR boxes to
 * 6px, caps+downsamples outliers, suppresses an honest-less mean, and decides every row-label show/
 * hide — all from DATA, never `t`.
 */
export function planDistribution(input: PlanDistributionInput): DistributionPlan {
  // 1. Coerce knobs (unknown → default).
  const mode: DistMode = input.mode === "rangeMarkers" ? "rangeMarkers" : "box";
  const showMean: DistMeanKnob = input.showMean === "on" ? "on" : "off";
  const unit = typeof input.unit === "string" ? input.unit : "";
  const groupAccents = Array.isArray(input.groupAccents) ? input.groupAccents : undefined;
  const singleAccent = typeof input.accent === "string" ? input.accent : undefined;

  const dropped = {
    groupsDropped: 0,
    invalidGroups: 0,
    hiddenLabels: 0,
    correctedGroups: 0,
    zeroIqrFloored: 0,
    tinyGroups: 0,
    outliersDropped: 0,
    valuesTruncated: 0,
    meanSuppressed: 0,
    clampedStats: 0,
  };

  // 2. Row-aware plot band (PL-0.8). viewH defaults to 640 → {y0:70, y1:556}.
  const { viewH, y0: plotY0, y1: plotY1, titleY } = plotBounds(input.viewH ?? VIEW_H);

  // 3. Resolve each group's five-number summary; drop the unusable (surfaced — never a NaN axis).
  type Resolved = ResolvedStats & { label: string; order: number };
  const rawGroups = Array.isArray(input.groups) ? input.groups : [];
  const resolved: Resolved[] = [];
  rawGroups.forEach((g, i) => {
    if (!g || typeof g !== "object") {
      dropped.invalidGroups++;
      return;
    }
    const r = resolveStats(g, dropped);
    if (!r) {
      dropped.invalidGroups++;
      return;
    }
    if (r.tinyN) dropped.tinyGroups++;
    resolved.push({ ...r, label: typeof g.label === "string" ? g.label : "", order: i });
  });

  // Empty state — 0 renderable groups after the drop.
  if (resolved.length === 0) {
    const ticks: number[] = [];
    for (let i = 0; i <= TICK_COUNT; i++) ticks.push(i / TICK_COUNT);
    return {
      mode,
      axisMin: 0,
      axisMax: 1,
      ticks,
      groups: [],
      unit,
      stagger: staggerForN(0),
      groupDur: GROUP_DUR,
      dropped,
      empty: true,
      viewH,
      plotY0,
      plotY1,
      titleY,
    };
  }

  // 4. §3 DYNAMIC render cap on the RENDERED viewH; even-stride downsample keeping first+last.
  const cap = effectiveMaxGroups(viewH);
  let kept = resolved;
  if (resolved.length > cap) {
    dropped.groupsDropped = resolved.length - cap;
    kept = evenStride(resolved, cap);
  }

  // 5. Derive the NON-0-anchored value axis (C5). Collect every finite value that defines a group's
  //    extent (lo/hi + outliers). Author per-bound override; pad only the DERIVED bound; max>min guard.
  const extents: number[] = [];
  for (const g of kept) {
    extents.push(g.lo, g.hi);
    for (const o of g.outliers) extents.push(o);
  }
  const dataLo = Math.min(...extents);
  const dataHi = Math.max(...extents);
  let axisMin = isNum(input.axisMin) ? input.axisMin : dataLo;
  let axisMax = isNum(input.axisMax) ? input.axisMax : dataHi;
  const span = Math.max(dataHi - dataLo, 1e-9);
  const pad = AXIS_PAD_FRACTION * span;
  if (!isNum(input.axisMin)) axisMin -= pad;
  if (!isNum(input.axisMax)) axisMax += pad;
  if (axisMax <= axisMin) axisMax = axisMin + 1; // max>min guard (all-flat / single-value degenerate)

  // NICE round tick VALUES (the candlestick Fix-3 precedent): the DOMAIN [axisMin,axisMax] still scales
  // the glyphs (unchanged, non-0-anchored); only the DISPLAYED tick labels become short round numbers
  // (e.g. 100ms / 200ms / …) instead of raw linspace decimals (124.09ms) so they fit + don't overflow.
  const ticks = niceTicks(axisMin, axisMax);

  // 6. Scales. scalePoint for the rows (row band [plotY0, plotY1], outer padding); scaleLinear value.
  const rowScale = scalePoint<number>()
    .domain(kept.map((_, i) => i))
    .range([plotY0, plotY1])
    .padding(ROW_PAD_OUTER);
  const scaleXd3 = scaleLinear().domain([axisMin, axisMax]).range([PLOT_X0, PLOT_X1]);
  // Out-of-axis statistics clamp to the band edge (only possible when the AUTHOR set a tighter axis);
  // the true value is preserved for the median label.
  const sx = (v: number) => clamp(scaleXd3(clamp(v, axisMin, axisMax)) ?? PLOT_X0, PLOT_X0, PLOT_X1);

  // Rendered pitch (single-point case: scalePoint(0)=mid-band; pitch = band/(N−1+2·pad) for N≥2).
  const band = plotY1 - plotY0;
  const n = kept.length;
  const pitch = n >= 2 ? band / (n - 1 + 2 * ROW_PAD_OUTER) : band;
  const boxH = clamp(Math.round(pitch * CAP_LEN_FRAC * 1.1), MIN_BOX_H, MAX_BOX_H); // ~0.55·pitch
  const halfH = boxH / 2;

  const stagger = staggerForN(n);

  // 7. Per-group geometry. Accent: groupAccents[] (comparison) wins; else single `accent` for one group
  //    or accentForIndex by position for several. Outlier cap+downsample; zero-IQR floor; mean suppress.
  const groups: PlannedGroup[] = kept.map((g, k) => {
    const cy = rowScale(k) ?? (plotY0 + plotY1) / 2;

    const accentKey: AccentKey = groupAccents
      ? accentOr(groupAccents[k], accentForIndex(undefined, k))
      : n === 1 && singleAccent
        ? accentOr(singleAccent, "cyan")
        : accentForIndex(singleAccent, k);

    // Out-of-axis clamp bookkeeping: count a group as clamped if any defining stat fell outside.
    if (g.lo < axisMin - 1e-9 || g.hi > axisMax + 1e-9 || g.median < axisMin - 1e-9 || g.median > axisMax + 1e-9) {
      dropped.clampedStats++;
    }

    let q1X = sx(g.q1);
    let q3X = sx(g.q3);
    const medX = clamp(sx(g.median), Math.min(q1X, q3X), Math.max(q1X, q3X));
    const loX = sx(g.lo);
    const hiX = sx(g.hi);

    // C-ZIQR: a box mapping below ZERO_IQR_PX wide is floored to a 6px flat block centered on the
    // q1/q3 value, then clamped into the plot band so it never exits. NEVER hidden. (tiny-n groups
    // have NO box, so the floor does not apply — they render a range+median glyph.)
    let zeroIqrFloored = false;
    if (!g.tinyN && Math.abs(q3X - q1X) < ZERO_IQR_PX) {
      zeroIqrFloored = true;
      const mid = (q1X + q3X) / 2;
      q1X = clamp(mid - ZERO_IQR_PX / 2, PLOT_X0, PLOT_X1 - ZERO_IQR_PX);
      q3X = q1X + ZERO_IQR_PX;
      dropped.zeroIqrFloored++;
    }

    // Outliers — axis-clamped xs, cap 8 keeping the FURTHEST from the nearer fence (most extreme).
    let outs = g.outliers;
    if (outs.length > MAX_OUTLIERS) {
      const fenceLo = axisMin;
      const fenceHi = axisMax;
      const dist = (v: number) => Math.max(fenceLo - v, v - fenceHi, Math.min(Math.abs(v - g.lo), Math.abs(v - g.hi)));
      outs = outs
        .map((v) => ({ v, d: dist(v) }))
        .sort((a, b) => b.d - a.d)
        .slice(0, MAX_OUTLIERS)
        .map((o) => o.v);
      dropped.outliersDropped += g.outliers.length - MAX_OUTLIERS;
    }
    const outlierXs = outs.map((v) => sx(v));

    // Mean diamond. Suppressed (forced off + counted) when showMean:"on" but no honest mean exists.
    let meanX: number | null = null;
    if (showMean === "on") {
      if (g.meanVal == null) dropped.meanSuppressed++;
      else meanX = sx(g.meanVal);
    }

    // Group-row label fit-or-hide (right-anchored at ROW_LABEL_X, vertically centered on the row).
    const trimmed = g.label.trim();
    let showLabel = false;
    let labelHideReason: PlannedGroup["labelHideReason"];
    if (trimmed.length === 0) {
      labelHideReason = "empty";
    } else if ([...trimmed].length > LABEL_MAX_CP) {
      labelHideReason = "tooLong";
      dropped.hiddenLabels++;
    } else if (estLabelPx(trimmed) > ROW_LABEL_X) {
      labelHideReason = "tooThin";
      dropped.hiddenLabels++;
    } else {
      showLabel = true;
    }

    // Optional median value label (shown iff there is room to the right of the median tick within the
    // row slot, up to the plot edge). Off-by-default visual emphasis; the position carries the meaning.
    const medText = formatTick(g.median, unit);
    const roomRight = PLOT_X1 - medX;
    const showMed = medText.trim().length > 0 && estLabelPx(medText) * (MED_LABEL_PX / AXIS_LABEL_PX) + 8 <= roomRight;

    return {
      index: g.order,
      cy,
      halfH,
      q1X,
      q3X,
      medX,
      loX,
      hiX,
      meanX,
      outlierXs,
      tinyN: g.tinyN,
      accentKey,
      corrected: g.corrected,
      zeroIqrFloored,
      label: g.label,
      showLabel,
      ...(showLabel ? {} : { labelHideReason }),
      medianValue: g.median,
      medText,
      showMed,
      groupStart: GROUP_START + stagger * k,
    };
  });

  return {
    mode,
    axisMin,
    axisMax,
    ticks,
    groups,
    unit,
    stagger,
    groupDur: GROUP_DUR,
    dropped,
    empty: false,
    viewH,
    plotY0,
    plotY1,
    titleY,
  };
}

export { formatTick, percentile, median, mean };
export type { AccentKey };
