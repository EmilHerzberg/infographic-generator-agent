// PL-1.2 — StatHero proportion-ring eligibility + clamp. Pure and dependency-free
// (mirrors countup.ts) so the deterministic check suite (tools/qa-stathero.mjs) can
// unit-test it without a DOM via Node's native type stripping.
//
// Decides ONCE, from DATA only (never from `t`), whether the stat renders in ring mode
// and at what clamped fraction. Anything non-conforming falls back to plain mode —
// never an error, never a layout difference across `t`.
// Spec: planning/primitive-library/handoffs/PL-1.2-stat-countup-pop.md §2.6.1 / C8.

export type RingSkipReason =
  | "absent" // no `proportion` field — the default; plain mode ⇒ C13 static identity
  | "nonFinite" // non-number / NaN / ±Infinity / negative — model garbage, render plain
  | "tooSmall" // < 0.01 — a 0-ring is an empty track; plain reads better
  | "bigTooLong"; // big > 12 chars — protects the in-ring 240px mobile floor (C4)

export type RingPlan = { ring: true; f: number } | { ring: false; reason: RingSkipReason };

const MIN_FRACTION = 0.01; // below this the arc is invisible — render plain instead
const MAX_BIG_CHARS = 12; // C8: longer suppresses the ring (FitLine floor proof, C4)

export function planRing(proportion: unknown, big: string): RingPlan {
  const skip = (reason: RingSkipReason): RingPlan => ({ ring: false, reason });

  if (proportion === undefined || proportion === null) return skip("absent");
  if (typeof proportion !== "number" || !Number.isFinite(proportion)) return skip("nonFinite");
  if (proportion < 0) return skip("nonFinite");
  if (proportion < MIN_FRACTION) return skip("tooSmall");
  if (big.trim().length > MAX_BIG_CHARS) return skip("bigTooLong");
  // > 1 ⇒ clamp to a full circle (model rounding slack — still a sensible ring).
  return { ring: true, f: Math.min(1, proportion) };
}
