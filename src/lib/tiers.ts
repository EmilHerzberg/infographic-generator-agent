// PL-3.2 — TierStack plan: the pure "tier brain" shared by the renderer (PostRenderer →
// TierStack) and the deterministic check suite (tools/qa-tiers.mjs). Like stack.ts /
// divergence.ts it is dependency-light (only the estW char-class table reused from stack.ts)
// so Node's native type-stripping can unit-test it without a DOM.
//
// `tiers` expresses items sorted into a small number of ORDERED buckets — the grouping +
// ordering IS the argument (the Dunlosky case: study techniques sorted into High / Moderate /
// Low utility). `planTiers` owns EVERY layout decision — the tier+item clamps (C1/C2), the
// total-12 cap with a deterministic last-tier-inward drop (C3), the greedy bin-pack into ≤2
// chip-rows (C6/C6b), the chip show/hide on the FitLine floor (C5/C8), and accent role-mapping
// (§2.5.4) — all from DATA only, never from `t`, so its output feeds the static-geometry
// checks directly. Every drop is surfaced via a counter, NEVER silent (§2.6).
// Spec: planning/primitive-library/handoffs/PL-3.2-tiered-ranked.md §2.4 / §2.5 / C1–C13.

import { estW } from "./stack.ts";

export type TierMode = "tiers" | "ranked";

export type TierInputItem = { label: string; note?: string };
export type TierInput = { label: string; accent?: string; items: TierInputItem[] };

// ── Accent roles (§2.5.4) — anti-monochrome, semantic by tier POSITION, never a gradient.
//    index 0 = mint (success/high), 1 = amber (insight/moderate), 2 = burnt (friction/low),
//    3 = violet (differentiator). Author-supplied accent overrides; unknown → position default.
export type AccentKey = "cyan" | "amber" | "violet" | "mint" | "burnt";
const ACCENT_BY_INDEX: AccentKey[] = ["mint", "amber", "burnt", "violet"];
const KNOWN_ACCENTS = new Set<AccentKey>(["cyan", "amber", "violet", "mint", "burnt"]);

// ── Fixed source-px geometry (§2.5.1 / §2.5.3) — the binding W=904 / H=654 content box.
export const TRACK_WIDTH = 904; // Panel content width at Path A's portrait layout (§2.1)
// PL-5.2: the chip rows do NOT have the full TRACK_WIDTH — each Tier row carries `px-5` (20px
// each side, TIER_PAD_X below), so the real chip-row track is 40px narrower. The bin-pack used to
// pack against the full 904 and over-pack by ~40px; a dense row (e.g. 5 short chips) then rendered
// ~57px past the real column and CASCADED a right-margin breach onto every PostFrame sibling. Pack
// against the TRUE inner track instead. NO-OP for content that already fit ≤ 864 (verified: every
// existing tiers fixture keeps identical row membership); only over-packed rows now wrap correctly.
export const TIER_PAD_X = 20; // the Tier row's `px-5` horizontal padding (each side)
export const CHIP_TRACK_WIDTH = TRACK_WIDTH - 2 * TIER_PAD_X; // 864 — the real chip-row inner width
export const CHIP_PAD_X = 20; // C7 — horizontal padding inside a chip
export const CHIP_GAP = 16; // C7 — gap between chips (≥ the 14px crampedPairs floor)
export const CHIP_MIN_WIDTH = 112; // C5 — a chip is never narrower than ~one short word
export const CHIP_FONT = 24; // chip label source size (C8 — 24 × FitLine zoom ≥ 18)
export const TIER_LABEL_FONT = 28; // tier label source size

// ── Data caps (§2.4) ─────────────────────────────────────────────────────────────────────
const MAX_TIERS = 4; // C1 — tiers ∈ [1, 4]
const MAX_ITEMS_PER_TIER = 5; // C2
const MAX_TOTAL_ITEMS = 12; // C3 — hard global cap (after per-tier slice)
const MAX_ROWS_PER_TIER = 2; // C6 — at most 2 chip-rows per tier
const TIER_LABEL_MAX_CP = 18; // C4 — tier label ≤ 18 code points
const ITEM_LABEL_MAX_CP = 14; // C4 — item label ≤ 14 code points
const NOTE_MAX_CP = 20; // C4 — item note ≤ 20 code points

// estW() is calibrated at 26px (stack.ts). Chip labels render at 24px → scale the estimate.
const CHIP_EST_SCALE = CHIP_FONT / 26;
// FitLine effective floor: 24px × zoom ≥ 18 ⇒ zoom ≥ 0.75. A chip whose label's natural width
// at the chip's inner box would force zoom below this floor is HIDDEN (not shrunk), per C5/C8.
const FIT_FLOOR_ZOOM = 18 / CHIP_FONT; // 0.75

