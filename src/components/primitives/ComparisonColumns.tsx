// ComparisonColumns — the qualitative A-vs-B comparison (the `comparison` viz). Promoted
// from the inline `Column` + grid in PostRenderer (PL-1.5), mirroring the StatHero promotion
// (PL-1.2): Path B importable, a clean home for the reveal + checks. PostRenderer's
// `comparison` branch delegates to it; t=1 geometry/text/icon is structurally identical to the
// pre-promotion inline render (gated by tools/qa-reveal.mjs against a captured baseline).
//
// It stays a TEXT primitive (icons + lists).
//
// Rev B (PL-1.5 §4) — the deck-table read was "a bit boring": two equal-weight parallel lists
// with a dead gutter. Two fixes:
//   1. PAIRED point/counterpoint reveal — the stagger is now per-ROW across BOTH columns
//      (row i = left item i + right item i reveal TOGETHER, staggered by row index), so each row
//      reads as a matched strength/cost pair. The per-item motion is unchanged (translateX
//      −12→0 + fade + icon pop); only the stagger GROUPING changed (by row, not by column). The
//      left-then-right column offset is removed — pairs land together. t=1 LAYOUT is unchanged
//      (timing-only) ⇒ the structural baseline geometry/text/icon rows stay valid (CC7).
//   2. WEIGHT the failure side — the friction column (good={false}, AlertTriangle) gets a subtle
//      burnt wash on its background (~7% opacity) + a 1px burnt border (~30%) so the eye reads
//      "costly path"; the good column stays neutral (the asymmetry IS the signal). The wash is a
//      paint-only overlay on the panel bg — item/icon/text geometry + colors are UNCHANGED, and
//      text contrast stays well above the lowContrast advisory (CC8).
//
// LAYOUT is fully reserved: every item box is present at all t; only opacity + transform
// (item translateX, icon scale) move (CC2). Transforms are OMITTED at settle — never an
// identity transform — so the final frame rasterizes exactly as the static grid (CC3/CC5).
// `clamp01` everywhere; the stagger is a pure function of ROW index, so the deepest row still
// settles ≤ 0.85 (CC4/CC7).

import type { CSSProperties } from "react";
import { Check, AlertTriangle } from "lucide-react";
import { colors, type AccentKey } from "@/tokens/design";
import { appear } from "@/lib/reveal";
import { easings } from "@/tokens/motion";
import { planNarrative, type NarrativePlan, COMPARISON_ITEM_CAP } from "@/lib/narrative";
import { Panel } from "./Panel";

export type ComparisonColumnData = { title: string; tone?: AccentKey; items: string[] };
// PL-4.1 reveal modes:
//   paired            — DEFAULT: both columns, per-ROW point/counterpoint stagger (Rev B).
//   sequential        — both columns side-by-side from t=0 (no movement); reveal the LEFT column's
//                       items one-by-one, then the RIGHT column's (absorb one side, then the other).
//   sequentialCentered— cinematic: the focused column is a MOVING standalone box, centered → off-
//                       screen → the other centers → both slide into the two-up (Emil Rev C).
export type ComparisonRevealMode = "paired" | "sequential" | "sequentialCentered";

const accentHex = (a: AccentKey = "cyan") => colors.accent[a] ?? colors.accent.cyan;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// Reveal timing on the global `t`. Fixed module constants — NOT authoring knobs.
const ROW_START = 0.2; // row 0 begins revealing
const ITEM_DUR = 0.18; // each item's own reveal window
const ROW_STEP = 0.09; // top→bottom stagger BY ROW (both columns in lockstep), ≤4 rows
const ITEM_SLIDE_PX = 12; // translateX −12 → 0 (CC3 bound)
// Worst case (deepest row, row index 3): start 0.2 + 3·0.09 = 0.47, + ITEM_DUR 0.18 = 0.65 ≤
// 0.85 settle deadline (CC4/CC7). Both columns share the same per-row window ⇒ paired reveal.

// Stagger is a PURE function of ROW index (CC7) — both columns advance in lockstep, so left
// item i and right item i share one reveal window and land as a matched point/counterpoint pair.
const rowStart = (row: number) => ROW_START + row * ROW_STEP;

