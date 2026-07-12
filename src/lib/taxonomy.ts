// PL-3.4 — Taxonomy / grouped-hierarchy plan: the pure "taxonomy brain" shared by the renderer
// (PostRenderer → Taxonomy) and the deterministic check suite (tools/qa-taxonomy.mjs). The LAST
// genuinely-new shape in the library. It closes the grouped-HIERARCHY / belongs-to-structure gap:
// N qualitative CATEGORIES each containing named CHILDREN, drawn as a tidy node-link TREE
// (synthetic root → category nodes → leaf nodes) on a SHARED canvas — the parent→child LINKS carry
// the belongs-to relation. NOT an ordering (that's tiers); NOT part-of-one-whole (that's stack/donut).
//
// Dependency decision (PL-3.4 PM verify): NO new dependency. The design (§2.1) provisionally adopted
// `d3-hierarchy` for a tidy `tree()` layout, but the wrap-to-≤2-sub-rows leaf cap can't be expressed by
// a single-row tidy layout, so the actual node placement is a HAND-ROLLED contiguous-per-category SLOT
// GRID (leaf x = slot · leafPitch, ≥ MIN_LEAF_PITCH by construction; category x = mean of its leaf xs;
// ranks at fixed ys) — which IS the provable no-node-overlap + child-within-band layout. d3-hierarchy's
// output was discarded, so it earned nothing and was removed. Layout math uses only `d3-scale`-free
// arithmetic; every other helper is reused (`estW`, `accentForIndex`). The viewBox is row-aware (§2.10).
//
// PL-0.8 ROW-AWARE viewBox (the §2.10 decision + the §3 BINDING CORRECTION). Width is FIXED (1000);
// height is row-aware — the renderer measures its row's aspect and passes a `viewH` so the viewBox
// aspect MATCHES the row → the SVG fills the full row WIDTH (uniform scale, scaleX==scaleY) so the
// thin LINKS (a scatter-class fragile feature) stay width-driven (≥1px@390) and the leaf-rank pitch
// is never compressed. Taxonomy is HEIGHT-HUNGRY: it has THREE FIXED ranks (root·category·leaf) whose
// vertical fit no leaf-cap can buy. The §3 binding correction:
//   - MIN_VIEW_H = 336 — the proven 3-rank floor: ROOT_Y 56 + 2·MIN_RANK_GAP_Y 104 + NODE_H/2 32 +
//     RANK_BOTTOM_PAD 40 = 336 (single leaf sub-row). clampViewH floors here; in a container shorter
//     than the 336-equivalent the row-aware SVG fits by HEIGHT and LETTERBOXES horizontally (accept —
//     a smaller-but-complete tree beats an overflowing one; links/chips stay legible-or-hidden, never
//     clipped).
//   - RANK_GAP_Y reserves the leaf chip's own NODE_H/2 (and the wrap band when 2 leaf sub-rows are
//     active): RANK_GAP_Y = clamp((viewH − RANK_TOP − RANK_BOTTOM_PAD − NODE_H/2 − leafWrapExtra) /
//     rankSpan, MIN_RANK_GAP_Y, 150). 2-sub-row wrap is GATED on a viewH that actually holds it (the
//     resulting gap must still be ≥ MIN_RANK_GAP_Y with the extra band, else force 1 sub-row + the
//     7-leaf cap). So leaf chips NEVER overflow the bottom at any viewH.
//
// The viewH ∈ {336, 480, 640} fit table (rankSpan = 2; leafWrapExtra = 0 @1 sub-row, NODE_H+gap = 88
// @2 sub-rows; chip half-height NODE_H/2 = 32; frame floor = viewH − RANK_BOTTOM_PAD):
//   viewH 336 → 1 sub-row, leaf cap 7:  gap clamp((336−56−40−32−0)/2=104) → 104 (floor); ROOT_Y 56,
//                catY 160, leafY 264; leaf chip bottom 264+32 = 296 == frame floor 296. NO overflow ✓
//                (2 sub-rows would need gap (336−56−40−32−88)/2=60 < 104 → DISALLOWED, forced to 1.)
//   viewH 480 → 2 sub-rows, leaf cap 14: gap clamp((480−56−40−32−88)/2=132) → 132; leafY 320, sub-row2
//                408, bottom 408+32 = 440 == frame floor 440. NO overflow ✓ (132 ≥ 104 → 2 rows held.)
//   viewH 640 → 2 sub-rows, leaf cap 14: gap clamp((640−56−40−32−88)/2=212) → 150 (cap); leafY 356,
//                sub-row2 444, bottom 444+32 = 476 < frame floor 600. NO overflow, comfortable ✓.
// viewH defaults to 640 ⇒ every already-fitting render is byte-identical.
// Spec: planning/primitive-library/handoffs/PL-3.4-taxonomy.md §2.4 / §2.5 / §2.6 / §2.10 / §3.
import { estW } from "./stack.ts";
import { accentForIndex, formatTick, type AccentKey } from "./bars.ts";

export type TaxMode = "curve" | "elbow";
export type TaxValuesKnob = "off" | "on";

