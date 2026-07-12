// PL-2.2 — Scatter / relationship plan: the pure "scatter brain" shared by the renderer
// (PostRenderer → ScatterPlot) and the deterministic check suite (tools/qa-scatter.mjs).
// Second sprint of Epic PL-2 (the chart family). Like bars.ts / divergence.ts it is
// dependency-light (only d3-scale `scaleLinear` + the `estW`/`accentForIndex`/`formatTick`
// helpers reused from stack.ts/bars.ts) so Node's native type-stripping can unit-test it
// without a DOM.
//
// `scatter` expresses a RELATIONSHIP between two numeric variables across N items — "as X
// rises, Y falls/rises", correlation strength, inverse relationships, 2-D positioning. Each
// item is one POINT at (x, y) on two independent LINEAR axes (NO mandatory 0 baseline — both
// axes float to the data with an 8% pad). `planScatter` owns EVERY geometry decision — knob
// coercion, invalid-point drop, even-stride downsample beyond the cap (surfaced), per-dim axis
// derivation + max>min guard, the scaleLinear x/y layout (centers clamped to the band), the
// OLS least-squares trend fit (suppressed on <2 distinct x) + Liang–Barsky clip to the plot
// band, quadrant divider positions (author or data means), per-point pop stagger, and the
// point/quadrant label fit-or-hide — all from DATA only, never from `t`, so its output feeds
// the static-geometry checks directly. Every drop is surfaced via a counter (§2.6), never silent.
// Spec: planning/primitive-library/handoffs/PL-2.2-scatter.md §2.4 / §2.5 / §2.6 / §2.9.

import { scaleLinear } from "d3-scale";
import { estW } from "./stack.ts";
import { accentForIndex, formatTick, type AccentKey } from "./bars.ts";

export type ScatterKnobTrend = "off" | "fit";
export type ScatterKnobQuad = "off" | "on";
export type ScatterKnobLabels = "auto" | "off";

// ── viewBox geometry (source px) — §2.4 ──────────────────────────────────────────────────────
// Width is FIXED (1000). Height is ROW-AWARE (PL-0.8): the renderer measures its row's aspect and
// passes a `viewH` so the viewBox aspect MATCHES the row → the SVG fills the full row WIDTH (uniform
// scale, scaleX==scaleY) instead of being height-bounded in a wide-short row. That keeps dots
// circular AND width-driven (~7.9px@390, clear of the 6px floor) while never overflowing. viewH
// defaults to 640 (today's square-ish portrait box) ⇒ every already-fitting render is byte-identical.
export const VIEW_W = 1000;
export const VIEW_H = 640; // default / max viewBox height
export const MIN_VIEW_H = 320; // floor (covers row aspect ≤ 1000/320 ≈ 3.1:1) — below this the box
// letterboxes by width again (rare pathological row); keeps a usable ≥166px plot band. Tuned so the
// densest real row (fuzz-46 ≈ 2.95:1 → viewH ≈ 339) matches its aspect exactly → full-width dots.
export const PLOT_TOP = 70; // top air (fixed px, independent of viewH)
export const PLOT_BOTTOM_BAND = 84; // x-ticks + x-title band below the plot (fixed px)
export const PLOT_X0 = 150; // plot band x — left gutter holds the y-axis title (x=26) + the y-tick
// labels (right-anchored at PLOT_X0−12=138). Widened 130→150 (PL-0.8): in a compressed (short-viewH)
// plot the constant-length rotated y-title spans more of the band, so a wide y-tick at a similar
// height could touch it; the extra gutter keeps ~6-char ticks clear of the title at any viewH.
export const PLOT_X1 = 968;
export const PLOT_Y0 = PLOT_TOP; // 70 — default-viewH bounds (back-compat export; unit checks use these)
export const PLOT_Y1 = VIEW_H - PLOT_BOTTOM_BAND; // 556 — bottom band holds x-ticks/x-title
export const DOT_R = 11; // C2 — point radius (source px) → ~7.9px@390 diameter floor
export const DOT_STROKE = 1; // 1px deepInk halo so overlapping dots stay separable
export const TREND_STROKE = 5; // stroke.chartLine
export const GRID_STROKE = 1.5; // stroke.grid
export const DIVIDER_STROKE = 1.5; // quadrant dividers — neutral, dashed
export const AXIS_LABEL_PX = 24; // tick labels (text.axisLabel)
export const AXIS_TITLE_PX = 24; // xLabel / yLabel
export const POINT_LABEL_PX = 22; // per-point labels (chartSeriesSubtitle)
export const QUAD_LABEL_PX = 22;
export const TICK_COUNT = 4; // 5 gridlines per axis incl. both ends

