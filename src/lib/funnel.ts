// PL-3.3 — Funnel plan: the pure "narrowing brain" shared by the renderer (PostRenderer →
// Funnel) and the deterministic check suite (tools/qa-funnel.mjs). Like divergence.ts /
// bars.ts / stack.ts it is dependency-light (only d3-scale + the estW char-class table reused
// from stack.ts) so Node's native type-stripping can unit-test it without a DOM.
//
// `funnel` expresses a multi-stage process where an ABSOLUTE measured quantity DROPS OFF
// stage to stage — conversion funnels (visitors→signups→activated→paid), pipeline yield,
// hiring funnels, retention cohorts. The narrowing magnitude and the per-stage drop-off ARE
// the argument. It is the magnitude-narrowing sibling of `bar` (unordered comparison) and the
// absolute-magnitude counterpart of `pipeline` (compounding rates).
//
// `planFunnel` owns EVERY geometry decision — knob coercion, the C1 downsample (keep first+last),
// maxValue derivation + ≤0 guard, the C5 min-width floor, the C6 monotonic painted-width clamp
// (true value preserved for count-up + drop-off %), the drop-off computation from TRUE values
// (value=0 guard), stage-label show/hide (reuse estW) + value-label + drop-off show/hide — all
// from DATA only, never from `t`, so its output feeds the static-geometry checks directly. Every
// drop is surfaced via a counter; non-monotonic clamp is surfaced via `monotonicClampApplied`.
// Spec: planning/primitive-library/handoffs/PL-3.3-funnel.md §2.4 / §2.5 / §2.6 / C1–C12,
// PM §3 binding correction (cap 5, label ALWAYS "above", no insideTop placement).

import { scaleLinear, scalePoint } from "d3-scale";
import { estW } from "./stack.ts";

export type FunnelMode = "funnel" | "bars";
export type AccentKey = "cyan" | "amber" | "violet" | "mint" | "burnt";

export type FunnelStageInput = {
  label: string;
  value: number;
  valueText?: string;
  accent?: string;
};

// ── Fixed viewBox geometry (source px) — §2.5.1 ─────────────────────────────────────────────
export const VIEW_W = 1000;
export const VIEW_H = 714; // ≈7/5 (1.4:1) — matches the ~904×643 Panel content box so the SVG fills it with
// ~zero letterbox (Fix 3). viewW stays 1000 ⇒ viewBox→904 scale k=0.904 unchanged → all 18px-effective
// text floors stay valid. Vertical-only retune (the band-area uses more of this height).

// C5 — anti-collapse / max band widths (source px).
export const MIN_BAND_W = 64; // narrowest painted band — never a hairline (→ ~58px effective)
export const MAX_BAND_W = 760; // widest (top) band — centered leaves ≥120px each side in the 1000-wide viewBox
export const BARS_MAX_BAND_W = 560; // = PLOT_X1 − LABEL_COL (880−320); bars left-anchors at LABEL_COL so this is the
// widest band ending exactly at PLOT_X1, leaving the [PLOT_X1, VIEW_W] gutter for the right-anchored drop-off label.

// Plot region — funnel mode centers each band at CX; the band-area spans [PLOT_X0, PLOT_X1].
export const PLOT_X0 = 120;
export const PLOT_X1 = 880;
export const CX = 500; // (PLOT_X0 + PLOT_X1) / 2 — funnel centerline
export const LABEL_COL = 320; // bars mode left-anchor x; stage label right-anchored at x=300
export const BARS_LABEL_ANCHOR_X = 300;

// Vertical band-area (Fix 3 — taller silhouette in the aspect-matched box; band-area 470→580px).
export const ROW_Y0 = 80;
export const ROW_Y1 = 660;
export const BAND_H = 76; // painted stage-band height (source px → ~68.7px effective)

// C8 — band corner radius + chart-line weight (the established chart weight, where stroked).
export const BAND_RADIUS = 8;
export const TAPER_OPACITY = 0.1; // taper-wall fill-only opacity (connective tissue)

// Label sizing (source px → effective via k=0.904; all ≥18px effective, §2.4 C7).
export const STAGE_LABEL_PX = 24; // → 21.7 ✓
export const VALUE_LABEL_PX = 28; // → 25.3 ✓ (the hero number of each band)
export const DROP_LABEL_PX = 24; // → 21.7 ✓
const STAGE_LABEL_MAX_CP = 22; // C3
const VALUE_LABEL_MAX_CP = 10; // C4
const DROP_LABEL_MAX_CP = 8; // C4b
const LABEL_PAD = 12; // px padding inside a value slot
// estW() is calibrated at 26px (stack.ts). Funnel labels render at their own sizes → scale.
const STAGE_EST_SCALE = STAGE_LABEL_PX / 26;
const VALUE_EST_SCALE = VALUE_LABEL_PX / 26;
const DROP_EST_SCALE = DROP_LABEL_PX / 26;