// ── Fixed source-px geometry (the 1000×viewH viewBox) — §2.4. Width FIXED; height ROW-AWARE. ──────
export const VIEW_W = 1000;
export const VIEW_H = 640; // default / max viewBox height
export const MIN_VIEW_H = 336; // §3 BINDING — the proven 3-rank vertical floor (see header fit table)
export const CANVAS_X0 = 24;
export const CANVAS_X1 = 976; // usable canvas width = 952
export const RANK_TOP = 56; // top air to the root chip center (fixed px)
export const RANK_BOTTOM_PAD = 40; // bottom air below the leaf chips (fixed px)
export const NODE_H = 64; // C-NODEH — node-chip height (→ 23px@390, ≥ the 18px text floor + padding)
export const MIN_NODE_W = 96; // C-NODEW — node-chip min width (~one short word at the floor)
export const MAX_NODE_W = 320; // node-chip max width (a long label clamps here, FitLine inside)
export const NODE_GAP_X = 24; // C-GAP — min horizontal gap between sibling chip rects (> 14px floor)
export const NODE_PAD_X = 18; // horizontal padding inside a chip (label box = chipW − 2·NODE_PAD_X)
export const RANK_GAP_Y = 150; // C-RANKGAP — vertical center-to-center between ranks at default viewH
export const MIN_RANK_GAP_Y = 104; // floor for RANK_GAP_Y (NODE_H 64 + ≥40px link air) — links visible
export const MIN_LEAF_PITCH = 120; // MIN_NODE_W 96 + NODE_GAP_X 24 — leaf-rank pitch floor (no overlap)
export const LEAF_WRAP_EXTRA = NODE_H + NODE_GAP_X; // 88 — the 2nd leaf sub-row band (chip + gap)
export const LINK_STROKE = 4; // C-LINK — link stroke (→ 1.44px@390 ≥ the 1px hairline floor)
export const ROOT_R = 14; // synthetic-root hub radius when rootLabel omitted (→ ~10px@390 diameter)
export const CAT_LABEL_PX = 26; // category node label (26 × FitLine zoom ≥ 18 ⇒ zoom ≥ 0.69)
export const LEAF_LABEL_PX = 22; // leaf node label (22 × zoom ≥ 18 ⇒ zoom ≥ 0.82)
export const ROOT_LABEL_PX = 26; // synthetic-root label when present
export const VALUE_PX = 20; // leaf value count chip text
export const CAT_LABEL_MAX_CP = 16; // C-CHARS — category label cap
export const LEAF_LABEL_MAX_CP = 14; // C-CHARS — leaf label cap
export const ROOT_LABEL_MAX_CP = 18;
export const MAX_CATEGORIES = 4; // C1 — schema/strict cap (the middle rank, never the binding axis)
export const MAX_CHILDREN_PER_CAT = 6; // C2
export const MAX_TOTAL_LEAVES = 14; // C3 — global leaf cap (the mobile-legibility binding cap)
export const RANK_SPAN = 2; // root→category, category→leaf

// ── Animation timing (§2.5) — exported so renderer + qa share one source of truth ──────────────
export const FRAME_START = 0.2; // panel/caption fade in
export const ROOT_POP = 0.26; // synthetic root node pops
export const RANK1_START = 0.34; // root→category links begin drawing
export const LINK_DUR = 0.1; // per-link strokeDashoffset draw duration
export const POP_DUR = 0.07; // per-node pop duration
export const SETTLE_DEADLINE = 0.85; // the LAST leaf must settle by here
export const MAX_STAGGER = 0.06; // per-rank link overlap stagger cap

// FitLine effective floor zooms (label hidden below these) — §2.4 C-FIT.
const CAT_FIT_FLOOR_ZOOM = 18 / CAT_LABEL_PX; // 0.692…
const LEAF_FIT_FLOOR_ZOOM = 18 / LEAF_LABEL_PX; // 0.818…
const ROOT_FIT_FLOOR_ZOOM = 18 / ROOT_LABEL_PX;

// estW() is calibrated at 26px (stack.ts). Labels render at their own px → scale the estimate.
const CAT_EST_SCALE = CAT_LABEL_PX / 26;
const LEAF_EST_SCALE = LEAF_LABEL_PX / 26;
const ROOT_EST_SCALE = ROOT_LABEL_PX / 26;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const cp = (s: string): number => [...s].length;

const KNOWN_ACCENTS = new Set<AccentKey>(["cyan", "amber", "violet", "mint", "burnt"]);
function accentOr(author: string | undefined, fallback: AccentKey): AccentKey {
  if (author && KNOWN_ACCENTS.has(author as AccentKey)) return author as AccentKey;
  return fallback;
}

export type TaxonomyLeafInput = { label?: string; value?: number; children?: unknown };
export type TaxonomyCategoryInput = { label?: string; accent?: string; children?: TaxonomyLeafInput[] };

export type PlannedNode = {
  rank: 0 | 1 | 2; // 0 root · 1 category · 2 leaf
  catIndex: number; // owning category index (root: -1) — the band check
  cx: number;
  cy: number; // FINAL chip center (constant across t)
  w: number;
  h: number; // chip rect size (h == NODE_H; w == per-rank-clamped width)
  accentKey: AccentKey;
  isRoot: boolean;
  showHub: boolean; // root rendered as a small neutral hub (no rootLabel)
  label: string;
  showLabel: boolean;
  labelScale: number; // FitLine zoom applied to the rendered label (≥ floor when shown; 1 when it fits)
  labelHideReason?: "empty" | "tooLong" | "tooThin";
  valueText: string | null;
  showValue: boolean; // leaf value chip (showValues:"on")
  popStart: number; // node pop window start (= its parent link's draw end)
};

