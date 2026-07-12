// PL-1.3 — DecompBar stack plan: segment-count clamp, legacy normalization, sliver floor,
// and the label show/hide decision (the latent label-bleed defect fix). Pure and
// dependency-free (mirrors countup.ts / ring.ts) so the deterministic check suite
// (tools/qa-decompbar.mjs) can unit-test it without a DOM via Node's native type stripping.
//
// Single source of truth for the `stack` viz: the renderer (PostRenderer → DecompBar) and
// the checks share this one deterministic brain. Everything here is decided ONCE, from DATA
// only (never from `t`) — rendered fractions sum to 1 ± 1e-6, each ∈ {0} ∪ [0.02, 1], and
// label presence is constant across the whole timeline.
// Spec: planning/primitive-library/handoffs/PL-1.3-decompbar-grow.md §2.5.2 / C1–C4.
//
// Rev B (handoff §7 — Emil's motion feedback): the grow timing also lives here, as pure
// functions — ONE eased leading edge `stackEdge(t)` sweeps the bar left→right over
// t ∈ [0.34, 0.62]; each segment's fill progress `segmentGrow(t, start, fraction)` is
// derived from where the edge sits, so a segment starts growing exactly when the edge
// touches its left boundary (chained continuous-edge build — never overlapping staggers);
// `labelStampT(end)` bisection-inverts the edge so a label stamps in exactly when its
// segment completes. DecompBar consumes these; tools/qa-decompbar.mjs unit-tests them
// without a DOM.

export type LabelHideReason =
  | "empty" // no label provided (or whitespace only)
  | "tooLong" // > 12 code points — never truncated/abbreviated, hidden entirely (C4)
  | "tooThin"; // fraction < max(0.06, (estW + 24) / 904) — today this label would bleed into neighbors

export type StackPlanSegment<C> = {
  /** Rendered fraction of the track — ∈ {0} ∪ [0.02, 1]; positive fractions sum to 1 ± 1e-6. */
  fraction: number;
  /** The raw color key, passed through untouched (missing/unknown → accentHex defaults to cyan, C12). */
  colorKey: C | undefined;
  label?: string;
  /** Inside label shown iff trimmed length ∈ [1, 12] code points AND the segment fits it (C4). */
  showLabel: boolean;
  /** Present iff showLabel is false — lets the check suite assert WHY a label was hidden. */
  hideReason?: LabelHideReason;
};

const MAX_SEGMENTS = 5; // C1 — existing slice(0, 5) clamp stands
const SLIVER_FLOOR = 0.02; // C3 — 0.02 × 904px track ≈ 18px, the system's visibility floor
const MAX_LABEL_CODEPOINTS = 12; // C4
const MIN_LABEL_FRACTION = 0.06; // C4
const LABEL_PADDING = 24; // C4 — 2 × 12px nominal inside padding
const TRACK_WIDTH = 904; // Panel content width at Path A's portrait layout (§2.1)

// Per-char advance estimate for Space Grotesk 600 at the Path A label size — §2.5.2
// char-class table (px @ 26px: narrow 9 / caps+digits 18 / wide 22 / default 14).
// Deliberately conservative; the rendered truth is still gated by the measured
// label-fits-segment check, and C5 containment makes even an estimate miss non-bleeding.
const NARROW = new Set([..."ijltfr1.,:;'’! |"]); // 0.346em
const WIDE = new Set([..."mwMW%@&—"]); // 0.846em
const PX_NARROW = 9;
const PX_CAPS_DIGITS = 18; // A–Z (excl. M W), 0 and 2–9 — 0.692em
const PX_WIDE = 22;
const PX_DEFAULT = 14; // 0.538em

/** Estimated advance width (px @ 26) of a label, by char class — §2.5.2 step 4. */
export function estW(label: string): number {
  let w = 0;
  for (const ch of label) {
    if (NARROW.has(ch)) w += PX_NARROW;
    else if (WIDE.has(ch)) w += PX_WIDE;
    else if (/[A-Z02-9]/.test(ch)) w += PX_CAPS_DIGITS;
    else w += PX_DEFAULT;
  }
  return w;
}

