// PL-4.1 — the narrative reveal-mode planner: the single deterministic brain the renderer
// AND the check suite share (the planStack/planTiers/planDivergence precedent). Pure and
// dependency-free (no DOM, no `t` input — it PRODUCES the t-windows) so the deterministic
// check suite (tools/qa-reveal.mjs --unit) can unit-test it via Node's native type stripping.
//
// Spec: planning/primitive-library/handoffs/PL-4.1-narrative-reveal-modes.md §2.5.0–§2.5.1.
//
// Two narrative modes:
//   ClaimList  "spotlight"  — each entry enters → reads → Rev-B kill → fades to opacity 0,
//                             then ALL entries assemble into the stacked list at the end.
//   Comparison "sequential" — left box + items one-by-one → switch → right box + items →
//                             resolve to the Rev-B weighted two-up.
//
// All time math is in REAL SECONDS first (§2.5.0), then mapped to `t`-space (because the global
// `t` carries the narrative timeline). The full narrative occupies real-seconds [0, DUR]; the
// renderer's `useProgressT` settles global `t→1` at ~85% of frames, so the planner lays the
// timeline out over t ∈ [0, ASSEMBLY_END=0.92] and pins a clean settled tail (0.92→1). The
// real→t map is therefore  t = (seconds / DUR) · ASSEMBLY_END.  A 15s post and a 25s post share
// the SAME plan SHAPE in t-space — only the frames-per-t differ (more frames for a longer post).

export type NarrativeMode = "spotlight" | "sequential";

// ── Pacing constants (module-level — NOT authoring knobs; Emil-tunable, §3 ruling 4) ──────────
// These are the read-pacing dials Emil tunes at the verify render (the PL-1.2 StatHero "perfect"
// pacing is the bar). Every value is a pure number consumed by both the renderer and the checks.
export const DEFAULT_DUR = 12; // s — default-mode composition length (unchanged; ~today's 12s).
export const READ_FLOOR = 1.5; // s — minimum settled read time per item (N4).
export const READ_PER_CHAR = 0.02; // s — extra settled read time per character of the item's text.
export const READ_CAP = 3.2; // s — max read time for one item (no item hogs the timeline).
export const READ_FLOOR_MIN = 1.1; // s — degraded floor: a squeezed read never drops below this.
export const READ_HARD_MIN = 0.9; // s — the absolute hard floor used only in the equal-residual tail.
export const ENTER_DUR = 0.45; // s — per-item fade/slide-in ramp (claim made / item enters focus).
export const KILL_DUR = 0.55; // s — ClaimList: the strike + × stamp beat (0 for comparison).
export const EXIT_DUR = 0.35; // s — per-item fade-out as focus leaves it.
export const SWITCH_DUR = 0.8; // s — Comparison: the left→right focus switch transition.
export const ASSEMBLY_DUR = 1.6; // s — the final assembly (all items resolve into the final layout).
export const LEAD_IN = 0.6; // s — headline/panel settles before the first focus (PostFrame hook).
export const FLOOR_DUR = 14; // s — hard min narrative composition length.
export const CEIL = 25; // s — hard max (Emil's ~18–25s ceiling).

// ── Structural constants ──────────────────────────────────────────────────────────────────────
export const ASSEMBLY_END_T = 0.92; // N7: the assembly ends here in t-space; clean hold 0.92→1.
export const FPS = 30; // composition fps (matches generated.tsx).
export const CLAIM_ITEM_CAP = 4; // CL1 — ClaimList ≤4 entries (explicit itemCap knob).
export const COMPARISON_ITEM_CAP = 5; // CC-CAP — comparison ≤5 items/col (BUMPED 4→5, Emil ruling 1).
// Comparison `sequential` (IN-PLACE) pace — Emil: the in-place mode (both boxes side-by-side from t=0)
// was "way too slow" at the full content-aware reading duration. That duration exists for the SINGLE-
// FOCUS modes (spotlight, sequentialCentered) where one thing is in focus and needs reading time. In
// the in-place mode BOTH boxes are visible the whole time, so no per-item dwell is needed — it should
// be a brisk staggered build. This uniformly speeds the timeline up (×PACE); the moving/spotlight
// modes are unaffected. Emil-tunable.
export const COMPARISON_INPLACE_PACE = 0.42; // ~25s → ~10.5s for the 4+4 / 5+5 cases.

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Per-item content-aware READ seconds (pre-squeeze): clamp(FLOOR + PER_CHAR·chars, FLOOR, CAP). */
export function readSecondsFor(chars: number): number {
  return clamp(READ_FLOOR + READ_PER_CHAR * Math.max(0, chars), READ_FLOOR, READ_CAP);
}

