// PL-4.3 — RangeBars plan (the `ranges` viz): the pure brain for the two-lane horizontal range
// visualization on a shared YEAR axis. Year→x scale, per-entry bar geometry (start/end → x/width, the
// band y per lane/row), label fit-or-hide, the maxYear≤minYear axis guard (MOVED here from
// PostRenderer's inline line), axis-derivation-from-data, openEnd handling, marketLine x, and the
// defensive clamps (entries-per-lane cap, label-char cap, min bar width, negative/zero span) — all
// decided ONCE, from DATA only (never from `t`). Pure and dependency-free except `estW` (the shared
// char-class width estimate from stack.ts), so the deterministic gate (tools/qa-ranges.mjs) can
// unit-test it without a DOM via Node's native type stripping (mirrors stack.ts / matrix.ts / line.ts).
//
// Single source of truth for the ranges render: PostRenderer → RangeBars and the checks share this one
// brain. The RETROFIT contract (handoff §1) is byte-identity — so the geometry here reproduces the
// legacy component's painted decisions EXACTLY on in-spec input (same scale, same row pitch, same
// label/openEnd/marketLine positions). The defensive clamps (over-cap lanes, INVALID accents, an
// ABSURDLY long label, a degenerate axis, a reversed span) are no-ops on every shipping/in-spec input
// and only fire on degenerate data.
//
// IMPORTANT — the EXTERNAL prop interface of RangeBars is PRESERVED (Path B's IncentivesVsTimelines +
// PostRenderer pass topEntries/bottomEntries/minYear/maxYear/marketLine/*Reveal). planRanges is an
// internal layout helper the component (and PostRenderer's degenerate-axis guard) consume; it does NOT
// change any prop, class, style or painted pixel.
//
// Numbered constraints (handoff §2B — lifted from the component header into a spec):
//   C1  viewBox 1000×560; layout reserved from Beat 1 (node count constant across reveals; reveals
//       drive group opacity ONLY, never the layout box).
//   C2  bars: x 320 (barAreaX), y 50–180 top / 300–430 bottom, height 32; within the viewBox.
//   C3  top group label x20 y40, bottom y285 (26px / GROUP_LABEL_FONT == text.eyebrow mono, weight 600, 0.22em).
//   C4  row labels: right-anchored at x300 (LABEL_COL_W), 22px (ROW_LABEL_FONT) Space Grotesk weight 500.
//   C5  axis baseline y220; ticks every 5 years from minYear+1; tick labels y+28 (AXIS_LABEL_FONT mono).
//   C6  spacing: ≥40px between text↔visual (label col pad 20 + bar gap), ≥24px between row labels
//       (ROW_HEIGHT 44 − BAR_HEIGHT 32 = 12 band gap; the 22px label fits with clear pitch).
//   C7  marketLine (optional): vertical violet dashed at year→x, y 20–460; label uppercased y490; year y518.
//   C8  caps: ≤ MAX_ENTRIES_PER_LANE rows/lane (surfaced); a label over MAX_LABEL_CHARS is hidden
//       (fit-or-hide, never bleeds; surfaced); min bar width 0 (a zero/negative span never goes negative).
//   C9  axis: maxYear≤minYear → maxYear bumped to min+1 (no divide-by-zero; surfaced); min/max derived
//       from the data extents when the author omitted them (Anthropic's loose schema).

import { estW } from "./stack.ts";

export type RangesAccent = "cyan" | "amber" | "violet" | "mint" | "burnt";
export const ACCENTS: RangesAccent[] = ["cyan", "amber", "violet", "mint", "burnt"];
const DEFAULT_TOP_ACCENT: RangesAccent = "cyan";
const DEFAULT_BOTTOM_ACCENT: RangesAccent = "burnt";

// ── Geometry constants (C1–C7). Source pixels (viewBox 1000×560). These reproduce the legacy
//    component's inline literals EXACTLY — changing any one breaks byte-identity. ──────────────────
export const VIEW_W = 1000; // C1
export const VIEW_H = 560; // C1
export const LABEL_COL_W = 300; // C4 — row label right-anchor x
const LABEL_COL_PAD_RIGHT = 20; // C6 — gap between label column and the bar area
export const BAR_AREA_X = LABEL_COL_W + LABEL_COL_PAD_RIGHT; // 320 — C2 bar start x
const BAR_AREA_W = VIEW_W - BAR_AREA_X - 20; // 660 — C2 bar area width
export const TOP_LANE_Y = 50; // C2
export const BOTTOM_LANE_Y = 300; // C2
export const ROW_HEIGHT = 44; // C6 — per-row pitch
export const BAR_HEIGHT = 32; // C2/C3
export const AXIS_Y = 220; // C5
const OPEN_END_OFFSET = 8; // C2 — the + marker x offset past the bar end