// C1 — stage cap (PM §3 BINDING CORRECTION: cap 5, not 6).
export const MAX_STAGES = 5;

// ── Animation timing (§2.5.3) — the continuous-edge build window (fixed module constants) ──
export const EDGE_START = 0.3;
export const EDGE_END = 0.78;
export const SETTLE_DEADLINE = 0.85;
export const DROP_FADE_DUR = 0.04; // drop-off % fades in over [revealT, revealT + 0.04]

const EDGE_DUR = EDGE_END - EDGE_START; // 0.48

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const KNOWN_ACCENTS = new Set<AccentKey>(["cyan", "amber", "violet", "mint", "burnt"]);

/** Map an author accent (or undefined/unknown) to a known key, defaulting to the funnel primary. */
export function accentOr(author: string | undefined, fallback: AccentKey): AccentKey {
  if (author && KNOWN_ACCENTS.has(author as AccentKey)) return author as AccentKey;
  return fallback;
}

/** Default numeric value formatter (the value-label string when no override). */
export function formatValue(v: number, unit?: string): string {
  if (!isNum(v)) return "";
  const r = Math.round(v * 100) / 100;
  const s = String(r);
  return unit ? `${s}${unit}` : s;
}

/** Format a derived drop-off ratio as a signed percentage string, e.g. -0.62 → "−62%". */
export function formatDropPct(pct: number): string {
  if (!isNum(pct)) return "";
  const rounded = Math.round(pct * 100);
  if (rounded === 0) return "0%";
  const sign = rounded < 0 ? "−" : "+"; // U+2212 minus (typographic), + for a non-funnel rise
  return `${sign}${Math.abs(rounded)}%`;
}

export type PlannedBand = {
  index: number; // original (post-clamp) stage index, top→down
  label: string;
  value: number; // TRUE absolute magnitude (drives count-up + drop-off ratio)
  valueText: string; // displayed value string (override or formatValue+unit)
  paintedW: number; // band width AFTER MIN_BAND_W floor + C6 monotonic clamp
  dataW: number; // un-clamped width (paints nothing; for the monotonic-painted-width check)
  cx: number; // band center x (funnel) — for bars this is LABEL_COL + paintedW/2
  xLeft: number; // band left edge (the renderer reads this directly)
  yTop: number;
  yBottom: number;
  bandH: number;
  accentKey: AccentKey;
  showLabel: boolean;
  labelHideReason?: "empty" | "tooLong" | "tooThin";
  labelPlacement: "above"; // PM §3: ALWAYS "above" (no insideTop mode)
  showValue: boolean;
  valueHideReason?: "empty" | "tooLong" | "tooThin";
  valueCountText?: string; // count-eligible numeric source → planCountUp; else undefined ⇒ fade
  monotonicClampApplied: boolean; // C6 — surfaced for the check + gallery
  bandStart: number; // continuous-edge reveal START for this band (the edge crosses yTop)
  bandSettle: number; // the `t` at which this band's reveal completes (edge crosses yBottom)
};

export type PlannedDrop = {
  fromIndex: number;
  toIndex: number;
  pct: number; // (value[i+1] − value[i]) / value[i] — from TRUE values; 0 when value[i]===0
  text: string; // e.g. "−62%"; "" if value[i] === 0 (divide guard)
  show: boolean; // C4b — hidden when the inter-band gap can't host it
  hideReason?: "off" | "empty" | "tooThin";
  cx: number; // viewBox x anchor of the drop-off label — funnel: right gutter (PLOT_X1); bars: right of the upper band
  anchor: "start" | "middle" | "end"; // textAnchor — funnel: "end" (right-gutter); bars: "start"
  cy: number; // viewBox y of the gap center
  revealT: number; // appears only after BOTH adjacent bands settle (§2.5.3) + a fade
};

export type FunnelPlan = {
  mode: FunnelMode;
  maxValue: number;
  bands: PlannedBand[];
  drops: PlannedDrop[];
  pitch: number; // band-center spacing (source px)
  accentKey: AccentKey; // the whole-funnel primary
  unit: string;
  dropLabels: "auto" | "off";
  /** True when, after clamping, < 2 renderable stages remain (C2 caption-only fallback). */
  fallback: boolean;
  dropped: { stagesDropped: number; hiddenLabels: number; hiddenValues: number; hiddenDrops: number };
};