export type ChipHideReason =
  | "rowBudget" // didn't fit the tier's allowed chip-rows (C6/C6b) — hidden, never shrunk
  | "tooThin"; // FitLine zoom would fall below the 0.75 floor at the chip's width (C5/C8)

export type PlannedChip = {
  label: string;
  note?: string;
  /** Rank ordinal (1-based) — set in `ranked` mode; undefined in `tiers` mode. */
  rank?: number;
  /** Estimated chip width (source px) including padding — the bin-pack basis. */
  width: number;
  /** Hidden chips are dropped from layout but COUNTED (§2.6) — never silently lost. */
  hidden: boolean;
  hideReason?: ChipHideReason;
};

export type PlannedTier = {
  label: string;
  accentKey: AccentKey;
  /** Deterministic greedy bin-pack into ≤ 2 chip-rows (C6). Visible chips only. */
  rows: PlannedChip[][];
  /** Every chip the tier received (post per-tier/total slice), incl. hidden — for the checks. */
  chips: PlannedChip[];
};

export type TiersDropped = {
  tiersDropped: number; // > 4 declared tiers (C1)
  itemsDropped: number; // > 5 per tier (C2) + > 12 total (C3)
  hiddenChips: number; // row-budget / too-thin hides (C5/C6)
  truncatedLabels: number; // tier/item labels over C4 (advisory — FitLine/line-clamp absorb them)
};

export type TiersPlan = {
  mode: TierMode;
  tiers: PlannedTier[];
  dropped: TiersDropped;
  /** True when, after clamping, no tier carries a visible chip (the empty-state net, §3 ruling 3). */
  empty: boolean;
};

const cp = (s: string): number => [...s].length;

/** Map an author accent (or undefined) to a known key, defaulting by tier position (§2.5.4). */
export function accentForTier(accent: string | undefined, index: number): AccentKey {
  if (accent && KNOWN_ACCENTS.has(accent as AccentKey)) return accent as AccentKey;
  return ACCENT_BY_INDEX[index] ?? ACCENT_BY_INDEX[ACCENT_BY_INDEX.length - 1];
}

/** Estimated chip width (source px) = clamp(estW(label)·scale + 2·pad, CHIP_MIN_WIDTH, CHIP_TRACK_WIDTH). */
export function chipWidth(label: string): number {
  const inner = estW(label) * CHIP_EST_SCALE;
  return Math.max(CHIP_MIN_WIDTH, Math.min(CHIP_TRACK_WIDTH, inner + 2 * CHIP_PAD_X));
}

/**
 * Greedy bin-pack a tier's chips into rows of width ≤ CHIP_TRACK_WIDTH (chip widths + 16px gaps).
 * Deterministic (left→right, fixed order) so the renderer and the check agree EXACTLY on which
 * chip sits where — collision is decided in pure JS, never left to CSS flex-wrap (§2.5.3). Chips
 * past `maxRows` are marked hidden(rowBudget). Returns the row layout of visible chips.
 */
function binPack(chips: PlannedChip[], maxRows: number): PlannedChip[][] {
  const rows: PlannedChip[][] = [];
  let row: PlannedChip[] = [];
  let rowW = 0;
  for (const chip of chips) {
    if (chip.hidden) continue; // already hidden (tooThin) — never enters a row
    const add = (row.length === 0 ? 0 : CHIP_GAP) + chip.width;
    if (row.length > 0 && rowW + add > CHIP_TRACK_WIDTH) {
      // Row full — start a new one if the budget allows, else this chip (and the rest) drop.
      rows.push(row);
      if (rows.length >= maxRows) {
        chip.hidden = true;
        chip.hideReason = "rowBudget";
        row = [];
        rowW = 0;
        continue;
      }
      row = [];
      rowW = 0;
    }
    if (rows.length >= maxRows) {
      // Already at the row cap (a prior chip overflowed and there is no row to open).
      chip.hidden = true;
      chip.hideReason = "rowBudget";
      continue;
    }
    row.push(chip);
    rowW += (row.length === 1 ? 0 : CHIP_GAP) + chip.width;
  }
  if (row.length) rows.push(row);
  return rows;
}

/** Does this tier's bin-pack need 2 rows (vs 1)? Pure measure used for the C6b budget. */
function rowsNeeded(chips: PlannedChip[]): number {
  let rows = 1;
  let rowW = 0;
  for (const chip of chips) {
    const add = (rowW === 0 ? 0 : CHIP_GAP) + chip.width;
    if (rowW > 0 && rowW + add > CHIP_TRACK_WIDTH) {
      rows++;
      rowW = chip.width;
    } else {
      rowW += add;
    }
  }
  return rows;
}

