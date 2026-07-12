// ClaimList — vertical "graveyard" list of claim/reality pairs.
// Each entry: date + source header, italic claim quote, × + reality marker.
//
// Internal bounding boxes per entry (~150px tall in panel content area):
//   header line:   date (22px mono cyan) · "·" · source (22px display white)
//   claim line:    30px display semibold italic, amber          — the centerpiece
//   reality line:  × (28px burnt) + reality text (22px mono muted) + optional note
// Left border: 2px amber @ 33% opacity — visually marks the entry as a "headstone."
// Spacing: gap-2 (8px) between rows, gap-3 (12px) between cards.
//
// PL-1.4 — richer per-entry "graveyard beat" (the story IS claim→killed). Each entry runs a
// two-beat reveal driven by the global `entriesReveal` 0..1 (top→bottom staggered across
// entries, the stagger a pure function of N so 4 entries still settle ≤ 0.85):
//   1. Entry placed — the card slides in from the left (translateX −16→0) + fades; header +
//      claim ride this first beat (a headstone planted into the ledger).
//   2. Reality strikes — a beat later (~0.45 of the entry's own progress), the reality line
//      reveals (opacity) and the × marker pops.
// LAYOUT is fully reserved at every t: the reality line is in normal flow today; only its
// opacity + the ×'s scale animate ⇒ ZERO layout shift (LC2). Transforms (entry translateX,
// × scale) are OMITTED at settle — never an identity transform — so the final frame
// rasterizes exactly as a static card (LC3/LC5). `clamp01` everywhere.
//
// Rev B (PL-1.4 §4) — the kill beat had no payoff; the reality (the point: "they were wrong")
// was the quietest element. Two new moves on the "reality strikes" beat, both driven off the
// SAME `killP` (so they never lead the claim):
//   1. STRIKE-THROUGH draws across the claim — the claim TEXT is wrapped in an inline-block span
//      and an absolutely-positioned burnt line (top:50%, height 3px, width:100% of the text span)
//      grows via transform: scaleX(killP) origin-left (ONE eased edge — the continuous-edge rule,
//      easeInOutCubic). Paint-only: the claim geometry is untouched, the claim stays fully legible
//      under the strike (a strike crosses text, never hides it). scaleX=1 + transform OMITTED at
//      settle. The line's box ⊆ the claim-text span's box at every sample (RC7).
//   2. The × STAMPS in — replaces the gentle pop with a stamp: scale 1.3→1 (slamming DOWN from
//      oversized) + rotation −8°→0°, sharp easeOutCubic over a short window inside the kill beat,
//      landing as the strike completes. Transform OMITTED at settle (RC8). The 1.3× × never
//      collides — `gap-3` (12px) gives it room (proven by the gate's collisions check at every t).
//   Optional: when an entry has a realityNote, it renders as a thin burnt-border STAMP CHIP
//   (reinforcing the stamp); skipped when absent.
// The strike is absolute over an inline-block span ⇒ ZERO change to any entry/claim/reality
// LAYOUT box ⇒ the existing qa:reveal layout-constancy checks stay valid (no baseline recapture).

import type { CSSProperties, ReactNode } from "react";
import { colors, text as textScale } from "@/tokens/design";
import { easings } from "@/tokens/motion";
import { planNarrative, type NarrativePlan } from "@/lib/narrative";

export type ClaimEntry = {
  id: string;
  date: string;
  source: string;
  claim: string;
  reality: string;
  realityNote?: string;
};

export type ClaimRevealMode = "stagger" | "spotlight";

