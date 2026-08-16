import { useContext, type CSSProperties } from "react";
import { colors, resolveFormat, type AccentKey } from "@/tokens/design";
import { FormatContext } from "@/components/layout/formatContext";
import { appear } from "@/lib/reveal";
import { easings } from "@/tokens/motion";
import { planCountUp } from "@/lib/countup";
import { planRing } from "@/lib/ring";
import { FitLine } from "./FitLine";

const accentClass: Record<AccentKey, string> = {
  cyan: "text-accent-cyan",
  amber: "text-accent-amber",
  violet: "text-accent-violet",
  mint: "text-accent-mint",
  burnt: "text-accent-burnt",
};

// PL-1.2 timing on the global `t` (handoff §2.5.2). The stat is the post's centerpiece:
// it enters at 0.30 (where the old block-level fade started), settles fully by 0.56 —
// comfortably before the PL-1.1 metric-row stagger starts at 0.62 (C10 eye path).
// Fixed module constants — deliberately NOT authoring knobs.
const POP_START = 0.3;
const POP_DUR = 0.06; // pop settles at t = 0.36
const COUNT_START = 0.3;
const COUNT_DUR = 0.2; // count + ring sweep settle at t = 0.50
const SUB_START = 0.4;
const SUB_DUR = 0.1;
const NOTE_START = 0.46;
const NOTE_DUR = 0.1;
const RISE_PX = 8;

// Ring geometry (C7). RING_BASE = the reference (1:1 / portrait); the ring + its stack gap scale UP on the
// taller aspects so a lone hero ring fills its share of the frame and the description isn't cramped against
// it (Emil's format feedback). Scaling only ever grows the stroke/font, so mobile floors stay satisfied.
const RING_TRACK = "rgba(244,241,234,0.10)";
const PLAIN_FONT = 104;
const RING_BASE = { size: 320, stroke: 18, font: 84, textWidth: 240 }; // stroke → 6.5px at 2.77× (≥3px floor)
// Per-aspect scale for the ring + the ring→description gap. 1:1 square is the reference ("1:1 is fine");
// 4:5 portrait and 9:16 vertical get a proportionally bigger ring + more breathing room. Kept modest.
const RING_SCALE: Record<string, number> = { square: 1, portrait: 1.16, vertical: 1.34 };
const STACK_GAP: Record<string, number> = { square: 20, portrait: 32, vertical: 44 };

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// Rise+fade reveal that OMITS the transform once settled — an identity translateY(0)
// can still promote a layer / change text rasterization (same PM §3 hardening as the
// pop wrapper's `transform: none`), which would break the C13 static-identity gate.
const settleReveal = (t: number, start: number, dur: number): CSSProperties => {
  const a = appear(t, start, dur);
  return { opacity: a, ...(a < 1 ? { transform: `translateY(${(1 - a) * RISE_PX}px)` } : {}) };
};

type StatHeroProps = {
  big: string;
  sub?: string;
  note?: string;
  /** 0..1 fraction when `big` expresses a proportion of a whole — draws the sweep ring.
   *  Validated/clamped by planRing (C8); anything non-conforming ⇒ plain mode. */
  proportion?: number;
  /** Colors `big` AND the ring arc as one unit; `note` stays amber (multi-accent). */
  accent?: AccentKey;
  /** Global post progress 0..1. Default 1 ⇒ settled/static — existing call sites unchanged. */
  t?: number;
  /** false ⇒ scale fixed at 1 for all t; opacity-only entrance in the same window. */
  pop?: boolean;
  /** false ⇒ the value plain-fades in the same window (same path as a non-numeric big). */
  countUp?: boolean;
};

