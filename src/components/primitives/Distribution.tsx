// Distribution — the FIVE-NUMBER summary (min·q1·median·q3·max) + outliers of one or a few GROUPS on
// a SHARED value axis (a box-and-whisker family). PL-3.5, the quantile/spread-structure gap.
//
//   box (default): per group a thin whisker <line> (min→max via the Tukey fence) with end CAPS, an
//     IQR box <rect> (q1→q3, band-thick), a THICK median <line> inside the box, optional outlier
//     <circle>s, and an optional mean DIAMOND. A tiny-n group (< MIN_SAMPLES raw) renders a
//     range+median glyph (no box).
//   rangeMarkers (mode knob): a thin range <line> (min→max) with q1 / median / q3 TICK markers (a
//     lighter, RangeBars-like read but WITH the quartile ticks RangeBars lacks). EVERYTHING shared
//     except the per-group glyph.
//
// All layout comes from planDistribution (src/lib/distribution.ts) — the pure brain shared with the
// check suite. Geometry is a pure function of DATA, never `t`. Groups are DISCONNECTED rows → a
// per-group overlapping stagger TOP→DOWN (the BarChart/ScatterPlot/Candlestick disconnected-pop
// pattern, NOT the continuous-edge of a connected silhouette): the whisker draws on, then the IQR box
// grows from the MEDIAN outward (the BarChart grow mechanism anchored at medX), then the median line +
// mean diamond + outliers pop. The box-grow scaleX is OMITTED at settle (never scaleX(1) — the LC3/C12
// rule) so the gate's parseMatrix reads it. A single distribution is one accent; comparing groups uses
// the accent roles (groupAccents / accentForIndex). Props default to t=1 (settled/static) so Path B
// can import it without animation.
//
// PL-0.8 ROW-AWARE viewBox (the §2.10 decision + §3 binding): width is FIXED (1000); height matches
// the row's measured aspect so the SVG fills the full row WIDTH (uniform scale ⇒ outlier dots stay
// full-size, clear of the mobile floor even in a wide-short row, with no overflow) — the proven
// ScatterPlot/Candlestick solution, NOT the fixed aspect-[25/16] box. The RENDER group cap is DYNAMIC
// on the rendered viewH (§3): a short row downsamples to fewer rows, each ≥ MIN_ROW_PITCH apart.
// Spec: planning/primitive-library/handoffs/PL-3.5-distribution.md §2.5 / §2.7 / §2.10 / §3.

import { useId, useLayoutEffect, useRef, useState } from "react";
import type { Accent } from "@/posts/renderTypes";
import { colors } from "@/tokens/design";
import {
  planDistribution,
  groupReveal,
  formatTick,
  clampViewH,
  type DistributionGroupInput,
  type DistMode,
  type DistMeanKnob,
  type PlannedGroup,
  VIEW_W,
  VIEW_H,
  PLOT_X0,
  PLOT_X1,
  ROW_LABEL_X,
  WHISKER_STROKE,
  MEDIAN_STROKE,
  CAP_LEN_FRAC,
  OUTLIER_R,
  OUTLIER_STROKE,
  GRID_STROKE,
  AXIS_LABEL_PX,
  MED_LABEL_PX,
} from "@/lib/distribution";

const accentHex = (a: string): string => colors.accent[a as Accent] ?? colors.accent.cyan;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const GRID_COLOR = "rgba(184,178,167,0.30)";

type Props = {
  groups: DistributionGroupInput[];
  mode?: DistMode;
  axisMin?: number;
  axisMax?: number;
  showMean?: DistMeanKnob;
  accent?: Accent;
  groupAccents?: Accent[];
  unit?: string;
  caption?: string;
  t?: number;
};