export type PlannedLink = {
  parent: number; // index into nodes[]
  child: number; // index into nodes[]
  x1: number;
  y1: number; // parent chip bottom-center
  x2: number;
  y2: number; // child chip top-center
  drawStart: number;
  drawDur: number; // strokeDashoffset draw window (overlap-stagger within rank)
  accentKey: AccentKey; // child's (=parent's) accent — neutral-tinted (§2.9)
};

export type CategoryBand = { catIndex: number; x0: number; x1: number }; // leaf-band — child-within-parent

export type TaxonomyPlan = {
  mode: TaxMode;
  nodes: PlannedNode[];
  links: PlannedLink[];
  bands: CategoryBand[];
  rootLabel: string;
  showRoot: boolean;
  unit: string;
  dropped: {
    categoriesDropped: number;
    childrenDropped: number;
    leavesDropped: number;
    invalidCategories: number;
    invalidLeaves: number;
    hiddenLabels: number;
    depthFlattened: number;
    valueSuppressed: number;
    hiddenValueChips: number;
  };
  empty: boolean;
  // PL-0.8 row-aware viewBox geometry (default viewH 640 ⇒ byte-identical).
  viewH: number;
  rootY: number;
  catY: number;
  leafY: number;
  rankGapY: number;
  leafRows: number;
};

export type PlanTaxonomyInput = {
  categories?: TaxonomyCategoryInput[];
  rootLabel?: string;
  mode?: TaxMode | string;
  showValues?: TaxValuesKnob | string;
  unit?: string;
  /** PL-0.8 — row-aware viewBox height (renderer-measured). Omitted/invalid → VIEW_H (640). */
  viewH?: number;
};

/** Clamp an aspect-derived viewBox height into the supported band [MIN_VIEW_H, VIEW_H]. */
export function clampViewH(viewH: number): number {
  return clamp(Math.round(isNum(viewH) ? viewH : VIEW_H), MIN_VIEW_H, VIEW_H);
}

export type PlotBounds = { viewH: number; rootY: number; catY: number; leafY: number; rankGapY: number; leafRows: number };

/**
 * §3 row-aware rank bands for a (clamped) viewH — the single source of truth shared by the renderer
 * (Taxonomy), the check (qa-taxonomy recomputes from the rendered viewBox), and the planner. RANK_GAP_Y
 * reserves the leaf chip's own NODE_H/2 PLUS the wrap band when 2 leaf sub-rows are active. The 2nd
 * sub-row is GATED: it is enabled only when the resulting gap (with the wrap-extra reserved) still
 * floors at ≥ MIN_RANK_GAP_Y — else 1 sub-row (and the dynamic leaf cap drops to the single-row count).
 * This is what makes leaf chips NEVER overflow the bottom at any viewH (the header fit table).
 */
export function rankBands(viewH: number): PlotBounds {
  const vH = clampViewH(viewH);
  // Try 2 sub-rows first (reserve the wrap band); fall back to 1 if it would breach the gap floor.
  const gap2raw = (vH - RANK_TOP - RANK_BOTTOM_PAD - NODE_H / 2 - LEAF_WRAP_EXTRA) / RANK_SPAN;
  const twoRowsHold = gap2raw >= MIN_RANK_GAP_Y;
  const leafRows = twoRowsHold ? 2 : 1;
  const leafWrapExtra = leafRows === 2 ? LEAF_WRAP_EXTRA : 0;
  const rankGapY = clamp((vH - RANK_TOP - RANK_BOTTOM_PAD - NODE_H / 2 - leafWrapExtra) / RANK_SPAN, MIN_RANK_GAP_Y, RANK_GAP_Y);
  const rootY = RANK_TOP;
  const catY = rootY + rankGapY;
  const leafY = catY + rankGapY;
  return { viewH: vH, rootY, catY, leafY, rankGapY, leafRows };
}

/** Back-compat plot-band export (mirrors scatter/distribution `plotBounds(viewH)`). */
export function plotBounds(viewH: number): PlotBounds {
  return rankBands(viewH);
}

/**
 * §3 DYNAMIC leaf cap on the RENDERED viewH (the Distribution §3 binding-correction analog, applied to
 * the HORIZONTAL leaf axis): the leaf-rank pitch (center-to-center across the 952 canvas) must stay ≥
 * MIN_LEAF_PITCH so two leaf chips never overlap. Per sub-row, floor(canvasW / MIN_LEAF_PITCH) = 7
 * leaves fit; up to `maxLeafRows(viewH)` ∈ {1,2} sub-rows. So a tall row holds 14, a short row holds 7
 * (surplus even-stride downsampled, surfaced). Clamped to [2, MAX_TOTAL_LEAVES].
 */
export function maxLeafRows(viewH: number): number {
  return rankBands(viewH).leafRows;
}
export function effectiveMaxLeaves(viewH: number): number {
  const canvasW = CANVAS_X1 - CANVAS_X0; // 952
  const perRow = Math.floor(canvasW / MIN_LEAF_PITCH); // 7
  const raw = perRow * maxLeafRows(viewH);
  return clamp(raw, 2, MAX_TOTAL_LEAVES);
}

