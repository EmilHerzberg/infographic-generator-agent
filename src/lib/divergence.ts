// PL-3.1 — Divergence plan: the pure "anti-overlap brain" shared by the renderer
// (PostRenderer → Divergence) and the deterministic check suite (tools/qa-divergence.mjs).
// Like stack.ts / countup.ts it is dependency-light (only d3-scale + the estW char-class
// table reused from stack.ts) so Node's native type-stripping can unit-test it without a DOM.
//
// `divergence` expresses the GAP between two paired values where the gap and its DIRECTION are
// the argument (predicted vs actual, before vs after, rank inversions). `planDivergence` owns
// EVERY geometry decision — axis derivation + guard, the C6 anti-collapse nudge, the
// endpoint-label show/hide decision, and the slope y-declutter nudge — from DATA only, never
// from `t`, so its output feeds the static-geometry checks directly.
// Spec: planning/primitive-library/handoffs/PL-3.1-divergence.md §2.5.1 / §2.5.2 / C1–C12.

import { scaleLinear, scalePoint } from "d3-scale";
import { estW } from "./stack.ts";

export type DivergenceMode = "dumbbell" | "slope";

export type DivergenceInputItem = {
  label: string;
  start: number;
  end: number;
  startText?: string;
  endText?: string;
};

// ── Fixed viewBox geometry (source px) — §2.5.1 ─────────────────────────────────────────────
export const VIEW_W = 1000;
export const VIEW_H = 640;
export const DOT_R = 13; // C8 — dot radius (→ ~23.5px effective diameter)
export const CONNECTOR_STROKE = 5; // C8 — stroke.chartLine, the established chart-line weight
export const MIN_GAP = 2 * DOT_R + 6; // C6 — floor center-to-center distance (32px source)

// Dumbbell — label column [0, 300] + plot band; row label textAnchor="end" at LABEL_ANCHOR_X.
export const LABEL_ANCHOR_X = 290; // 10px gutter inside the 300px column
const PLOT_X_LEFT = 340; // plot band left edge
const PLOT_X_RIGHT = 980; // plot band right edge
export const AXIS_X0 = PLOT_X_LEFT + DOT_R; // 353 — usable left for a dot CENTER
export const AXIS_X1 = PLOT_X_RIGHT - DOT_R; // 967 — usable right for a dot CENTER
const ROW_Y0 = 96;
const ROW_Y1 = 540; // rows span [96, 540]; pitch ≥ ~99px source at N=5 (≥110 floor proof §2.5.1)
export const AXIS_Y = VIEW_H - 40; // 600 — baseline + tick labels

// Slope — two vertical axes, vertical value scale. Clean coordinates (PM §3 correction).
export const SLOPE_X_LEFT = 140;
export const SLOPE_X_RIGHT = 860;
const SLOPE_Y_TOP = 80; // value axis top (maps axisMax)
const SLOPE_Y_BOTTOM = VIEW_H - 80; // 560 — value axis bottom (maps axisMin)
export const SLOPE_DECLUTTER = 28; // px — minimum vertical gap between two endpoint LABELS

const AXIS_PAD_FRACTION = 0.08; // 8% domain padding each side (mirrors the `ranges` renderer)
const MAX_ITEMS = 5; // C1
const MAX_LABEL_CODEPOINTS = 24; // C3
const ENDPOINT_MAX_CODEPOINTS = 12; // C4
const ENDPOINT_LABEL_PX = 24; // source size of an endpoint value label (count-up / *Text)
// estW() is calibrated at 26px (stack.ts). Endpoint labels render at 24px → scale the estimate.
const ENDPOINT_EST_SCALE = ENDPOINT_LABEL_PX / 26;