export function StatHero({
  big,
  sub,
  note,
  proportion,
  accent = "cyan",
  t = 1,
  pop = true,
  countUp = true,
}: StatHeroProps) {
  // Ring + gap scale to the output aspect (read from FormatContext; portrait when unset).
  const fmtKey = resolveFormat(useContext(FormatContext));
  const ringScale = RING_SCALE[fmtKey] ?? 1;
  const RING_SIZE = Math.round(RING_BASE.size * ringScale);
  const RING_STROKE = Math.round(RING_BASE.stroke * ringScale);
  const RING_R = (RING_SIZE - RING_STROKE) / 2;
  const RING_C = 2 * Math.PI * RING_R;
  const RING_FONT = Math.round(RING_BASE.font * ringScale);
  const RING_TEXT_WIDTH = Math.round(RING_BASE.textWidth * ringScale);
  const stackGap = STACK_GAP[fmtKey] ?? 20;

  // Mode is a pure function of DATA, never of `t` (C2/C8) — the ring can never
  // appear/disappear across the timeline.
  const ring = planRing(proportion, big);
  const plan = countUp ? planCountUp(big) : null;

  // Shared eased count/sweep progress (§2.5.2), pinned to exact 0/1 outside the window
  // so the final frame can never be an easing rounding artifact (C12).
  const countLin = clamp01((t - COUNT_START) / COUNT_DUR);
  const p = countLin <= 0 ? 0 : countLin >= 1 ? 1 : easings.easeOutCubic(countLin);

  // Entrance pop (C5): transform-only scale 0.94 → 1 on ONE wrapper, easeOutBackSubtle
  // (output max ≈ 1.030 ⇒ s_max ≈ 1.0018 < 1.002). Once settled (t ≥ 0.36) the transform
  // is OMITTED entirely — never `scale(1)` — per the PM §3 hardening (an identity
  // transform can change rasterization and break the C13 pixel-diff-0 gate).
  const popLin = clamp01((t - POP_START) / POP_DUR);
  const popActive = pop && popLin < 1;
  const scale = 0.94 + 0.06 * easings.easeOutBackSubtle(popLin);

  // Reserved-width count (PL-1.1 ghost+overlay, reused): the in-flow GHOST is the final
  // string at every t — permanently invisible, it IS the layout, so FitLine's zoom is a
  // pure function of the final value (C3). The overlay is CENTER-aligned (PM ruling 3 —
  // a centered hero grows symmetrically); tabular figures keep width(t) ≤ width(1).
  const heroText = plan?.animate ? (
    <span style={{ position: "relative", display: "inline-block", fontVariantNumeric: "tabular-nums" }}>
      <span data-stat-ghost aria-hidden style={{ opacity: 0 }}>{big}</span>
      <span
        data-stat-value-text
        style={{
          position: "absolute",
          inset: 0,
          textAlign: "center",
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {plan.display(p)}
      </span>
    </span>
  ) : (
    // Fallback (parse fail / countUp:false): the static final string in normal flow —
    // trivially width-stable — fading over the count window (§2.5.2) so a non-numeric
    // big ("1 in 5") lands together with its ring sweep.
    <span data-stat-value-text style={{ opacity: appear(t, COUNT_START, COUNT_DUR) }}>
      {big}
    </span>
  );

  const fitClass = `font-display font-semibold tracking-tight leading-none ${accentClass[accent]}`;

  return (
    <div className="flex h-full flex-col items-center justify-center text-center" style={{ gap: stackGap }} data-stat-root>
      <div
        data-stat-hero={ring.ring ? "ring" : "plain"}
        data-stat-mode={plan?.animate ? "count" : "fade"}
        {...(ring.ring ? {} : { "data-stat-value": "" })}
        className={ring.ring ? undefined : "w-full"}
        style={{
          opacity: appear(t, POP_START, POP_DUR),
          transformOrigin: "center",
          ...(popActive ? { transform: `scale(${scale})` } : {}),
        }}
      >
        {ring.ring ? (
          // Ring mode (§2.5.4): fixed 320×320 box; the sweep animates strokeDashoffset
          // ONLY (dasharray fixed at C) — layout box constant across t by construction.
          <div data-stat-ring-box style={{ position: "relative", width: RING_SIZE, height: RING_SIZE }}>
            <svg
              data-stat-ring-svg
              data-ring-f={ring.f}
              width={RING_SIZE}
              height={RING_SIZE}
              viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            >
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_R}
                fill="none"
                stroke={RING_TRACK}
                strokeWidth={RING_STROKE}
              />
              <circle
                data-stat-ring-arc
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_R}
                fill="none"
                stroke={colors.accent[accent]}
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - ring.f * p)}
                transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div data-stat-value style={{ width: RING_TEXT_WIDTH }}>
                <FitLine className={fitClass} fontSize={RING_FONT} align="center">
                  {heroText}
                </FitLine>
              </div>
            </div>
          </div>
        ) : (
          <FitLine className={fitClass} fontSize={PLAIN_FONT} align="center">
            {heroText}
          </FitLine>
        )}
      </div>
      {sub && (
        <div
          data-stat-sub
          className="line-clamp-2 text-text-secondary"
          style={{ fontSize: 32, lineHeight: 1.3, ...settleReveal(t, SUB_START, SUB_DUR) }}
        >
          {sub}
        </div>
      )}
      {note && (
        <div
          data-stat-note
          className="whitespace-nowrap font-mono uppercase tracking-[0.16em] text-accent-amber"
          style={{ fontSize: 22, ...settleReveal(t, NOTE_START, NOTE_DUR) }}
        >
          {note}
        </div>
      )}
    </div>
  );
}
