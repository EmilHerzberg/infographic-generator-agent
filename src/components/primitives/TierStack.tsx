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

import { useContext, useId } from "react";
import type { Accent } from "@/posts/renderTypes";
import { colors, resolveFormat } from "@/tokens/design";
import { FormatContext } from "@/components/layout/formatContext";
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

// Taller-frame spread (Emil's format-bench feedback): on 4:5/9:16 the stack opens its vertical
// rhythm (band gaps, band padding, chip height) to USE the extra frame height instead of clustering
// mid-zone. Square keeps today's values byte-identically.
type Spread = {
  stackGap: number;
  tierPadY: number;
  tierMinH: number;
  rowGap: number;
  chipMinH: number;
  /** Adaptive density (Emil): narrower pack width → fewer, WIDER chips per row on tall formats. */
  packWidth?: number;
  twoRowQuota?: number;
  /** Scale-up of the whole stack (fonts + boxes) — width-compensated so it still fits the track. */
  zoom: number;
  chipGrow: boolean;
};
const SPREADS: Record<"base" | "portrait" | "vertical", Spread> = {
  base: { stackGap: 24, tierPadY: 12, tierMinH: 96, rowGap: 16, chipMinH: 56, zoom: 1, chipGrow: false },
  portrait: { stackGap: 36, tierPadY: 16, tierMinH: 110, rowGap: 20, chipMinH: 62, packWidth: 680, twoRowQuota: 3, zoom: 1.05, chipGrow: true },
  vertical: { stackGap: 56, tierPadY: 24, tierMinH: 128, rowGap: 24, chipMinH: 70, packWidth: 560, twoRowQuota: 3, zoom: 1.12, chipGrow: true },
};

export function TierStack({ tiers, mode = "tiers", showValue = false, t = 1 }: Props) {
  const uid = useId();
  const fmt = resolveFormat(useContext(FormatContext));
  const spread = SPREADS[fmt === "vertical" ? "vertical" : fmt === "portrait" ? "portrait" : "base"];
  const plan = planTiers(tiers, mode, spread.packWidth != null ? { packWidth: spread.packWidth, twoRowQuota: spread.twoRowQuota } : undefined);

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
      className="flex h-full w-full min-w-0 flex-col justify-center"
      // zoom scales the whole stack up (fonts + chips); maxWidth divides by it so the RENDERED
      // width stays exactly the design track (zoomed layout px × zoom = track px).
      style={{ maxWidth: TRACK_WIDTH / spread.zoom, rowGap: spread.stackGap, ...(spread.zoom !== 1 ? { zoom: spread.zoom } : {}) }}
      data-tiers
      data-tiers-mode={plan.mode}
    >
      {plan.tiers.map((tier, i) =>
        plan.mode === "ranked" ? (
          <RankedTier key={`${uid}-t${i}`} tier={tier} index={i} t={t} showValue={showValue} spread={spread} />
        ) : (
          <Tier key={`${uid}-t${i}`} tier={tier} index={i} t={t} spread={spread} />
        ),
      )}
    </div>
  );
}

// ── Tiers mode ──────────────────────────────────────────────────────────────────────────────
function Tier({ tier, index, t, spread }: { tier: PlannedTier; index: number; t: number; spread: Spread }) {
  const hex = accentHex(tier.accentKey);
  const bandStart = tierBandStart(index);
  const bandOn = clamp01((t - bandStart) / BAND_DUR);
  const labelOn = clamp01((t - (bandStart + 0.02)) / BAND_DUR);
  const labelSettled = labelOn >= 1;
  // Flat chip index across both rows (left→right, top row first) — drives the overlapping stagger.
  let chipIdx = 0;

  return (
    <div
      className="relative flex min-w-0 flex-col justify-center gap-2 px-5"
      style={{ minHeight: spread.tierMinH, paddingTop: spread.tierPadY, paddingBottom: spread.tierPadY }}
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
      <div className="relative flex min-w-0 flex-col" style={{ rowGap: spread.rowGap }}>
        {tier.rows.map((row, ri) => (
          <div key={ri} className="flex min-w-0 flex-row gap-4">
            {row.map((chip, ci) => {
              const j = chipIdx++;
              const start = chipStart(index, j);
              const on = clamp01((t - start) / CHIP_DUR);
              return <Chip key={ci} chip={chip} on={on} accentHex={hex} minH={spread.chipMinH} grow={spread.chipGrow} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Chip({ chip, on, accentHex: hex, minH, grow }: { chip: PlannedChip; on: number; accentHex: string; minH: number; grow: boolean }) {
  const settled = on >= 1;
  return (
    <div
      className="flex min-w-0 items-center rounded-[10px]"
      style={{
        minWidth: CHIP_MIN_WIDTH,
        minHeight: minH,
        // Adaptive density: on tall formats the (fewer) chips GROW to share the full row width.
        ...(grow ? { flexGrow: 1 } : {}),
        padding: "0 20px",
        // Chip readability (Emil's format-bench feedback): a deeper fill + stronger ring separates
        // the chip from the tinted band it sits on, so the label reads at feed size.
        backgroundColor: colors.bg.deepInk,
        boxShadow: `inset 0 0 0 1px ${rgba(hex, 0.38)}`,
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
  spread,
}: {
  tier: PlannedTier;
  index: number;
  t: number;
  showValue: boolean;
  spread: Spread;
}) {
  return (
    <div className="relative flex flex-col" style={{ rowGap: Math.max(12, spread.rowGap - 4) }} data-tier={index}>
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
              minHeight: spread.chipMinH,
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
