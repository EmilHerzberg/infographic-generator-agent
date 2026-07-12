// ComparisonMatrix — 2×2 decision matrix with column + row headers.
// Layout: CSS grid 3 columns × 3 rows (row 1 = col headers, col 1 = row headers).
//
// PL-4.3 retrofit: the layout/clamp/focus DECISIONS live in the pure `planMatrix` brain
// (src/lib/matrix.ts) — this component is now a thin painter that consumes the plan. The painted
// output is BYTE-IDENTICAL to the pre-retrofit code (the retrofit's non-negotiable gate); see
// tools/qa-matrix.mjs (THE HEADLINE CHECK) and planning/primitive-library/baselines/pl-4.3-matrix/.
//
// Numbered constraints (C1–C8) are declared in src/lib/matrix.ts. The internal bounding boxes
// (panel content area ~904×600) are unchanged:
//   col-header×2:   row 1, cells 2-3            font 26px mono uppercase   (C2)
//   row-header×2:   col 1, rows 2-3 (~140px W)  font 26px mono uppercase   (C2)
//   data-cell×4:    rows 2-3, cols 2-3 (~366×254 each)                     (C5)
//     value:        64px display semibold       (mobile floor ≥40, C4)
//     delta:        22px mono uppercase          (mobile floor 22, C3) — fit-or-hide (C6)
// Spacing: grid gap 16px between cells; cell padding 24px internal (C5).
// Animation drivers per cell: tlReveal / trReveal / blReveal / brReveal (0..1).
// focusOn cell + focusLockOpacity dims non-focused cells (C8).

import type { AccentKey } from "@/content/schema";
import { colors, text as textScale } from "@/tokens/design";
import { cellDim as planCellDim, planMatrix, type MatrixAccent } from "@/lib/matrix";
import { FitLine } from "./FitLine";

const accentColorMap: Record<AccentKey, string> = {
  cyan: colors.accent.cyan,
  amber: colors.accent.amber,
  violet: colors.accent.violet,
  mint: colors.accent.mint,
  burnt: colors.accent.burnt,
};

const accentTextClass: Record<AccentKey, string> = {
  cyan: "text-accent-cyan",
  amber: "text-accent-amber",
  violet: "text-accent-violet",
  mint: "text-accent-mint",
  burnt: "text-accent-burnt",
};

export type MatrixCellData = {
  value: string;
  delta?: string;
  accent: AccentKey;
};

export type FocusKey = "tl" | "tr" | "bl" | "br" | null;

type Props = {
  rowHeaders: [string, string];
  rowAccents: [AccentKey, AccentKey];
  colHeaders: [string, string];
  tl: MatrixCellData;
  tr: MatrixCellData;
  bl: MatrixCellData;
  br: MatrixCellData;
  headersReveal?: number;
  tlReveal?: number;
  trReveal?: number;
  blReveal?: number;
  brReveal?: number;
  highlightCell?: FocusKey;
  focusOn?: FocusKey;
  /** opacity of non-focused cells during focus lock (typically 0.7) */
  focusLockOpacity?: number;
};