export type DivergenceRow = {
  /** Original (post-clamp) item index. */
  index: number;
  label: string;
  showLabel: boolean; // C3 — row label hidden iff empty / > 24 cp / estW > 290
  /** True data-position of each endpoint center on the value axis (used for count-up labels). */
  aData: number;
  bData: number;
  /** Painted dot center (after the C6 anti-collapse nudge) — dumbbell: x; slope: y on each side. */
  aCenter: number;
  bCenter: number;
  /** Cross-axis coordinate of the row — dumbbell: row y; slope: unused (endpoints carry their own y). */
  rowY: number;
  /** Slope only: the painted y of each endpoint label after the declutter nudge. */
  aLabelY: number;
  bLabelY: number;
  aLabel: string; // displayed endpoint string (startText or formatted start)
  bLabel: string;
  showALabel: boolean; // C4 — endpoint label hidden when it can't fit its slot / collides
  showBLabel: boolean;
  /** Dumbbell only — width-aware endpoint-label placement (PL-0.7 class-C clip fix). The text
   *  anchor (flipped inward near an edge so the label can never extend past the viewBox) and the
   *  label x (= dot center, except in the rare both-gutters-too-narrow case where it is clamped
   *  inward so the label box sits within [pad, VIEW_W−pad]; the dot stays at its true center). */
  aAnchor: "start" | "middle" | "end";
  bAnchor: "start" | "middle" | "end";
  aLabelX: number;
  bLabelX: number;
  aCountText?: string; // count-eligible source (numeric) → drives planCountUp; else undefined ⇒ fade
  bCountText?: string;
  /** Per-row animation start (the chained stagger, §2.5.3). */
  rowStart: number;
};

