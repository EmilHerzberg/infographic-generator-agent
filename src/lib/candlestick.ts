// PL-2.5 — Candlestick / OHLC plan: the pure "candlestick brain" shared by the renderer
// (PostRenderer → Candlestick) and the deterministic check suite (tools/qa-candlestick.mjs).
// The last open chart gap of Epic PL-2 (the chart family). Like bars.ts / scatter.ts it is
// dependency-light (only d3-scale `scaleBand`+`scaleLinear` + the `estW`/`accentForIndex`/
// `formatTick` helpers reused from stack.ts/bars.ts) so Node's native type-stripping can
// unit-test it without a DOM. FRAMEWORKS §A binding: candlestick has NO d3-shape generator —
// it is rects + lines from band+linear scales, so NO new dependency is added.
//
// `candlestick` expresses an OPEN/HIGH/LOW/CLOSE (OHLC) range over an ORDERED time axis: each
// period carries FOUR values, and the argument is the per-period range (high–low) AND the
// open→close move plus its up/down direction. The price axis is NOT 0-anchored — it is a price
// WINDOW derived `[min(low), max(high)] + 8% pad` exactly like ScatterPlot's float-to-data axis
// (a 0-anchored candlestick crushes every candle into a sliver at the top — the single most
// important correctness point, C5). `planCandles` owns EVERY geometry decision — mode coercion,
// invalid-candle drop, even-stride downsample beyond the cap (surfaced), C6 inverted-candle
// sanitation (lo'/hi'+clamp; direction from the ORIGINAL o/c), C5 axis derivation + max>min
// guard, the scaleBand (paddingInner reduced before any body-width floor breach) + scaleLinear
// (inverted, high price at the top) layout, per-candle body/wick/tick geometry, the C-DOJI 6px
// body floor, the time-label fit-or-hide + every-k stride, and the per-candle overlap-stagger —
// all from DATA only, never from `t`, so its output feeds the static-geometry checks directly.
// Every drop is surfaced via a counter (§2.6), never silent.
//
// PL-0.8 ROW-AWARE viewBox (the §3 BINDING CORRECTION): width is FIXED (1000); height is
// row-aware — the renderer measures its row's aspect and passes a `viewH` so the viewBox aspect
// MATCHES the row → the SVG fills the full row WIDTH (uniform scale, scaleX==scaleY) instead of
// being height-bounded in a wide-short row. That keeps candle bodies full-width (the scatter-dot
// floor lesson applied to body width) while never overflowing. viewH defaults to 640 ⇒ every
// already-fitting render is byte-identical to the fixed-box reasoning.
// Spec: planning/primitive-library/handoffs/PL-2.5-candlestick.md §2.4 / §2.5 / §2.6 / §3.

import { scaleBand, scaleLinear } from "d3-scale";
import { estW } from "./stack.ts";
import { formatTick, type AccentKey } from "./bars.ts";

export type CandleMode = "candles" | "ohlc";

// ── viewBox geometry (source px) — §2.4 ──────────────────────────────────────────────────────
export const VIEW_W = 1000;
export const VIEW_H = 640; // default / max viewBox height
export const MIN_VIEW_H = 320; // floor (covers a row aspect ≤ 1000/320 ≈ 3.1:1); below this the box
// letterboxes by width again (rare pathological row). Mirrors scatter.ts MIN_VIEW_H — keeps a usable
// plot band and a body width that stays clear of the floor at the densest realistic row.
// Left gutter holds the right-anchored y-axis price-tick LABELS (value + unit). PL-2.5 Fix 3:
// PLOT_X0 widened 120→140 so the widest realistic NICE tick label fits the gutter without clipping
// the viewBox left edge or breaching the 64px outer safe margin. Proof: ticks are NICE round numbers
// (§ niceTicks below), the widest realistic label is "1640.5ms"-class (≈116px @24), right-anchored at
// TICK_LABEL_X = PLOT_X0 − 12 = 128 ⇒ left edge 128 − 116 = 12 ≥ 0 (fits). The narrower 840px plot
// still satisfies C1/C4 at the cap: scaleBand(14) ⇒ bandwidth ≈ 42px (≥ MIN_BODY_W 18), gap ≈ 18px
// (≥ MIN_BODY_GAP 14), body @390 ≈ 16.4px (≥ the 6.5px floor). assertGutterFits enforces it.
export const PLOT_X0 = 140; // plot band x — 840 wide; left gutter <140 holds the y-axis price-tick labels
export const PLOT_X1 = 980;
export const TICK_LABEL_GAP = 12; // px between the plot band left edge and the right-anchored tick label
export const PLOT_TOP = 70; // top air (fixed px, independent of viewH)
export const PLOT_BOTTOM_BAND = 84; // bottom band [y1, y1+44] holds the time-slot labels (fixed px)
export const PLOT_Y0 = PLOT_TOP; // 70 — default-viewH bounds (back-compat export; unit checks use these)
export const PLOT_Y1 = VIEW_H - PLOT_BOTTOM_BAND; // 556 — bottom band holds the time labels