type Props = {
  entries: ClaimEntry[];
  entriesReveal?: number;
  dim?: number;
  /** PL-4.1: reveal-mode knob. Default "stagger" → today's exact path (byte-identical). */
  revealMode?: ClaimRevealMode;
  /** PL-4.1: spotlight consumes the RAW global t (0..1); ignored by stagger. */
  t?: number;
  /** PL-4.1: the precomputed NarrativePlan (spotlight only); the component computes it if absent. */
  narrative?: NarrativePlan;
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// Per-entry reveal timing (fractions of the global entriesReveal 0..1). Pure module
// constants — NOT authoring knobs.
const ENTRY_SLIDE_PX = 16; // translateX −16 → 0 (LC3 bound)
const ENTRY_DUR = 0.55; // an entry's own reveal (slide + header + claim) within its stagger band
// The reality strike is the SECOND beat: it runs over the LATTER part of the entry's OWN
// progress — starting once the claim is mostly made (KILL_LAG_FRAC) and finishing together
// with the entry. Deriving it from the entry's progress (not a separate t-window) guarantees
// by construction that the reality never leads the claim it contradicts (the graveyard beat),
// and that the whole entry — claim AND reality strike — settles in the SAME band, so the
// staggerForN deadline math needs only ENTRY_DUR.
const KILL_LAG_FRAC = 0.45;

// Stagger as a PURE function of N (mirrors PL-1.3 staggerForN): the per-entry start step is
// sized so the LAST entry's full reveal (entry + its trailing reality strike, both within
// ENTRY_DUR) completes by entriesReveal = 1. Last start = (N−1)·step; (N−1)·step + ENTRY_DUR ≤ 1.
function staggerForN(n: number): number {
  if (n <= 1) return 0;
  return Math.max(0, (1 - ENTRY_DUR) / (n - 1));
}

// PL-4.1 spotlight (Rev D — Emil "list the claims under each other from the beginning, with reading
// time; keep it like pl14b"): the stacked list is present from t=0 (reserved slots, exactly the
// stagger layout); each entry reveals INTO its slot at its plan window, is read (content-aware time),
// STRIKES in place, and STAYS — the list builds top→bottom and every entry remains listed (cumulative).
// The ONLY difference from the default stagger is the pacing: one-entry-at-a-time, content-timed
// (genuine reading time per claim) instead of the fast overlapping stagger. The strike works exactly
// as stagger (full-width claim, RC7) — Emil's "the crossing out didn't work" on the centered card is
// gone because we're back to the in-place stacked card. Final frame == stagger (N3 thumbnail-clean).

export function ClaimList({ entries, entriesReveal = 1, dim = 1, revealMode = "stagger", t = 1, narrative }: Props) {
  const n = entries.length;

  // ── DEFAULT (stagger) — byte-identical early return to today's exact render path ──────────────
  if (revealMode !== "spotlight") {
    const step = staggerForN(n);
    return (
      <div className="flex flex-col gap-3" data-claim-list>
        {entries.map((e, i) => {
          // Each entry's own 0..1 progress: starts at i·step, lasts ENTRY_DUR.
          const entryP = clamp01((entriesReveal - i * step) / ENTRY_DUR);
          // The reality strike rides the tail of the entry's own progress (the second beat).
          const killP = clamp01((entryP - KILL_LAG_FRAC) / (1 - KILL_LAG_FRAC));
          return <Entry key={e.id} entry={e} index={i} entryP={entryP} killP={killP} dim={dim} />;
        })}
      </div>
    );
  }

  // ── NARRATIVE (spotlight, Rev D) — stacked list from t=0; reveal+strike one-by-one DOWN the list,
  // content-timed, cumulative (entries stay). The plan is a pure function of content; compute it if
  // the caller didn't pass one (§2.6 clamp 2).
  const plan =
    narrative ??
    planNarrative(
      "spotlight",
      entries.map((e) => ({ claim: e.claim, reality: e.reality, realityNote: e.realityNote })),
    );
  const settled = t >= plan.assembly.endT;
  return (
    <div className="flex flex-col gap-3" data-claim-list data-claim-spotlight>
      {entries.map((e, i) => {
        const w = plan.windows[i];
        // No window (over the cap) → fully revealed (final-frame safe).
        if (!w) return <Entry key={e.id} entry={e} index={i} entryP={1} killP={1} dim={dim} />;
        // Reveal on the enter ramp and STAY (cumulative — never fades out). The Rev-B kill (strike +
        // × stamp) lands inside the read window via killP, with content-aware room to read first.
        const enterP = settled ? 1 : clamp01((t - w.enterStartT) / Math.max(1e-6, w.readStartT - w.enterStartT));
        const killStartT = w.killStartT ?? w.readEndT;
        const killP = settled ? 1 : clamp01((t - killStartT) / Math.max(1e-6, w.readEndT - killStartT));
        return <Entry key={e.id} entry={e} index={i} entryP={enterP} killP={killP} dim={dim} />;
      })}
    </div>
  );
}

// Slide-in reveal that OMITS the transform once settled (entryP ≥ 1) — an identity translateX(0)
// can still change rasterization (the LC3 discipline), which the final-frame check forbids. Used by
// BOTH stagger and spotlight (Rev D): spotlight is the same stacked card, just plan-timed.
function entryStyle(entryP: number, dim: number): CSSProperties {
  const eased = easings.easeOutCubic(entryP);
  const tx = (1 - eased) * -ENTRY_SLIDE_PX;
  return {
    opacity: clamp01(eased) * dim,
    ...(entryP < 1 ? { transform: `translateX(${tx}px)` } : {}),
    borderLeft: `2px solid ${colors.accent.amber}55`,
  };
}

// Rev B kill-beat sub-windows (fractions of the entry's own killP 0..1).
// The strike draws across the whole kill beat; the × stamp lands over its LATTER part, so the
// × slams home as the strike finishes crossing the claim.
const STAMP_START = 0.45; // the × stamp begins this far into the kill beat
const X_OVERSCALE = 1.3; // stamp scale 1.3 → 1 (RC8 bound)
const X_OVERROT = -8; // stamp rotation −8° → 0° (RC8 bound)

function Entry({
  entry,
  index,
  entryP,
  killP,
  dim,
}: {
  entry: ClaimEntry;
  index: number;
  entryP: number;
  killP: number;
  dim: number;
}): ReactNode {
  // Strike-through edge: ONE eased edge scaleX(0→1) across the claim text (easeInOutCubic,
  // continuous-edge). scaleX pinned to [0,1]; the transform is OMITTED at settle (killP ≥ 1)
  // so the line is at natural full width — never scaleX(1) (RC7 rasterization discipline).
  const strikeP = killP <= 0 ? 0 : killP >= 1 ? 1 : clamp01(easings.easeInOutCubic(killP));

  // × STAMP: over the LATTER part of the kill beat (STAMP_START..1), sharp easeOutCubic, the ×
  // slams DOWN from oversized (scale 1.3→1) + un-rotates (−8°→0°). Transform OMITTED at settle
  // (RC8 — never scale(1)/rotate(0)). stampP 0→1 ⇒ scale 1.3→1, rotation −8→0.
  const stampLin = clamp01((killP - STAMP_START) / (1 - STAMP_START));
  const stampP = killP <= 0 ? 0 : killP >= 1 ? 1 : easings.easeOutCubic(stampLin);
  const xScale = X_OVERSCALE + (1 - X_OVERSCALE) * stampP; // 1.3 → 1
  const xRot = X_OVERROT * (1 - stampP); // −8 → 0
  const xStamped = killP >= 1; // settled ⇒ omit the transform
  return (
    <div
      data-claim-entry={index}
      className="relative flex flex-col gap-2 rounded-card bg-bg-midnight-slate/60 px-5 py-3.5 shadow-card"
      style={entryStyle(entryP, dim)}
    >
      <div
        data-claim-header
        className="flex items-baseline gap-3 font-mono uppercase tracking-[0.22em]"
        style={{ fontSize: 22 }}
      >
        <span className="text-accent-cyan">{entry.date}</span>
        <span className="text-text-tertiary">·</span>
        <span className="text-text-primary tracking-[0.14em]">{entry.source}</span>
      </div>

      <div
        data-claim-claim
        className="font-display italic text-accent-amber"
        style={{ fontSize: 30, lineHeight: 1.2, letterSpacing: "-0.01em" }}
      >
        {/* Inline-block span so the strike line spans the WORDS, not the empty box width. The
            claim text geometry is untouched; the strike is an absolute overlay (paint-only). */}
        <span data-claim-text-span style={{ position: "relative", display: "inline-block" }}>
          {entry.claim}
          <span
            data-claim-strike
            aria-hidden="true"
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              width: "100%",
              height: 3,
              backgroundColor: colors.accent.burnt,
              transformOrigin: "left center",
              pointerEvents: "none",
              // continuous-edge: ONE eased edge; OMITTED at settle (never scaleX(1)).
              ...(strikeP < 1 ? { transform: `scaleX(${strikeP})` } : {}),
            }}
          />
        </span>
      </div>

      <div
        data-claim-reality
        className="flex items-baseline gap-3 font-mono uppercase tracking-[0.18em]"
        style={{ fontSize: textScale.chartSeriesSubtitle, opacity: clamp01(killP <= 0 ? 0 : killP) }}
      >
        <span
          data-claim-kill
          className="text-accent-burnt font-bold"
          style={{
            fontSize: 28,
            lineHeight: 1,
            display: "inline-block",
            transformOrigin: "center",
            // Stamp: scale 1.3→1 + rotation −8°→0°. OMITTED at settle (never scale(1)/rotate(0)).
            ...(xStamped ? {} : { transform: `scale(${xScale}) rotate(${xRot}deg)` }),
          }}
        >
          ×
        </span>
        <span className="text-text-secondary">{entry.reality}</span>
        {entry.realityNote && (
          // Rev B: burnt-border STAMP CHIP reinforcing the kill (existing uppercase mono). Sized
          // height-neutral — `lineHeight:1` + 1px vertical padding so the chip's border-box fits
          // within the reality line's existing box (no entry-height growth ⇒ no layout/overflow
          // regression at the bottom margin; LC2 layout-constancy is unaffected).
          <span
            data-claim-note
            className="rounded-card text-text-tertiary"
            style={{
              border: `1px solid ${colors.accent.burnt}66`,
              padding: "1px 7px",
              lineHeight: 1,
            }}
          >
            {entry.realityNote}
          </span>
        )}
      </div>
    </div>
  );
}