// ── Eased reveal helpers (pure `t`-functions, colocated like stack.ts) ──────────────────────
// cubic-bezier(0.65,0,0.35,1) — easeInOutCubic, motionRole.chartGrow. Implemented locally
// (40-step bisection on the monotone x-polynomial) so render + check share one implementation,
// dependency-free for Node unit testing. Mirrors stack.ts / bars.ts.
const X1 = 0.65;
const X2 = 0.35;
const bez = (p: number, a1: number, a2: number) => (((1 - 3 * a2 + 3 * a1) * p + (3 * a2 - 6 * a1)) * p + 3 * a1) * p;
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
  return bez((lo + hi) / 2, 0, 1);
}

/** The descending leading edge ∈ [0,1] — eased position of the build front over [ROW_Y0,ROW_Y1]. */
export function funnelEdge(t: number): number {
  return chartGrowEase(clamp01((t - EDGE_START) / EDGE_DUR));
}

/**
 * Band i reveal progress g ∈ [0,1] — paint-only top→down wipe. The edge's painted y is
 * ROW_Y0 + funnelEdge·(ROW_Y1−ROW_Y0); the band fills from yTop to yBottom as the edge crosses it.
 * Pinned to EXACT 0/1 outside its window (the renderer OMITS the clip/transform at g===1).
 */
export function bandReveal(t: number, yTop: number, bandH: number): number {
  if (bandH <= 0) return 1;
  const edgeY = ROW_Y0 + funnelEdge(t) * (ROW_Y1 - ROW_Y0);
  return clamp01((edgeY - yTop) / bandH);
}

/**
 * bandSettle — the `t` at which the descending edge reaches viewBox y `yBottom` (i.e. when the
 * band ending there completes its reveal). Deterministic bisection of the eased edge over the
 * window, fixed 24 iterations. A `yBottom` at/below ROW_Y1 returns EDGE_END exactly; above
 * ROW_Y0 returns EDGE_START.
 */