// Per-item slide-in style that OMITS the transform once settled (a ≥ 1) — an identity
// translateX(0) can change rasterization; the final-frame check forbids it (CC3/CC5).
function itemStyle(t: number, start: number): CSSProperties {
  const a = appear(t, start, ITEM_DUR);
  const eased = easings.easeOutCubic(a);
  const tx = (1 - eased) * -ITEM_SLIDE_PX;
  return { opacity: clamp01(eased), ...(a < 1 ? { transform: `translateX(${tx}px)` } : {}) };
}

// A per-item reveal value (opacity 0..1) + slide-in style. In `paired` it derives from the row
// stagger on `t` (today's exact behavior). In `sequential` it derives from the item's own focus
// sub-window in the plan: enter ramp → held read → exit fade; assembly resolves ALL items to 1.
type SeqWindow = {
  enterStartT: number;
  readStartT: number;
  exitStartT: number;
  exitEndT: number;
};

function Column({
  col,
  good,
  t,
  mode = "paired",
  seq,
}: {
  col: ComparisonColumnData;
  good: boolean;
  t: number;
  mode?: ComparisonRevealMode;
  // sequential-only: the column's focus windows + the resolved opacity/transform.
  seq?: {
    windows: SeqWindow[];
    columnOpacity: number; // the whole-column focus opacity (opacity only — never unmount, N1)
    columnTransform?: string; // the moving-box transform (center / off-screen / seat); none at settle
    assembled: boolean; // assembly window → resolve every item to opacity 1
    assembleP: number; // 0..1 eased assembly progress
    settled: boolean; // t ≥ assembly.endT → pin everything (N3/N7)
  };
}) {
  const Icon = good ? Check : AlertTriangle;
  const c = accentHex(col.tone);
  const cap = mode === "sequential" ? COMPARISON_ITEM_CAP : 4; // CC-CAP — ≤5/col sequential, ≤4 paired
  const items = col.items.slice(0, cap);
  return (
    <Panel
      label={col.title}
      data-cmp-col={good ? "left" : "right"}
      // sequential (Rev C — Emil "the ENTIRE box centered, then moves outside"): the whole column
      // is a MOVING standalone box — centered during its own focus, slides off-screen during the
      // switch, slides into its final seat at resolve. Driven by opacity + a translateX transform
      // ONLY (the grid seat / offset* layout never moves — N2 holds; the transform is OMITTED once
      // settled so the final two-up is byte-identical to paired — N3).
      style={
        mode === "sequential" && seq && !seq.settled
          ? {
              opacity: clamp01(seq.columnOpacity),
              // `visibility:hidden` INHERITS to children (opacity does not), so a hidden / off-screen
              // column is excluded from the inspector's visible() scan — no false collision with the
              // centered column, no false out-of-margin for the off-screen one. Visually == opacity 0.
              visibility: clamp01(seq.columnOpacity) < 0.02 ? "hidden" : "visible",
              ...(seq.columnTransform ? { transform: seq.columnTransform } : {}),
            }
          : undefined
      }
      overlay={
        // Rev B failure-side wash — paint-only, full panel (~7% burnt), behind the content, with
        // a 1px burnt INSET border drawn ON the overlay (not the Panel root) so it adds no box-
        // model width and shifts no item (the t=1 item geometry stays byte-identical, CC8). Good
        // col: no overlay at all. The Panel's own `shadow-panel` chrome is preserved.
        good ? undefined : (
          <div
            data-cmp-wash
            className="pointer-events-none absolute inset-0 rounded-panel"
            style={{
              backgroundColor: `${colors.accent.burnt}12`,
              boxShadow: `inset 0 0 0 1px ${colors.accent.burnt}4D`,
            }}
          />
        )
      }
    >
      <div className="relative flex flex-col gap-4">
        {items.map((it, i) => {
          let style: CSSProperties;
          let iconScale: number;
          if (mode === "sequential" && seq) {
            // CMP2: each item reveals one-by-one within the focused column (its own focus
            // sub-window). enter ramp (translateX −12→0 + icon pop) → held read; assembly resolves
            // EVERY item to opacity 1 (N3). "Disappear" never happens here — items only build then
            // hold; the COLUMN ghost opacity carries the recede (N1). Plus the switch SLIDE on the
            // column content (CMP1), omitted at settle.
            const w = seq.windows[i];
            const settled = seq.settled;
            const enterP = w
              ? clamp01((t - w.enterStartT) / Math.max(1e-6, w.readStartT - w.enterStartT))
              : 0;
            const itemOpacity = settled ? 1 : Math.max(enterP, seq.assembled ? seq.assembleP : 0);
            const eased = easings.easeOutCubic(enterP);
            const slidePx = settled ? 0 : (1 - eased) * -ITEM_SLIDE_PX;
            style = {
              opacity: clamp01(itemOpacity),
              ...(Math.abs(slidePx) > 1e-3 ? { transform: `translateX(${slidePx}px)` } : {}),
            };
            const pop = settled ? 1 : enterP;
            iconScale = pop <= 0 ? 0 : pop >= 1 ? 1 : clamp01(easings.easeOutBackSubtle(pop));
          } else {
            const start = rowStart(i); // PAIRED reveal: row index drives BOTH columns (CC7)
            // Icon pop: scale 0 → 1 with easeOutBackSubtle (clamped to [0,1], CC3); transform
            // OMITTED at settle — never scale(1).
            const popLin = appear(t, start, ITEM_DUR);
            iconScale = popLin <= 0 ? 0 : popLin >= 1 ? 1 : clamp01(easings.easeOutBackSubtle(popLin));
            style = itemStyle(t, start);
          }
          return (
            <div key={i} data-cmp-item={i} className="flex items-start gap-3" style={style}>
              <span
                data-cmp-icon
                style={{
                  flexShrink: 0,
                  marginTop: 2,
                  display: "inline-flex",
                  transformOrigin: "center",
                  ...(iconScale < 1 ? { transform: `scale(${iconScale})` } : {}),
                }}
              >
                <Icon size={28} color={c} />
              </span>
              <span data-cmp-text className="text-text-primary" style={{ fontSize: 28, lineHeight: 1.25 }}>
                {it}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

type Props = {
  left: ComparisonColumnData;
  right: ComparisonColumnData;
  /** Global post progress 0..1. Default 1 ⇒ settled/static — Path B / legacy callers unchanged. */
  t?: number;
  /** PL-4.1: reveal-mode knob. Default "paired" → today's exact path (byte-identical). */
  revealMode?: ComparisonRevealMode;
  /** PL-4.1: the precomputed NarrativePlan (sequential only); the component computes it if absent. */
  narrative?: NarrativePlan;
};

export function ComparisonColumns({ left, right, t = 1, revealMode = "paired", narrative }: Props) {
  // ── DEFAULT (paired) — byte-identical early return to today's exact render path ───────────────
  if (revealMode !== "sequential" && revealMode !== "sequentialCentered") {
    return (
      <div className="grid h-full grid-cols-2 gap-6" data-cmp>
        <Column col={left} good t={t} />
        <Column col={right} good={false} t={t} />
      </div>
    );
  }

  // Shared narrative plan + phase progress (both sequential variants consume the SAME plan/timing).
  const plan =
    narrative ?? planNarrative("sequential", { left: left.items ?? [], right: right.items ?? [] });
  const settled = t >= plan.assembly.endT;
  const assembled = t >= plan.assembly.startT;
  const assembleP = assembled
    ? clamp01((t - plan.assembly.startT) / Math.max(1e-6, plan.assembly.endT - plan.assembly.startT))
    : 0;
  const assembleEased = easings.easeOutExpo(assembleP); // resolution role → final two-up
  const sideWindows = (side: "left" | "right"): SeqWindow[] =>
    plan.windows.filter((w) => w.side === side).map((w) => ({
      enterStartT: w.enterStartT,
      readStartT: w.readStartT,
      exitStartT: w.exitStartT,
      exitEndT: w.exitEndT,
    }));

  // ── NARRATIVE A — "sequential" (Emil mode 2): both boxes SIDE-BY-SIDE from t=0 (no movement);
  // reveal the LEFT column's items one-by-one, then the RIGHT column's. Both Panels are visible in
  // their final seats the whole time (columnOpacity 1, no transform); only the ITEMS reveal in plan
  // order (left group → switch gap → right group). Final frame == paired (N3). ──────────────────────
  if (revealMode === "sequential") {
    const inPlaceSeq = (side: "left" | "right") => ({
      windows: sideWindows(side),
      columnOpacity: 1,
      columnTransform: undefined,
      assembled,
      assembleP: assembleEased,
      settled,
    });
    return (
      <div className="grid h-full grid-cols-2 gap-6" data-cmp data-cmp-sequential>
        <Column col={left} good t={t} mode="sequential" seq={inPlaceSeq("left")} />
        <Column col={right} good={false} t={t} mode="sequential" seq={inPlaceSeq("right")} />
      </div>
    );
  }

  // ── NARRATIVE B — "sequentialCentered" (Emil mode 1, Rev C moving boxes) ───────────────────────
  //   left box ENTIRELY CENTERED (standalone) + items one-by-one
  //     → left box moves OUTSIDE (off-screen left) while the right box advances to CENTER
  //     → right box CENTERED (standalone) + items one-by-one
  //     → resolve: both boxes slide into their side-by-side seats (the two-up == paired final frame).
  // Both Panels are ALWAYS mounted in the grid (their seats/offset* layout never move — N2 holds);
  // the "movement" is a translateX transform + opacity ONLY, OMITTED at settle so the two-up is
  // byte-identical to paired (N3).
  const switchP = plan.switchT
    ? clamp01((t - plan.switchT.startT) / Math.max(1e-6, plan.switchT.endT - plan.switchT.startT))
    : 1;
  const switchEased = easings.easeInOutSine(switchP);
  const inSwitch = plan.switchT && t >= plan.switchT.startT && t < plan.switchT.endT;
  const beforeSwitch = !plan.switchT || t < plan.switchT.startT; // left-focus phase

  // translateX positions as {pct, px} (pct = % of the column's OWN width; +12px = half the gap-6 24px).
  // A 2-col grid column centered over the whole frame = translateX(50% + 12px) for left / −(50% + 12px)
  // for right. OFF screen = ±135% of column width. SEAT = the natural grid position (0).
  type Pos = { pct: number; px: number };
  const CENTER_L: Pos = { pct: 50, px: 12 };
  const CENTER_R: Pos = { pct: -50, px: -12 };
  const OFF_L: Pos = { pct: -135, px: 0 }; // left box exits to the left ("moves outside")
  const SEAT: Pos = { pct: 0, px: 0 };
  const lerp = (a: Pos, b: Pos, k: number): Pos => ({ pct: a.pct + (b.pct - a.pct) * k, px: a.px + (b.px - a.px) * k });
  const toTransform = (p: Pos) => `translateX(calc(${p.pct.toFixed(2)}% + ${p.px.toFixed(2)}px))`;

  // LEFT column: CENTER (left-focus) → CENTER→OFF_L as it leaves (switch) → OFF_L (right-focus)
  //              → OFF_L→SEAT (resolve, slides in from the left). Opacity 1 → fades out → 0 → fades in.
  let leftPos: Pos, leftOpacity: number;
  if (beforeSwitch) { leftPos = CENTER_L; leftOpacity = 1; }
  else if (inSwitch) { leftPos = lerp(CENTER_L, OFF_L, switchEased); leftOpacity = 1 - switchEased; }
  else if (!assembled) { leftPos = OFF_L; leftOpacity = 0; }
  else { leftPos = lerp(OFF_L, SEAT, assembleEased); leftOpacity = assembleEased; }

  // RIGHT column: SEAT/hidden (left-focus) → SEAT→CENTER as it advances (switch) → CENTER (right-focus)
  //               → CENTER→SEAT (resolve, slides to its right seat). Opacity 0 → fades in → 1.
  let rightPos: Pos, rightOpacity: number;
  if (beforeSwitch) { rightPos = SEAT; rightOpacity = 0; }
  else if (inSwitch) { rightPos = lerp(SEAT, CENTER_R, switchEased); rightOpacity = switchEased; }
  else if (!assembled) { rightPos = CENTER_R; rightOpacity = 1; }
  else { rightPos = lerp(CENTER_R, SEAT, assembleEased); rightOpacity = 1; }

  return (
    <div className="grid h-full grid-cols-2 gap-6" data-cmp data-cmp-sequential-centered>
      <Column
        col={left}
        good
        t={t}
        mode="sequential"
        seq={{
          windows: sideWindows("left"),
          columnOpacity: settled ? 1 : leftOpacity,
          columnTransform: settled ? undefined : toTransform(leftPos),
          assembled,
          assembleP: assembleEased,
          settled,
        }}
      />
      <Column
        col={right}
        good={false}
        t={t}
        mode="sequential"
        seq={{
          windows: sideWindows("right"),
          columnOpacity: settled ? 1 : rightOpacity,
          columnTransform: settled ? undefined : toTransform(rightPos),
          assembled,
          assembleP: assembleEased,
          settled,
        }}
      />
    </div>
  );
}