/**
 * The pure tier layout brain. Clamps tiers/items, applies the total-12 cap with a deterministic
 * last-tier-inward drop, decides chip show/hide on the FitLine floor, bin-packs into ≤2 rows
 * under the C6b "≤1 two-row tier when tiers≥4" budget, and maps accents — from DATA only.
 */
export function planTiers(
  rawTiers: ReadonlyArray<TierInput> | undefined,
  modeIn: TierMode | string | undefined,
): TiersPlan {
  const mode: TierMode = modeIn === "ranked" ? "ranked" : "tiers"; // unknown/missing → "tiers"

  const dropped: TiersDropped = { tiersDropped: 0, itemsDropped: 0, hiddenChips: 0, truncatedLabels: 0 };

  const all = Array.isArray(rawTiers) ? rawTiers.filter((t) => t && typeof t === "object") : [];

  if (mode === "ranked") {
    return planRanked(all, dropped);
  }

  // C1 — tiers ∈ [1, 4]. Drop the surplus and COUNT it.
  if (all.length > MAX_TIERS) dropped.tiersDropped = all.length - MAX_TIERS;
  const sliced = all.slice(0, MAX_TIERS);

  // C2 — items per tier ≤ 5 (per-tier slice). Build per-tier item arrays of {label, note}.
  const perTier = sliced.map((tier) => {
    const items: TierInputItem[] = Array.isArray(tier.items) ? tier.items : [];
    if (items.length > MAX_ITEMS_PER_TIER) dropped.itemsDropped += items.length - MAX_ITEMS_PER_TIER;
    return {
      label: typeof tier.label === "string" ? tier.label : "",
      accent: typeof tier.accent === "string" ? tier.accent : undefined,
      items: items.slice(0, MAX_ITEMS_PER_TIER).map((it) => ({
        label: typeof it?.label === "string" ? it.label : "",
        note: typeof it?.note === "string" ? it.note : undefined,
      })),
    };
  });

  // C3 — TOTAL ≤ 12, applied AFTER the per-tier slice by a DETERMINISTIC round-robin drop from
  // the LAST tier's LAST chips inward. Reproducible (never random) so the check matches exactly.
  let total = perTier.reduce((s, t) => s + t.items.length, 0);
  for (let ti = perTier.length - 1; ti >= 0 && total > MAX_TOTAL_ITEMS; ti--) {
    const items = perTier[ti].items;
    while (items.length > 0 && total > MAX_TOTAL_ITEMS) {
      items.pop();
      dropped.itemsDropped++;
      total--;
    }
  }

  // Build planned chips per tier with the FitLine-floor show/hide (C5/C8) and the C4 truncation
  // advisory. A chip whose natural label width forces FitLine zoom below 0.75 at the chip's inner
  // box is HIDDEN(tooThin) — only reachable if C4 is violated (the cap keeps zoom ≥ floor).
  const built = perTier.map((tier) => {
    const chips: PlannedChip[] = tier.items.map((it) => {
      const trimmed = it.label.trim();
      if (cp(trimmed) > ITEM_LABEL_MAX_CP) dropped.truncatedLabels++;
      if (it.note && cp(it.note) > NOTE_MAX_CP) dropped.truncatedLabels++;
      const width = chipWidth(trimmed);
      const innerBox = width - 2 * CHIP_PAD_X;
      const naturalW = estW(trimmed) * CHIP_EST_SCALE;
      const zoom = naturalW > 0 ? Math.min(1, innerBox / naturalW) : 1;
      const tooThin = trimmed.length === 0 || zoom < FIT_FLOOR_ZOOM - 1e-9;
      if (tooThin) dropped.hiddenChips++;
      return {
        label: trimmed,
        note: it.note,
        width,
        hidden: tooThin,
        ...(tooThin ? { hideReason: "tooThin" as const } : {}),
      };
    });
    if (cp(tier.label.trim()) > TIER_LABEL_MAX_CP) dropped.truncatedLabels++;
    return { tier, chips };
  });

  // C6b — at most ONE tier may use 2 chip-rows when tiers ≥ 4 (the height proof §2.5.2). For
  // tiers ≤ 3, up to two 2-row tiers. Decide each tier's row budget BEFORE packing: a tier that
  // *would* need 2 rows only gets them while the two-row quota remains; otherwise it packs into 1
  // row and the overflow drops (rowBudget). Earlier tiers (top→bottom) get first claim on the quota.
  const twoRowQuota = built.length >= 4 ? 1 : 2;
  let twoRowUsed = 0;

  const tiers: PlannedTier[] = built.map(({ tier, chips }, index) => {
    const visible = chips.filter((c) => !c.hidden);
    const wants2 = rowsNeeded(visible) >= 2;
    let maxRows = 1;
    if (wants2 && twoRowUsed < twoRowQuota) {
      maxRows = MAX_ROWS_PER_TIER;
      twoRowUsed++;
    }
    const rows = binPack(chips, maxRows);
    return {
      label: tier.label,
      accentKey: accentForTier(tier.accent, index),
      rows,
      chips,
    };
  });

  // Recount row-budget hides (binPack mutated chip.hidden) — hiddenChips counts BOTH reasons.
  dropped.hiddenChips = tiers.reduce(
    (s, t) => s + t.chips.filter((c) => c.hidden).length,
    0,
  );

  const empty = tiers.every((t) => t.rows.every((r) => r.length === 0));
  return { mode: "tiers", tiers, dropped, empty };
}

