// Candlestick — an OPEN/HIGH/LOW/CLOSE (OHLC) range over an ORDERED time axis. PL-2.5, the last
// open chart gap of Epic PL-2 (the chart family). Each period carries FOUR values; the story is the
// per-period range (high–low) AND the open→close move plus its up/down direction.
//
//   candles (default): a filled body <rect> spanning open→close (width = band) + a thin vertical
//     wick <line> spanning high→low through the band center.
//   ohlc (mode knob): a vertical high–low <line> + a left tick at open + a right tick at close
//     (the western "bar chart" glyph). EVERYTHING shared except the per-candle glyph.
//
// All layout comes from planCandles (src/lib/candlestick.ts) — the pure brain shared with the check
// suite. Geometry is a pure function of DATA, never `t`: each candle's final body/wick coordinates
// are fixed by the plan and constant across the timeline. Candles are DISCONNECTED objects → a
// per-candle overlapping stagger LEFT→RIGHT (the BarChart/ScatterPlot disconnected-pop pattern, NOT
// the continuous-edge of a connected silhouette): the wick draws on (high→low) then the body grows
// from the open edge (the BarChart grow-from-baseline transform, anchored at `open` not a global
// baseline), OMITTED at settle (never scale(1) — the LC3/C12 rule) so the gate's parseMatrix reads
// it. Up (close≥open) = mint, down = burnt (a legitimately two-accent primitive — direction IS the
// data). Props default to t=1 (settled/static) so Path B can import it without animation.
//
// PL-0.8 ROW-AWARE viewBox (the §3 BINDING CORRECTION): width is FIXED (1000); height matches the
// row's measured aspect so the SVG fills the full row WIDTH (uniform scale ⇒ body width stays
// full-size, clear of the mobile floor even in a wide-short row, with no overflow) — the proven
// ScatterPlot solution, NOT the fixed aspect-[25/16] box.
// Spec: planning/primitive-library/handoffs/PL-2.5-candlestick.md §2.5 / §2.7 / §3.

import { useId, useLayoutEffect, useRef, useState } from "react";
import type { Accent } from "@/posts/renderTypes";
import { colors } from "@/tokens/design";
import {
  planCandles,
  candleReveal,
  formatTick,
  clampViewH,
  type CandleInput,
  type CandleMode,
  type PlannedCandle,
  VIEW_W,
  VIEW_H,
  PLOT_X0,
  PLOT_X1,
  TICK_LABEL_X,
  WICK_STROKE,
  TICK_LEN,
  GRID_STROKE,
  AXIS_LABEL_PX,
} from "@/lib/candlestick";

const accentHex = (a: string): string => colors.accent[a as Accent] ?? colors.accent.cyan;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const GRID_COLOR = "rgba(184,178,167,0.30)";

type Props = {
  candles: CandleInput[];
  mode?: CandleMode;
  axisMin?: number;
  axisMax?: number;
  upAccent?: Accent;
  downAccent?: Accent;
  unit?: string;
  caption?: string;
  t?: number;
};