/**
 * Per-rank chip-width clamp (C-NODEW): a chip is sized to its label (estW·scale + 2·pad), floored at
 * MIN_NODE_W and capped at min(MAX_NODE_W, pitch − NODE_GAP_X) so adjacent chip rects on a rank are
 * ALWAYS disjoint by ≥ NODE_GAP_X. A leaf chip at 120px pitch is capped to 120 − 24 = 96 = MIN_NODE_W.
 */
export function chipWidth(label: string, fontPx: number, pitch: number): number {
  const scale = fontPx / 26;
  const inner = estW(label) * scale;
  const cap = Math.min(MAX_NODE_W, Math.max(MIN_NODE_W, pitch - NODE_GAP_X));
  return clamp(inner + 2 * NODE_PAD_X, MIN_NODE_W, cap);
}

/** Pure stagger-vs-N (§2.5): the last link in a rank's window must finish by the window end. `n` ≤ 1 → MAX. */
export function staggerForN(n: number, windowSpan: number): number {
  if (n <= 1) return MAX_STAGGER;
  return Math.min(MAX_STAGGER, Math.max(0, (windowSpan - LINK_DUR) / (n - 1)));
}

// cubic-bezier(0.65,0,0.35,1) — easeInOutCubic, the chart-family grow/pop ease. Local 40-step
// bisection so render + check share one dependency-free implementation (mirrors distribution.ts).
const X1 = 0.65;
const X2 = 0.35;
const bez = (p: number, a1: number, a2: number) => (((1 - 3 * a2 + 3 * a1) * p + (3 * a2 - 6 * a1)) * p + 3 * a1) * p;
function ease(x: number): number {
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

/** Node pop progress ∈ [0,1] (opacity + scale pop about the chip center), eased + clamped. */
export function nodeReveal(t: number, popStart: number): number {
  return ease(clamp01((t - popStart) / POP_DUR));
}
/** Link draw progress ∈ [0,1] (strokeDashoffset 1−reveal), eased + clamped. */
export function linkReveal(t: number, drawStart: number, drawDur: number): number {
  return ease(clamp01((t - drawStart) / Math.max(drawDur, 1e-6)));
}

/** Even-stride downsample keeping first+last (the funnel/candlestick/distribution fitNodes pattern). */
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

// Internal normalized shape after the drop/cap pass.
type NormLeaf = { label: string; value: number | null };
type NormCat = { label: string; accentKey: AccentKey; leaves: NormLeaf[] };

/** Resolve a node label's fit-or-hide on the FitLine floor (C-FIT). Hidden below the floor, never
 *  shrunk past it; returns the FitLine zoom to apply to the rendered label (≤1; 1 when it already
 *  fits the inner box). `innerOverride` lets a leaf reserve room for its value chip. */
function fitLabel(
  label: string,
  chipW: number,
  maxCp: number,
  floorZoom: number,
  estScale: number,
  innerOverride?: number,
): { show: boolean; scale: number; reason?: "empty" | "tooLong" | "tooThin" } {
  const trimmed = label.trim();
  if (trimmed.length === 0) return { show: false, scale: 1, reason: "empty" };
  if (cp(trimmed) > maxCp) return { show: false, scale: 1, reason: "tooLong" };
  const inner = (innerOverride ?? chipW - 2 * NODE_PAD_X);
  const naturalW = estW(trimmed) * estScale;
  const zoom = naturalW > 0 ? Math.min(1, inner / naturalW) : 1;
  if (zoom < floorZoom - 1e-9) return { show: false, scale: 1, reason: "tooThin" };
  return { show: true, scale: zoom };
}

/**
 * The pure taxonomy layout brain. Coerces knobs, enforces depth 2 (drops leaf children), normalizes +
 * downsamples categories (cap 4) / children (cap 6) / total leaves (dynamic cap on the rendered viewH),
 * places nodes via the hand-rolled per-category slot grid (leaf x = slot·leafPitch; category x = mean of
 * its leaf xs), normalizes/clamps centers into the canvas, applies the per-rank chip-width clamp, wraps
 * leaf sub-rows when the dynamic cap needs 2,
 * records each category's leaf band, builds links (same endpoints for both modes), resolves label
 * fit-or-hide + value chips, and computes the per-rank reveal windows — all from DATA only, never `t`.
 */
export function planTaxonomy(input: PlanTaxonomyInput): TaxonomyPlan {
  // 1. Coerce knobs (unknown → default).
  const mode: TaxMode = input.mode === "elbow" ? "elbow" : "curve";
  const showValues: TaxValuesKnob = input.showValues === "on" ? "on" : "off";
  const unit = typeof input.unit === "string" ? input.unit : "";
  const rootLabelRaw = typeof input.rootLabel === "string" ? input.rootLabel.trim() : "";

  const dropped = {
    categoriesDropped: 0,
    childrenDropped: 0,
    leavesDropped: 0,
    invalidCategories: 0,
    invalidLeaves: 0,
    hiddenLabels: 0,
    depthFlattened: 0,
    valueSuppressed: 0,
    hiddenValueChips: 0,
  };

  // 2. Row-aware ranks (PL-0.8 + §3). viewH defaults to 640.
  const { viewH, rootY, catY, leafY, rankGapY, leafRows } = rankBands(input.viewH ?? VIEW_H);

  // 3. Normalize categories. Drop invalid; even-stride downsample > 4; per category: drop invalid
  //    leaves, FLATTEN any leaf-children (depth fixed at 2), even-stride downsample > 6.
  const rawCats = Array.isArray(input.categories) ? input.categories : [];
  const usable: { label: string; accent?: string; leaves: NormLeaf[]; order: number }[] = [];
  rawCats.forEach((c, i) => {
    if (!c || typeof c !== "object") {
      dropped.invalidCategories++;
      return;
    }
    const catLabel = typeof c.label === "string" ? c.label.trim() : "";
    const rawChildren = Array.isArray(c.children) ? c.children : [];
    const leaves: NormLeaf[] = [];
    for (const leaf of rawChildren) {
      if (!leaf || typeof leaf !== "object") {
        dropped.invalidLeaves++;
        continue;
      }
      // Depth enforcement (C-DEPTH): a leaf's own `children` are GRANDCHILDREN — dropped, surfaced.
      const leafChildren = (leaf as TaxonomyLeafInput).children;
      if (Array.isArray(leafChildren) && leafChildren.length > 0) {
        dropped.depthFlattened++;
      }
      const leafLabel = typeof leaf.label === "string" ? leaf.label.trim() : "";
      const value = isNum(leaf.value) ? (leaf.value as number) : null;
      if (leafLabel.length === 0) {
        // No usable label and no value to stand in → drop.
        dropped.invalidLeaves++;
        continue;
      }
      leaves.push({ label: leafLabel, value });
    }
    // A category with neither a usable label NOR any usable child is dropped (never an empty branch).
    if (catLabel.length === 0 && leaves.length === 0) {
      dropped.invalidCategories++;
      return;
    }
    usable.push({ label: catLabel, accent: typeof c.accent === "string" ? c.accent : undefined, leaves, order: i });
  });

  // Empty state — 0 renderable categories after the drop.
  if (usable.length === 0) {
    return {
      mode,
      nodes: [],
      links: [],
      bands: [],
      rootLabel: rootLabelRaw,
      showRoot: false,
      unit,
      dropped,
      empty: true,
      viewH,
      rootY,
      catY,
      leafY,
      rankGapY,
      leafRows,
    };
  }

  // C1 — category cap 4, even-stride keep-first-last.
  let cats = usable;
  if (usable.length > MAX_CATEGORIES) {
    dropped.categoriesDropped = usable.length - MAX_CATEGORIES;
    cats = evenStride(usable, MAX_CATEGORIES);
  }

  // C2 — per-category children cap 6, even-stride keep-first-last within the category.
  cats.forEach((c) => {
    if (c.leaves.length > MAX_CHILDREN_PER_CAT) {
      dropped.childrenDropped += c.leaves.length - MAX_CHILDREN_PER_CAT;
      c.leaves = evenStride(c.leaves, MAX_CHILDREN_PER_CAT);
    }
  });

  // C3 — TOTAL leaf cap (DYNAMIC on the rendered viewH), drop from the LAST category's LAST leaf inward.
  const cap = effectiveMaxLeaves(viewH);
  let total = cats.reduce((s, c) => s + c.leaves.length, 0);
  for (let ci = cats.length - 1; ci >= 0 && total > cap; ci--) {
    const leaves = cats[ci].leaves;
    while (leaves.length > 0 && total > cap) {
      leaves.pop();
      dropped.leavesDropped++;
      total--;
    }
  }

  // 4. Accents (category position default; author `accent` wins). Build the normalized tree.
  const normCats: NormCat[] = cats.map((c, i) => ({
    label: c.label,
    accentKey: accentOr(c.accent, accentForIndex(undefined, i)),
    leaves: c.leaves,
  }));

  // 5. Slot-grid layout (hand-rolled — see the header note; no d3-hierarchy). The leaf x-step is set so
  //    the leaf rank packs the 952 canvas at the dynamic
  //    cap (pitch ≥ MIN_LEAF_PITCH by construction). A category with 0 children is a leaf of the root
  //    in the layout (no rank-2 link); we still place it on the CATEGORY rank (rank 1) below.
  const leafTotal = normCats.reduce((s, c) => s + c.leaves.length, 0);
  const canvasW = CANVAS_X1 - CANVAS_X0; // 952
  const xCenterCanvas = (CANVAS_X0 + CANVAS_X1) / 2;

  // Per-category sub-row split (deterministic): a category wraps to 2 sub-rows only when wrapping is
  // enabled (leafRows===2) AND it has > the per-row count's worth of leaves. perRow = ceil(count/rows).
  const catRows: number[] = normCats.map((c) => (leafRows === 2 && c.leaves.length > Math.ceil(c.leaves.length / 2) ? 2 : 1));
  // The TOP sub-row's slot count per category sets the leaf-rank slot grid; each category occupies a
  // CONTIGUOUS block of slots (so sibling-category bands stay disjoint). Within a category, sub-row r
  // holds leaves [r·perRow .. (r+1)·perRow); the 2nd sub-row REUSES the top row's x slots (nests under
  // it). The global slot pitch is sized so totalTopSlots slots fill the canvas at ≥ MIN_LEAF_PITCH —
  // the dynamic cap (effectiveMaxLeaves) guarantees totalTopSlots ≤ floor(canvasW/MIN_LEAF_PITCH)=7,
  // so the pitch is ALWAYS ≥ MIN_LEAF_PITCH by construction (the §3 horizontal-floor proof).
  const catTopSlots: number[] = normCats.map((c, ci) => Math.max(1, Math.ceil(c.leaves.length / catRows[ci])));
  const totalTopSlots = leafTotal > 0 ? catTopSlots.reduce((s, n) => s + n, 0) : 0;
  const leafPitch = totalTopSlots > 0 ? Math.max(MIN_LEAF_PITCH, canvasW / totalTopSlots) : MIN_LEAF_PITCH;
  const leafRowW = Math.max(0, (Math.max(totalTopSlots, 1) - 1) * leafPitch);
  const leafX0 = xCenterCanvas - leafRowW / 2; // first leaf-slot center
  // Per-category starting slot index (running) → the category's leaf block start.
  const catSlotStart: number[] = [];
  {
    let acc = 0;
    normCats.forEach((_, ci) => {
      catSlotStart[ci] = acc;
      acc += catTopSlots[ci];
    });
  }

  // Node layout is a HAND-ROLLED contiguous-per-category SLOT GRID (PL-3.4 PM verify): each leaf gets a
  // slot-derived x so the per-sub-row pitch is EXACTLY `leafPitch` ≥ MIN_LEAF_PITCH (no overlap, by
  // construction, wrappable to ≤ leafRows sub-rows — which a single-row tidy layout can't encode), then
  // each category is re-centered over the mean of its own leaf xs (parent-over-children). NO d3-hierarchy:
  // its `tree()` layout produces a single-row x we'd have to discard, so it earned nothing here — the slot
  // grid is the actual (and provably-no-overlap) layout. Leaves are enumerated in author order directly.
  type CatStruct = { ci: number; leaves: number[] }[];
  const catStruct: CatStruct = normCats.map((c, ci) => ({ ci, leaves: c.leaves.map((_, li) => li) }));

  // 6. Build planned nodes. Root → rank 0 at rootY; categories → rank 1 at catY; leaves → rank 2 at
  //    leafY (+ wrap to a 2nd sub-row within the category when leafRows===2 and the cat has > slot/cat).
  const nodes: PlannedNode[] = [];
  const nodeIndexByKey = new Map<string, number>();
  const key = (ci: number, li: number) => `${ci}:${li}`;

  const showRoot = rootLabelRaw.length > 0;
  // Root chip / hub. Centered over the whole category band.
  const rootCx = xCenterCanvas;
  let rootChipW = MIN_NODE_W;
  let rootShowLabel = false;
  let rootLabelScale = 1;
  let rootHideReason: PlannedNode["labelHideReason"];
  if (showRoot) {
    rootChipW = chipWidth(rootLabelRaw, ROOT_LABEL_PX, MAX_NODE_W + NODE_GAP_X);
    const fit = fitLabel(rootLabelRaw, rootChipW, ROOT_LABEL_MAX_CP, ROOT_FIT_FLOOR_ZOOM, ROOT_EST_SCALE);
    rootShowLabel = fit.show;
    rootHideReason = fit.reason;
    rootLabelScale = fit.scale;
    if (!fit.show && rootLabelRaw.length > 0) dropped.hiddenLabels++;
  }
  nodes.push({
    rank: 0,
    catIndex: -1,
    cx: rootCx,
    cy: rootY,
    w: showRoot ? rootChipW : ROOT_R * 2,
    h: showRoot ? NODE_H : ROOT_R * 2,
    accentKey: "cyan",
    isRoot: true,
    showHub: !showRoot,
    label: rootLabelRaw,
    showLabel: rootShowLabel,
    labelScale: rootLabelScale,
    ...(rootShowLabel ? {} : { labelHideReason: rootHideReason }),
    valueText: null,
    showValue: false,
    popStart: ROOT_POP,
  });

  // LEAVES FIRST (rank 2): place every leaf at a slot-derived x so per-sub-row pitch == leafPitch
  // (≥ MIN_LEAF_PITCH, no overlap, by construction), wrapped to ≤ leafRows sub-rows WITHIN the
  // category. Sub-row y = leafY + r·LEAF_WRAP_EXTRA. Record each category's leaf band + center.
  const catNode = catStruct;
  const bands: CategoryBand[] = [];
  const catLeafXs: number[][] = normCats.map(() => []);
  // Defer the actual node pushes until after we add the root + category nodes, so node[] order is
  // root, categories…, leaves… (the rank-ascending order the renderer + gate expect). Collect leaf
  // specs first.
  type LeafSpec = { ci: number; li: number; cx: number; cy: number; w: number; show: boolean; scale: number; reason?: "empty" | "tooLong" | "tooThin"; valueText: string | null; showValue: boolean };
  const VALUE_GAP = 18; // gap between the label zone and the value chip (a buffer vs estW vs real metrics)
  const leafSpecs: LeafSpec[] = [];
  normCats.forEach((c, ci) => {
    const rows = catRows[ci];
    const perRow = Math.max(1, Math.ceil(c.leaves.length / rows));
    let bandX0 = Infinity;
    let bandX1 = -Infinity;
    c.leaves.forEach((leaf, li) => {
      const r = Math.floor(li / perRow); // sub-row 0..rows-1
      const slotInRow = li % perRow; // 0..perRow-1 within this sub-row
      const slot = catSlotStart[ci] + slotInRow; // global TOP-row slot (sub-rows reuse the same xs)
      // A leaf with a value chip needs a WIDER chip so the label + count both fit. Size the chip to the
      // label, then if a value chip will show, widen by the value text + a gap (clamped to the pitch).
      const inner0 = chipWidth(leaf.label, LEAF_LABEL_PX, leafPitch) - 2 * NODE_PAD_X;

      // Value chip (showValues:"on" + a finite value). Off ⇒ suppressed (advisory). Resolved BEFORE the
      // label so the label zone reserves room for it (no label↔value overlap).
      let valueText: string | null = null;
      let showValue = false;
      let valueW = 0;
      if (leaf.value != null) {
        if (showValues === "on") {
          const text = formatTick(leaf.value, unit);
          const vw = estW(text) * (VALUE_PX / 26);
          // Show the value chip if it fits within the per-rank chip-width cap alongside the label zone.
          if (text.trim().length > 0 && vw + VALUE_GAP < leafPitch - NODE_GAP_X - 2 * NODE_PAD_X) {
            valueText = text;
            showValue = true;
            valueW = vw + VALUE_GAP;
          } else {
            dropped.hiddenValueChips++;
          }
        } else {
          dropped.valueSuppressed++;
        }
      }
      // Chip width: label zone + value zone + padding, capped per-rank (no overlap with neighbours).
      const cap = Math.min(MAX_NODE_W, Math.max(MIN_NODE_W, leafPitch - NODE_GAP_X));
      const cw = clamp(inner0 + valueW + 2 * NODE_PAD_X, MIN_NODE_W, cap);
      const labelInner = cw - 2 * NODE_PAD_X - valueW; // the label's own zone (value reserved)
      const fit = fitLabel(leaf.label, cw, LEAF_LABEL_MAX_CP, LEAF_FIT_FLOOR_ZOOM, LEAF_EST_SCALE, labelInner);
      if (!fit.show && leaf.label.trim().length > 0) dropped.hiddenLabels++;
      const cx = leafX0 + slot * leafPitch;
      const cy = leafY + r * LEAF_WRAP_EXTRA;
      catLeafXs[ci].push(cx);

      leafSpecs.push({ ci, li, cx, cy, w: cw, show: fit.show, scale: fit.scale, reason: fit.reason, valueText, showValue });
      bandX0 = Math.min(bandX0, cx - cw / 2);
      bandX1 = Math.max(bandX1, cx + cw / 2);
    });
    if (c.leaves.length === 0) {
      // Zero-children category: band recorded after we know its chip x (its own center). Placeholder.
      bands.push({ catIndex: ci, x0: NaN, x1: NaN });
    } else {
      bands.push({ catIndex: ci, x0: bandX0 - NODE_GAP_X / 2, x1: bandX1 + NODE_GAP_X / 2 });
    }
  });

  // Category nodes (rank 1): x = mean of the category's own leaf xs (parent-centering), or — for a
  // 0-child category — its slot-derived x. Compute ALL centers first, then size each chip so adjacent
  // category chips never overlap: the per-rank chip-width cap is the gap to the NEAREST neighbour
  // center minus NODE_GAP_X (the leaf-rank clamp, applied to the category rank). Uneven leaf
  // distributions can pull two category means close, so this neighbour-aware cap is what guarantees
  // no category-rank overlap (the §2.4.1 disjointness on the middle rank).
  const catCenterX: number[] = normCats.map((_c, ci) => {
    const xsForCat = catLeafXs[ci];
    return xsForCat.length ? xsForCat.reduce((s, x) => s + x, 0) / xsForCat.length : leafX0 + catSlotStart[ci] * leafPitch;
  });
  const catCountN = catCenterX.length;
  normCats.forEach((c, ci) => {
    // Nearest-neighbour gap (center-to-center) on the category rank.
    let nbrGap = Infinity;
    if (ci > 0) nbrGap = Math.min(nbrGap, catCenterX[ci] - catCenterX[ci - 1]);
    if (ci < catCountN - 1) nbrGap = Math.min(nbrGap, catCenterX[ci + 1] - catCenterX[ci]);
    const pitch = Number.isFinite(nbrGap) ? nbrGap : canvasW;
    const cw = chipWidth(c.label, CAT_LABEL_PX, pitch);
    const fit = fitLabel(c.label, cw, CAT_LABEL_MAX_CP, CAT_FIT_FLOOR_ZOOM, CAT_EST_SCALE);
    if (!fit.show && c.label.trim().length > 0) dropped.hiddenLabels++;
    // Clamp the chip center so the chip never exits the canvas at an edge category.
    const cx = clamp(catCenterX[ci], CANVAS_X0 + cw / 2, CANVAS_X1 - cw / 2);
    catCenterX[ci] = cx;
    // Fix up a 0-child category's band to its (clamped) chip point.
    const xsForCat = catLeafXs[ci];
    if (xsForCat.length === 0) {
      const b = bands.find((bb) => bb.catIndex === ci)!;
      b.x0 = cx;
      b.x1 = cx;
    }
    nodes.push({
      rank: 1,
      catIndex: ci,
      cx,
      cy: catY,
      w: cw,
      h: NODE_H,
      accentKey: c.accentKey,
      isRoot: false,
      showHub: false,
      label: c.label,
      showLabel: fit.show,
      labelScale: fit.scale,
      ...(fit.show ? {} : { labelHideReason: fit.reason }),
      valueText: null,
      showValue: false,
      popStart: 0, // set after the link windows are computed
    });
    nodeIndexByKey.set(key(ci, -1), nodes.length - 1);
  });

  // Now push the leaf nodes (after the category nodes) so node[] is root → categories → leaves.
  for (const s of leafSpecs) {
    nodes.push({
      rank: 2,
      catIndex: s.ci,
      cx: s.cx,
      cy: s.cy,
      w: s.w,
      h: NODE_H,
      accentKey: normCats[s.ci].accentKey,
      isRoot: false,
      showHub: false,
      label: normCats[s.ci].leaves[s.li].label,
      showLabel: s.show,
      labelScale: s.scale,
      ...(s.show ? {} : { labelHideReason: s.reason }),
      valueText: s.valueText,
      showValue: s.showValue,
      popStart: 0,
    });
    nodeIndexByKey.set(key(s.ci, s.li), nodes.length - 1);
  }

  // Re-center the synthetic root over the mean of its category centers (Reingold–Tilford parent
  // centering, preserved manually since we placed categories from their leaves).
  if (catCenterX.length) {
    nodes[0].cx = catCenterX.reduce((s, x) => s + x, 0) / catCenterX.length;
  }

  // 7. Build links (parent bottom-center → child top-center) — SAME endpoints for both modes. Compute
  //    the per-rank draw windows + the node pop windows (a node pops as its parent link finishes).
  const links: PlannedLink[] = [];
  const rootIdx = 0;

  // Rank-1 links: root → categories. Window [RANK1_START, RANK1_START + r1Span]; r1Span sized so the
  // last category link finishes well before the rank-2 build needs the bulk of the [.., 0.85] budget.
  const C = catNode.length;
  const R1_SPAN = 0.18; // root→category build window
  const r1Stagger = staggerForN(C, R1_SPAN);
  let catEnd = RANK1_START + LINK_DUR;
  catNode.forEach((_, ci) => {
    const catNodeIdx = nodeIndexByKey.get(key(ci, -1))!;
    const drawStart = RANK1_START + r1Stagger * ci;
    const drawEnd = drawStart + LINK_DUR;
    catEnd = Math.max(catEnd, drawEnd);
    links.push({
      parent: rootIdx,
      child: catNodeIdx,
      x1: nodes[rootIdx].cx,
      y1: nodes[rootIdx].cy + nodes[rootIdx].h / 2,
      x2: nodes[catNodeIdx].cx,
      y2: nodes[catNodeIdx].cy - nodes[catNodeIdx].h / 2,
      drawStart,
      drawDur: LINK_DUR,
      accentKey: nodes[catNodeIdx].accentKey,
    });
    nodes[catNodeIdx].popStart = drawEnd; // category pops as its link finishes
  });

  // Rank-2 links: categories → leaves. The whole build (link draw + the node pop that follows it)
  // must SETTLE by SETTLE_DEADLINE (0.85) — so the LAST leaf LINK must finish by SETTLE_DEADLINE −
  // POP_DUR (the pop runs after the link, for POP_DUR), leaving the transform OMITTED at t ≥ 0.85 (the
  // LC3/C12 settle rule). The window is [catEnd, SETTLE_DEADLINE − POP_DUR]; one global stagger across
  // all leaves keeps the last leaf's pop ending exactly at SETTLE_DEADLINE.
  const r2End = SETTLE_DEADLINE - POP_DUR;
  const r2Span = Math.max(LINK_DUR, r2End - catEnd);
  const totalLeaves = leafTotal;
  let leafOrder = 0;
  const r2Stagger = staggerForN(totalLeaves, r2Span);
  normCats.forEach((c, ci) => {
    const catNodeIdx = nodeIndexByKey.get(key(ci, -1))!;
    c.leaves.forEach((_, li) => {
      const leafIdx = nodeIndexByKey.get(key(ci, li))!;
      const drawStart = catEnd + r2Stagger * leafOrder;
      const drawEnd = drawStart + LINK_DUR;
      leafOrder++;
      links.push({
        parent: catNodeIdx,
        child: leafIdx,
        x1: nodes[catNodeIdx].cx,
        y1: nodes[catNodeIdx].cy + nodes[catNodeIdx].h / 2,
        x2: nodes[leafIdx].cx,
        y2: nodes[leafIdx].cy - nodes[leafIdx].h / 2,
        drawStart,
        drawDur: LINK_DUR,
        accentKey: nodes[leafIdx].accentKey,
      });
      nodes[leafIdx].popStart = drawEnd; // leaf pops as its link finishes
    });
  });

  return {
    mode,
    nodes,
    links,
    bands,
    rootLabel: rootLabelRaw,
    showRoot,
    unit,
    dropped,
    empty: false,
    viewH,
    rootY,
    catY,
    leafY,
    rankGapY,
    leafRows,
  };
}

export { formatTick };
export type { AccentKey };
