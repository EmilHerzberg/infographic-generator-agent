// Donut — radial composition of ONE whole into a FEW parts (PL-2.3, Epic PL-2 chart family).
// N segments rendered as stroked arcs around a ring, normalized so the arcs sum to a full turn
// (it IS a proportion — the radial sibling of DecompBar's linear stack). An optional center hole
// headline (the total / "100%"); outside segment labels (a value + a name, fit-or-hide).
//
// All layout comes from planDonut (src/lib/donut.ts) — the pure brain shared with the check suite.
// Geometry is a pure function of DATA, never `t` (§5): each arc's angular span + every label anchor
// is fixed by the plan and constant across the timeline. The ring is CONNECTED geometry, so it
// draws on as ONE continuous leading edge (§3 ruling 3) — `donutSweep(t)` runs around the ring and
// `segmentSweep` derives each arc's fill from it; at most one arc is mid-draw at any t.
//
// MECHANISM (§3 ruling 2): the sweep is `strokeDashoffset` on each arc <circle> (the StatHero ring
// mechanism), NOT a CSS transform — there is NO CSS transform on the arcs at all. Each arc is a full
// <circle r=198> ROTATED so its dash-zero point sits at the segment's start angle (rotate(-90) =
// 12 o'clock + the segment's start, clockwise); a two-stop dasharray `[drawn, C-drawn]` paints only
// the swept portion of that segment's span. At settle the dash is the segment's FULL arc and the
// animated offset is OMITTED (the static final dash), never an identity offset:0 (the StatHero/
// DecompBar omit-once-settled rule). Props default to t=1 (settled/static) so Path B can import it.
//
// Source-px square viewBox (640×640) scaled to the Panel content box, exactly like Divergence/
// BarChart. The inspector reads viewBox coordinates as the single deterministic system.
// Spec: planning/primitive-library/handoffs/PL-2.3-donut.md §2 / §5 / §7.

import { useId } from "react";
import type { Accent } from "@/posts/renderTypes";
import { colors } from "@/tokens/design";
import { appear } from "@/lib/reveal";
import { FitLine } from "./FitLine";
import {
  planDonut,
  segmentSweep,
  labelStampT,
  type DonutPlanSegment,
  VIEW,
  CX,
  CY,
  RING_OUTER_R,
  RING_STROKE,
  RING_R,
  RING_INNER_R,
  RING_C,
  SEG_GAP_DEG,
  LABEL_RADIAL_OFFSET,
  SEG_NAME_PX,
  SEG_VALUE_PX,
  CENTER_PX,
  CENTER_CAP_PX,
  CENTER_TEXT_W,
  LABEL_STAMP_DUR,
  CENTER_REVEAL,
  DIM_OPACITY,
} from "@/lib/donut";

const accentHex = (a: string): string => colors.accent[a as Accent] ?? colors.accent.cyan;
const RING_TRACK = "rgba(244,241,234,0.10)";
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

type Props = {
  segments: { label?: string; value?: number; accent?: Accent }[];
  centerLabel?: string;
  centerValue?: string;
  valueLabels?: "auto" | "off";
  centerTotal?: "on" | "off";
  unit?: string;
  emphasis?: number;
  caption?: string;
  t?: number;
};