export function Candlestick({
  candles,
  mode = "candles",
  axisMin,
  axisMax,
  upAccent,
  downAccent,
  unit,
  caption,
  t = 1,
}: Props) {
  const uid = useId();

  // PL-0.8 — row-aware viewBox: measure the row's px aspect so the viewBox aspect MATCHES it and the
  // SVG fills the FULL row width (uniform scale ⇒ full-width bodies that clear the mobile floor even
  // in a wide-short row, with no overflow). FitZone's proven pattern: a SYNCHRONOUS measure inside
  // useLayoutEffect (applied before paint, so Remotion captures the settled frame — PL-0.3 render-
  // truth parity), plus a ResizeObserver for later resizes. Pre-measure default = 640 (today's
  // geometry) ⇒ static/SSR import byte-identical.
  const boxRef = useRef<HTMLDivElement>(null);
  const [viewH, setViewH] = useState(VIEW_H);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      const w = box.clientWidth;
      const h = box.clientHeight;
      if (!w || !h) return;
      const next = clampViewH((VIEW_W * h) / w); // viewH = 1000 / aspect, clamped to [MIN_VIEW_H, 640]
      setViewH((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  const plan = planCandles({ candles, mode, axisMin, axisMax, upAccent, downAccent, unit, viewH });
  const { plotY0, plotY1, labelY, viewH: vbH } = plan;

  const frameOn = clamp01((t - 0.26) / 0.08); // axes/gridlines/time labels appear (chrome)

  // viewBox px position of a price along the y-axis (for gridlines + ticks). y inverted (max at top).
  const span = plan.axisMax - plan.axisMin || 1;
  const yPos = (v: number) => plotY1 - ((v - plan.axisMin) / span) * (plotY1 - plotY0);

  if (plan.empty) {
    return (
      <div ref={boxRef} className="relative h-full w-full">
        <svg
          viewBox={`0 0 ${VIEW_W} ${vbH}`}
          className="block h-full w-full"
          role="img"
          aria-label={caption ?? "OHLC range over time"}
          data-candle
          data-candle-mode={plan.mode}
          data-candle-empty
          data-candle-viewh={vbH}
        />
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative h-full w-full">
      <svg
        viewBox={`0 0 ${VIEW_W} ${vbH}`}
        className="block h-full w-full"
        role="img"
        aria-label={caption ?? "OHLC range over time"}
        data-candle
        data-candle-mode={plan.mode}
        data-candle-viewh={vbH}
      >
        {/* Chrome — price gridlines + ticks (left gutter), time-slot labels (bottom band). Opacity-
            only reveal; geometry reserved from frame 1 (the Bar/Scatter frame-in beat). */}
        <g opacity={frameOn} data-candle-axis>
          {plan.ticks.map((tick, i) => {
            const y = yPos(tick);
            return (
              <g key={`${uid}-yt-${i}`} data-candle-tick={i}>
                <line x1={PLOT_X0} x2={PLOT_X1} y1={y} y2={y} stroke={GRID_COLOR} strokeWidth={GRID_STROKE} opacity={i === 0 ? 1 : 0.5} />
                <text
                  x={TICK_LABEL_X}
                  y={y + 8}
                  textAnchor="end"
                  fill={colors.text.tertiary}
                  fontFamily="'JetBrains Mono', monospace"
                  fontSize={AXIS_LABEL_PX}
                  letterSpacing="0.04em"
                >
                  {formatTick(tick, plan.unit)}
                </text>
              </g>
            );
          })}
        </g>

        {/* Time-slot labels — bottom band, centered on each visible candle. */}
        <g opacity={frameOn} data-candle-tlabels>
          {plan.candles.map((c) =>
            c.showLabel ? (
              <text
                key={`${uid}-tl-${c.index}`}
                x={c.cx}
                y={labelY}
                textAnchor="middle"
                fill={colors.text.primary}
                fontFamily="'Space Grotesk', sans-serif"
                fontSize={AXIS_LABEL_PX}
                fontWeight={500}
                data-candle-tlabel={c.index}
              >
                {c.label}
              </text>
            ) : null,
          )}
        </g>

        {/* Candles — wick draws then body grows; overlap-stagger left→right; transform OMITTED at settle. */}
        {plan.candles.map((c) => (
          <Candle key={`${uid}-c${c.index}`} c={c} mode={plan.mode} t={t} />
        ))}
      </svg>
    </div>
  );
}

// ── One candle: wick draw + body grow (candles), or H-L line + open/close ticks (ohlc) ──────────
function Candle({ c, mode, t }: { c: PlannedCandle; mode: CandleMode; t: number }) {
  const { wick, body } = candleReveal(t, c.candleStart); // each clamped ∈ [0,1]
  const settled = body >= 1;
  const fill = accentHex(c.accentKey);
  const opacity = clamp01((t - c.candleStart) / 0.06);

  const bodyH = c.bodyBot - c.bodyTop;
  // §3 note — BarChart's EXACT grow mechanism: an explicit CSS style.transform in viewBox user units
  // (default transform-box, NO fill-box), scaleY about the OPEN edge, OMITTED at settle (never
  // scaleY(1)) so getComputedStyle reads a matrix the gate's parseMatrix consumes. The open edge is
  // the body edge AT the open price (openY); the body grows open→close from there.
  const anchor = c.openY;
  const bodyTransform = settled ? undefined : `translate(0px, ${anchor}px) scale(1, ${body}) translate(0px, ${-anchor}px)`;

  // Wick draws on via pathLength=1 + strokeDashoffset = 1−wick (the LineChart/scatter-trend draw).
  const wickLen = c.wickBot - c.wickTop;

  return (
    <g data-candle-g={c.index} data-candle-dir={c.dir}>
      {mode === "ohlc" ? (
        <>
          {/* high–low vertical line. */}
          <line
            x1={c.cx}
            x2={c.cx}
            y1={c.wickTop}
            y2={c.wickBot}
            stroke={fill}
            strokeWidth={WICK_STROKE}
            strokeLinecap="butt"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={1 - wick}
            opacity={opacity}
            data-candle-hl
            data-candle-wick-reveal={wick.toFixed(3)}
          />
          {/* left tick at open, right tick at close — fade in with the body. */}
          <g style={{ opacity: settled ? opacity : opacity * body }} data-candle-grow>
            <line x1={c.cx - TICK_LEN} x2={c.cx} y1={c.openY} y2={c.openY} stroke={fill} strokeWidth={WICK_STROKE} strokeLinecap="butt" data-candle-open-tick />
            <line x1={c.cx} x2={c.cx + TICK_LEN} y1={c.closeY} y2={c.closeY} stroke={fill} strokeWidth={WICK_STROKE} strokeLinecap="butt" data-candle-close-tick />
          </g>
        </>
      ) : (
        <>
          {/* wick (high–low) through the band center — draws on first. */}
          <line
            x1={c.cx}
            x2={c.cx}
            y1={c.wickTop}
            y2={c.wickBot}
            stroke={fill}
            strokeWidth={WICK_STROKE}
            strokeLinecap="butt"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={1 - wick}
            opacity={opacity}
            data-candle-wick
            data-candle-wick-reveal={wick.toFixed(3)}
            data-candle-wick-len={wickLen.toFixed(2)}
          />
          {/* body (open→close) — grows from the open edge; transform OMITTED at settle. */}
          <g style={{ transform: bodyTransform, opacity }} data-candle-grow>
            <rect x={c.cx - c.halfW} y={c.bodyTop} width={2 * c.halfW} height={Math.max(0, bodyH)} rx={3} fill={fill} data-candle-body data-candle-doji={c.dojiFloored ? "1" : "0"} />
          </g>
        </>
      )}
    </g>
  );
}