export type DivergencePlan = {
  mode: DivergenceMode;
  axisMin: number;
  axisMax: number;
  rows: DivergenceRow[];
  ticks: number[];
  stagger: number; // min(0.08, (0.85 − 0.20 − 0.34)/(N−1)) — §2.5.3
  /** Dumbbell row pitch (source px); the renderer's per-row vertical label budget is ±pitch/2. */
  pitch: number;
  /** True when, after clamping, < 2 renderable items remain (C2 self-contained fallback). */
  fallback: boolean;
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Default numeric formatter for an endpoint when no display string is given. */
export function formatValue(v: number): string {
  if (!Number.isFinite(v)) return "";
  // Trim to ≤ 2 decimals, drop trailing zeros, keep it short (≤ 12 cp enforced by C4 downstream).
  const r = Math.round(v * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r);
}

/** Pure stagger-vs-N (§2.5.3): the last B-dot must land by the 0.85 settle deadline. */
export function staggerForN(n: number): number {
  if (n <= 1) return 0.08;
  return Math.min(0.08, (0.85 - 0.2 - 0.34) / (n - 1));
}

/** Estimated rendered advance width (px) of an endpoint label at its 24px size. */
function endpointEstW(s: string): number {
  return estW(s) * ENDPOINT_EST_SCALE;
}

// Endpoint-label edge guard (PL-0.7 class-C clip fix; mirrors ranges' clampTickLabelX). The natural
// outward anchor — A reads toward B (away from the connector) — pushes a wide label (e.g. metr's
// "+39% faster", ~140px) past the viewBox when its dot sits near an edge. This makes the placement
// WIDTH-AWARE so a label can NEVER extend past [0, VIEW_W]: flip the anchor inward if the natural
// side doesn't hold the full width; if NEITHER gutter fits (label wider than both — rare), clamp the
// label x inward so its box lands within [pad, VIEW_W−pad] (the DOT stays at its true center, only the
// LABEL shifts). A NO-OP for every label whose natural placement already fits → byte-identical for
// content that fits; only an otherwise-clipping endpoint moves. estW is @26px → scaled to 24px above.
const ENDPOINT_EDGE_PAD = 4; // px breathing room from the viewBox edge (ranges' TICK_EDGE_PAD)
function placeEndpointLabel(
  cx: number,
  natural: "start" | "end",
  labelW: number,
): { anchor: "start" | "end"; x: number } {
  let anchor = natural;
  // Flip inward when the natural side can't hold the full label width before the viewBox edge.
  if (anchor === "start" && cx + labelW > VIEW_W - ENDPOINT_EDGE_PAD) anchor = "end";
  else if (anchor === "end" && cx - labelW < ENDPOINT_EDGE_PAD) anchor = "start";
  // After the flip, clamp the label x so its box stays within [pad, VIEW_W−pad]. For a label that
  // fits on the chosen side this is a no-op (x stays at cx); only a label wider than its gutter is
  // nudged inward — the dot remains at cx, the text box slides to sit just inside the edge.
  let x = cx;
  if (anchor === "start") x = Math.min(cx, VIEW_W - ENDPOINT_EDGE_PAD - labelW);
  else x = Math.max(cx, ENDPOINT_EDGE_PAD + labelW);
  return { anchor, x };
}

/**
 * The pure divergence layout brain. Decides axis, dot centers (with the C6 anti-collapse
 * nudge), endpoint-label show/hide, and (slope) the y-declutter — all from DATA, never `t`.
 */
export function planDivergence(
  rawItems: ReadonlyArray<DivergenceInputItem> | undefined,
  axisMinIn: number | undefined,
  axisMaxIn: number | undefined,
  modeIn: DivergenceMode | string | undefined,
): DivergencePlan {
  const mode: DivergenceMode = modeIn === "slope" ? "slope" : "dumbbell"; // unknown → dumbbell (§2.6.6)

  // 1. Clamp count (C1), then coerce endpoints (§2.6.2). An item with BOTH endpoints
  //    non-numeric is dropped (can't place it); a single non-numeric endpoint is coerced to
  //    the axis midpoint for LAYOUT and its label forced to the fade path (never counts a NaN).
  const clamped = (Array.isArray(rawItems) ? rawItems : []).slice(0, MAX_ITEMS);
  const usable = clamped.filter((it) => it && (isNum(it.start) || isNum(it.end)));

  // 2. Axis derivation + guard (§2.5.1). Collect every finite endpoint across usable items.
  const nums: number[] = [];
  for (const it of usable) {
    if (isNum(it.start)) nums.push(it.start);
    if (isNum(it.end)) nums.push(it.end);
  }
  let axisMin = isNum(axisMinIn) ? axisMinIn : nums.length ? Math.min(...nums) : 0;
  let axisMax = isNum(axisMaxIn) ? axisMaxIn : nums.length ? Math.max(...nums) : 1;
  if (!isNum(axisMinIn) && !isNum(axisMaxIn) && nums.length) {
    const pad = AXIS_PAD_FRACTION * Math.max(axisMax - axisMin, 1e-9);
    axisMin -= pad;
    axisMax += pad;
  }
  if (axisMax <= axisMin) axisMax = axisMin + 1; // scaleLinear divides by span (ranges' guard)

  // Coerced numeric endpoints (NaN → axis midpoint) and a flag per side for the fade path.
  const mid = (axisMin + axisMax) / 2;
  const items = usable.map((it) => ({
    label: typeof it.label === "string" ? it.label : "",
    aNum: isNum(it.start) ? clamp(it.start, axisMin, axisMax) : mid,
    bNum: isNum(it.end) ? clamp(it.end, axisMin, axisMax) : mid,
    aIsNum: isNum(it.start),
    bIsNum: isNum(it.end),
    aData: isNum(it.start) ? it.start : mid, // unclamped true value drives the count-up target
    bData: isNum(it.end) ? it.end : mid,
    startText: typeof it.startText === "string" ? it.startText : undefined,
    endText: typeof it.endText === "string" ? it.endText : undefined,
  }));

  const n = items.length;
  const stagger = staggerForN(n);
  const fallback = n < 2; // C2

  // Ticks — 3–5 evenly spaced over the (possibly derived) domain.
  const TICK_COUNT = 4;
  const ticks: number[] = [];
  for (let i = 0; i <= TICK_COUNT; i++) ticks.push(axisMin + ((axisMax - axisMin) * i) / TICK_COUNT);

  if (mode === "slope") {
    return planSlope(items, axisMin, axisMax, ticks, stagger, fallback);
  }
  return planDumbbell(items, axisMin, axisMax, ticks, stagger, fallback);
}

type PreparedItem = {
  label: string;
  aNum: number;
  bNum: number;
  aIsNum: boolean;
  bIsNum: boolean;
  aData: number;
  bData: number;
  startText?: string;
  endText?: string;
};

/** Show/hide + count-eligibility for a single endpoint's displayed string. */
function endpointDisplay(it: PreparedItem, side: "a" | "b") {
  const text = side === "a" ? it.startText : it.endText;
  const isNumEndpoint = side === "a" ? it.aIsNum : it.bIsNum;
  const dataVal = side === "a" ? it.aData : it.bData;
  const display = text != null ? text : isNumEndpoint ? formatValue(dataVal) : "";
  // Count-eligible ONLY when there is no override string AND the endpoint is a finite number;
  // an explicit non-numeric *Text (e.g. "19% slower") and any NaN endpoint take the fade path.
  const countText = text == null && isNumEndpoint ? formatValue(dataVal) : undefined;
  // C4 — hidden when empty or > 12 code points (the measured check still gates the slot fit).
  const fits = display.length > 0 && [...display].length <= ENDPOINT_MAX_CODEPOINTS;
  return { display, countText, fits, estPx: endpointEstW(display) };
}

function planDumbbell(
  items: PreparedItem[],
  axisMin: number,
  axisMax: number,
  ticks: number[],
  stagger: number,
  fallback: boolean,
): DivergencePlan {
  const value = scaleLinear().domain([axisMin, axisMax]).range([AXIS_X0, AXIS_X1]);

  // Row y placement via scalePoint (even spacing, half-step padding). For the < 2-item
  // fallback the single pair is centered vertically (the self-contained defensive net, §3.2).
  let rowYof: (i: number) => number;
  if (items.length >= 2) {
    const point = scalePoint<string>()
      .domain(items.map((_, i) => String(i)))
      .range([ROW_Y0, ROW_Y1])
      .padding(0.5);
    rowYof = (i) => point(String(i)) ?? (ROW_Y0 + ROW_Y1) / 2;
  } else {
    const cy = (ROW_Y0 + ROW_Y1) / 2;
    rowYof = () => cy;
  }
  const pitch = items.length >= 2 ? (ROW_Y1 - ROW_Y0) / (items.length - 1) : ROW_Y1 - ROW_Y0;

  const rows: DivergenceRow[] = items.map((it, i) => {
    const aX = value(it.aNum);
    const bX = value(it.bNum);

    // C6 anti-collapse nudge: floor the painted center-to-center distance at MIN_GAP, keeping
    // the data midpoint fixed and the SIGN of (end − start) so direction is preserved. Equal
    // values stay coincident (legitimate "no divergence" — two stacked dots). The nudged
    // centers are clamped to stay inside the band.
    let aCenter = aX;
    let bCenter = bX;
    const d = bX - aX;
    if (d !== 0 && Math.abs(d) < MIN_GAP) {
      const m = (aX + bX) / 2;
      const half = (MIN_GAP / 2) * Math.sign(d);
      aCenter = clamp(m - half, AXIS_X0, AXIS_X1);
      bCenter = clamp(m + half, AXIS_X0, AXIS_X1);
    }

    const trimmedLabel = it.label.trim();
    const showLabel =
      trimmedLabel.length > 0 &&
      [...trimmedLabel].length <= MAX_LABEL_CODEPOINTS &&
      estW(trimmedLabel) <= LABEL_ANCHOR_X;

    const a = endpointDisplay(it, "a");
    const b = endpointDisplay(it, "b");

    // C11 / §2.5.2 — each endpoint label sits over its dot (A above-left, B above-right). When
    // the gap is narrow, the two labels' half-widths can overlap; if both can't fit without
    // collision, hide the SMALLER-MAGNITUDE endpoint's label (the dot stays, the count-up of the
    // larger value carries the number). A label whose own string doesn't fit C4 is hidden first.
    let showALabel = a.fits;
    let showBLabel = b.fits;
    if (showALabel && showBLabel) {
      const need = a.estPx / 2 + b.estPx / 2 + 8; // 8px min separation between the two labels
      if (Math.abs(bCenter - aCenter) < need) {
        // Collision — drop the smaller-magnitude endpoint's label.
        if (Math.abs(it.aData) <= Math.abs(it.bData)) showALabel = false;
        else showBLabel = false;
      }
    }

    // Width-aware endpoint-label placement (PL-0.7 class-C clip fix). Natural anchor: each label
    // reads outward, away from the connector (A toward B). placeEndpointLabel flips/clamps it so the
    // rendered box can never cross [0, VIEW_W] — a no-op for labels that already fit.
    const aLeft = aCenter <= bCenter;
    const aPlaced = placeEndpointLabel(aCenter, aLeft ? "end" : "start", a.estPx);
    const bPlaced = placeEndpointLabel(bCenter, aLeft ? "start" : "end", b.estPx);

    return {
      index: i,
      label: it.label,
      showLabel,
      aData: it.aData,
      bData: it.bData,
      aCenter,
      bCenter,
      rowY: rowYof(i),
      aLabelY: rowYof(i),
      bLabelY: rowYof(i),
      aLabel: a.display,
      bLabel: b.display,
      showALabel,
      showBLabel,
      aAnchor: aPlaced.anchor,
      bAnchor: bPlaced.anchor,
      aLabelX: aPlaced.x,
      bLabelX: bPlaced.x,
      aCountText: a.countText,
      bCountText: b.countText,
      rowStart: 0.34 + stagger * i,
    };
  });
  return { mode: "dumbbell", axisMin, axisMax, rows, ticks, stagger, pitch, fallback };
}

function planSlope(
  items: PreparedItem[],
  axisMin: number,
  axisMax: number,
  ticks: number[],
  stagger: number,
  fallback: boolean,
): DivergencePlan {
  // Vertical value scale: axisMax at the top, axisMin at the bottom.
  const value = scaleLinear().domain([axisMin, axisMax]).range([SLOPE_Y_BOTTOM, SLOPE_Y_TOP]);

  const rows: DivergenceRow[] = items.map((it, i) => {
    const aY = value(it.aNum); // left endpoint y (true data y — connectors point here, undistorted)
    const bY = value(it.bNum); // right endpoint y
    const trimmedLabel = it.label.trim();
    const showLabel =
      trimmedLabel.length > 0 && [...trimmedLabel].length <= MAX_LABEL_CODEPOINTS;
    const a = endpointDisplay(it, "a");
    const b = endpointDisplay(it, "b");
    return {
      index: i,
      label: it.label,
      showLabel,
      aData: it.aData,
      bData: it.bData,
      aCenter: aY, // dot center y on the left axis (true data)
      bCenter: bY, // dot center y on the right axis (true data)
      rowY: (aY + bY) / 2,
      aLabelY: aY, // nudged below
      bLabelY: bY,
      aLabel: a.display,
      bLabel: b.display,
      showALabel: a.fits,
      showBLabel: b.fits,
      // Slope labels live in FIXED inside-the-axis columns (left start-anchored, right end-anchored),
      // x decided by the renderer from SLOPE_X_*±offset — never near the viewBox edge, so the
      // width-aware edge guard is a no-op here. Carry the fixed anchors through; the renderer keeps
      // computing the slope x from SLOPE geometry (aLabelX/bLabelX are dumbbell-only consumers).
      aAnchor: "start",
      bAnchor: "end",
      aLabelX: SLOPE_X_LEFT,
      bLabelX: SLOPE_X_RIGHT,
      aCountText: a.countText,
      bCountText: b.countText,
      rowStart: 0.34 + stagger * i,
    };
  });

  // y-declutter (PM §3): the connector ENDPOINTS stay at the true data y (crossings/inversions
  // are never distorted) — only the LABEL y nudges. Per side: sort by y; push each subsequent
  // colliding label down by (SLOPE_DECLUTTER − gap), bounded within the axis. Pure pass.
  declutterLabels(rows, "aLabelY");
  declutterLabels(rows, "bLabelY");

  return { mode: "slope", axisMin, axisMax, rows, ticks, stagger, pitch: 0, fallback };
}

/** Deterministic vertical label de-overlap on one side — moves ONLY the label y, never the dot. */
function declutterLabels(rows: DivergenceRow[], key: "aLabelY" | "bLabelY") {
  const order = rows
    .map((r, i) => ({ i, y: r[key] }))
    .sort((p, q) => p.y - q.y);
  for (let k = 1; k < order.length; k++) {
    const prev = rows[order[k - 1].i][key];
    const cur = rows[order[k].i];
    if (cur[key] - prev < SLOPE_DECLUTTER) {
      cur[key] = Math.min(prev + SLOPE_DECLUTTER, SLOPE_Y_BOTTOM);
    }
  }
}