/**
 * `ranked` mode (§2.6.9) — one synthetic full-width tier; each item a single-chip row with a
 * leading ordinal. Same total cap (≤ 12 rows). Items collapse from the input tiers in order.
 */
function planRanked(all: ReadonlyArray<TierInput>, dropped: TiersDropped): TiersPlan {
  // Flatten every tier's items into one ordered list (ranked is tier-less).
  const flat: TierInputItem[] = [];
  for (const tier of all) {
    const items = Array.isArray(tier.items) ? tier.items : [];
    for (const it of items) {
      flat.push({
        label: typeof it?.label === "string" ? it.label : "",
        note: typeof it?.note === "string" ? it.note : undefined,
      });
    }
  }
  if (flat.length > MAX_TOTAL_ITEMS) dropped.itemsDropped = flat.length - MAX_TOTAL_ITEMS;
  const ranked = flat.slice(0, MAX_TOTAL_ITEMS);

  const chips: PlannedChip[] = ranked.map((it, i) => {
    const trimmed = it.label.trim();
    if (cp(trimmed) > ITEM_LABEL_MAX_CP) dropped.truncatedLabels++;
    if (it.note && cp(it.note) > NOTE_MAX_CP) dropped.truncatedLabels++;
    return {
      label: trimmed,
      note: it.note,
      rank: i + 1,
      width: TRACK_WIDTH, // full-width rows
      hidden: false,
    };
  });

  // One synthetic tier; each chip is its own row (vertical leaderboard).
  const tier: PlannedTier = {
    label: "",
    accentKey: "cyan",
    rows: chips.map((c) => [c]),
    chips,
  };
  return { mode: "ranked", tiers: [tier], dropped, empty: chips.length === 0 };
}

// ── Animation timing (§2.5.5) — locked module constants, designed in `t`-space ──────────────
// tiers reveal strictly top→bottom; within a tier the band fades first, then chips
// overlapping-stagger left→right (stagger 0.028 < dur 0.08 ⇒ chips overlap — the intended
// disconnected-item pop). DecompBar/Divergence convention: opacity + rise, transform OMITTED at
// settle. The component consumes these; tools/qa-tiers.mjs unit-tests the settle arithmetic.
export const TIER_BAND_0 = 0.2; // first tier band on
export const TIER_STEP = 0.105; // per-tier delay
export const BAND_DUR = 0.08; // band fade duration
export const CHIP_OFFSET = 0.06; // chip start offset within a tier (after the band)
export const CHIP_STAGGER = 0.028; // per-chip stagger (< CHIP_DUR ⇒ overlap)
export const CHIP_DUR = 0.08; // chip fade duration

/** Band reveal window start for tier i. */
export function tierBandStart(i: number): number {
  return TIER_BAND_0 + TIER_STEP * i;
}

/** Chip reveal window start for chip j of tier i (flat across both rows, left→right). */
export function chipStart(i: number, j: number): number {
  return tierBandStart(i) + CHIP_OFFSET + CHIP_STAGGER * j;
}

/** The `t` at which the whole stack has settled (last chip of the densest legal layout). */
export function settleT(plan: TiersPlan): number {
  let last = TIER_BAND_0 + BAND_DUR;
  plan.tiers.forEach((tier, i) => {
    const visible = tier.rows.flat();
    visible.forEach((_, j) => {
      last = Math.max(last, chipStart(i, j) + CHIP_DUR);
    });
    last = Math.max(last, tierBandStart(i) + BAND_DUR);
  });
  return last;
}