export const GROUP_LABEL_FONT = 26; // C3 — design token text.eyebrow (rendered 26; the handoff's "28px" note was stale)
export const ROW_LABEL_FONT = 22; // C4
export const AXIS_LABEL_FONT = 24; // C5 — design token text.axisLabel (the gate reads the effective size)

// ── Defensive caps (C8/C9) — no-ops on every in-spec input. ─────────────────────────────────────
export const MAX_ENTRIES_PER_LANE = 4; // C8 — PostRenderer already sliced to 4; the planner OWNS it now
// A row label is hidden if it can't fit the left label column at 22px. The label column is 300px wide;
// estW is calibrated @26px → scale to 22px. A label estimated wider than the column is hidden (no bleed).
export const MAX_LABEL_CHARS = 64; // C8 — beyond this a label is absurd → hidden regardless of width
const LABEL_FONT_SCALE = ROW_LABEL_FONT / 26; // estW is @26px; scale its advance to the 22px label size
const LABEL_FIT_WIDTH = LABEL_COL_W; // C8 — the label must fit the 300px left column

const isAccent = (a: unknown): a is RangesAccent => typeof a === "string" && (ACCENTS as string[]).includes(a);

export type RangeEntryInput = {
  id?: string;
  label?: string;
  start?: number;
  end?: number;
  openEnd?: boolean;
};

export type RangesPlanEntry = {
  id: string;
  label: string;
  start: number;
  end: number;
  openEnd: boolean;
  /** Bar geometry in viewBox px (start/end → x/width via yearToX). */
  x: number;
  w: number;
  /** Band y for this row (lane base + row index × ROW_HEIGHT). */
  y: number;
  /** Row-label baseline y (vertically centered in the bar). */
  labelY: number;
  /** False when the label can't fit the left column at 22px → hidden (C8 fit-or-hide). */
  showLabel: boolean;
  /** The openEnd `+` marker x (yearToX(end) + offset); only meaningful when openEnd. */
  openEndX: number;
};

export type RangesMarketLine = {
  year: number;
  label: string;
  /** Vertical line x (yearToX(year)) — the MARK stays at the true x. */
  x: number;
  /** Label/year text x (PL-0.11 edge-fit): x+12 when it fits to the right, else flipped left. */
  labelX: number;
  /** Label/year text-anchor: "start" (extends right, the legacy default) or "end" (extends left). */
  labelAnchor: "start" | "end";
};

export type RangesPlan = {
  minYear: number;
  maxYear: number;
  barAreaX: number;
  barAreaW: number;
  topLaneY: number;
  bottomLaneY: number;
  yearToX: (year: number) => number;
  topGroupLabel: string;
  bottomGroupLabel: string;
  topAccent: RangesAccent;
  bottomAccent: RangesAccent;
  topEntries: RangesPlanEntry[];
  bottomEntries: RangesPlanEntry[];
  /** Tick years (every 5 from minYear+1). */
  ticks: number[];
  marketLine: RangesMarketLine | null;
  dropped: {
    /** Rows beyond MAX_ENTRIES_PER_LANE (per lane, summed) — surfaced, never silent. */
    entriesDropped: number;
    /** Labels hidden by the fit-or-hide decision (C8). */
    labelsHidden: number;
    /** Accents that were missing/invalid and fell back (C8). */
    invalidAccents: number;
    /** True when the maxYear≤minYear axis guard fired (C9). */
    axisGuarded: boolean;
  };
};

export type PlanRangesInput = {
  topGroupLabel?: string;
  bottomGroupLabel?: string;
  topEntries?: RangeEntryInput[];
  bottomEntries?: RangeEntryInput[];
  topAccent?: unknown;
  bottomAccent?: unknown;
  minYear?: number;
  maxYear?: number;
  marketLine?: { year?: number; label?: string } | null;
};

const isNum = (n: unknown): n is number => typeof n === "number" && !Number.isNaN(n) && Number.isFinite(n);

