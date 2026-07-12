// PL-2.3 — Donut / radial proportion plan: the pure "donut brain" shared by the renderer
// (PostRenderer → Donut) and the deterministic check suite (tools/qa-donut.mjs). Like
// stack.ts / bars.ts it is dependency-light (only estW from stack.ts + accentForIndex/
// formatValue from bars.ts — REUSED, never duplicated) so Node's native type-stripping can
// unit-test it without a DOM.
//
// `donut` is the RADIAL composition of ONE whole into a FEW parts — N segments as arcs around
// a ring, normalized so the arcs sum to a full turn (it IS a proportion). It is the radial
// sibling of `stack`/DecompBar (same data shape: sum-to-1, ≤N cap, 0.02 sliver floor, label
// fit-or-hide) — the planStack normalization/sliver discipline mapped to ARC ANGLES instead of
// widths, plus the StatHero ring-sweep timing discipline (a continuous-edge sweep, shared as
// pure functions so render + check agree).
//
// Everything here is decided ONCE, from DATA only (never from `t`): rendered fractions sum to
// 1 ± 1e-6, each ∈ {0} ∪ [0.02, 1]; the cumulative start/sweep angles, the outside-label
// anchors + show/hide, and the center headline are all pure functions of the input.
// Spec: planning/primitive-library/handoffs/PL-2.3-donut.md §2 / §4 / §6 (rulings §3).

import { estW } from "./stack.ts";
import { accentForIndex, formatValue, type AccentKey } from "./bars.ts";

// ── Fixed viewBox geometry (source px) — §4 ──────────────────────────────────────────────────
export const VIEW = 640;
export const CX = 320;
export const CY = 320;
export const RING_OUTER_R = 230; // outer radius; leaves a 90px margin each side for outside labels
export const RING_STROKE = 64; // ring band thickness; → 23.1px @390 (≫ the 3px stroke floor)
export const RING_R = RING_OUTER_R - RING_STROKE / 2; // 198 — stroke centerline = the arc <circle> r
export const RING_INNER_R = RING_OUTER_R - RING_STROKE; // 166 — hole radius
export const RING_C = 2 * Math.PI * RING_R; // ≈ 1244.07 — the dasharray base (StatHero RING_C analog)
export const SEG_GAP_DEG = 2; // a small gap between adjacent segments so wedge boundaries read

// ── Counts / sliver / fit (§4) ────────────────────────────────────────────────────────────────
export const MAX_SEGMENTS = 6; // a ring has 360° to spread parts; 6 readable wedges is the ceiling
export const MIN_FRACTION = 0.02; // radial planStack sliver floor (0.02 × 360° = 7.2°)
export const SEG_NAME_MAX_CP = 14; // name fit-or-hide codepoint cap
export const SEG_VALUE_MAX_CP = 6; // value like "100%" / "2.5k" — short by construction
export const LABEL_RADIAL_OFFSET = 26; // px beyond RING_OUTER_R → outside-label anchor radius R = 256

// ── Mobile floors (memory feedback_mobile_first_sizing, ÷2.77) — §4 ─────────────────────────────
export const SEG_NAME_PX = 24; // sans name (8.7px @390)
export const SEG_VALUE_PX = 26; // mono value (9.4px @390)
export const CENTER_PX = 92; // FitLine zoom-to-fit hero (33px @390) — StatHero RING_FONT analog
export const CENTER_CAP_PX = 22; // mono uppercase caption (7.9px @390)
export const CENTER_TEXT_W = 280; // FitLine box inside the hole (chord ≈ 300px)

// ── Emphasis / focus (PL-4.2 knob #4 — OPACITY-ONLY "this slice is the story") ─────────────────
// When `emphasis` names a wedge, the focused wedge stays FULL opacity/accent and the others dim to
// DIM_OPACITY (a paint-only de-emphasis — NO geometry change, NO radial explode). The matrix
// focus-lock uses 0.7 for TEXT-bearing cells (legibility); a donut wedge is pure colour mass, so a
// firmer 0.32 makes the focus read decisively while staying clearly above the 0.10 track ring.
// DEFAULT (no `emphasis`) ⇒ every wedge dim:false ⇒ full opacity ⇒ byte-identical to today.
export const DIM_OPACITY = 0.32;