// ── Caps + label limits ─────────────────────────────────────────────────────────────────────
export const MAX_POINTS = 20; // C1
const POINT_LABEL_MAX_CP = 20; // §2.2
const QUAD_LABEL_MAX_CP = 16; // §2.2
const LABEL_PAD = 8; // px gap a point label needs from its dot edge / a plot edge

// estW() is calibrated at 26px (stack.ts). Scatter labels render at 22px → scale the estimate.
const POINT_EST_SCALE = POINT_LABEL_PX / 26;
const QUAD_EST_SCALE = QUAD_LABEL_PX / 26;

// ── Animation timing (§2.5) — exported so renderer + qa share one source of truth ──────────
export const POP_START = 0.34; // first point begins its pop
export const POP_DUR = 0.08; // per-point pop duration
export const POINTS_SETTLE = 0.78; // the LAST point must settle by here (before the trend draws)
export const TREND_START = 0.8; // trend draw-on begins (after points settle)
export const TREND_DUR = 0.12; // trend draw-on duration → fully drawn by 0.92
export const MAX_STAGGER = 0.05;
export const AXIS_PAD_FRACTION = 0.08; // 8% domain padding each side (scatter is NOT 0-anchored)

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

export type PlotBounds = { viewH: number; y0: number; y1: number; titleY: number };

/** Clamp an aspect-derived viewBox height into the supported band [MIN_VIEW_H, VIEW_H]. */
export function clampViewH(viewH: number): number {
  return clamp(Math.round(isNum(viewH) ? viewH : VIEW_H), MIN_VIEW_H, VIEW_H);
}

/**
 * Pure plot-band bounds for a (clamped) viewBox height — the single source of truth shared by the
 * renderer (ScatterPlot), the check (qa-scatter recomputes from the rendered viewBox), and the
 * planner. Top air + bottom band are FIXED px (so axis chrome stays the same physical size under the
 * uniform scale); only the plot's vertical extent compresses. viewH 640 → {70, 556, 632} = today.
 */
export function plotBounds(viewH: number): PlotBounds {
  const vH = clampViewH(viewH);
  return { viewH: vH, y0: PLOT_TOP, y1: vH - PLOT_BOTTOM_BAND, titleY: vH - 8 };
}

export type ScatterPointInput = { x: number; y: number; label?: string; accent?: string };

export type PlannedPoint = {
  index: number; // original (post-drop) author index — drives accent default + stagger
  cx: number; // FINAL viewBox-space center (clamped to band; constant across t)
  cy: number;
  xData: number; // true values (for the axis-correctness check)
  yData: number;
  accentKey: AccentKey;
  label: string;
  showLabel: boolean; // pointLabels=auto fit-or-hide decision
  labelHideReason?: "off" | "empty" | "tooLong" | "tooThin" | "collide";
  popStart: number; // POP_START + stagger·k (k = render order)
};

export type Fitted = { slope: number; intercept: number; x1: number; y1: number; x2: number; y2: number } | null;
export type QuadLabel = { text: string; x: number; y: number; anchor: "start" | "end"; show: boolean };
export type Quadrant = { xDivPx: number | null; yDivPx: number | null; labels: QuadLabel[] };

