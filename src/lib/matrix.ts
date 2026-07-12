// PL-4.3 — ComparisonMatrix plan (the `matrix` viz): the pure brain for the 2×2 decision matrix.
// Cell content resolution, accent mapping + clamp, the delta fit-or-hide decision, the value
// overflow flag, focus/dim logic, highlight resolution, and the reveal easing — all decided ONCE,
// from DATA only (never from `t`). Pure and dependency-free except `estW` (the shared char-class
// width estimate from stack.ts), so the deterministic gate (tools/qa-matrix.mjs) can unit-test it
// without a DOM via Node's native type stripping (mirrors stack.ts / tiers.ts / line.ts).
//
// Single source of truth for the matrix render: PostRenderer → ComparisonMatrix and the checks share
// this one brain. The RETROFIT contract (handoff §1) is byte-identity — so the resolution here MUST
// reproduce the legacy component's painted decisions exactly on in-spec input: delta shows iff it is a
// non-empty string (the legacy `data.delta && (…)` guard), the value is always rendered (FitLine shrinks
// it), accents pass through. The defensive clamps (missing/extra cells, INVALID accents, an ABSURDLY
// long delta) are no-ops on every shipping/in-spec input and only fire on degenerate data.
//
// Numbered constraints (handoff §2A — lifted from the component header into a spec):
//   C1  FIXED 3×3 grid (row1 = col headers, col1 = row headers, 2×2 = data cells) — 9 cells, never
//       more/fewer; layout reserved from Beat 1 (node count constant across t).
//   C2  col + row headers: 26px (eyebrow) mono uppercase.
//   C3  delta: 22px (chartSeriesSubtitle) mono uppercase — the mobile floor (=22).
//   C4  value: 64px (display semibold) at rest; the mobile floor is 40 (FitLine never shrinks an
//       in-spec value below it; an over-long value is FLAGGED, not silently shrunk past the floor).
//   C5  grid gap 16px; cell padding 24px (the component's CSS — unchanged by the retrofit).
//   C6  delta fit-or-hide: an empty / whitespace / absurdly-long (> MAX_DELTA_CODEPOINTS) delta is
//       hidden ENTIRELY (no bleed); a hidden delta is surfaced via a counter, never silent.
//   C7  accent resolution: an unknown/missing cell or row accent → a valid fallback (never undefined,
//       never an invalid key); surfaced via a counter.
//   C8  focus/highlight: cellDim dims non-focused cells to focusLockOpacity; an invalid focus/highlight
//       key is treated as none (no false ring / no spurious dim).

import { estW } from "./stack.ts";

export type MatrixAccent = "cyan" | "amber" | "violet" | "mint" | "burnt";
export type MatrixFocusKey = "tl" | "tr" | "bl" | "br" | null;

export const ACCENTS: MatrixAccent[] = ["cyan", "amber", "violet", "mint", "burnt"];
const DEFAULT_CELL_ACCENT: MatrixAccent = "cyan";
const DEFAULT_ROW_ACCENTS: [MatrixAccent, MatrixAccent] = ["cyan", "burnt"];

// Constants (C2–C6). Source pixels (the 1080-wide canvas); the gate reads the effective rendered size.
export const HEADER_FONT = 26; // C2 — design token text.eyebrow
export const DELTA_FONT = 22; // C3 — design token text.chartSeriesSubtitle (== the mobile floor)
export const VALUE_FONT = 64; // C4 — at-rest value size
export const VALUE_MIN_FONT = 40; // C4 — value mobile floor
export const MAX_DELTA_CODEPOINTS = 48; // C6 — beyond this a delta is absurd → hidden (no in-spec delta is this long)
// A data cell's inner content width (≈366px box − 2×24px padding ≈ 318px). A value whose estimated
// advance at 64px exceeds this gets FLAGGED valueOverflowRisk (the renderer FitLine-shrinks it; the
// gate then exempts it from the C4 floor). estW is calibrated @26px → scale to the 64px value size.
const CELL_CONTENT_WIDTH = 318; // C5-derived (≈366 − 48)
const VALUE_FONT_SCALE = VALUE_FONT / 26;

const isAccent = (a: unknown): a is MatrixAccent => typeof a === "string" && (ACCENTS as string[]).includes(a);

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

type RawCell = { value?: string; delta?: string; accent?: unknown } | undefined;

export type MatrixDeltaHideReason = "empty" | "tooLong";

export type MatrixPlanCell = {
  /** Cell value, passed through verbatim (the renderer FitLine-shrinks it; never hidden). */
  value: string;
  /** Resolved accent (always a valid key — C7). */
  accent: MatrixAccent;
  /** Raw delta string (may be absent). */
  delta?: string;
  /** Delta shown iff it is a non-empty string ≤ MAX_DELTA_CODEPOINTS (legacy guard + C6). */
  showDelta: boolean;
  /** Present iff showDelta is false — lets the gate assert WHY (never silent). */
  deltaHideReason?: MatrixDeltaHideReason;
  /** True when the value is estimated to exceed the cell content width at 64px (FitLine will shrink it). */
  valueOverflowRisk: boolean;
};