export function bandSettle(yBottom: number): number {
  const span = ROW_Y1 - ROW_Y0;
  const target = clamp01((yBottom - ROW_Y0) / span); // edge position needed to reach yBottom
  if (target >= 1 - 1e-6) return EDGE_END;
  if (target <= 0) return EDGE_START;
  let lo = EDGE_START;
  let hi = EDGE_END;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (funnelEdge(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** C1 downsample to MAX_STAGES, ALWAYS keeping FIRST + LAST (even-stride — Pipeline.fitNodes). */
function downsampleKeepEnds<T>(items: T[], cap: number): T[] {
  if (items.length <= cap) return items.slice();
  if (cap <= 1) return [items[0]];
  if (cap === 2) return [items[0], items[items.length - 1]];
  // Keep first + last; fill the middle (cap−2 slots) at an even stride over the interior.
  const out: T[] = [items[0]];
  const interiorCount = cap - 2;
  const lastIdx = items.length - 1;
  for (let k = 1; k <= interiorCount; k++) {
    const idx = Math.round((k * lastIdx) / (interiorCount + 1));
    const clamped = Math.min(lastIdx - 1, Math.max(1, idx));
    out.push(items[clamped]);
  }
  out.push(items[lastIdx]);
  return out;
}

const stageEstPx = (s: string) => estW(s) * STAGE_EST_SCALE;
const valueEstPx = (s: string) => estW(s) * VALUE_EST_SCALE;
const dropEstPx = (s: string) => estW(s) * DROP_EST_SCALE;

/**
 * The pure funnel layout brain. Coerces knobs, downsamples (keep ends), derives maxValue + guard,
 * floors + monotonic-clamps painted widths, computes drop-off % from TRUE values, and decides
 * every label show/hide — all from DATA, never `t`.
 */
export function planFunnel(
  rawStages: ReadonlyArray<FunnelStageInput> | undefined,
  modeIn: FunnelMode | string | undefined,
  unitIn: string | undefined,
  accentIn: string | undefined,
  dropLabelsIn: "auto" | "off" | string | undefined,
): FunnelPlan {
  const mode: FunnelMode = modeIn === "bars" ? "bars" : "funnel"; // unknown/absent → funnel
  const unit = typeof unitIn === "string" ? unitIn : "";
  const accentKey = accentOr(accentIn, "cyan");
  const dropLabels: "auto" | "off" = dropLabelsIn === "off" ? "off" : "auto";
  const dropped = { stagesDropped: 0, hiddenLabels: 0, hiddenValues: 0, hiddenDrops: 0 };

  // 1. Normalize + count clamp (C1). Each stage: label string, value coerced (NaN/neg/Inf → 0).
  const rawArr = Array.isArray(rawStages) ? rawStages : [];
  const normalizedAll = rawArr.map((s) => ({
    label: typeof s?.label === "string" ? s.label : "",
    value: isNum(s?.value) && s!.value! >= 0 ? s!.value! : 0,
    valueIsNum: isNum(s?.value) && s!.value! >= 0,
    valueText: typeof s?.valueText === "string" ? s.valueText : undefined,
    accent: typeof s?.accent === "string" ? s.accent : undefined,
  }));
  if (normalizedAll.length > MAX_STAGES) dropped.stagesDropped = normalizedAll.length - MAX_STAGES;
  const stages = downsampleKeepEnds(normalizedAll, MAX_STAGES);

  const n = stages.length;
  const fallback = n < 2; // C2 — caption-only Panel handled in-component

  // 2. maxValue derivation + ≤0 guard (§2.5.1). Domain anchored at 0; value=0 → MIN_BAND_W band.
  const values = stages.map((s) => s.value);
  let maxValue = values.length ? Math.max(0, ...values) : 0;
  if (maxValue <= 0) maxValue = 1; // guard — every band paints at the min floor (degenerate, not broken)

  // 3. Width scale (C5). funnel range [MIN, MAX]; bars range [MIN, BARS_MAX] so a left-anchored
  //    band can't exit the plot.
  const maxBandW = mode === "bars" ? BARS_MAX_BAND_W : MAX_BAND_W;
  const widthScale = scaleLinear().domain([0, maxValue]).range([MIN_BAND_W, maxBandW]);

  // 4. Vertical placement via scalePoint (even spacing, half-step padding) — the divergence row
  //    pattern. Centers span [ROW_Y0, ROW_Y1] ⇒ step = 580/N (116px at N=5); the stage label rides
  //    ABOVE each band with ≥12px slack to the previous band's bottom (Fix 3 cap-5 proof: label 24 +
  //    4 gap + band 76 = 104 < 116). The first center's label clears the viewBox top; the last band's
  //    bottom stays within ROW_Y1.
  let yCenterOf: (i: number) => number;
  if (n >= 2) {
    const point = scalePoint<string>()
      .domain(stages.map((_, i) => String(i)))
      .range([ROW_Y0, ROW_Y1])
      .padding(0.5);
    yCenterOf = (i) => point(String(i)) ?? (ROW_Y0 + ROW_Y1) / 2;
  } else {
    const cy = (ROW_Y0 + ROW_Y1) / 2;
    yCenterOf = () => cy;
  }
  const pitch = n >= 2 ? (ROW_Y1 - ROW_Y0) / n : ROW_Y1 - ROW_Y0;

  // 5. Per-band painted width: scale → MIN floor → C6 monotonic clamp (≤ prior painted width).
  let prevPainted = Infinity;
  const bands: PlannedBand[] = stages.map((s, i) => {
    const dataW = Math.max(MIN_BAND_W, widthScale(s.value) ?? MIN_BAND_W);
    let monotonicClampApplied = false;
    let paintedW = dataW;
    if (paintedW > prevPainted + 1e-6) {
      paintedW = prevPainted; // C6 — clamp to ≤ prior so the silhouette never inverts
      monotonicClampApplied = true;
    }
    prevPainted = paintedW;

    const yCenter = yCenterOf(i);
    const yTop = yCenter - BAND_H / 2;
    const yBottom = yCenter + BAND_H / 2;

    // Band x-anchor by mode: funnel centers at CX; bars left-anchors at LABEL_COL.
    const xLeft = mode === "bars" ? LABEL_COL : CX - paintedW / 2;
    const cx = xLeft + paintedW / 2;

    // Value display string: valueText override, else formatValue(value)+unit. Count-eligible ONLY
    // when there is no override AND the value is a finite ≥0 number (never count a coerced 0-from-NaN
    // unless it was a true 0 — a true 0 still counts to 0 cleanly).
    const valueText = s.valueText != null ? s.valueText : formatValue(s.value, unit);
    const valueCountText = s.valueText == null && s.valueIsNum ? formatValue(s.value, unit) : undefined;

    // Stage label show/hide (C3) — hide-not-shrink. The label lives ABOVE the band, centered
    // (funnel) / right-anchored in the left column (bars); its slot is the band width (funnel) or
    // the label column (bars).
    const trimmedLabel = s.label.trim();
    let labelHideReason: "empty" | "tooLong" | "tooThin" | undefined;
    const labelSlot = mode === "bars" ? BARS_LABEL_ANCHOR_X : Math.max(paintedW, MAX_BAND_W * 0.5);
    if (trimmedLabel.length === 0) labelHideReason = "empty";
    else if ([...trimmedLabel].length > STAGE_LABEL_MAX_CP) labelHideReason = "tooLong";
    else if (stageEstPx(trimmedLabel) > labelSlot) labelHideReason = "tooThin";
    const showLabel = labelHideReason === undefined;
    if (!showLabel && labelHideReason !== "empty") dropped.hiddenLabels++;

    // Value label show/hide (C4) — inside the band. Hidden if empty / >10cp / wider than the band.
    const trimmedValue = valueText.trim();
    let valueHideReason: "empty" | "tooLong" | "tooThin" | undefined;
    if (trimmedValue.length === 0) valueHideReason = "empty";
    else if ([...trimmedValue].length > VALUE_LABEL_MAX_CP) valueHideReason = "tooLong";
    else if (valueEstPx(trimmedValue) > paintedW - LABEL_PAD) valueHideReason = "tooThin";
    const showValue = valueHideReason === undefined;
    if (!showValue && valueHideReason !== "empty") dropped.hiddenValues++;

    return {
      index: i,
      label: s.label,
      value: s.value,
      valueText,
      paintedW,
      dataW,
      cx,
      xLeft,
      yTop,
      yBottom,
      bandH: BAND_H,
      accentKey: accentOr(s.accent, accentKey),
      showLabel,
      ...(showLabel ? {} : { labelHideReason }),
      labelPlacement: "above" as const,
      showValue,
      ...(showValue ? {} : { valueHideReason }),
      valueCountText,
      monotonicClampApplied,
      bandStart: bandSettle(yTop),
      bandSettle: bandSettle(yBottom),
    };
  });

  // 6. Drop-off computation (length n−1) from TRUE values; value[i]===0 → empty text (divide guard).
  const drops: PlannedDrop[] = [];
  for (let i = 0; i < bands.length - 1; i++) {
    const from = bands[i];
    const to = bands[i + 1];
    const pct = from.value === 0 ? 0 : (to.value - from.value) / from.value;
    const text = from.value === 0 ? "" : formatDropPct(pct);
    const cy = (from.yBottom + to.yTop) / 2;

    // C4b — show only when dropLabels=auto, the text is non-empty + ≤8cp, and the inter-band gap can
    // host it (the narrowest stages can be too tiny). The gap is the vertical room between bands.
    const gap = to.yTop - from.yBottom;
    let hideReason: "off" | "empty" | "tooThin" | undefined;
    if (dropLabels === "off") hideReason = "off";
    else if (text.length === 0 || [...text].length > DROP_LABEL_MAX_CP) hideReason = "empty";
    else if (gap < DROP_LABEL_PX - 2 || dropEstPx(text) > Math.max(from.paintedW, to.paintedW) + 80)
      hideReason = "tooThin";
    const show = hideReason === undefined;
    if (!show && hideReason !== "off" && hideReason !== "empty") dropped.hiddenDrops++;

    // Appears only after BOTH adjacent bands settle, then a fade (§2.5.3).
    const revealT = Math.max(from.bandSettle, to.bandSettle);

    // Horizontal placement (§2.5.1 proof point 5, Fix 1): in FUNNEL mode the stage label of band i+1
    // and this drop-off both live in the gap between band i and i+1, both centered at CX — so they
    // would stack. Separate them HORIZONTALLY: the drop-off is right-anchored in the [PLOT_X1, VIEW_W]
    // gutter (textAnchor="end" at PLOT_X1), clear of the CX-centered stage labels by construction. In
    // BARS mode the gap is empty (labels are in the left column), so keep the existing right-of-band
    // placement.
    const cx = mode === "bars" ? from.xLeft + from.paintedW + 14 : PLOT_X1;
    const anchor: "start" | "end" = mode === "bars" ? "start" : "end";

    drops.push({
      fromIndex: i,
      toIndex: i + 1,
      pct,
      text,
      show,
      ...(show ? {} : { hideReason }),
      cx,
      anchor,
      cy,
      revealT,
    });
  }

  return { mode, maxValue, bands, drops, pitch, accentKey, unit, dropLabels, fallback, dropped };
}
