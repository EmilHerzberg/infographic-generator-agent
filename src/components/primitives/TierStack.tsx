// TierStack — items sorted into a small number of ORDERED buckets (high/moderate/low utility)
// or a ranked leaderboard, where the grouping/ordering IS the argument. PL-3.2.
//
//   tiers (default): N labeled tiers, each a colored band carrying a row of item chips. The
//     Dunlosky case (study techniques sorted into effectiveness tiers).
//   ranked (mode knob): the items collapse to a single ordered 1..N leaderboard with rank
//     numerals — one synthetic full-width tier, vertical flow. Zero new fields / layout math.
//
// All layout comes from planTiers (src/lib/tiers.ts) — the pure brain shared with the check
// suite. Geometry is a pure function of DATA, never `t` (C11): chip presence + bin-pack rows are
// decided by data and constant across the timeline. The only animated properties are opacity +
// a small rise; the transform is OMITTED at settle (never translateY(0), C13). Props default to
// t=1 (settled/static) so Path B can import and call it without animation. FitLine fits ALL text
// (do not hand-roll fit). Empty-state = caption-only Panel — no "no data" text (§3 ruling 3).
// Spec: planning/primitive-library/handoffs/PL-3.2-tiered-ranked.md §2.5.

import { useId } from "react";
import type { Accent } from "@/posts/renderTypes";
import { colors } from "@/tokens/design";
import { FitLine } from "@/components/primitives/FitLine";
import {
  planTiers,
  type TierInput,
  type TierMode,
  type PlannedChip,
  type PlannedTier,
  tierBandStart,
  chipStart,
  BAND_DUR,
  CHIP_DUR,
  CHIP_FONT,
  TIER_LABEL_FONT,
  CHIP_MIN_WIDTH,
  TRACK_WIDTH,
} from "@/lib/tiers";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const accentHex = (a: string): string => colors.accent[a as Accent] ?? colors.accent.cyan;

// Hex → rgba at a given alpha (band fill / ring tints — accent @12% fill, @40% ring, §2.5.4).
function rgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type Props = {
  tiers: TierInput[];
  mode?: TierMode;
  caption?: string;
  showValue?: boolean; // ranked: render each item's note right-aligned as a value
  t?: number;
};

export function TierStack({ tiers, mode = "tiers", showValue = false, t = 1 }: Props) {
  const uid = useId();
  const plan = planTiers(tiers, mode);

  // Empty-state (§3 ruling 3): the Panel renders with its caption only — NO "no data" text. The
  // PostRenderer wraps us in a captioned Panel, so here we simply render an empty stack.
  if (plan.empty) {
    return <div className="flex h-full w-full flex-col" data-tiers data-tiers-empty />;
  }

  return (
    // PL-5.2 + PL-0.11: `min-w-0` lets the flex chain SHRINK; the ABSOLUTE `maxWidth: TRACK_WIDTH`
    // (904) hard-caps the stack at its design track so a dense element can't expand the column and
    // cascade a right-margin breach onto every PostFrame sibling (eyebrow/headline/metric/takeaway).
    // PL-5.2 used `max-w-full` (a PERCENT of the panel content box), but that box is itself sized by
    // the same auto grid column — so when a chip row rendered ~4px past CHIP_TRACK_WIDTH (estW
    // under-counts the true text advance by a few px), the column inflated, the 100% cap inflated with
    // it, and the cap leaked. The absolute 904 cap can't be inflated: it bounds the stack's max-content
    // CONTRIBUTION to the grid track, so the column stays = canvas. Combined with `w-full` the width is
    // min(100%, 904px). It's a NO-OP when content fits (the stack already renders at exactly 904) —
    // the chips' FitLine + flex-shrink then absorb any residual within the capped track. Covers BOTH
    // modes and a pathologically long tier/ranked label, not just the measured chip-row case.
    <div
      className="flex h-full w-full min-w-0 flex-col justify-center gap-6"
      style={{ maxWidth: TRACK_WIDTH }}
      data-tiers
      data-tiers-mode={plan.mode}
    >
      {plan.tiers.map((tier, i) =>
        plan.mode === "ranked" ? (
          <RankedTier key={`${uid}-t${i}`} tier={tier} index={i} t={t} showValue={showValue} />
        ) : (
          <Tier key={`${uid}-t${i}`} tier={tier} index={i} t={t} />
        ),
      )}
    </div>
  );
}