export const MIN_BODY_W = 18; // C4 — min candle body width (== absolute type floor; matches MIN_BAR_THICKNESS)
export const MIN_BODY_GAP = 14; // C4 — min gap between candle slots (== MIN_BAR_GAP, the crampedPairs floor)
export const MAX_BODY_W = 64; // C4 — max body width (pleasant aspect on few candles), centered in the band
export const DOJI_MIN_BODY_PX = 6; // C-DOJI — open≈close → a 6px-tall flat block, NEVER hidden
export const WICK_STROKE = 4; // C-WICK — wick / ohlc-line / ohlc-tick stroke (→ 1.44px@390 ≥ 1px hairline)
export const TICK_LEN = 16; // ohlc open/close tick length (centered at the band edge)
export const GRID_STROKE = 1.5; // gridlines + baseline (reused from bars)
export const AXIS_LABEL_PX = 24; // price-axis tick labels + time-slot labels (the 18px floor parent)
export const TICK_COUNT = 4; // 5 price gridlines incl. both ends

export const MAX_CANDLES = 14; // C1 — proven legible via scaleBand (≥43px body, ≥18px gap at the cap)
export const LABEL_MAX_CP = 10; // C3 — time-slot label char cap
export const MAX_VISIBLE_LABELS = 8; // C3 — ≤8 time labels paint regardless of N (every-k stride)
export const AXIS_PAD_FRACTION = 0.08; // 8% price-window pad each end (NOT 0-anchored) — the scatter convention

// scaleBand padding (candles thinner than bars → a touch more inner air). §2.4.
const PAD_INNER = 0.3;
const PAD_OUTER = 0.14;

// ── Animation timing (§2.5) — exported so renderer + qa share one source of truth ──────────
export const CANDLE_START = 0.34; // first candle begins its reveal (after the frame-in beat)
export const CANDLE_DUR = 0.3; // per-candle reveal window (wick draw then body grow)
export const SETTLE_DEADLINE = 0.85; // the LAST candle must settle by here
export const MAX_STAGGER = 0.05;
export const WICK_FRAC = 0.4; // the wick draws over the first 40% of the per-candle window; body the last 60%

// estW() is calibrated at 26px (stack.ts). Time labels render at 24px → scale the estimate.
const LABEL_EST_SCALE = AXIS_LABEL_PX / 26;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

export type PlotBounds = { viewH: number; y0: number; y1: number; labelY: number };

/** Clamp an aspect-derived viewBox height into the supported band [MIN_VIEW_H, VIEW_H]. */
export function clampViewH(viewH: number): number {
  return clamp(Math.round(isNum(viewH) ? viewH : VIEW_H), MIN_VIEW_H, VIEW_H);
}

/**
 * Pure plot-band bounds for a (clamped) viewBox height — the single source of truth shared by the
 * renderer (Candlestick), the check (qa-candlestick recomputes from the rendered viewBox), and the
 * planner. Top air + bottom band are FIXED px (so axis chrome stays the same physical size under the
 * uniform scale); only the plot's vertical extent compresses. viewH 640 → {70, 556, 600} = today.
 */
export function plotBounds(viewH: number): PlotBounds {
  const vH = clampViewH(viewH);
  return { viewH: vH, y0: PLOT_TOP, y1: vH - PLOT_BOTTOM_BAND, labelY: vH - PLOT_BOTTOM_BAND + 32 };
}

export type CandleInput = { label?: string; open: number; high: number; low: number; close: number };