export function planRanges(input: PlanRangesInput = {}): RangesPlan {
  const counters = { entriesDropped: 0, labelsHidden: 0, invalidAccents: 0, axisGuarded: false };

  // ── Lane caps (C8) — reproduce PostRenderer's `.slice(0,4)` exactly, surfacing the drop. ──
  const rawTop = Array.isArray(input.topEntries) ? input.topEntries : [];
  const rawBottom = Array.isArray(input.bottomEntries) ? input.bottomEntries : [];
  const topRaw = rawTop.slice(0, MAX_ENTRIES_PER_LANE);
  const bottomRaw = rawBottom.slice(0, MAX_ENTRIES_PER_LANE);
  counters.entriesDropped += Math.max(0, rawTop.length - topRaw.length) + Math.max(0, rawBottom.length - bottomRaw.length);

  // ── Axis derivation + guard (C9) — MOVED from PostRenderer's inline block (~line 154). The painted
  //    result is identical: when the author supplies min/max they pass through; otherwise derive from
  //    the data extents; maxYear≤minYear is bumped to min+1 to avoid the divide-by-zero in yearToX. ──
  const years = [...topRaw, ...bottomRaw]
    .flatMap((e) => [e.start, e.end])
    .filter(isNum) as number[];
  const minYear = isNum(input.minYear) ? input.minYear : years.length ? Math.min(...years) : 2024;
  let maxYear = isNum(input.maxYear) ? input.maxYear : years.length ? Math.max(...years) : 2030;
  if (maxYear <= minYear) {
    maxYear = minYear + 1;
    counters.axisGuarded = true;
  }

  const yearToX = (year: number) => BAR_AREA_X + ((year - minYear) / (maxYear - minYear)) * BAR_AREA_W;

  // ── Accent resolution (C8) — invalid/missing → a valid fallback, surfaced. ──
  let topAccent: RangesAccent = DEFAULT_TOP_ACCENT;
  if (isAccent(input.topAccent)) topAccent = input.topAccent;
  else if (input.topAccent !== undefined) counters.invalidAccents += 1;
  let bottomAccent: RangesAccent = DEFAULT_BOTTOM_ACCENT;
  if (isAccent(input.bottomAccent)) bottomAccent = input.bottomAccent;
  else if (input.bottomAccent !== undefined) counters.invalidAccents += 1;

  // ── Per-entry geometry (C2) + label fit-or-hide (C8). ──
  const planLane = (raw: RangeEntryInput[], laneY: number, prefix: string): RangesPlanEntry[] =>
    raw.map((e, i) => {
      const label = typeof e.label === "string" ? e.label : "";
      const start = isNum(e.start) ? e.start : minYear;
      const end = isNum(e.end) ? e.end : start;
      const x = yearToX(start);
      // Min bar width 0 — a zero or reversed (start>end) span never produces a negative width (C8).
      const w = Math.max(0, yearToX(end) - x);
      const y = laneY + i * ROW_HEIGHT;
      const labelY = y + BAR_HEIGHT / 2 + 7;
      // Fit-or-hide: a label estimated wider than the left column at 22px (or over the absurd-length
      // cap) is hidden entirely rather than bleeding into the bar area. estW is @26px → scale to 22px.
      const fits = [...label].length <= MAX_LABEL_CHARS && estW(label) * LABEL_FONT_SCALE <= LABEL_FIT_WIDTH;
      const showLabel = label.length === 0 ? true : fits;
      if (label.length > 0 && !fits) counters.labelsHidden += 1;
      return {
        id: typeof e.id === "string" ? e.id : `${prefix}${i}`,
        label,
        start,
        end,
        openEnd: e.openEnd === true,
        x,
        w,
        y,
        labelY,
        showLabel,
        openEndX: yearToX(end) + OPEN_END_OFFSET,
      };
    });

  const topEntries = planLane(topRaw, TOP_LANE_Y, "t");
  const bottomEntries = planLane(bottomRaw, BOTTOM_LANE_Y, "b");

  // ── Ticks (C5) — every 5 years from minYear+1 (verbatim from the legacy loop). ──
  const ticks: number[] = [];
  for (let y = minYear + 1; y <= maxYear; y += 5) {
    if (y >= minYear && y <= maxYear) ticks.push(y);
  }

  // ── marketLine (C7) — x derived from the year; null when absent. The label/year text placement is
  //    edge-fit (PL-0.11) so its box can never exit the viewBox; the line MARK stays at the true x. ──
  const ml = input.marketLine;
  let marketLine: RangesMarketLine | null = null;
  if (ml && isNum(ml.year)) {
    const label = typeof ml.label === "string" ? ml.label : "";
    const x = yearToX(ml.year);
    const placed = placeMarketLabel(x, label);
    marketLine = { year: ml.year, label, x, labelX: placed.labelX, labelAnchor: placed.anchor };
  }

  return {
    minYear,
    maxYear,
    barAreaX: BAR_AREA_X,
    barAreaW: BAR_AREA_W,
    topLaneY: TOP_LANE_Y,
    bottomLaneY: BOTTOM_LANE_Y,
    yearToX,
    topGroupLabel: typeof input.topGroupLabel === "string" ? input.topGroupLabel : "",
    bottomGroupLabel: typeof input.bottomGroupLabel === "string" ? input.bottomGroupLabel : "",
    topAccent,
    bottomAccent,
    topEntries,
    bottomEntries,
    ticks,
    marketLine,
    dropped: counters,
  };
}

