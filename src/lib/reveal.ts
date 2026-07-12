// Staggered reveal helpers driven by a single global progress `t` (0..1).
// Used by motion posts so animation is pure opacity/transform (layout reserved for
// all t) — never mount/unmount. At t=1 everything is settled = the final frame.

/** Opacity-style 0..1 for an element whose reveal window starts at `start` and lasts `dur` (in t-units). */
export function appear(t: number, start: number, dur = 0.14): number {
  if (dur <= 0) return t >= start ? 1 : 0;
  return Math.max(0, Math.min(1, (t - start) / dur));
}

/** Vertical rise offset (px) that eases to 0 as the element reveals. */
export function rise(t: number, start: number, dur = 0.14, px = 12): number {
  return (1 - appear(t, start, dur)) * px;
}

/** Convenience: inline style for a standard rise+fade reveal. */
export function revealStyle(t: number, start: number, dur = 0.14, px = 12) {
  const a = appear(t, start, dur);
  return { opacity: a, transform: `translateY(${(1 - a) * px}px)` };
}