export type ScatterPlan = {
  points: PlannedPoint[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xTicks: number[];
  yTicks: number[];
  xLabel: string;
  yLabel: string;
  xUnit: string;
  yUnit: string;
  trendLine: ScatterKnobTrend;
  fitted: Fitted;
  quadrants: ScatterKnobQuad;
  quadrant: Quadrant;
  pointLabels: ScatterKnobLabels;
  stagger: number;
  dropped: { pointsDropped: number; invalidPoints: number; hiddenPointLabels: number; hiddenQuadLabels: number };
  empty: boolean;
  // PL-0.8 row-aware viewBox geometry (default viewH 640 ⇒ {640,70,556,632} = byte-identical).
  viewH: number;
  plotY0: number;
  plotY1: number;
  titleY: number;
};

export type PlanScatterInput = {
  points?: ScatterPointInput[];
  xLabel?: string;
  yLabel?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  xUnit?: string;
  yUnit?: string;
  trendLine?: ScatterKnobTrend | string;
  quadrants?: ScatterKnobQuad | string;
  xDivider?: number;
  yDivider?: number;
  quadrantLabels?: string[];
  pointLabels?: ScatterKnobLabels | string;
  /** PL-0.8 — row-aware viewBox height (renderer-measured). Omitted/invalid → VIEW_H (640). */
  viewH?: number;
};

/** Pure stagger-vs-N (§2.5): the last point must settle by POINTS_SETTLE (0.78). */
export function staggerForN(n: number): number {
  if (n <= 1) return MAX_STAGGER;
  return Math.min(MAX_STAGGER, (POINTS_SETTLE - POP_START - POP_DUR) / (n - 1));
}

// cubic-bezier(0.34,1.3,0.64,1) — easeOutBackSubtle, the keyCallout/dot-pop ease. Local 40-step
// bisection on the monotone x-polynomial so render + check share one implementation (bars.ts pattern).
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
  const t = (lo + hi) / 2;
  return bez(t, 0, 1);
}
// easeOutBackSubtle on Y: bezier(0.34,1.3,0.64,1) — the y-poly overshoots >1 then settles; that
// is the intended "back" pop, but the RENDERER clamps the applied scale to [0,1] (§2.5 / D2).
function easeOutBackSubtleY(p: number): number {
  return bez(solveBez(clamp01(p), 0.34, 0.64), 1.3, 1);
}
const X1C = 0.65;
const X2C = 0.35;
function easeInOutCubicY(p: number): number {
  return bez(solveBez(clamp01(p), X1C, X2C), 0, 1);
}

/** Per-point pop progress, clamped ∈ [0,1] — the renderer's scale factor (omitted at settle). */
export function pointPop(t: number, popStart: number): number {
  return clamp01(easeOutBackSubtleY((t - popStart) / POP_DUR));
}

/** Trend draw-on reveal ∈ [0,1] — easeInOutCubic over [TREND_START, TREND_START+TREND_DUR]. */
export function trendReveal(t: number): number {
  return clamp01(easeInOutCubicY((t - TREND_START) / TREND_DUR));
}

const estPointPx = (s: string) => estW(s) * POINT_EST_SCALE;
const estQuadPx = (s: string) => estW(s) * QUAD_EST_SCALE;

/**
 * OLS y-on-x least-squares fit. Returns null iff < 2 points OR < 2 DISTINCT x-values
 * (Σ(xᵢ−x̄)² = 0 ⇒ undefined slope — we never draw a NaN/vertical line; §2.6). All-same-y
 * ⇒ slope 0 ⇒ a valid flat line.
 */
export function fitLeastSquares(pts: { x: number; y: number }[]): { slope: number; intercept: number } | null {
  const n = pts.length;
  if (n < 2) return null;
  const distinctX = new Set(pts.map((p) => p.x));
  if (distinctX.size < 2) return null;
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    const dx = p.x - mx;
    num += dx * (p.y - my);
    den += dx * dx;
  }
  if (den === 0) return null; // numerical guard (mirrors the distinct-x guard)
  const slope = num / den;
  const intercept = my - slope * mx;
  return { slope, intercept };
}

/**
 * Liang–Barsky clip of the OLS line `y = slope·x + intercept` (evaluated at the visible x-domain
 * edges, mapped through the scales) to the plot band rectangle. Returns the two clipped endpoints
 * in viewBox px, or null if the line never crosses the band. §2.4 C7.
 */
export function clipToBand(
  slope: number,
  intercept: number,
  xMin: number,
  xMax: number,
  scaleX: (v: number) => number,
  scaleY: (v: number) => number,
  bounds?: { x0: number; x1: number; y0: number; y1: number },
): { x1: number; y1: number; x2: number; y2: number } | null {
  // Plot band — defaults to the fixed-640 constants so the pure unit test is unchanged; planScatter
  // passes the row-aware bounds (PL-0.8). x is always [PLOT_X0,PLOT_X1] (width fixed); y is dynamic.
  const x0 = bounds?.x0 ?? PLOT_X0;
  const x1b = bounds?.x1 ?? PLOT_X1;
  const y0 = bounds?.y0 ?? PLOT_Y0;
  const y1b = bounds?.y1 ?? PLOT_Y1;
  // Segment in viewBox px from the line evaluated at the x-domain edges.
  const px0 = scaleX(xMin);
  const py0 = scaleY(slope * xMin + intercept);
  const px1 = scaleX(xMax);
  const py1 = scaleY(slope * xMax + intercept);
  const dx = px1 - px0;
  const dy = py1 - py0;
  // Liang–Barsky against [x0,x1] × [y0,y1].
  const p = [-dx, dx, -dy, dy];
  const q = [px0 - x0, x1b - px0, py0 - y0, y1b - py0];
  let u1 = 0;
  let u2 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null; // parallel and outside
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > u2) return null;
        if (r > u1) u1 = r;
      } else {
        if (r < u1) return null;
        if (r < u2) u2 = r;
      }
    }
  }
  return {
    x1: px0 + u1 * dx,
    y1: py0 + u1 * dy,
    x2: px0 + u2 * dx,
    y2: py0 + u2 * dy,
  };
}