// ── Tiers mode ──────────────────────────────────────────────────────────────────────────────
function Tier({ tier, index, t }: { tier: PlannedTier; index: number; t: number }) {
  const hex = accentHex(tier.accentKey);
  const bandStart = tierBandStart(index);
  const bandOn = clamp01((t - bandStart) / BAND_DUR);
  const labelOn = clamp01((t - (bandStart + 0.02)) / BAND_DUR);
  const labelSettled = labelOn >= 1;
  // Flat chip index across both rows (left→right, top row first) — drives the overlapping stagger.
  let chipIdx = 0;

  return (
    <div
      className="relative flex min-w-0 flex-col justify-center gap-2 px-5 py-3"
      style={{ minHeight: 96 }}
      data-tier={index}
    >
      {/* Band — absolute inset:0 so it can NEVER affect layout (PL-1.3 fill discipline). Colored
          shelf: accent @12% fill + accent @40% 1px ring. Opacity-only reveal (geometry static). */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl"
        style={{
          backgroundColor: rgba(hex, 0.12),
          boxShadow: `inset 0 0 0 1px ${rgba(hex, 0.4)}`,
          opacity: bandOn,
        }}
        data-tier-band
      />

      {/* Tier label + accent dot — top-left, FitLine width, line-clamp 1, color = accent. */}
      <div
        className="relative flex items-center gap-2.5"
        style={{
          opacity: labelOn,
          ...(labelSettled ? {} : { transform: `translateY(${(1 - labelOn) * 8}px)` }),
        }}
      >
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
        <div className="min-w-0 flex-1">
          <FitLine fontSize={TIER_LABEL_FONT} align="left" style={{ color: hex, fontWeight: 600 }}>
            <span className="font-display" data-tier-label>
              {tier.label}
            </span>
          </FitLine>
        </div>
      </div>

      {/* Chip rows — deterministic planTiers bin-pack (≤2 rows). gap 16px between chips/rows.
          min-w-0 on the column + each row so chips can shrink to the real width (PL-5.2). */}
      <div className="relative flex min-w-0 flex-col gap-4">
        {tier.rows.map((row, ri) => (
          <div key={ri} className="flex min-w-0 flex-row gap-4">
            {row.map((chip, ci) => {
              const j = chipIdx++;
              const start = chipStart(index, j);
              const on = clamp01((t - start) / CHIP_DUR);
              return <Chip key={ci} chip={chip} on={on} accentHex={hex} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Chip({ chip, on, accentHex: hex }: { chip: PlannedChip; on: number; accentHex: string }) {
  const settled = on >= 1;
  return (
    <div
      className="flex min-w-0 items-center rounded-[10px]"
      style={{
        minWidth: CHIP_MIN_WIDTH,
        minHeight: 56,
        padding: "0 20px",
        backgroundColor: colors.bg.softPanel,
        boxShadow: `inset 0 0 0 1px ${rgba(hex, 0.22)}`,
        opacity: on,
        ...(settled ? {} : { transform: `translateY(${(1 - on) * 8}px)` }),
      }}
      data-tier-chip
    >
      <div className="min-w-0 flex-1">
        <FitLine fontSize={CHIP_FONT} align="left" style={{ color: colors.text.primary }}>
          <span className="font-display" style={{ fontWeight: 500 }}>
            {chip.label}
          </span>
        </FitLine>
      </div>
    </div>
  );
}

// ── Ranked mode ─────────────────────────────────────────────────────────────────────────────
// One synthetic full-width tier; each item a single-chip row with a leading rank ordinal. Uses
// the same per-item cadence (chips stagger from the tier's band start, §2.5.5).
function RankedTier({
  tier,
  index,
  t,
  showValue,
}: {
  tier: PlannedTier;
  index: number;
  t: number;
  showValue: boolean;
}) {
  return (
    <div className="relative flex flex-col gap-3" data-tier={index}>
      {tier.rows.map((row, ri) => {
        const chip = row[0];
        if (!chip) return null;
        const start = chipStart(index, ri);
        const on = clamp01((t - start) / CHIP_DUR);
        const settled = on >= 1;
        return (
          <div
            key={ri}
            className="flex items-center gap-4 rounded-[10px] px-5"
            style={{
              minHeight: 56,
              backgroundColor: colors.bg.softPanel,
              boxShadow: `inset 0 0 0 1px ${rgba(colors.accent.cyan, 0.18)}`,
              opacity: on,
              ...(settled ? {} : { transform: `translateY(${(1 - on) * 8}px)` }),
            }}
            data-tier-chip
          >
            <span
              className="shrink-0 font-mono"
              style={{ color: colors.accent.cyan, fontSize: CHIP_FONT, fontWeight: 600 }}
              data-tier-rank
            >
              {chip.rank}.
            </span>
            <div className="min-w-0 flex-1">
              <FitLine fontSize={CHIP_FONT} align="left" style={{ color: colors.text.primary }}>
                <span className="font-display" style={{ fontWeight: 500 }}>
                  {chip.label}
                </span>
              </FitLine>
            </div>
            {showValue && chip.note && (
              <span
                className="shrink-0 font-mono"
                style={{ color: colors.text.secondary, fontSize: CHIP_FONT, maxWidth: "30%" }}
                data-tier-value
              >
                {chip.note}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