export function Donut({
  segments,
  centerLabel,
  centerValue,
  valueLabels = "auto",
  centerTotal = "on",
  unit,
  emphasis,
  caption,
  t = 1,
}: Props) {
  const uid = useId();
  const plan = planDonut({ segments, centerLabel, centerValue, valueLabels, centerTotal, unit, emphasis });

  const frameOn = clamp01((t - 0.26) / 0.08); // track ring appears

  if (plan.empty) {
    return (
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="block h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={caption ?? "composition of a whole"}
        data-donut
        data-donut-empty
      >
        <circle cx={CX} cy={CY} r={RING_R} fill="none" stroke={RING_TRACK} strokeWidth={RING_STROKE} opacity={frameOn} />
      </svg>
    );
  }

  const center = plan.center;

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      className="block h-auto w-full"
      role="img"
      aria-label={caption ?? "composition of a whole"}
      data-donut
    >
      {/* Faint full-ring track behind the segments (StatHero convention). */}
      <circle cx={CX} cy={CY} r={RING_R} fill="none" stroke={RING_TRACK} strokeWidth={RING_STROKE} opacity={frameOn} data-donut-track />

      {/* Segment arcs — each a stroked <circle> swept by the global continuous edge. */}
      {plan.segments.map((seg, i) => (
        <Arc key={`${uid}-arc-${i}`} seg={seg} index={i} singleFull={plan.singleFull} t={t} />
      ))}

      {/* Outside labels — fade in the instant each wedge completes (fit-or-hide). */}
      {plan.segments.map((seg, i) => (
        <OutsideLabel key={`${uid}-lbl-${i}`} seg={seg} t={t} />
      ))}

      {/* Center headline + caption — fade/rise in over the center reveal window. The foreignObject
          spans the full hole diameter (centered on CY) so the FitLine's content box (leading-none, ~1.14em
          ascent+descent) plus the entrance rise never clips against a tight box. */}
      {center.show && (
        <foreignObject x={CX - CENTER_TEXT_W / 2} y={CY - RING_INNER_R} width={CENTER_TEXT_W} height={RING_INNER_R * 2} style={{ overflow: "visible" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              ...settleReveal(t),
            }}
          >
            <div data-donut-center style={{ width: CENTER_TEXT_W }}>
              <FitLine className="font-display font-semibold tracking-tight leading-none text-text-primary" fontSize={CENTER_PX} align="center">
                {center.value}
              </FitLine>
            </div>
            {center.caption && (
              <div
                data-donut-center-cap
                className="whitespace-nowrap font-mono uppercase tracking-[0.16em] text-accent-amber"
                style={{ fontSize: CENTER_CAP_PX, marginTop: 6 }}
              >
                {center.caption}
              </div>
            )}
          </div>
        </foreignObject>
      )}
    </svg>
  );
}

// Rise+fade reveal that OMITS the transform once settled (StatHero settleReveal — an identity
// translateY(0) can change rasterization; only the center text uses a transform, so it follows
// the omit-at-settle rule — the ARCS never use a transform at all, §3 ruling 2).
const RISE_PX = 8;
function settleReveal(t: number): { opacity: number; transform?: string } {
  const a = appear(t, CENTER_REVEAL.start, CENTER_REVEAL.dur);
  return { opacity: a, ...(a < 1 ? { transform: `translateY(${(1 - a) * RISE_PX}px)` } : {}) };
}