/**
 * The pure scatter layout brain. Coerces knobs, drops invalid points, even-stride-downsamples
 * beyond the cap, derives both axes (+8% pad +max>min guard), builds the scaleLinear x/y geometry
 * (centers clamped to the band), runs the OLS fit (+Liang–Barsky clip), computes quadrant dividers
 * + region labels, and decides every label show/hide — all from DATA, never `t`.
 */
export function planScatter(input: PlanScatterInput): ScatterPlan {
  // 1. Coerce knobs (unknown → default).
  const trendLine: ScatterKnobTrend = input.trendLine === "fit" ? "fit" : "off";
  const quadrants: ScatterKnobQuad = input.quadrants === "on" ? "on" : "off";
  const pointLabels: ScatterKnobLabels = input.pointLabels === "off" ? "off" : "auto";
  const xUnit = typeof input.xUnit === "string" ? input.xUnit : "";
  const yUnit = typeof input.yUnit === "string" ? input.yUnit : "";
  const xLabel = typeof input.xLabel === "string" ? input.xLabel : "";
  const yLabel = typeof input.yLabel === "string" ? input.yLabel : "";

  const dropped = { pointsDropped: 0, invalidPoints: 0, hiddenPointLabels: 0, hiddenQuadLabels: 0 };

  // Row-aware plot band (PL-0.8). viewH defaults to 640 → {y0:70, y1:556} = today's fixed layout.
  const { viewH, y0: plotY0, y1: plotY1, titleY } = plotBounds(input.viewH ?? VIEW_H);

  // 2. Normalize + drop invalid (non-finite x OR y) points — surfaced.
  const rawPts = Array.isArray(input.points) ? input.points : [];
  type NormPt = { x: number; y: number; label: string; accent?: string; order: number };
  const valid: NormPt[] = [];
  rawPts.forEach((p, i) => {
    if (p && isNum(p.x) && isNum(p.y)) {
      valid.push({
        x: p.x,
        y: p.y,
        label: typeof p?.label === "string" ? p.label : "",
        accent: typeof p?.accent === "string" ? p.accent : undefined,
        order: i,
      });
    } else {
      dropped.invalidPoints++;
    }
  });

  // 3. Even-stride downsample beyond the cap (preserve the cloud's spread; keep first+last). §2.6.
  let kept = valid;
  if (valid.length > MAX_POINTS) {
    dropped.pointsDropped = valid.length - MAX_POINTS;
    const n = valid.length;
    const m = MAX_POINTS;
    const idxs = new Set<number>();
    for (let k = 0; k < m; k++) idxs.add(Math.round((k * (n - 1)) / (m - 1)));
    // round collisions can yield < m unique indices — backfill from the remaining to reach m.
    if (idxs.size < m) {
      for (let i = 0; i < n && idxs.size < m; i++) idxs.add(i);
    }
    kept = [...idxs].sort((a, b) => a - b).map((i) => valid[i]);
  }

  // Empty state — 0 renderable points after the drop.
  if (kept.length === 0) {
    const xTicks: number[] = [];
    const yTicks: number[] = [];
    for (let i = 0; i <= TICK_COUNT; i++) {
      xTicks.push(i / TICK_COUNT);
      yTicks.push(i / TICK_COUNT);
    }
    return {
      points: [],
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
      xTicks,
      yTicks,
      xLabel,
      yLabel,
      xUnit,
      yUnit,
      trendLine,
      fitted: null,
      quadrants,
      quadrant: { xDivPx: null, yDivPx: null, labels: [] },
      pointLabels,
      stagger: staggerForN(0),
      dropped,
      empty: true,
      viewH,
      plotY0,
      plotY1,
      titleY,
    };
  }

  // 4. Per-dim axis derivation (8% pad) + max>min guard (§2.4 C5/C3). Author bounds override per-bound.
  const xs = kept.map((p) => p.x);
  const ys = kept.map((p) => p.y);
  const deriveAxis = (data: number[], minIn?: number, maxIn?: number): [number, number] => {
    let lo = isNum(minIn) ? minIn : Math.min(...data);
    let hi = isNum(maxIn) ? maxIn : Math.max(...data);
    // Pad only the derived bounds (not author-given ones).
    const span = Math.max(hi - lo, 1e-9);
    const pad = AXIS_PAD_FRACTION * span;
    if (!isNum(minIn)) lo -= pad;
    if (!isNum(maxIn)) hi += pad;
    if (hi <= lo) hi = lo + 1; // max>min guard (all-same-x / all-same-y degenerate)
    return [lo, hi];
  };
  const [xMin, xMax] = deriveAxis(xs, input.xMin, input.xMax);
  const [yMin, yMax] = deriveAxis(ys, input.yMin, input.yMax);

  const xTicks: number[] = [];
  const yTicks: number[] = [];
  for (let i = 0; i <= TICK_COUNT; i++) {
    xTicks.push(xMin + ((xMax - xMin) * i) / TICK_COUNT);
    yTicks.push(yMin + ((yMax - yMin) * i) / TICK_COUNT);
  }

  // 5. Scales. y inverted in screen space (axisMax at the top). y range is row-aware (plotY0/plotY1).
  const scaleXd3 = scaleLinear().domain([xMin, xMax]).range([PLOT_X0, PLOT_X1]);
  const scaleYd3 = scaleLinear().domain([yMin, yMax]).range([plotY1, plotY0]);
  const scaleX = (v: number) => scaleXd3(v) ?? PLOT_X0;
  const scaleY = (v: number) => scaleYd3(v) ?? plotY1;

  const stagger = staggerForN(kept.length);

  // 6. Per-point centers (clamped to the band so no dot's painted box exits), accent, popStart.
  const cxLo = PLOT_X0 + DOT_R;
  const cxHi = PLOT_X1 - DOT_R;
  const cyLo = plotY0 + DOT_R;
  const cyHi = plotY1 - DOT_R;
  const points: PlannedPoint[] = kept.map((p, k) => {
    const cx = clamp(scaleX(p.x), cxLo, cxHi);
    const cy = clamp(scaleY(p.y), cyLo, cyHi);
    return {
      index: p.order,
      cx,
      cy,
      xData: p.x,
      yData: p.y,
      accentKey: accentForIndex(p.accent, k),
      label: p.label,
      showLabel: false, // decided below
      popStart: POP_START + stagger * k,
    };
  });

  // 7. Point-label fit-or-hide (greedy author-order pass; earlier kept on collision). §2.6.
  //    A label box sits to the RIGHT of its dot, vertically centered. Hidden if off / empty /
  //    > 20cp / would exceed the room to the nearest plot edge / overlaps a visible label.
  type LabelBox = { x: number; y: number; w: number; h: number };
  const visibleBoxes: LabelBox[] = [];
  const labelBox = (pt: PlannedPoint, est: number): LabelBox => ({
    x: pt.cx + DOT_R + 4,
    y: pt.cy - POINT_LABEL_PX / 2,
    w: est,
    h: POINT_LABEL_PX,
  });
  const boxOverlap = (a: LabelBox, b: LabelBox): number => {
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return ox > 4 && oy > 4 ? Math.min(ox, oy) : 0;
  };
  for (const pt of points) {
    if (pointLabels === "off") {
      pt.labelHideReason = "off";
      continue;
    }
    const trimmed = pt.label.trim();
    if (trimmed.length === 0) {
      pt.labelHideReason = "empty";
      continue;
    }
    if ([...trimmed].length > POINT_LABEL_MAX_CP) {
      pt.labelHideReason = "tooLong";
      dropped.hiddenPointLabels++;
      continue;
    }
    const est = estPointPx(trimmed);
    // Room to the right plot edge (label is right-anchored at the dot). If it would exceed, hide.
    const roomRight = PLOT_X1 - (pt.cx + DOT_R + 4) - LABEL_PAD;
    if (est > roomRight) {
      pt.labelHideReason = "tooThin";
      dropped.hiddenPointLabels++;
      continue;
    }
    const box = labelBox(pt, est);
    if (visibleBoxes.some((b) => boxOverlap(b, box) > 0)) {
      pt.labelHideReason = "collide";
      dropped.hiddenPointLabels++;
      continue;
    }
    pt.showLabel = true;
    visibleBoxes.push(box);
  }

  // 8. OLS trend fit (on the KEPT points) + Liang–Barsky clip. Suppressed → fitted:null. §2.6.
  let fitted: Fitted = null;
  if (trendLine === "fit") {
    const fit = fitLeastSquares(kept.map((p) => ({ x: p.x, y: p.y })));
    if (fit) {
      const seg = clipToBand(fit.slope, fit.intercept, xMin, xMax, scaleX, scaleY, { x0: PLOT_X0, x1: PLOT_X1, y0: plotY0, y1: plotY1 });
      if (seg) fitted = { slope: fit.slope, intercept: fit.intercept, ...seg };
    }
  }

  // 9. Quadrant dividers (author value or data MEAN) + ≤4 region labels (TL,TR,BL,BR). §2.4 C8.
  let quadrant: Quadrant = { xDivPx: null, yDivPx: null, labels: [] };
  if (quadrants === "on") {
    const meanX = xs.reduce((s, v) => s + v, 0) / xs.length;
    const meanY = ys.reduce((s, v) => s + v, 0) / ys.length;
    const xDivVal = isNum(input.xDivider) ? input.xDivider : meanX;
    const yDivVal = isNum(input.yDivider) ? input.yDivider : meanY;
    // Clamp the divider px to the band edges if the value is out of domain (line still renders).
    const xDivPx = clamp(scaleX(xDivVal), PLOT_X0, PLOT_X1);
    const yDivPx = clamp(scaleY(yDivVal), plotY0, plotY1);

    const rawLabels = Array.isArray(input.quadrantLabels) ? input.quadrantLabels.slice(0, 4) : [];
    // Region inner-corner anchors, inset 14px from the divider intersection toward the outer corner.
    // Order TL, TR, BL, BR (top-left, top-right, bottom-left, bottom-right of the plot).
    const INSET = 14;
    const slots: { x: number; y: number; anchor: "start" | "end"; innerW: number }[] = [
      { x: xDivPx - INSET, y: plotY0 + QUAD_LABEL_PX + INSET, anchor: "end", innerW: xDivPx - PLOT_X0 - INSET }, // TL
      { x: xDivPx + INSET, y: plotY0 + QUAD_LABEL_PX + INSET, anchor: "start", innerW: PLOT_X1 - xDivPx - INSET }, // TR
      { x: xDivPx - INSET, y: plotY1 - INSET, anchor: "end", innerW: xDivPx - PLOT_X0 - INSET }, // BL
      { x: xDivPx + INSET, y: plotY1 - INSET, anchor: "start", innerW: PLOT_X1 - xDivPx - INSET }, // BR
    ];
    const dotBoxes = points.map((pt) => ({ x: pt.cx - DOT_R, y: pt.cy - DOT_R, w: 2 * DOT_R, h: 2 * DOT_R }));
    const placedLabelBoxes: LabelBox[] = [];
    const labels: QuadLabel[] = slots.map((slot, qi) => {
      const text = typeof rawLabels[qi] === "string" ? rawLabels[qi].trim() : "";
      let show = text.length > 0;
      if (show && [...text].length > QUAD_LABEL_MAX_CP) show = false;
      const est = estQuadPx(text);
      if (show && est > slot.innerW) show = false; // doesn't fit its quadrant's inner width
      // The label box (anchored start/end at slot.x).
      const lx = slot.anchor === "start" ? slot.x : slot.x - est;
      const box: LabelBox = { x: lx, y: slot.y - QUAD_LABEL_PX, w: est, h: QUAD_LABEL_PX };
      if (show && (dotBoxes.some((d) => boxOverlap(d, box) > 0) || placedLabelBoxes.some((b) => boxOverlap(b, box) > 0))) {
        show = false; // overlaps a dot or an already-placed quad label
      }
      if (text.length > 0 && !show) dropped.hiddenQuadLabels++;
      if (show) placedLabelBoxes.push(box);
      return { text, x: slot.x, y: slot.y, anchor: slot.anchor, show };
    });
    quadrant = { xDivPx, yDivPx, labels };
  }

  return {
    points,
    xMin,
    xMax,
    yMin,
    yMax,
    xTicks,
    yTicks,
    xLabel,
    yLabel,
    xUnit,
    yUnit,
    trendLine,
    fitted,
    quadrants,
    quadrant,
    pointLabels,
    stagger,
    dropped,
    empty: false,
    viewH,
    plotY0,
    plotY1,
    titleY,
  };
}

export { formatTick };
export type { AccentKey };