/** Char count of a ClaimList entry: claim + reality + optional realityNote (§2.5.0). */
export function claimChars(e: { claim?: string; reality?: string; realityNote?: string; note?: string }): number {
  return (e.claim?.length ?? 0) + (e.reality?.length ?? 0) + ((e.realityNote ?? e.note)?.length ?? 0);
}

// A planned focus item before t-space mapping — its content chars + which column side (comparison).
type RawItem = { chars: number; side?: "left" | "right" };

export type FocusWindow = {
  index: number; // ordinal across the whole sequence
  side?: "left" | "right"; // comparison only
  enterStartT: number;
  readStartT: number;
  readEndT: number;
  killStartT?: number; // ClaimList kill sub-window start (inside the read)
  exitStartT: number;
  exitEndT: number;
  readSeconds: number; // real seconds of SETTLED read (N4 check uses this)
};

export type NarrativePlan = {
  mode: NarrativeMode;
  durationSeconds: number;
  degraded: boolean;
  leadInT: number; // t at which the focus sequence begins
  windows: FocusWindow[];
  switchT?: { startT: number; endT: number }; // comparison only
  assembly: { startT: number; endT: number }; // endT === ASSEMBLY_END_T
};

// Resolve the per-item read seconds with the §2.5.0 closed-form degraded squeeze. Returns the
// final per-item read seconds (in sequence order), the total DUR, and the degraded flag.
function resolveReads(
  rawItems: RawItem[],
  mode: NarrativeMode,
): { reads: number[]; durationSeconds: number; degraded: boolean } {
  const n = rawItems.length;
  // Per-item FIXED time (ramps + per-item kill) — independent of the read squeeze.
  const killPer = mode === "spotlight" ? KILL_DUR : 0;
  const fixedPer = ENTER_DUR + killPer + EXIT_DUR;
  // Fixed total = LEAD_IN + assembly + (comparison) the switch + Σ per-item fixed.
  const switchTime = mode === "sequential" ? SWITCH_DUR : 0;
  const fixedTotal = LEAD_IN + ASSEMBLY_DUR + switchTime + n * fixedPer;

  const baseReads = rawItems.map((it) => readSecondsFor(it.chars));
  const sumReads = baseReads.reduce((s, r) => s + r, 0);
  const RAW = fixedTotal + sumReads;

  if (n === 0) {
    // Empty: no focus windows; the composition is the FLOOR (defensive — authoring won't do this).
    return { reads: [], durationSeconds: FLOOR_DUR, degraded: false };
  }

  if (RAW <= CEIL) {
    return { reads: baseReads, durationSeconds: Math.max(FLOOR_DUR, RAW), degraded: false };
  }

  // Squeeze the READ portion only (ramps/transitions/assembly fixed): solve a single scale s on
  // the reads so LEAD_IN + Σ(fixed_i + s·read_i) + switch + assembly == CEIL  (closed form).
  const s = sumReads > 0 ? (CEIL - fixedTotal) / sumReads : 0;
  let reads = baseReads.map((r) => Math.max(READ_FLOOR_MIN, s * r));

  // If even READ_FLOOR_MIN·n + fixedTotal overruns CEIL (only reachable at comparison's ≤10 reads
  // with maximal ramps), trim every read to the equal residual share, still ≥ READ_HARD_MIN.
  if (fixedTotal + reads.reduce((a, b) => a + b, 0) > CEIL + 1e-9) {
    const residual = Math.max(READ_HARD_MIN, (CEIL - fixedTotal) / n);
    reads = baseReads.map(() => residual);
  }
  return { reads, durationSeconds: CEIL, degraded: true };
}