// ── Animation timing (§5; sweep-on, reuse PL-1.2) ──────────────────────────────────────────────
export const SWEEP_START = 0.34;
export const SWEEP_DUR = 0.3; // ring fully drawn at t = 0.64
export const SETTLE_DEADLINE = 0.85;
export const LABEL_STAMP_DUR = 0.06;
export const SWEEP_END = SWEEP_START + SWEEP_DUR; // 0.64
const CENTER_START = 0.3;
const CENTER_DUR = 0.2; // center settles by 0.50

// estW() is calibrated at 26px (stack.ts). Outside names render at SEG_NAME_PX → scale the estimate.
const EST_SCALE = SEG_NAME_PX / 26;
const estPxAt = (s: string) => estW(s) * EST_SCALE;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

export type DonutPlanSegment = {
  /** ∈ {0} ∪ [0.02, 1]; positive fractions sum to 1 ± 1e-6. */
  fraction: number;
  /** Cumulative start (fraction-of-ring, 0 = 12 o'clock, clockwise). */
  startFrac: number;
  startAngleDeg: number; // startFrac × 360
  sweepAngleDeg: number; // fraction × 360 (gap applied at paint time, not here)
  accentKey: AccentKey;
  label?: string;
  showName: boolean;
  nameHideReason?: "empty" | "tooLong" | "tooThin";
  valueText: string;
  showValue: boolean;
  valueHideReason?: "off" | "empty" | "tooLong";
  labelAngleDeg: number; // mid-angle anchor for the outside block (0 = 12 o'clock, CW)
  /** PL-4.2 emphasis: true ⇒ this wedge is de-emphasized (paints at DIM_OPACITY). Default false. */
  dim: boolean;
};

export type DonutPlan = {
  segments: DonutPlanSegment[];
  center: { value: string; caption?: string; show: boolean };
  valueLabels: "auto" | "off";
  unit: string;
  dropped: { segmentsDropped: number; hiddenLabels: number };
  empty: boolean;
  singleFull: boolean;
  /** PL-4.2 emphasis: the resolved focused-wedge index (post-sort/post-cap), or null = no emphasis. */
  emphasisIndex: number | null;
};

export type PlanDonutInput = {
  segments?: { label?: string; value?: number; accent?: string }[];
  centerLabel?: string;
  centerValue?: string;
  valueLabels?: string;
  centerTotal?: string;
  unit?: string;
  /** PL-4.2 emphasis: index (post-sort) of the ONE wedge to spotlight; others dim. Out-of-range ⇒ none. */
  emphasis?: number;
};

/**
 * The pure donut layout brain. Coerces knobs, normalizes values → fractions (reusing the
 * planStack contract), caps + downsamples (≤6, surfaced), applies the radial sliver floor,
 * derives cumulative start/sweep angles from 12 o'clock clockwise, decides every label
 * show/hide + mid-angle anchor, and derives the center headline — all from DATA, never `t`.
 */