// ── One segment arc ─────────────────────────────────────────────────────────────────────────────
// A full <circle r=198> rotated (a STATIC SVG presentation transform — `rotate(-90 + startAngle)`,
// the StatHero rotate; constant across t, never the sweep) so its dash origin sits at the segment's
// start angle (12 o'clock + startAngle, clockwise). The SWEEP is the strokeDasharray/strokeDashoffset
// mechanism (§3 ruling 2 — the StatHero ring): the painted "on" run grows from the start angle as the
// global edge crosses the segment's span. There is NO `t`-driven transform — the rotate is reserved
// geometry (the gate asserts it is identical across every t), so there is no identity-transform-at-
// settle concern; the dash is "fully swept (drawn)" at t=1 (ruling 2's settle assertion).
function Arc({ seg, index, singleFull, t }: { seg: DonutPlanSegment; index: number; singleFull: boolean; t: number }) {
  // The segment's full painted arc length on the ring circle. A 2° gap is carved off the END of each
  // wedge so boundaries read — suppressed for a single full ring (no notch).
  const gapDeg = singleFull ? 0 : SEG_GAP_DEG;
  const spanDeg = Math.max(0, seg.sweepAngleDeg - gapDeg);
  const segLen = (spanDeg / 360) * RING_C; // full drawn length at settle

  const fill = segmentSweep(t, seg.startFrac, seg.fraction); // ∈ [0,1] from the global edge
  const drawn = fill >= 1 ? segLen : segLen * fill;

  // rotate(-90) puts the dash origin at 12 o'clock; + startAngle rotates to the segment's start (CW).
  // STATIC: a pure function of DATA, identical across every t (reserved geometry, not the sweep).
  const rotateDeg = -90 + seg.startAngleDeg;

  return (
    <circle
      data-donut-seg={index}
      data-donut-startangle={seg.startAngleDeg}
      data-donut-sweepangle={seg.sweepAngleDeg}
      cx={CX}
      cy={CY}
      r={RING_R}
      fill="none"
      stroke={accentHex(seg.accentKey)}
      strokeWidth={RING_STROKE}
      strokeLinecap="butt"
      // PL-4.2 emphasis: OPACITY-ONLY focus — dim every non-focused wedge. Default (no emphasis) ⇒
      // dim:false ⇒ opacity 1 (byte-identical to today). Orthogonal to the dash-driven sweep; the
      // arc has no other opacity, so this never fights the reveal. Static across t (paint, not motion).
      opacity={seg.dim ? DIM_OPACITY : 1}
      // Two-stop dash: paint `drawn` then a gap of (C − drawn) so nothing else of the circle shows.
      // The drawn length grows with the global edge (the sweep); fully drawn (== segLen) at t=1.
      strokeDasharray={`${drawn} ${RING_C - drawn}`}
      // Dash origin already sits at the segment start (via the static rotate) → offset stays 0.
      strokeDashoffset={0}
      transform={`rotate(${rotateDeg} ${CX} ${CY})`}
    />
  );
}

// ── Outside two-line label (value over name) at the arc mid-angle ────────────────────────────────
function OutsideLabel({ seg, t }: { seg: DonutPlanSegment; t: number }) {
  if (!seg.showName && !seg.showValue) return null;
  // Fade in the instant this wedge completes.
  const start = labelStampT(seg.startFrac + seg.fraction);
  const op = appear(t, start, LABEL_STAMP_DUR);

  // Mid-angle anchor just beyond the outer radius. labelAngleDeg is 0 at 12 o'clock, clockwise.
  const R = RING_OUTER_R + LABEL_RADIAL_OFFSET;
  const rad = ((seg.labelAngleDeg - 90) * Math.PI) / 180; // -90 → 12 o'clock origin
  const ax = CX + R * Math.cos(rad);
  const ay = CY + R * Math.sin(rad);
  // Anchor: left/center/right by which side of the ring the label sits on (keeps the block inside
  // the gutter — labels on the right grow rightward, on the left grow leftward).
  const cosA = Math.cos(rad);
  const anchor: "start" | "middle" | "end" = cosA > 0.2 ? "start" : cosA < -0.2 ? "end" : "middle";

  // Two lines: value on top, name below (or whichever is shown). Vertically centered on the anchor.
  const lines: { text: string; hook: string; size: number; weight: number; family: string; fill: string }[] = [];
  if (seg.showValue) lines.push({ text: seg.valueText, hook: "data-donut-value", size: SEG_VALUE_PX, weight: 600, family: "'JetBrains Mono', monospace", fill: accentHex(seg.accentKey) });
  if (seg.showName) lines.push({ text: seg.label ?? "", hook: "data-donut-name", size: SEG_NAME_PX, weight: 500, family: "'Space Grotesk', sans-serif", fill: colors.text.primary });

  const lineH = 30;
  const y0 = ay - ((lines.length - 1) * lineH) / 2 + 8;

  return (
    <g opacity={op}>
      {lines.map((ln, i) => (
        <text
          key={i}
          {...{ [ln.hook]: "" }}
          x={ax}
          y={y0 + i * lineH}
          textAnchor={anchor}
          fill={ln.fill}
          fontFamily={ln.family}
          fontSize={ln.size}
          fontWeight={ln.weight}
        >
          {ln.text}
        </text>
      ))}
    </g>
  );
}