export function planStack<C>(
  rawSegments: ReadonlyArray<{ width: number; color?: C; label?: string }>,
): StackPlanSegment<C>[] {
  // 1. Count clamp (C1).
  const segs = rawSegments.slice(0, MAX_SEGMENTS);

  // 2. Legacy normalization, verbatim (NaN > 0 is false ⇒ NaN/negative become 0; zero
  //    stays zero; all-zero keeps total ‖ 1 — never a division by zero).
  const widths = segs.map((s) => (s.width > 0 ? s.width : 0));
  const total = widths.reduce((sum, w) => sum + w, 0) || 1;
  const fractions = widths.map((w) => w / total);

  // 3. Sliver floor (C3): fractions in (0, 0.02) are raised to exactly 0.02 and PINNED; the
  //    deficit is redistributed proportionally among the remaining positive segments. Each
  //    pass permanently pins ≥1 segment, so the fixpoint terminates in ≤5 passes (≤5
  //    segments). Sum stays 1 ± 1e-6 (C2). For inputs with no slivers this loop is a no-op
  //    and the output equals the legacy normalization exactly.
  const pinned = fractions.map(() => false);
  for (let pass = 0; pass < MAX_SEGMENTS; pass++) {
    const tiny = fractions.map((f, i) => !pinned[i] && f > 0 && f < SLIVER_FLOOR);
    if (!tiny.some(Boolean)) break;
    tiny.forEach((isTiny, i) => {
      if (isTiny) {
        fractions[i] = SLIVER_FLOOR;
        pinned[i] = true;
      }
    });
    const others = fractions.map((f, i) => !pinned[i] && f > 0);
    const sumPinned = pinned.filter(Boolean).length * SLIVER_FLOOR;
    const sumOthers = fractions.reduce((s, f, i) => s + (others[i] ? f : 0), 0);
    if (sumOthers <= 0) {
      // Degenerate all-tiny case (unreachable with ≤5 post-normalization segments — at
      // least one fraction is ≥ 1/5 — kept as the spec's §2.5.2 guard): equal shares.
      const positives = fractions.map((f) => f > 0);
      const n = positives.filter(Boolean).length || 1;
      positives.forEach((isPos, i) => {
        if (isPos) fractions[i] = 1 / n;
      });
      break;
    }
    const scale = (1 - sumPinned) / sumOthers;
    others.forEach((isOther, i) => {
      if (isOther) fractions[i] *= scale;
    });
  }

  // 4. Label decision (C4) — the latent-defect fix: a label that doesn't provably fit its
  //    segment is hidden ENTIRELY (no truncation, no abbreviation, no outside placement).
  return segs.map((s, i) => {
    const fraction = fractions[i];
    const trimmed = (s.label ?? "").trim();
    let hideReason: LabelHideReason | undefined;
    if (trimmed.length === 0) hideReason = "empty";
    else if ([...trimmed].length > MAX_LABEL_CODEPOINTS) hideReason = "tooLong";
    else if (fraction < Math.max(MIN_LABEL_FRACTION, (estW(trimmed) + LABEL_PADDING) / TRACK_WIDTH))
      hideReason = "tooThin";
    const showLabel = hideReason === undefined;
    return { fraction, colorKey: s.color, label: s.label, showLabel, ...(showLabel ? {} : { hideReason }) };
  });
}

// ─── Rev B (§7): chained continuous-edge build timing ────────────────────────────────────
// One eased edge E(t) = chartGrow(clamp01((t − 0.34) / 0.28)) sweeps the whole bar; segment
// progress is DERIVED from the edge: g_i(t) = clamp01((E − start_i) / f_i). By construction,
// at any t the segments left of the edge are complete, those right of it are at 0, and AT
// MOST ONE is mid-grow — total painted fill width = E(t) × track width (the edge never
// jumps or pauses). The wrapper fade [0.30, 0.36] and the 0.62 metric-row handover stand.

/** The edge build window on the global `t` — fills end exactly as the metric counts start. */
export const EDGE_START = 0.34;
export const EDGE_END = 0.62;
/** Label stamp fade duration (label i fades over [tStar_i, tStar_i + LABEL_STAMP_DUR]) —
 *  last label done at 0.62 + 0.06 = 0.68 ≤ 0.85 settle deadline. */
export const LABEL_STAMP_DUR = 0.06;
const EDGE_DUR = EDGE_END - EDGE_START; // 0.28

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// cubic-bezier(0.65, 0, 0.35, 1) — easeInOutCubic, `motionRole.chartGrow`. Implemented
// locally (standard CSS cubic-bezier evaluation, x→t solved by 40-step bisection on the
// monotone x-polynomial) so this module stays dependency-free for Node unit-testing;
// DecompBar consumes THESE functions, so render and check share one implementation.
const X1 = 0.65;
const X2 = 0.35;
const Y1 = 0;
const Y2 = 1;
const bez = (p: number, a1: number, a2: number) =>
  (((1 - 3 * a2 + 3 * a1) * p + (3 * a2 - 6 * a1)) * p + 3 * a1) * p;

function chartGrowEase(x: number): number {
  if (x <= 0) return 0; // pinned — a bezier evaluation can never leave a ≠0/≠1 frame
  if (x >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (bez(mid, X1, X2) < x) lo = mid;
    else hi = mid;
  }
  return bez((lo + hi) / 2, Y1, Y2);
}

/** The leading edge E(t) ∈ [0, 1] — eased position of the build front along the track. */
export function stackEdge(t: number): number {
  return chartGrowEase(clamp01((t - EDGE_START) / EDGE_DUR));
}

/**
 * Fill progress g ∈ [0, 1] for the segment spanning [start, start + fraction] of the track.
 * Starts growing exactly when the edge touches `start`; complete when the edge reaches
 * `start + fraction`. Pinned to EXACT 0/1 outside its window (C11 — DecompBar omits the
 * transform entirely at g === 1); zero-width segments are g = 1 (no 0/0 NaN).
 */
export function segmentGrow(t: number, start: number, fraction: number): number {
  if (t >= EDGE_END || fraction <= 0) return 1;
  const e = stackEdge(t);
  if (e >= start + fraction) return 1;
  if (e <= start) return 0;
  return clamp01((e - start) / fraction);
}

/**
 * tStar — the `t` at which the edge reaches track position `end` (E(tStar) = end), i.e.
 * when the segment ending there completes and its label stamps in. Deterministic bisection
 * of the eased edge over the window, fixed 24 iterations (precision 0.28 / 2²⁴ ≈ 1.7e-8 in
 * `t`). The last segment (end = 1 ± 1e-6) returns EDGE_END exactly.
 */
export function labelStampT(end: number): number {
  if (end >= 1 - 1e-6) return EDGE_END;
  if (end <= 0) return EDGE_START;
  let lo = EDGE_START;
  let hi = EDGE_END;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (stackEdge(mid) < end) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