export function ComparisonMatrix({
  rowHeaders,
  rowAccents,
  colHeaders,
  tl,
  tr,
  bl,
  br,
  headersReveal = 1,
  tlReveal = 1,
  trReveal = 1,
  blReveal = 1,
  brReveal = 1,
  highlightCell = "bl",
  focusOn = null,
  focusLockOpacity = 1,
}: Props) {
  // The pure brain resolves cell content, accents, the delta fit-or-hide decision (C6) and the
  // highlight key (C8). It is byte-identical to the legacy inline resolution on in-spec input.
  const plan = planMatrix({ rowHeaders, colHeaders, rowAccents, tl, tr, bl, br, highlightCell });
  const cellDim = (key: Exclude<FocusKey, null>) => planCellDim(focusOn, key, focusLockOpacity);
  const reveals: Record<Exclude<FocusKey, null>, number> = { tl: tlReveal, tr: trReveal, bl: blReveal, br: brReveal };

  // PL-0.9: `max-w-full` + `minmax(0,1fr)` cap the grid at its container so a wide cell value (64px
  // display font in an auto-width grid) can't expand the tracks past the content column and cascade a
  // right-margin breach onto every sibling (eyebrow/headline/takeaway). No-op when the grid already
  // fits — FitLine then shrinks the value within the capped column. (PL-5.2 honest-factor repro.)
  return (
    <div
      data-matrix
      className="grid max-w-full grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)] grid-rows-[auto_1fr_1fr] gap-x-4 gap-y-4"
    >
      <div data-matrix-cell="spacer" />
      <ColHeader text={plan.colHeaders[0]} reveal={headersReveal} />
      <ColHeader text={plan.colHeaders[1]} reveal={headersReveal} />

      <RowHeader text={plan.rowHeaders[0]} accent={plan.rowAccents[0]} reveal={headersReveal} />
      <Cell cellKey="tl" data={plan.cells.tl} reveal={reveals.tl} dim={cellDim("tl")} highlight={plan.highlightCell === "tl"} />
      <Cell cellKey="tr" data={plan.cells.tr} reveal={reveals.tr} dim={cellDim("tr")} highlight={plan.highlightCell === "tr"} />

      <RowHeader text={plan.rowHeaders[1]} accent={plan.rowAccents[1]} reveal={headersReveal} />
      <Cell cellKey="bl" data={plan.cells.bl} reveal={reveals.bl} dim={cellDim("bl")} highlight={plan.highlightCell === "bl"} />
      <Cell cellKey="br" data={plan.cells.br} reveal={reveals.br} dim={cellDim("br")} highlight={plan.highlightCell === "br"} />
    </div>
  );
}

function ColHeader({ text, reveal }: { text: string; reveal: number }) {
  return (
    <div
      data-matrix-cell="colhdr"
      data-matrix-header="col"
      className="flex items-end justify-center pb-2 font-mono uppercase tracking-[0.22em] text-text-tertiary"
      style={{
        fontSize: textScale.eyebrow,
        opacity: reveal,
        transform: `translateY(${(1 - reveal) * 6}px)`,
      }}
    >
      {text}
    </div>
  );
}

function RowHeader({
  text,
  accent,
  reveal,
}: {
  text: string;
  accent: MatrixAccent;
  reveal: number;
}) {
  return (
    <div
      data-matrix-cell="rowhdr"
      data-matrix-header="row"
      className={`flex items-center justify-end pr-3 text-right font-mono uppercase tracking-[0.20em] ${accentTextClass[accent]}`}
      style={{
        fontSize: textScale.eyebrow,
        opacity: reveal,
        transform: `translateX(${(1 - reveal) * -8}px)`,
        whiteSpace: "pre-line",
        lineHeight: 1.15,
      }}
    >
      {text}
    </div>
  );
}

function Cell({
  cellKey,
  data,
  reveal,
  dim,
  highlight,
}: {
  cellKey: Exclude<FocusKey, null>;
  data: { value: string; delta?: string; accent: MatrixAccent; showDelta: boolean };
  reveal: number;
  dim: number;
  highlight: boolean;
}) {
  const accentColor = accentColorMap[data.accent];
  const scale = 0.96 + reveal * 0.04;
  return (
    <div
      data-matrix-cell={cellKey}
      data-matrix-data={cellKey}
      data-matrix-highlight={highlight ? "1" : "0"}
      className="relative rounded-card bg-bg-midnight-slate/80 px-6 py-6 shadow-card"
      style={{
        opacity: reveal * dim,
        transform: `translateY(${(1 - reveal) * 10}px) scale(${scale})`,
        boxShadow: highlight
          ? `0 0 0 1px ${accentColor}66, 0 0 32px ${accentColor}40`
          : `0 0 0 1px rgba(184,178,167,0.06)`,
      }}
    >
      <FitLine
        zoneAttr="data-matrix-value"
        className={`font-display font-semibold leading-none ${accentTextClass[data.accent]}`}
        fontSize={64}
        style={{
          letterSpacing: "-0.02em",
          filter: `drop-shadow(0 0 ${highlight ? 18 : 12}px ${accentColor}${highlight ? "AA" : "66"})`,
        }}
      >
        {data.value}
      </FitLine>
      {data.showDelta && data.delta && (
        <div
          data-matrix-delta
          className="mt-3 font-mono uppercase tracking-[0.18em] text-text-secondary"
          style={{ fontSize: textScale.chartSeriesSubtitle }}
        >
          {data.delta}
        </div>
      )}
    </div>
  );
}