export function Distribution({
  groups,
  mode = "box",
  axisMin,
  axisMax,
  showMean = "off",
  accent,
  groupAccents,
  unit,
  caption,
  t = 1,
}: Props) {
  const uid = useId();

  // PL-0.8 — row-aware viewBox: measure the row's px aspect so the viewBox aspect MATCHES it and the
  // SVG fills the FULL row width (uniform scale ⇒ full-width outlier dots that clear the mobile floor
  // even in a wide-short row, with no overflow). The ScatterPlot/Candlestick pattern: a SYNCHRONOUS
  // measure inside useLayoutEffect (applied before paint, so Remotion captures the settled frame),
  // plus a ResizeObserver for later resizes. Pre-measure default = 640 ⇒ static/SSR import byte-identical.
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

  const plan = planDistribution({ groups, mode, axisMin, axisMax, showMean, accent, groupAccents, unit, viewH });
  const { plotY0, plotY1, viewH: vbH } = plan;

  const frameOn = clamp01((t - 0.26) / 0.08); // axes/gridlines/row labels appear (chrome)

  // viewBox px position of a value along the x-axis (for gridlines + ticks).
  const span = plan.axisMax - plan.axisMin || 1;
  const xPos = (v: number) => PLOT_X0 + ((v - plan.axisMin) / span) * (PLOT_X1 - PLOT_X0);

  if (plan.empty) {
    return (
      <div ref={boxRef} className="relative h-full w-full">
        <svg
          viewBox={`0 0 ${VIEW_W} ${vbH}`}
          className="block h-full w-full"
          role="img"
          aria-label={caption ?? "distribution of a metric by group"}
          data-dist
          data-dist-mode={plan.mode}
          data-dist-empty
          data-dist-viewh={vbH}
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
        aria-label={caption ?? "distribution of a metric by group"}
        data-dist
        data-dist-mode={plan.mode}
        data-dist-viewh={vbH}
      >
        {/* Chrome — value gridlines + ticks (bottom band), group-row labels (left gutter). Opacity-
            only reveal; geometry reserved from frame 1 (the Bar/Scatter frame-in beat). */}
        <g opacity={frameOn} data-dist-axis>
          {plan.ticks.map((tick, i) => {
            const x = xPos(tick);
            // Anchor edge labels INWARD so the first/last never overflow the viewBox (the rightmost
            // tick at x≈968 center-anchored would clip the right edge; the candlestick gutter lesson
            // applied to the bottom band). x within ~6% of either band end → start/end, else middle.
            const frac = (x - PLOT_X0) / (PLOT_X1 - PLOT_X0);
            const anchor: "start" | "middle" | "end" = frac <= 0.04 ? "start" : frac >= 0.96 ? "end" : "middle";
            return (
              <g key={`${uid}-xt-${i}`} data-dist-tick={i}>
                <line x1={x} x2={x} y1={plotY0} y2={plotY1} stroke={GRID_COLOR} strokeWidth={GRID_STROKE} opacity={i === 0 ? 0.6 : 0.4} />
                <text
                  x={x}
                  y={plotY1 + 30}
                  textAnchor={anchor}
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

        {/* Group-row labels — left gutter, right-anchored, vertically centered on each row. */}
        <g opacity={frameOn} data-dist-rlabels>
          {plan.groups.map((g) =>
            g.showLabel ? (
              <text
                key={`${uid}-rl-${g.index}`}
                x={ROW_LABEL_X}
                y={g.cy + 8}
                textAnchor="end"
                fill={colors.text.primary}
                fontFamily="'Space Grotesk', sans-serif"
                fontSize={AXIS_LABEL_PX}
                fontWeight={500}
                data-dist-rlabel={g.index}
              >
                {g.label}
              </text>
            ) : null,
          )}
        </g>

        {/* Groups — whisker draws → box grows from median → median/mean/outliers pop; overlap-stagger
            top→down; box-grow transform OMITTED at settle. */}
        {plan.groups.map((g) => (
          <Group key={`${uid}-g${g.index}`} g={g} mode={plan.mode} t={t} />
        ))}
      </svg>
      {/* the per-group median value label (optional) lives in the same SVG below — kept inline for fit */}
    </div>
  );
}

// ── One group: whisker draw + box grow (box mode), or range line + q1/med/q3 ticks (rangeMarkers) ──
function Group({ g, mode, t }: { g: PlannedGroup; mode: DistMode; t: number }) {
  const { whisker, box, pop } = groupReveal(t, g.groupStart); // each clamped ∈ [0,1]
  const boxSettled = box >= 1;
  const fill = accentHex(g.accentKey);
  const opacity = clamp01((t - g.groupStart) / 0.06);

  const cy = g.cy;
  const halfH = g.halfH;
  const capLen = halfH * CAP_LEN_FRAC * 2; // cap length = CAP_LEN_FRAC · boxH, centered on the row

  // §3 note — the BarChart grow mechanism: an explicit CSS style.transform in viewBox user units
  // (default transform-box), scaleX about the MEDIAN x, OMITTED at settle (never scaleX(1)) so
  // getComputedStyle reads a matrix the gate's parseMatrix consumes. The box "opens" from the center.
  const anchor = g.medX;
  const boxTransform = boxSettled ? undefined : `translate(${anchor}px, 0px) scale(${box}, 1) translate(${-anchor}px, 0px)`;

  // The whisker line spans loX→hiX. It draws on via pathLength=1 + strokeDashoffset = 1−whisker.
  const whiskLen = g.hiX - g.loX;
  const boxW = g.q3X - g.q1X;

  return (
    <g data-dist-g={g.index} data-dist-accent={g.accentKey} data-dist-tinyn={g.tinyN ? "1" : "0"}>
      {/* whisker / range line (loX→hiX) through the row center — draws on first. In rangeMarkers mode
          this IS the range bar (carries data-dist-range too). */}
      <line
        x1={g.loX}
        x2={g.hiX}
        y1={cy}
        y2={cy}
        stroke={fill}
        strokeWidth={WHISKER_STROKE}
        strokeLinecap="butt"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset={1 - whisker}
        opacity={opacity}
        data-dist-whisker
        {...(mode === "rangeMarkers" ? { "data-dist-range": "" } : {})}
        data-dist-whisker-reveal={whisker.toFixed(3)}
        data-dist-whisker-len={whiskLen.toFixed(2)}
      />

      {mode === "rangeMarkers" ? (
        // rangeMarkers: q1 / median / q3 vertical TICK markers (the lighter read). The ticks pop in.
        <g style={{ opacity: boxSettled ? opacity : opacity * box }}>
          {!g.tinyN && (
            <>
              <line x1={g.q1X} x2={g.q1X} y1={cy - capLen / 2} y2={cy + capLen / 2} stroke={fill} strokeWidth={WHISKER_STROKE} data-dist-tick-q1 />
              <line x1={g.q3X} x2={g.q3X} y1={cy - capLen / 2} y2={cy + capLen / 2} stroke={fill} strokeWidth={WHISKER_STROKE} data-dist-tick-q3 />
            </>
          )}
          <line x1={g.medX} x2={g.medX} y1={cy - halfH} y2={cy + halfH} stroke={fill} strokeWidth={MEDIAN_STROKE} data-dist-tick-med data-dist-median />
        </g>
      ) : (
        <>
          {/* whisker end-caps at lo / hi (centered on the row) — fade with the whisker. */}
          <g opacity={whisker * opacity}>
            <line x1={g.loX} x2={g.loX} y1={cy - capLen / 2} y2={cy + capLen / 2} stroke={fill} strokeWidth={WHISKER_STROKE} data-dist-cap="lo" />
            <line x1={g.hiX} x2={g.hiX} y1={cy - capLen / 2} y2={cy + capLen / 2} stroke={fill} strokeWidth={WHISKER_STROKE} data-dist-cap="hi" />
          </g>

          {/* IQR box (q1→q3) — grows from the median; transform OMITTED at settle. tiny-n has NO box. */}
          {!g.tinyN && (
            <g style={{ transform: boxTransform, opacity }} data-dist-grow>
              <rect
                x={g.q1X}
                y={cy - halfH}
                width={Math.max(0, boxW)}
                height={2 * halfH}
                rx={4}
                fill={fill}
                fillOpacity={0.28}
                stroke={fill}
                strokeWidth={WHISKER_STROKE}
                data-dist-box
                data-dist-ziqr={g.zeroIqrFloored ? "1" : "0"}
              />
            </g>
          )}

          {/* median line (THICK — the dominant read), inside the box — pops in last. */}
          <line
            x1={g.medX}
            x2={g.medX}
            y1={cy - halfH}
            y2={cy + halfH}
            stroke={fill}
            strokeWidth={MEDIAN_STROKE}
            strokeLinecap="butt"
            opacity={boxSettled ? opacity : opacity * pop}
            data-dist-median
          />

          {/* mean diamond (optional, showMean:"on") — a DISTINCT glyph (not a line), pops with median. */}
          {g.meanX != null && (
            <path
              d={diamond(g.meanX, cy, halfH * 0.55)}
              fill={fill}
              stroke={colors.bg.deepInk}
              strokeWidth={OUTLIER_STROKE}
              opacity={boxSettled ? opacity : opacity * pop}
              data-dist-mean
            />
          )}

          {/* outlier dots — share the group accent; pop with the median. */}
          {g.outlierXs.map((ox, oi) => (
            <circle
              key={`o${oi}`}
              cx={ox}
              cy={cy}
              r={OUTLIER_R}
              fill={fill}
              stroke={colors.bg.deepInk}
              strokeWidth={OUTLIER_STROKE}
              opacity={boxSettled ? opacity : opacity * pop}
              data-dist-outlier={oi}
            />
          ))}
        </>
      )}

      {/* optional median value label — above-right of the median tick, within the row slot. */}
      {g.showMed && (
        <text
          x={g.medX + 8}
          y={cy - halfH - 6}
          textAnchor="start"
          fill={colors.text.secondary}
          fontFamily="'JetBrains Mono', monospace"
          fontSize={MED_LABEL_PX}
          opacity={boxSettled ? opacity : opacity * pop}
          data-dist-mlabel={g.index}
        >
          {g.medText}
        </text>
      )}
    </g>
  );
}

/** A diamond ◆ centered at (cx,cy) with half-extent r — the mean glyph (distinct from the median line). */
function diamond(cx: number, cy: number, r: number): string {
  return `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`;
}