export type PlannedCandle = {
  index: number; // original (post-drop) author index → stagger order
  cx: number; // band-center x (constant across t)
  halfW: number; // half the body width (body x = cx ± halfW; centered, ≤ MAX_BODY_W/2)
  bodyTop: number; // FINAL viewBox-y of the body top (smaller y = higher price), DOJI-floored
  bodyBot: number; // FINAL viewBox-y of the body bottom
  wickTop: number; // FINAL viewBox-y of the wick top (high')
  wickBot: number; // FINAL viewBox-y of the wick bottom (low')
  openY: number; // scaleY(open') — the body grow-anchor (open edge) + the ohlc open tick
  closeY: number; // scaleY(close') — the ohlc close tick
  dir: "up" | "down"; // close >= open ? up : down (from the ORIGINAL o/c)
  accentKey: AccentKey; // upAccent (up) / downAccent (down)
  corrected: boolean; // the inputs were NOT valid OHLC (C6 sanitation fired)
  dojiFloored: boolean; // the body mapped below DOJI_MIN_BODY_PX and was floored
  label: string;
  showLabel: boolean;
  labelHideReason?: "empty" | "tooLong" | "tooThin" | "stride";
  candleStart: number; // CANDLE_START + stagger·k (overlap-stagger)
};

export type CandlesPlan = {
  mode: CandleMode;
  axisMin: number;
  axisMax: number;
  ticks: number[];
  candles: PlannedCandle[];
  upAccentKey: AccentKey;
  downAccentKey: AccentKey;
  unit: string;
  stagger: number;
  candleDur: number;
  dropped: { candlesDropped: number; invalidCandles: number; hiddenLabels: number; correctedCandles: number; dojiFloored: number };
  empty: boolean;
  // PL-0.8 row-aware viewBox geometry (default viewH 640 ⇒ {640,70,556,600} = byte-identical).
  viewH: number;
  plotY0: number;
  plotY1: number;
  labelY: number;
};

export type PlanCandlesInput = {
  candles?: CandleInput[];
  mode?: CandleMode | string;
  axisMin?: number;
  axisMax?: number;
  upAccent?: string;
  downAccent?: string;
  unit?: string;
  /** PL-0.8 — row-aware viewBox height (renderer-measured). Omitted/invalid → VIEW_H (640). */
  viewH?: number;
};

const KNOWN_ACCENTS = new Set<AccentKey>(["cyan", "amber", "violet", "mint", "burnt"]);

/** Map an author accent key to a known AccentKey, else a default. */
function accentOr(author: string | undefined, fallback: AccentKey): AccentKey {
  if (author && KNOWN_ACCENTS.has(author as AccentKey)) return author as AccentKey;
  return fallback;
}

/** Pure stagger-vs-N (§2.5): the last candle must settle by SETTLE_DEADLINE (0.85). */
export function staggerForN(n: number): number {
  if (n <= 1) return MAX_STAGGER;
  return Math.min(MAX_STAGGER, (SETTLE_DEADLINE - CANDLE_START - CANDLE_DUR) / (n - 1));
}

// cubic-bezier(0.65,0,0.35,1) — easeInOutCubic, motionRole.chartGrow (the BarChart body-grow ease).
// Local 40-step bisection on the monotone x-polynomial so render + check share one implementation,
// dependency-free for Node unit testing. Mirrors bars.ts / stack.ts.
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
 * Per-candle reveal progress: { wick, body } each ∈ [0,1], eased + clamped. The wick draws over the
 * first WICK_FRAC of the window; the body grows over the last (1−WICK_FRAC). The renderer applies
 * `wick` to the wick strokeDashoffset (1−wick) and `body` to the body scaleY about the open edge.
 */
export function candleReveal(t: number, candleStart: number): { wick: number; body: number } {
  const local = (t - candleStart) / CANDLE_DUR; // ∈ [0,1] over the window
  const wickP = clamp01(local / WICK_FRAC); // first WICK_FRAC of the window
  const bodyP = clamp01((local - WICK_FRAC) / (1 - WICK_FRAC)); // last (1−WICK_FRAC)
  return { wick: chartGrowEase(wickP), body: chartGrowEase(bodyP) };
}

const estLabelPx = (s: string) => estW(s) * LABEL_EST_SCALE;

/** The viewBox-x at which the right-anchored price-tick label ENDS (its right edge). */
export const TICK_LABEL_X = PLOT_X0 - TICK_LABEL_GAP; // 128