// Lay the resolved reads out into ordered, non-overlapping t-windows. `seconds → t` is
// t = (seconds / DUR) · ASSEMBLY_END_T, so the whole [0, DUR] sequence+assembly fits [0, 0.92].
function layout(
  rawItems: RawItem[],
  reads: number[],
  durationSeconds: number,
  mode: NarrativeMode,
): Pick<NarrativePlan, "leadInT" | "windows" | "switchT" | "assembly"> {
  const toT = (sec: number) => (durationSeconds > 0 ? clamp01((sec / durationSeconds) * ASSEMBLY_END_T) : 0);
  const killPer = mode === "spotlight" ? KILL_DUR : 0;

  let cursor = LEAD_IN; // real-seconds cursor; the lead-in settles the headline first.
  const leadInT = toT(cursor);
  const windows: FocusWindow[] = [];
  let switchT: NarrativePlan["switchT"] | undefined;

  let prevSide: "left" | "right" | undefined;
  rawItems.forEach((it, index) => {
    // Comparison: when the side flips left→right, the switch transition runs BEFORE the right items.
    if (mode === "sequential" && index > 0 && it.side !== prevSide) {
      const startT = toT(cursor);
      cursor += SWITCH_DUR;
      switchT = { startT, endT: toT(cursor) };
    }
    prevSide = it.side;

    const enterStartT = toT(cursor);
    cursor += ENTER_DUR;
    const readStartT = toT(cursor);
    const read = reads[index];
    cursor += read;
    const readEndT = toT(cursor);
    // ClaimList kill: the strike+stamp beat runs over the LATTER part of the settled read window,
    // ending as the read ends (so the claim is read, THEN killed — with room). Placed at
    // readEndT − KILL_DUR; the kill sub-window sits INSIDE [readStartT, readEndT].
    const killStartT = mode === "spotlight" ? toT(cursor - Math.min(killPer, read)) : undefined;
    const exitStartT = toT(cursor);
    cursor += EXIT_DUR;
    const exitEndT = toT(cursor);

    windows.push({
      index,
      side: it.side,
      enterStartT,
      readStartT,
      readEndT,
      killStartT,
      exitStartT,
      exitEndT,
      readSeconds: read,
    });
  });

  // Assembly fills the remainder up to ASSEMBLY_END_T (the fixed ASSEMBLY_DUR by construction,
  // but pinned to end exactly at 0.92 so N7 holds regardless of float drift).
  const assembly = { startT: toT(cursor), endT: ASSEMBLY_END_T };
  return { leadInT, windows, switchT, assembly };
}

/**
 * planNarrative — the pure planner. `items` is content in sequence order:
 *   spotlight  : ClaimEntry-like [{ claim, reality, realityNote|note }]
 *   sequential : { left: string[], right: string[] } (item text per column)
 * Caps are applied here (slice) so the plan only sequences kept items (§2.6 clamp 3).
 */
export function planNarrative(
  mode: NarrativeMode,
  items:
    | Array<{ claim?: string; reality?: string; realityNote?: string; note?: string }>
    | { left: string[]; right: string[] },
  opts: { pace?: number } = {},
): NarrativePlan {
  let raw: RawItem[];
  if (mode === "spotlight") {
    const entries = (items as Array<{ claim?: string; reality?: string; realityNote?: string; note?: string }>)
      .slice(0, CLAIM_ITEM_CAP);
    raw = entries.map((e) => ({ chars: claimChars(e) }));
  } else {
    const cmp = items as { left: string[]; right: string[] };
    const left = (cmp.left ?? []).slice(0, COMPARISON_ITEM_CAP);
    const right = (cmp.right ?? []).slice(0, COMPARISON_ITEM_CAP);
    raw = [
      ...left.map((txt) => ({ chars: txt.length, side: "left" as const })),
      ...right.map((txt) => ({ chars: txt.length, side: "right" as const })),
    ];
  }

  const { reads, durationSeconds, degraded } = resolveReads(raw, mode);
  const laid = layout(raw, reads, durationSeconds, mode);
  // `pace` (default 1) uniformly speeds the timeline up. The t-windows (enter/read/exit/switch/
  // assembly, all in t-space) are SCALE-INVARIANT — toT = sec/DUR, so scaling every second AND DUR by
  // the same factor leaves every `t` unchanged. Only the wall-clock shrinks: durationSeconds·pace and
  // each window's real readSeconds·pace. So a paced plan renders the IDENTICAL choreography, faster.
  const pace = opts.pace ?? 1;
  if (pace > 0 && pace !== 1) {
    return {
      mode,
      durationSeconds: durationSeconds * pace,
      degraded,
      ...laid,
      windows: laid.windows.map((w) => ({ ...w, readSeconds: w.readSeconds * pace })),
    };
  }
  return { mode, durationSeconds, degraded, ...laid };
}

