// Divergence — the gap between two paired values where the GAP and its DIRECTION are the story
// (predicted vs actual, before vs after, rank inversions). PL-3.1.
//
//   dumbbell (default): per item two dots on a SHARED horizontal value axis, joined by a
//     connector that IS the gap. The connector draws edge-style A→B (one eased leading edge,
//     memory feedback-continuous-edge-growth); the B-dot pops exactly as the edge lands.
//   slope (mode knob): two vertical axes, each item a line connecting its two values; crossing
//     lines = a rank inversion. Same data, same value scale, same connector-draws-then-marker-pops
//     motion — only the geometry function differs.
//
// All layout comes from planDivergence (src/lib/divergence.ts) — the pure brain shared with the
// check suite. Geometry is a pure function of DATA, never `t` (C9). The only animated properties
// are opacity, the connector's drawn dash length (paint-only), and a dot's entrance scale
// (transform on the marker <g>, OMITTED at settle — never scale(1), C12). Props default to t=1
// (settled/static) so Path B can import and call it without animation.
//
// Source-pixel viewBox (1000×640) scaled to the Panel content box, exactly like RangeBars — the
// inspector reads viewBox coordinates as the single deterministic system.
// Spec: planning/primitive-library/handoffs/PL-3.1-divergence.md §2.5.

import { useId } from "react";
import type { Accent } from "@/posts/renderTypes";
import { colors, text, stroke } from "@/tokens/design";
import { easings } from "@/tokens/motion";
import { planCountUp } from "@/lib/countup";
import {
  planDivergence,
  type DivergenceInputItem,
  type DivergenceMode,
  type DivergenceRow,
  VIEW_W,
  VIEW_H,
  DOT_R,
  AXIS_X0,
  AXIS_X1,
  AXIS_Y,
  LABEL_ANCHOR_X,
  SLOPE_X_LEFT,
  SLOPE_X_RIGHT,
} from "@/lib/divergence";

const accentHex = (a: Accent | undefined): string => (a ? colors.accent[a] ?? colors.accent.cyan : colors.accent.cyan);

// Connector = NEUTRAL slate, distinct from BOTH endpoint accents (Emil feedback 2026-06-15): when the
// connector took the end-accent color, the end dots + number labels became unreadable against it
// (violet-on-violet in slope mode). A neutral line is the standard dumbbell/slope convention — the
// two colored endpoints carry the "which side" meaning; the line just connects them. The gap is still
// encoded by the connector's drawn LENGTH, not its hue.
const CONNECTOR_COLOR = colors.text.tertiary; // #8D93A1

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// Remotion Easing functions are pure (number → number) — reuse them outside the timeline.
const easeInOutCubic = (x: number) => easings.easeInOutCubic(clamp01(x));
const easeOutBackSubtle = (x: number) => easings.easeOutBackSubtle(clamp01(x));

type Props = {
  items: DivergenceInputItem[];
  axisMin?: number;
  axisMax?: number;
  startAccent?: Accent;
  endAccent?: Accent;
  startLabel?: string;
  endLabel?: string;
  mode?: DivergenceMode;
  caption?: string;
  t?: number;
};

/** Endpoint label string at a given progress — count-up when eligible, else the static string. */
function endpointText(row: DivergenceRow, side: "a" | "b", p: number): string {
  const display = side === "a" ? row.aLabel : row.bLabel;
  const countText = side === "a" ? row.aCountText : row.bCountText;
  if (!countText) return display; // non-numeric / *Text override → fade path, static string
  const plan = planCountUp(countText);
  return plan.animate ? plan.display(p) : display;
}