export type MatrixPlan = {
  rowHeaders: [string, string];
  colHeaders: [string, string];
  rowAccents: [MatrixAccent, MatrixAccent];
  cells: { tl: MatrixPlanCell; tr: MatrixPlanCell; bl: MatrixPlanCell; br: MatrixPlanCell };
  /** Resolved highlight key — a valid cell key or null (C8). */
  highlightCell: Exclude<MatrixFocusKey, null> | null;
  dropped: {
    /** Cells that were missing in the input (defaulted to an empty value) — C7/defensive. */
    missingCells: number;
    /** Cell or row accents that were missing/invalid and fell back — C7. */
    invalidAccents: number;
    /** Deltas hidden by the fit-or-hide decision — C6 (surfaced, never silent). */
    deltasHidden: number;
  };
};

export type PlanMatrixInput = {
  rowHeaders?: [string, string] | string[];
  colHeaders?: [string, string] | string[];
  rowAccents?: [unknown, unknown] | unknown[];
  tl?: RawCell;
  tr?: RawCell;
  bl?: RawCell;
  br?: RawCell;
  highlightCell?: string | null;
};

function planCell(
  raw: RawCell,
  counters: { missingCells: number; invalidAccents: number; deltasHidden: number },
): MatrixPlanCell {
  if (raw == null) counters.missingCells += 1;
  const value = typeof raw?.value === "string" ? raw.value : "";
  let accent: MatrixAccent;
  if (isAccent(raw?.accent)) accent = raw.accent;
  else {
    accent = DEFAULT_CELL_ACCENT;
    if (raw?.accent !== undefined) counters.invalidAccents += 1;
  }

  // Delta fit-or-hide (C6) — reproduces the legacy `data.delta && (…)` guard for in-spec deltas
  // (a non-empty string shows); only an empty/whitespace or absurdly-long delta is hidden.
  const delta = typeof raw?.delta === "string" ? raw.delta : undefined;
  const trimmed = (delta ?? "").trim();
  let deltaHideReason: MatrixDeltaHideReason | undefined;
  if (trimmed.length === 0) deltaHideReason = "empty";
  else if ([...trimmed].length > MAX_DELTA_CODEPOINTS) deltaHideReason = "tooLong";
  const showDelta = deltaHideReason === undefined;
  if (!showDelta && delta !== undefined && trimmed.length > 0) counters.deltasHidden += 1;

  // Value overflow flag (C4) — estimate the 64px advance from the @26 char-class table.
  const valueOverflowRisk = value.length > 0 && estW(value) * VALUE_FONT_SCALE > CELL_CONTENT_WIDTH;

  return { value, accent, delta, showDelta, valueOverflowRisk, ...(showDelta ? {} : { deltaHideReason }) };
}

function pair(p: readonly unknown[] | undefined): [string, string] {
  return [typeof p?.[0] === "string" ? (p[0] as string) : "", typeof p?.[1] === "string" ? (p[1] as string) : ""];
}

export function planMatrix(input: PlanMatrixInput = {}): MatrixPlan {
  const counters = { missingCells: 0, invalidAccents: 0, deltasHidden: 0 };

  const rowHeaders = pair(input.rowHeaders);
  const colHeaders = pair(input.colHeaders);

  const rowAccents: [MatrixAccent, MatrixAccent] = [DEFAULT_ROW_ACCENTS[0], DEFAULT_ROW_ACCENTS[1]];
  const rawRowAccents = input.rowAccents;
  for (let i = 0; i < 2; i++) {
    const a = rawRowAccents?.[i];
    if (isAccent(a)) rowAccents[i] = a;
    else if (a !== undefined) counters.invalidAccents += 1;
  }

  const cells = {
    tl: planCell(input.tl, counters),
    tr: planCell(input.tr, counters),
    bl: planCell(input.bl, counters),
    br: planCell(input.br, counters),
  };

  const hk = input.highlightCell;
  const highlightCell = hk === "tl" || hk === "tr" || hk === "bl" || hk === "br" ? hk : null;

  return { rowHeaders, colHeaders, rowAccents, cells, highlightCell, dropped: counters };
}

// ── Animation (pure functions — never geometry) ───────────────────────────────────────────────
// The matrix reveal is per-cell opacity + a bounded scale/translate (the legacy Cell used
// `scale = 0.96 + reveal*0.04`, `translateY((1-reveal)*10)`). The reveal ARG is the per-cell appear
// progress PostRenderer already computes via `appear(t, start, dur)`; this module exposes the identity
// easing so render and gate agree, plus the focus-dim arithmetic (C8). Geometry is pure-from-DATA, so
// these only drive opacity/transform — never the layout box.

/** Reveal easing for a cell, given its appear progress r ∈ [0,1]. Identity (pinned 0/1) — the legacy
 *  Cell consumed `reveal` directly for opacity, so this keeps render byte-identical. */
export function cellReveal(r: number): number {
  return clamp01(r);
}

/** Dim factor for a cell during focus lock (C8): 1 when nothing is focused or this is the focused
 *  cell, else focusLockOpacity. An invalid focus key is treated as no focus. */
export function cellDim(focusOn: string | null, cellKey: Exclude<MatrixFocusKey, null>, focusLockOpacity: number): number {
  const valid = focusOn === "tl" || focusOn === "tr" || focusOn === "bl" || focusOn === "br";
  if (!valid) return 1;
  return focusOn === cellKey ? 1 : focusLockOpacity;
}
