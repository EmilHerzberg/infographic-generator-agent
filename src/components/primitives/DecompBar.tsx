// DecompBar — horizontal stacked bar with N labeled segments.
// Used for R²-decomposition metaphors (Hero + TrustDecomp specs) and the Path A
// `stack` viz (part-to-whole composition).
//
// Each segment has a fractional width (0..1) and a color. Widths must
// sum to 1.0. Renders as plain divs (flexbox) — scales to the parent container width.
//
// PL-1.3 grow-from-zero (handoff §2.5.1, Rev B motion per §7): the flex geometry is a pure
// function of DATA (flexBasis from `width` only, NEVER `t`) — segment boxes at every `t`
// are identical to the t=1 layout (C7). Each segment's COLOR FILL is an absolutely-
// positioned inset:0 child that wipes in via `transform: scaleX(g)` origin-left; labels are
// in-flow, opacity-only, and never inside the scaled node (C8 — opacity/transform only,
// no layout animation, no text distortion). Once a fill is settled (g === 1) the transform
// is OMITTED entirely — never `scaleX(1)` — so the final frame rasterizes exactly like a
// plain colored div (C11, the PL-1.2 §3 discipline). Legacy call sites pass no `t`
// (default 1) and render byte-identical to the pre-PL-1.3 bar.
//
// Rev B build (chained continuous edge — Emil's motion feedback, §7): ONE eased leading
// edge `stackEdge(t)` sweeps the bar left→right over t ∈ [0.34, 0.62]; each segment's
// g = segmentGrow(t, start, fraction) is derived from the edge, so a segment starts growing
// exactly when the edge touches its left boundary and AT MOST ONE segment is mid-grow at
// any t. Its label stamps in the moment its fill completes (appear at tStar = the edge's
// bisection-inverse at the segment's right boundary). All timing math lives in
// src/lib/stack.ts (pure) so the gate unit-tests the exact functions rendered here.

import { type CSSProperties } from "react";
import { appear } from "@/lib/reveal";
import { labelStampT, segmentGrow, LABEL_STAMP_DUR } from "@/lib/stack";

export type DecompSegment = {
  width: number;
  color: string;
  label?: string;
  labelInside?: boolean;
  labelColor?: string;
  labelSize?: number;
  labelWeight?: number;
};

type Props = {
  segments: DecompSegment[];
  height: number;
  radius?: number;
  className?: string;
  style?: CSSProperties;
  /** Global post progress 0..1. Default 1 ⇒ settled/static — existing call sites unchanged. */
  t?: number;
  /** false ⇒ every fill pinned at g=1 with no transform; the bar rides the wrapper fade as today. */
  grow?: boolean;
  /** Hard CSS label containment (C5): inline-block + maxWidth calc(100% − 16px) + overflow
   *  hidden — a label can NEVER paint outside its segment, even if the C4 estimate were
   *  wrong. Path A always passes true; default false keeps the two hand-tuned legacy TSX
   *  posts (HonestFactorHero, HonestFactorTrustDecomp) bit-identical. */
  containLabels?: boolean;
};

// Rev B timing on the global `t` (handoff §7) — fixed in src/lib/stack.ts, deliberately
// NOT authoring knobs: edge window [0.34, 0.62] (the build ends exactly as the PL-1.1
// metric-row counts start — clean top→bottom eye-path handover); label i stamps over
// [tStar_i, tStar_i + 0.06]; everything settled by t = 0.68 ≤ 0.85.

export function DecompBar({
  segments,
  height,
  radius = 8,
  className = "",
  style,
  t = 1,
  grow = true,
  containLabels = false,
}: Props) {
  // Cumulative left boundaries (track fractions) — pure function of DATA, never of `t`.
  // For Path A these widths are planStack fractions (sum 1 ± 1e-6); the legacy hand-tuned
  // posts pass no `t` (default 1) so every fill is pinned settled regardless.
  const starts: number[] = [];
  let cum = 0;
  for (const s of segments) {
    starts.push(cum);
    cum += s.width > 0 ? s.width : 0;
  }
  return (
    <div
      data-decomp-bar
      className={`flex w-full overflow-hidden ${className}`}
      style={{
        height,
        borderRadius: radius,
        boxShadow: "0 0 0 1px rgba(244,241,234,0.08)",
        ...style,
      }}
    >
      {segments.map((s, i) => {
        // Fill progress g ∈ [0, 1] derived from the single leading edge — the segment
        // starts growing exactly when the edge touches starts[i] and is pinned to exact
        // 0/1 outside its window (C11 — never a 0.9997-scale final frame).
        const fraction = s.width > 0 ? s.width : 0;
        const g = grow ? segmentGrow(t, starts[i], fraction) : 1;
        // Label stamps in the moment its segment's fill completes (§7).
        const labelOpacity = grow ? appear(t, labelStampT(starts[i] + fraction), LABEL_STAMP_DUR) : 1;
        return (
          <div
            key={i}
            data-decomp-seg={i}
            className="relative flex items-center justify-center"
            style={{
              // Pure function of DATA — never of `t` (C7). Color lives on the fill.
              flexBasis: `${s.width * 100}%`,
              minWidth: 0,
            }}
          >
            <div
              data-decomp-fill
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: s.color,
                // OMITTED entirely once settled — never `scaleX(1)` (C11).
                ...(g < 1 ? { transform: `scaleX(${g})`, transformOrigin: "left" } : {}),
              }}
            />
            {s.labelInside && s.label && (
              <span
                data-decomp-label
                className="font-display"
                style={{
                  // position:relative only for paint order (above the absolute fill) —
                  // no offsets, so it can never move layout. Labels are NEVER transformed.
                  position: "relative",
                  fontSize: Math.max(18, Math.min(40, s.labelSize ?? 32)),
                  fontWeight: s.labelWeight ?? 600,
                  color: s.labelColor ?? "#F4F1EA",
                  letterSpacing: "-0.01em",
                  whiteSpace: "nowrap",
                  opacity: labelOpacity,
                  ...(containLabels
                    ? { display: "inline-block", maxWidth: "calc(100% - 16px)", overflow: "hidden" }
                    : {}),
                }}
              >
                {s.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