export function Divergence({
  items,
  axisMin,
  axisMax,
  startAccent = "cyan",
  endAccent = "burnt",
  startLabel,
  endLabel,
  mode = "dumbbell",
  caption,
  t = 1,
}: Props) {
  const uid = useId();
  const plan = planDivergence(items, axisMin, axisMax, mode);
  const aColor = accentHex(startAccent);
  const bColor = accentHex(endAccent);

  const frameOn = clamp01((t - 0.26) / 0.08); // panel/axis/legend appear

  const legend = (label: string | undefined, color: string, x: number, anchor: "start" | "end") =>
    label ? (
      <text
        x={x}
        y={30}
        textAnchor={anchor}
        fill={color}
        fontFamily="'JetBrains Mono', monospace"
        fontSize={text.axisLabel}
        fontWeight={600}
        letterSpacing="0.18em"
        opacity={frameOn}
        data-diverge-legend
      >
        {label.slice(0, 16).toUpperCase()}
      </text>
    ) : null;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full"
      role="img"
      aria-label={caption ?? "paired-value divergence"}
      data-diverge
      data-diverge-mode={plan.mode}
    >
      {/* Top legends — cool (start) left, warm (end) right. */}
      {plan.mode === "dumbbell" ? (
        <>
          {legend(startLabel, aColor, AXIS_X0, "start")}
          {legend(endLabel, bColor, AXIS_X1, "end")}
        </>
      ) : (
        <>
          {legend(startLabel, aColor, SLOPE_X_LEFT, "start")}
          {legend(endLabel, bColor, SLOPE_X_RIGHT, "end")}
        </>
      )}

      {plan.mode === "dumbbell"
        ? plan.rows.map((row) => (
            <DumbbellRow key={`${uid}-r${row.index}`} row={row} aColor={aColor} bColor={bColor} t={t} pitch={plan.pitch} />
          ))
        : plan.rows.map((row) => (
            <SlopeRow key={`${uid}-r${row.index}`} row={row} aColor={aColor} bColor={bColor} t={t} />
          ))}

      {/* Dumbbell axis baseline + ticks. */}
      {plan.mode === "dumbbell" && (
        <g opacity={frameOn} data-diverge-axis>
          <line x1={AXIS_X0} x2={AXIS_X1} y1={AXIS_Y} y2={AXIS_Y} stroke="rgba(184,178,167,0.30)" strokeWidth={1.5} />
          {plan.ticks.map((tick, i) => {
            const x = AXIS_X0 + ((tick - plan.axisMin) / (plan.axisMax - plan.axisMin)) * (AXIS_X1 - AXIS_X0);
            return (
              <g key={`${uid}-tick-${i}`}>
                <line x1={x} x2={x} y1={AXIS_Y - 4} y2={AXIS_Y + 4} stroke="rgba(184,178,167,0.30)" strokeWidth={1.5} />
                <text
                  x={x}
                  y={AXIS_Y + 28}
                  textAnchor="middle"
                  fill={colors.text.tertiary}
                  fontFamily="'JetBrains Mono', monospace"
                  fontSize={text.axisLabel}
                  letterSpacing="0.10em"
                >
                  {formatTick(tick)}
                </text>
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}

function formatTick(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

// ── Dumbbell row ────────────────────────────────────────────────────────────────────────────
function DumbbellRow({
  row,
  aColor,
  bColor,
  t,
  pitch,
}: {
  row: DivergenceRow;
  aColor: string;
  bColor: string;
  t: number;
  pitch: number;
}) {
  const s = row.rowStart;
  // Beat windows (§2.5.3): A-dot pop [s, s+0.06]; connector draw [s+0.04, s+0.14]; B-dot pop
  // [s+0.14, s+0.20]; A count [s, s+0.10]; B count [s+0.06, s+0.18].
  const aPop = easeOutBackSubtle((t - s) / 0.06);
  const edge = easeInOutCubic((t - (s + 0.04)) / 0.1);
  const bPop = easeOutBackSubtle((t - (s + 0.14)) / 0.06);
  const aCountP = clamp01((t - s) / 0.1);
  const bCountP = clamp01((t - (s + 0.06)) / 0.12);

  const y = row.rowY;
  const x0 = row.aCenter;
  const x1 = row.bCenter;
  const len = Math.abs(x1 - x0);
  const dir = Math.sign(x1 - x0) || 1;
  const labelBudget = pitch / 2;

  return (
    <g data-diverge-row={row.index}>
      {/* Row label (left column). */}
      {row.showLabel && (
        <text
          x={LABEL_ANCHOR_X}
          y={y + 8}
          textAnchor="end"
          fill={colors.text.primary}
          fontFamily="'Space Grotesk', sans-serif"
          fontSize={text.axisLabel}
          fontWeight={500}
          opacity={clamp01((t - s) / 0.08)}
          data-diverge-rowlabel
        >
          {row.label}
        </text>
      )}

      {/* Connector — ONE eased leading edge from A toward B (continuous-edge draw). The full
          geometry is fixed; only the drawn length grows (paint-only, C9). */}
      <line
        x1={x0}
        y1={y}
        x2={x0 + dir * len * edge}
        y2={y}
        stroke={CONNECTOR_COLOR}
        strokeWidth={stroke.chartLine}
        strokeLinecap="round"
        opacity={0.85}
        data-diverge-connector
        data-diverge-drawn={(len * edge).toFixed(2)}
      />

      {/* A dot — pops at row start. transform OMITTED at settle (C12). */}
      <Dot cx={x0} cy={y} color={aColor} pop={aPop} />
      {/* B dot — pops exactly as the edge lands. */}
      <Dot cx={x1} cy={y} color={bColor} pop={bPop} />

      {/* Endpoint labels — above each dot, away from the connector. */}
      {row.showALabel && (
        <EndpointLabel
          x={row.aLabelX}
          y={y - DOT_R - 8}
          anchor={row.aAnchor}
          color={aColor}
          text={endpointText(row, "a", aCountP)}
          opacity={clamp01(aCountP / 0.2)}
          budgetY={[y - labelBudget, y + labelBudget]}
        />
      )}
      {row.showBLabel && (
        <EndpointLabel
          x={row.bLabelX}
          y={y - DOT_R - 8}
          anchor={row.bAnchor}
          color={bColor}
          text={endpointText(row, "b", bCountP)}
          opacity={clamp01(bCountP / 0.2)}
          budgetY={[y - labelBudget, y + labelBudget]}
        />
      )}
    </g>
  );
}

// Endpoint-label anchor + x are decided width-aware in planDivergence (placeEndpointLabel): each
// label reads outward (away from the connector) and is flipped/clamped so it can never extend past
// the viewBox. The renderer just consumes row.aAnchor/bAnchor + row.aLabelX/bLabelX.

// ── Slope row ───────────────────────────────────────────────────────────────────────────────
function SlopeRow({ row, aColor, bColor, t }: { row: DivergenceRow; aColor: string; bColor: string; t: number }) {
  const s = row.rowStart;
  const aPop = easeOutBackSubtle((t - s) / 0.06);
  const edge = easeInOutCubic((t - (s + 0.04)) / 0.1);
  const bPop = easeOutBackSubtle((t - (s + 0.14)) / 0.06);
  const aCountP = clamp01((t - s) / 0.1);
  const bCountP = clamp01((t - (s + 0.06)) / 0.12);

  const xL = SLOPE_X_LEFT;
  const xR = SLOPE_X_RIGHT;
  const yA = row.aCenter; // true data y
  const yB = row.bCenter;
  // Connector from the left endpoint toward the right endpoint — one eased edge.
  const ex = xL + (xR - xL) * edge;
  const ey = yA + (yB - yA) * edge;

  return (
    <g data-diverge-row={row.index}>
      <line
        x1={xL}
        y1={yA}
        x2={ex}
        y2={ey}
        stroke={CONNECTOR_COLOR}
        strokeWidth={stroke.chartLine}
        strokeLinecap="round"
        opacity={0.85}
        data-diverge-connector
      />
      <Dot cx={xL} cy={yA} color={aColor} pop={aPop} />
      <Dot cx={xR} cy={yB} color={bColor} pop={bPop} />

      {/* Item label rides OUTSIDE the left axis (the identity column), at the decluttered y so
          two close rows' labels separate exactly as their value labels do. */}
      {row.showLabel && (
        <text
          x={xL - DOT_R - 12}
          y={row.aLabelY + 8}
          textAnchor="end"
          fill={colors.text.primary}
          fontFamily="'Space Grotesk', sans-serif"
          fontSize={text.axisLabel}
          fontWeight={500}
          opacity={clamp01((t - s) / 0.08)}
          data-diverge-rowlabel
        >
          {row.label}
        </text>
      )}

      {/* Endpoint value labels — placed INSIDE (between the axes, just past each dot) and
          declutter-nudged in y, so they never collide with the outside item-label column. */}
      {row.showALabel && (
        <EndpointLabel
          x={xL + DOT_R + 10}
          y={row.aLabelY + 8}
          anchor="start"
          color={aColor}
          text={endpointText(row, "a", aCountP)}
          opacity={clamp01(aCountP / 0.2)}
        />
      )}
      {row.showBLabel && (
        <EndpointLabel
          x={xR - DOT_R - 10}
          y={row.bLabelY + 8}
          anchor="end"
          color={bColor}
          text={endpointText(row, "b", bCountP)}
          opacity={clamp01(bCountP / 0.2)}
        />
      )}
    </g>
  );
}

// ── Shared leaves ─────────────────────────────────────────────────────────────────────────────
function Dot({ cx, cy, color, pop }: { cx: number; cy: number; color: string; pop: number }) {
  // transform OMITTED at settle (pop >= 1) — never scale(1) (C12). Bounded ∈ [0,1].
  const settled = pop >= 1;
  return (
    <g
      transform={settled ? undefined : `translate(${cx} ${cy}) scale(${clamp01(pop)}) translate(${-cx} ${-cy})`}
      data-diverge-dot
    >
      <circle cx={cx} cy={cy} r={DOT_R} fill={color} stroke={colors.bg.deepInk} strokeWidth={1} />
    </g>
  );
}

function EndpointLabel({
  x,
  y,
  anchor,
  color,
  text: label,
  opacity,
  budgetY,
}: {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  color: string;
  text: string;
  opacity: number;
  budgetY?: [number, number];
}) {
  // Keep the label's baseline inside the row's vertical budget when one is given (dumbbell).
  let yy = y;
  if (budgetY) yy = Math.max(budgetY[0] + 6, Math.min(budgetY[1] - 2, y));
  return (
    <text
      x={x}
      y={yy}
      textAnchor={anchor}
      fill={color}
      fontFamily="'JetBrains Mono', monospace"
      fontSize={text.axisLabel}
      fontWeight={600}
      opacity={clamp01(opacity)}
      data-diverge-endlabel
    >
      {label}
    </text>
  );
}