/**
 * NICE price-axis tick VALUES (PL-2.5 Fix 3). The axis DOMAIN [axisMin,axisMax] still scales the
 * candles (the derived NON-0-anchored window, unchanged); only the DISPLAYED tick labels become nice
 * round numbers via d3's `scaleLinear().ticks()` (e.g. 120 / 130 / 140 …) instead of raw linspace
 * decimals (115.68 / 124.09 / …). Nice ⇒ short + round ⇒ the label fits the left gutter (proven by
 * `assertGutterFits` / the U-gutter unit check). Ticks are clamped to the domain (d3 may return a tick
 * exactly on a rounded-out bound) and de-duplicated; we always keep ≥ 2 ticks (fall back to the two
 * bounds for a tiny/degenerate span).
 */
export function niceTicks(axisMin: number, axisMax: number): number[] {
  if (!(axisMax > axisMin)) return [axisMin, axisMax];
  const raw = scaleLinear().domain([axisMin, axisMax]).ticks(TICK_COUNT);
  const inDomain = raw.filter((v) => v >= axisMin - 1e-9 && v <= axisMax + 1e-9);
  // De-duplicate on the FORMATTED label (two nice values must never render the same string).
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

/**
 * The widest formatted price-tick label, right-anchored at `TICK_LABEL_X`, MUST fit the left gutter:
 * its left edge (`TICK_LABEL_X − estLabelPx(widest)`) ≥ 0 (no viewBox left-clip; the outer safe margin
 * maps to viewBox-x 0 because the SVG fills the row from the Panel's left edge, itself ≥ the 64px outer
 * margin). Returns the proof breakdown so the gate can assert it deterministically (U-gutter). This is
 * the check that §2.4 asserted in prose ("ticks live in the gutter, right-anchored at 108") but never
 * PROVED for the tick TEXT — the gap that let fuzz-81/82/83 overflow.
 */
export function gutterFit(ticks: number[], unit: string): { widest: string; widthPx: number; leftEdge: number; fits: boolean } {
  let widest = "";
  let widthPx = 0;
  for (const v of ticks) {
    const s = formatTick(v, unit);
    const w = estLabelPx(s);
    if (w > widthPx) {
      widthPx = w;
      widest = s;
    }
  }
  const leftEdge = TICK_LABEL_X - widthPx;
  return { widest, widthPx, leftEdge, fits: leftEdge >= -1e-6 };
}

/**
 * The pure candlestick layout brain. Coerces the mode + accents + unit, drops invalid candles,
 * even-stride-downsamples beyond the cap, sanitizes each candle (C6 lo'/hi'+clamp, direction from
 * the ORIGINAL o/c), derives the NON-0-anchored price axis (+8% pad +max>min guard), builds the
 * scaleBand (paddingInner reduced before any body-width floor breach) + scaleLinear geometry, floors
 * doji bodies to 6px, and decides every time-label show/hide — all from DATA, never `t`.
 */
export function planCandles(input: PlanCandlesInput): CandlesPlan {
  // 1. Coerce knobs (unknown → default).
  const mode: CandleMode = input.mode === "ohlc" ? "ohlc" : "candles";
  const unit = typeof input.unit === "string" ? input.unit : "";
  const upAccentKey = accentOr(input.upAccent, "mint");
  const downAccentKey = accentOr(input.downAccent, "burnt");

  const dropped = { candlesDropped: 0, invalidCandles: 0, hiddenLabels: 0, correctedCandles: 0, dojiFloored: 0 };

  // Row-aware plot band (PL-0.8). viewH defaults to 640 → {y0:70, y1:556} = today's fixed layout.
  const { viewH, y0: plotY0, y1: plotY1, labelY } = plotBounds(input.viewH ?? VIEW_H);

  // 2. Normalize + drop invalid candles (any non-finite member). A missing price ≠ a 0 price, so we
  //    drop (the ScatterPlot rule), never clamp-to-0. Direction is captured from the ORIGINAL o/c.
  const rawCandles = Array.isArray(input.candles) ? input.candles : [];
  type NormCandle = { open: number; high: number; low: number; close: number; label: string; order: number };
  const valid: NormCandle[] = [];
  rawCandles.forEach((c, i) => {
    if (c && isNum(c.open) && isNum(c.high) && isNum(c.low) && isNum(c.close)) {
      valid.push({ open: c.open, high: c.high, low: c.low, close: c.close, label: typeof c.label === "string" ? c.label : "", order: i });
    } else {
      dropped.invalidCandles++;
    }
  });

  // 3. Even-stride downsample beyond the cap (preserve the time span; keep first+last). §2.6.
  let kept = valid;
  if (valid.length > MAX_CANDLES) {
    dropped.candlesDropped = valid.length - MAX_CANDLES;
    const n = valid.length;
    const m = MAX_CANDLES;
    const idxs = new Set<number>();
    for (let k = 0; k < m; k++) idxs.add(Math.round((k * (n - 1)) / (m - 1)));
    if (idxs.size < m) {
      for (let i = 0; i < n && idxs.size < m; i++) idxs.add(i);
    }
    kept = [...idxs].sort((a, b) => a - b).map((i) => valid[i]);
  }

  // Empty state — 0 renderable candles after the drop.
  if (kept.length === 0) {
    const ticks: number[] = [];
    for (let i = 0; i <= TICK_COUNT; i++) ticks.push(i / TICK_COUNT);
    return {
      mode,
      axisMin: 0,
      axisMax: 1,
      ticks,
      candles: [],
      upAccentKey,
      downAccentKey,
      unit,
      stagger: staggerForN(0),
      candleDur: CANDLE_DUR,
      dropped,
      empty: true,
      viewH,
      plotY0,
      plotY1,
      labelY,
    };
  }

  // 4. Sanitize each candle (C6) — a broken/inverted shape is IMPOSSIBLE BY CONSTRUCTION.
  //    lo' = min(o,h,l,c), hi' = max(o,h,l,c) → the wick spans the true full extent (high<low
  //    transposed self-corrects). open'/close' clamped into [lo',hi'] → the body never pokes outside
  //    the wick. `corrected` iff the inputs were not already valid OHLC (low ≤ open,close ≤ high and
  //    low ≤ high). Direction classified from the ORIGINAL open/close so color reads author intent.
  type Sani = NormCandle & { loP: number; hiP: number; openP: number; closeP: number; dir: "up" | "down"; corrected: boolean };
  const sani: Sani[] = kept.map((c) => {
    const loP = Math.min(c.open, c.high, c.low, c.close);
    const hiP = Math.max(c.open, c.high, c.low, c.close);
    const openP = clamp(c.open, loP, hiP);
    const closeP = clamp(c.close, loP, hiP);
    const wasValid = c.low <= c.high && c.low <= c.open && c.open <= c.high && c.low <= c.close && c.close <= c.high;
    const corrected = !wasValid;
    if (corrected) dropped.correctedCandles++;
    return { ...c, loP, hiP, openP, closeP, dir: c.close >= c.open ? "up" : "down", corrected };
  });

  // 5. Derive the NON-0-anchored price axis (C5). Author per-bound override; pad only the DERIVED
  //    bound; max>min guard. The scatter deriveAxis, applied to [min(low'),max(high')].
  const dataLo = Math.min(...sani.map((c) => c.loP));
  const dataHi = Math.max(...sani.map((c) => c.hiP));
  let axisMin = isNum(input.axisMin) ? input.axisMin : dataLo;
  let axisMax = isNum(input.axisMax) ? input.axisMax : dataHi;
  const span = Math.max(dataHi - dataLo, 1e-9);
  const pad = AXIS_PAD_FRACTION * span;
  if (!isNum(input.axisMin)) axisMin -= pad;
  if (!isNum(input.axisMax)) axisMax += pad;
  if (axisMax <= axisMin) axisMax = axisMin + 1; // max>min guard (all-flat / single-price degenerate)

  // NICE round tick VALUES (PL-2.5 Fix 3). The domain [axisMin,axisMax] above still scales the candles
  // (unchanged, non-0-anchored); only the DISPLAYED labels become short round numbers so they fit the
  // left gutter. gutterFit then PROVES the widest formatted label fits (the §2.4 collision gap).
  const ticks = niceTicks(axisMin, axisMax);

  // 6. Scales. scaleBand for the time slots (reduce paddingInner before bandwidth < MIN_BODY_W);
  //    scaleLinear for price, range [plotY1, plotY0] (INVERTED — high price at the top).
  const n = sani.length;
  let padInner = PAD_INNER;
  const bandwidthAt = (pi: number) =>
    scaleBand<number>()
      .domain(sani.map((_, i) => i))
      .range([PLOT_X0, PLOT_X1])
      .paddingInner(pi)
      .paddingOuter(PAD_OUTER)
      .bandwidth();
  while (padInner > 0 && bandwidthAt(padInner) < MIN_BODY_W) padInner = Math.max(0, padInner - 0.02);
  const band = scaleBand<number>()
    .domain(sani.map((_, i) => i))
    .range([PLOT_X0, PLOT_X1])
    .paddingInner(padInner)
    .paddingOuter(PAD_OUTER);
  const bandwidth = band.bandwidth();
  const bodyW = Math.min(bandwidth, MAX_BODY_W);
  const halfW = bodyW / 2;

  const scaleYd3 = scaleLinear().domain([axisMin, axisMax]).range([plotY1, plotY0]);
  const scaleY = (v: number) => clamp(scaleYd3(clamp(v, axisMin, axisMax)) ?? plotY1, plotY0, plotY1);

  const stagger = staggerForN(n);

  // 7. Per-candle body/wick/tick geometry + the C-DOJI floor.
  const candles: PlannedCandle[] = sani.map((c, k) => {
    const cx = (band(k) ?? PLOT_X0) + bandwidth / 2;
    const openY = scaleY(c.openP);
    const closeY = scaleY(c.closeP);
    // Body spans open→close in screen-y. Top = the higher price (smaller y) = scaleY(max(open',close')).
    let bodyTop = Math.min(openY, closeY);
    let bodyBot = Math.max(openY, closeY);
    // C-DOJI: a body mapping below DOJI_MIN_BODY_PX is floored to a 6px flat block centered on the
    // open/close midpoint, then clamped into the plot band so it never exits. NEVER hidden.
    let dojiFloored = false;
    if (bodyBot - bodyTop < DOJI_MIN_BODY_PX) {
      dojiFloored = true;
      const mid = (bodyTop + bodyBot) / 2;
      bodyTop = clamp(mid - DOJI_MIN_BODY_PX / 2, plotY0, plotY1 - DOJI_MIN_BODY_PX);
      bodyBot = bodyTop + DOJI_MIN_BODY_PX;
      dropped.dojiFloored++;
    }
    // Wick spans high'→low' (high' = the smaller y). Always ⊇ the body by construction.
    const wickTop = scaleY(c.hiP);
    const wickBot = scaleY(c.loP);

    return {
      index: c.order,
      cx,
      halfW,
      bodyTop,
      bodyBot,
      wickTop,
      wickBot,
      openY,
      closeY,
      dir: c.dir,
      accentKey: c.dir === "up" ? upAccentKey : downAccentKey,
      corrected: c.corrected,
      dojiFloored,
      label: c.label,
      showLabel: false, // decided below
      candleStart: CANDLE_START + stagger * k,
    };
  });

  // 8. Time-label fit-or-hide + every-k stride (C3). ≤8 labels paint regardless of N (the histogram
  //    x-tick precedent); first+last are always stride candidates. A label is shown iff its slot is a
  //    stride slot AND it is non-empty AND ≤ LABEL_MAX_CP AND it fits the bandwidth. Stride-hidden is
  //    NOT a defect; non-stride empty/tooLong/tooThin hides on a stride slot are surfaced.
  const k = Math.max(1, Math.ceil(n / MAX_VISIBLE_LABELS));
  candles.forEach((cand, i) => {
    const onStride = i % k === 0 || i === n - 1; // first..every-k..last
    if (!onStride) {
      cand.labelHideReason = "stride";
      return;
    }
    const trimmed = cand.label.trim();
    if (trimmed.length === 0) {
      cand.labelHideReason = "empty";
      return;
    }
    if ([...trimmed].length > LABEL_MAX_CP) {
      cand.labelHideReason = "tooLong";
      dropped.hiddenLabels++;
      return;
    }
    if (estLabelPx(trimmed) > bandwidth) {
      cand.labelHideReason = "tooThin";
      dropped.hiddenLabels++;
      return;
    }
    cand.showLabel = true;
  });

  return {
    mode,
    axisMin,
    axisMax,
    ticks,
    candles,
    upAccentKey,
    downAccentKey,
    unit,
    stagger,
    candleDur: CANDLE_DUR,
    dropped,
    empty: false,
    viewH,
    plotY0,
    plotY1,
    labelY,
  };
}

export { formatTick };
export type { AccentKey };