export function planDonut(input: PlanDonutInput): DonutPlan {
  // 1. Coerce knobs (unknown → default).
  const valueLabels: "auto" | "off" = input.valueLabels === "off" ? "off" : "auto";
  const centerTotal: "on" | "off" = input.centerTotal === "off" ? "off" : "on";
  const unit = typeof input.unit === "string" ? input.unit : "";

  const dropped = { segmentsDropped: 0, hiddenLabels: 0 };

  // 2. Normalize raw segments: clamp negatives/NaN → 0 (planStack legacy normalization).
  const rawSegs = Array.isArray(input.segments) ? input.segments : [];
  type NormSeg = { label: string; value: number; accent?: string; order: number };
  let segs: NormSeg[] = rawSegs.map((s, i) => ({
    label: typeof s?.label === "string" ? s.label : "",
    value: isNum(s?.value) && s!.value! > 0 ? s!.value! : 0,
    accent: typeof s?.accent === "string" ? s.accent : undefined,
    order: i,
  }));

  // Raw total BEFORE the cap (for a derived center total that reflects the whole input).
  const rawTotal = segs.reduce((sum, s) => sum + s.value, 0);

  // 3. Sort by value desc so the cap keeps the LARGEST shares (a donut reads largest-first);
  //    stable for ties (author order preserved).
  segs = segs
    .map((s) => ({ s, key: s.value }))
    .sort((a, b) => b.key - a.key || a.s.order - b.s.order)
    .map((x) => x.s);

  // 4. Cap segments (≤6) + surface the drop.
  if (segs.length > MAX_SEGMENTS) {
    dropped.segmentsDropped = segs.length - MAX_SEGMENTS;
    segs = segs.slice(0, MAX_SEGMENTS);
  }

  const center = deriveCenter(input, centerTotal, unit, rawTotal);

  // Empty state: 0 renderable segments OR sum 0 / all-zero.
  const positiveCount = segs.filter((s) => s.value > 0).length;
  if (segs.length === 0 || positiveCount === 0) {
    return {
      segments: [],
      center,
      valueLabels,
      unit,
      dropped,
      empty: true,
      singleFull: false,
      emphasisIndex: null,
    };
  }

  // 5. Sum-to-1 normalization (planStack contract).
  const total = segs.reduce((sum, s) => sum + s.value, 0) || 1;
  const fractions = segs.map((s) => s.value / total);

  // 6. Sliver-floor fixpoint (planStack verbatim, radial): fractions in (0, 0.02) raised to 0.02
  //    and PINNED; surplus redistributed proportionally among the remaining positive segments.
  //    ≤6 passes; sum stays 1 ± 1e-6; no-op when there are no slivers.
  const pinned = fractions.map(() => false);
  for (let pass = 0; pass < MAX_SEGMENTS; pass++) {
    const tiny = fractions.map((f, i) => !pinned[i] && f > 0 && f < MIN_FRACTION);
    if (!tiny.some(Boolean)) break;
    tiny.forEach((isTiny, i) => {
      if (isTiny) {
        fractions[i] = MIN_FRACTION;
        pinned[i] = true;
      }
    });
    const others = fractions.map((f, i) => !pinned[i] && f > 0);
    const sumPinned = pinned.filter(Boolean).length * MIN_FRACTION;
    const sumOthers = fractions.reduce((s, f, i) => s + (others[i] ? f : 0), 0);
    if (sumOthers <= 0) {
      // Degenerate all-tiny guard (unreachable with ≤6 post-norm segments — at least one ≥ 1/6).
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

  const singleFull = positiveCount === 1;

  // 6b. Resolve emphasis (PL-4.2, OPACITY-ONLY focus). `emphasis` is a post-sort/post-cap wedge
  //     index: it must be a finite integer in [0, segs.length); ANY other value (NaN, negative,
  //     ≥ length, non-integer) is defended to "no emphasis" = today. Pure-from-DATA.
  const emphasisIndex =
    isNum(input.emphasis) && Number.isInteger(input.emphasis) && input.emphasis >= 0 && input.emphasis < segs.length
      ? input.emphasis
      : null;

  // 7. Cumulative start/sweep angle per segment (fraction × 360° running sum, from 12 o'clock CW).
  //    8. Per-segment name/value fit-or-hide + mid-angle anchor (§6.4 + §3 ruling 1).
  let cursor = 0; // cumulative fraction
  const planned: DonutPlanSegment[] = segs.map((s, i) => {
    const fraction = fractions[i];
    const startFrac = cursor;
    cursor += fraction;
    const startAngleDeg = startFrac * 360;
    const sweepAngleDeg = fraction * 360;
    const labelAngleDeg = (startFrac + fraction / 2) * 360;
    const accentKey = accentForIndex(s.accent, i);

    // Value text: "<value><unit>" via the shared formatter (or the raw value if no unit).
    const valueText = formatValue(s.value, unit);
    let valueHideReason: "off" | "empty" | "tooLong" | undefined;
    if (valueLabels === "off") valueHideReason = "off";
    else if (valueText.trim().length === 0) valueHideReason = "empty";
    else if ([...valueText.trim()].length > SEG_VALUE_MAX_CP) valueHideReason = "tooLong";
    const showValue = valueHideReason === undefined;

    // Name fit-or-hide: empty / >cap / two-line block too wide for the segment's own angular slot.
    const trimmed = s.label.trim();
    let nameHideReason: "empty" | "tooLong" | "tooThin" | undefined;
    if (trimmed.length === 0) nameHideReason = "empty";
    else if ([...trimmed].length > SEG_NAME_MAX_CP) nameHideReason = "tooLong";
    else if (!labelFitsSlot(trimmed, fraction, labelAngleDeg)) nameHideReason = "tooThin";
    const showName = nameHideReason === undefined;

    if (!showName && nameHideReason !== "empty") dropped.hiddenLabels++;
    if (!showValue && valueHideReason !== "off" && valueHideReason !== undefined) dropped.hiddenLabels++;

    return {
      fraction,
      startFrac,
      startAngleDeg,
      sweepAngleDeg,
      accentKey,
      label: s.label,
      showName,
      ...(showName ? {} : { nameHideReason }),
      valueText,
      showValue,
      ...(showValue ? {} : { valueHideReason }),
      labelAngleDeg,
      // OPACITY-ONLY emphasis: dim every wedge EXCEPT the focused one (no emphasis ⇒ all false).
      dim: emphasisIndex !== null && i !== emphasisIndex,
    };
  });

  return { segments: planned, center, valueLabels, unit, dropped, empty: false, singleFull, emphasisIndex };
}

// Derive the center hole headline (§2.3 centerTotal): centerValue override wins; else if on,
// "100%" for percent/no-unit, otherwise the summed raw total formatted. Caption = centerLabel.
function deriveCenter(
  input: PlanDonutInput,
  centerTotal: "on" | "off",
  unit: string,
  rawTotal: number,
): { value: string; caption?: string; show: boolean } {
  const caption = typeof input.centerLabel === "string" && input.centerLabel.trim().length > 0 ? input.centerLabel : undefined;
  if (centerTotal === "off") return { value: "", caption, show: false };
  let value: string;
  if (typeof input.centerValue === "string" && input.centerValue.trim().length > 0) {
    value = input.centerValue;
  } else if (unit === "%" || unit === "") {
    value = "100%";
  } else {
    value = formatValue(rawTotal, unit);
  }
  return { value, caption, show: true };
}

// Outside two-line label fit (§3 ruling 1, BINDING): a name is shown only if (a) its block fits
// within half the segment's own angular slot (so adjacent blocks never overlap — the slot is
// bounded by 360°), AND (b) the block stays inside the viewBox safe frame (so it never exits the
// box — the real layout risk a near-full ring + horizontal labels poses). Either failure → hide
// (never bend, never truncate, never a leader — the stack/bar "hide, don't bend" rule).
const LABEL_R = RING_OUTER_R + LABEL_RADIAL_OFFSET; // 256
const FRAME_INSET = 8; // viewBox-px safe inset (the SVG ≈ fills the Panel's safe content box)
const LABEL_LINE_H = 30; // matches the renderer's two-line block line height
function labelFitsSlot(name: string, fraction: number, labelAngleDeg: number): boolean {
  if (fraction <= 0) return false;
  // The block's widest line is whichever is wider: the name or a typical value ("100%").
  const blockW = Math.max(estPxAt(name), estPxAt("100%")) + 12; // + breathing room
  const blockHalfW = blockW / 2;

  // (a) Angular no-overlap: the block's half-angle at the anchor radius ≤ half the segment slot.
  const halfAngleDeg = (Math.atan2(blockHalfW, LABEL_R) * 180) / Math.PI;
  const slotHalfDeg = (fraction * 360) / 2;
  if (halfAngleDeg > slotHalfDeg) return false;

  // (b) Frame containment: place the two-line block at the mid-angle anchor with the renderer's
  // anchor rule (start/middle/end by which side of the ring), and require its bbox ⊆ the safe frame.
  const rad = ((labelAngleDeg - 90) * Math.PI) / 180; // -90 → 12 o'clock origin
  const ax = CX + LABEL_R * Math.cos(rad);
  const ay = CY + LABEL_R * Math.sin(rad);
  const cosA = Math.cos(rad);
  let left: number;
  let right: number;
  if (cosA > 0.2) {
    left = ax; // textAnchor "start" → grows right
    right = ax + blockW;
  } else if (cosA < -0.2) {
    right = ax; // textAnchor "end" → grows left
    left = ax - blockW;
  } else {
    left = ax - blockHalfW; // "middle"
    right = ax + blockHalfW;
  }
  const top = ay - LABEL_LINE_H; // two lines centered on the anchor
  const bottom = ay + LABEL_LINE_H;
  return left >= FRAME_INSET && right <= VIEW - FRAME_INSET && top >= FRAME_INSET && bottom <= VIEW - FRAME_INSET;
}

// ─── Continuous-edge sweep timing (§5; §3 ruling 3) — mirror stack.ts; shared by render + check ──
// ONE eased edge E(t) sweeps the whole ring over [SWEEP_START, SWEEP_END]; each segment's painted
// arc is DERIVED from where the edge sits (fraction-of-ring space), so at any t the segments behind
// the edge are complete, those ahead are 0, and AT MOST ONE is mid-fill. The ring is connected
// geometry → ONE continuous leading edge (never overlapping staggers).

// cubic-bezier(0.65, 0, 0.35, 1) — easeInOutCubic, motionRole.chartGrow. Implemented locally (40-step
// bisection on the monotone x-polynomial) so render + check share one implementation, dependency-free
// for Node unit testing. The SAME ease stack.ts / bars.ts use.
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

/** The leading sweep edge E(t) ∈ [0, 1] — eased position of the build front around the ring. */
export function donutSweep(t: number): number {
  return chartGrowEase(clamp01((t - SWEEP_START) / SWEEP_DUR));
}

/**
 * Fill progress ∈ [0, 1] for the segment spanning [startFrac, startFrac + fraction] of the ring.
 * Starts filling exactly when the edge touches startFrac; complete when the edge reaches
 * startFrac + fraction. Pinned to EXACT 0/1 outside its window; zero-fraction segments are 1.
 */
export function segmentSweep(t: number, startFrac: number, fraction: number): number {
  if (t >= SWEEP_END || fraction <= 0) return 1;
  const e = donutSweep(t);
  if (e >= startFrac + fraction) return 1;
  if (e <= startFrac) return 0;
  return clamp01((e - startFrac) / fraction);
}

/**
 * labelStampT — the `t` at which the edge reaches ring position `endFrac` (E(t) = endFrac), i.e.
 * when the segment ending there completes and its label stamps in. Deterministic bisection of the
 * eased edge over the window, 24 iterations. endFrac ≥ 1 (the last segment) returns SWEEP_END.
 */
export function labelStampT(endFrac: number): number {
  if (endFrac >= 1 - 1e-6) return SWEEP_END;
  if (endFrac <= 0) return SWEEP_START;
  let lo = SWEEP_START;
  let hi = SWEEP_END;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (donutSweep(mid) < endFrac) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Center headline reveal window (StatHero settle pattern). */
export const CENTER_REVEAL = { start: CENTER_START, dur: CENTER_DUR };