// ── Axis tick LABEL clamp (PL-0.9) — keep a tick label inside the viewBox right/left edge ────────
// A middle-anchored axis tick label centered at the viewBox edge (e.g. maxYear landing exactly at
// barAreaX+barAreaW = x980, only 20px from the 1000-wide viewBox edge) spills its half-width past the
// edge and is flagged as a clip (the agi-timelines repro: "2055" clipped +14px). This clamps the
// label's x so its rendered box stays inside [pad, VIEW_W-pad], keeping the tick MARK at the true x.
// It is a NO-OP for every label whose centered box already fits (every shipping/baseline fixture's
// ticks sit well inside the edges) → byte-identical for content that fits; only an edge tick is nudged
// inward. estW is calibrated @26px; scale to the axis-label font and halve for the centered half-width.
const AXIS_TICK_FONT_SCALE = AXIS_LABEL_FONT / 26;
const TICK_EDGE_PAD = 4; // px breathing room from the viewBox edge
export function clampTickLabelX(year: number, yearToX: (y: number) => number, label: string): number {
  const x = yearToX(year);
  const halfW = (estW(label) * AXIS_TICK_FONT_SCALE) / 2;
  const lo = halfW + TICK_EDGE_PAD;
  const hi = VIEW_W - halfW - TICK_EDGE_PAD;
  return Math.min(Math.max(x, lo), hi);
}

// ── marketLine LABEL edge-fit (PL-0.11) — same edge-clamp discipline as the axis tick clamp, but for
// the START-anchored marketLine label + year (which extend RIGHT from marketLine.x + 12). When the
// marketLine sits near the right edge (e.g. at maxYear = the right plot edge x980), that start-anchored
// label spills far past the 1000-wide viewBox (the agi-timelines repro: "RESEARCHER SURVEY" clipped
// +99px). The MARK stays at its true x; only the LABEL moves: if the start-anchored box would breach the
// right edge, FLIP to end-anchor on the OTHER side of the line (extends LEFT), then clamp so neither edge
// exits [pad, VIEW_W-pad]. The label is uppercased + tracked (0.18em) downstream, so the width estimate
// uppercases and adds the inter-char tracking (estW alone — char advance @26px — would under-count both).
// NO-OP for a mid-axis marketLine whose label already fits to the right (every shipping fixture: 108
// "AGGREGATED MARKETS" ends ~x841, 109 "MARKET MEDIAN" ~x788 — both well inside) → byte-identical there.
const MARKET_LABEL_DX = 12; // the label's x offset from the marketLine (matches the legacy +12)
const MARKET_LABEL_FONT_SCALE = AXIS_LABEL_FONT / 26; // estW @26px → the 24px marketLine label
const MARKET_LABEL_TRACKING = 0.18 * AXIS_LABEL_FONT; // 0.18em letterSpacing → px per inter-char gap
const MARKET_LABEL_EDGE_PAD = 6; // px breathing room from the viewBox edge

/** Estimated rendered advance (px) of the UPPERCASED, 0.18em-tracked marketLine label. */
function marketLabelWidth(label: string): number {
  const upper = label.toUpperCase();
  const chars = [...upper].length;
  return estW(upper) * MARKET_LABEL_FONT_SCALE + Math.max(0, chars - 1) * MARKET_LABEL_TRACKING;
}

/** Place the marketLine label (+ year) so its rendered box never exits the viewBox (PL-0.11). */
export function placeMarketLabel(x: number, label: string): { labelX: number; anchor: "start" | "end" } {
  const w = marketLabelWidth(label);
  // Start-anchored to the RIGHT of the line (the legacy default) — keep it if its right edge fits.
  if (x + MARKET_LABEL_DX + w <= VIEW_W - MARKET_LABEL_EDGE_PAD) {
    return { labelX: x + MARKET_LABEL_DX, anchor: "start" };
  }
  // Flip to the LEFT of the line (end-anchored). Clamp the anchor x so BOTH the right edge (anchorX)
  // and the left edge (anchorX - w) stay inside [pad, VIEW_W - pad].
  const anchorX = Math.min(
    Math.max(x - MARKET_LABEL_DX, w + MARKET_LABEL_EDGE_PAD),
    VIEW_W - MARKET_LABEL_EDGE_PAD,
  );
  return { labelX: anchorX, anchor: "end" };
}

// ── Animation (pure — never geometry) ──────────────────────────────────────────────────────────
// The lane reveal is per-row opacity from the lane's 0..1 reveal prop. Reproduces the legacy
// `laneItemOpacity` EXACTLY (byte-identical motion) — geometry is pure-from-DATA, so this only drives
// opacity, never the layout box.
export function laneItemOpacity(laneReveal: number, i: number, n: number): number {
  if (n <= 0) return Math.max(0, Math.min(1, laneReveal));
  const start = (i / n) * 0.6;
  const span = 0.6 / n + 0.4;
  return Math.max(0, Math.min(1, (laneReveal - start) / span));
}