/** narrativeDuration — composition length in seconds for a plan (the duration-correctness source). */
export function narrativeDuration(plan: NarrativePlan): number {
  return plan.durationSeconds;
}

/**
 * narrativeProgressT — the frame→`t` mapping for narrative posts. The shared "one brain" the
 * Remotion composition AND the render-truth check both consume.
 *
 * Default posts use `useProgressT` (easeOutCubic, settled at 85% of frames). Narrative posts MUST
 * NOT: easeOutCubic races through early `t` and crawls through late `t`, so the plan's content-aware
 * READING windows (which live in early/mid `t`) would be compressed to a fraction of their designed
 * seconds while the settled assembly (late `t`) bloats into a multi-second frozen end-card — the
 * exact opposite of the content-aware-reading-time goal. A LINEAR map makes a `t`-window of width Δt
 * last exactly Δt·DUR real seconds, so every plan window gets the seconds it was designed for and the
 * plan's own reserved tail (t ∈ [ASSEMBLY_END_T, 1]) becomes a clean ~0.08·DUR hold (the §2.5.0
 * intent). Pure: no Remotion import, unit-testable, identical math in the renderer and the check.
 */
export function narrativeProgressT(frame: number, durationInFrames: number): number {
  if (durationInFrames <= 0) return 1;
  return clamp01(frame / durationInFrames);
}

/** Does this Path-A post select a narrative revealMode? (Mirrors postDurationSeconds' detection.) */
export function isNarrativePost(post: any): boolean {
  const viz = post?.visualization;
  if (!viz) return false;
  return (
    (viz.kind === "claims" && viz.revealMode === "spotlight") ||
    (viz.kind === "comparison" && (viz.revealMode === "sequential" || viz.revealMode === "sequentialCentered"))
  );
}

/** durationInFrames for a plan (round(DUR·FPS)) — what the Remotion composition declares (N6). */
export function narrativeFrames(plan: NarrativePlan): number {
  return Math.round(plan.durationSeconds * FPS);
}

/**
 * postDurationSeconds — Path A JSON composition duration. If the post's visualization selects a
 * narrative revealMode, returns narrativeDuration(plan); else DEFAULT_DURATION (the byte-identical
 * default — every existing Path-A post is unaffected). Pure: consumes only the post JSON.
 */
export function postDurationSeconds(post: any, defaultSeconds: number): number {
  const viz = post?.visualization;
  if (!viz) return defaultSeconds;
  if (viz.kind === "claims" && viz.revealMode === "spotlight") {
    const entries = (viz.entries ?? []).map((e: any) => ({
      claim: e.claim,
      reality: e.reality,
      realityNote: e.note,
    }));
    return narrativeDuration(planNarrative("spotlight", entries));
  }
  if (viz.kind === "comparison" && (viz.revealMode === "sequential" || viz.revealMode === "sequentialCentered")) {
    // in-place `sequential` is paced up (brisk — both boxes visible); the moving `sequentialCentered`
    // keeps the full reading duration (one box in focus at a time).
    const pace = viz.revealMode === "sequential" ? COMPARISON_INPLACE_PACE : 1;
    return narrativeDuration(
      planNarrative("sequential", { left: viz.left?.items ?? [], right: viz.right?.items ?? [] }, { pace }),
    );
  }
  return defaultSeconds;
}
