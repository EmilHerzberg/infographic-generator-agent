// Pipeline — the COMPOUNDING-process track: equal-weight 56×56 node chips on a horizontal track, a
// signal dot travelling it, per-step rate → cumulative payoff label, end-to-end endpoint label.
//
// PL-4.3 retrofit: this is now a THIN PAINTER over the pure planPipeline brain (src/lib/pipeline.ts) —
// the node layout along the track, the MAX_NODES=8 even-stride downsample (keep first+last, surface the
// drop), cumulative-label resolution, the signal-dot path, and the defensive clamps all live in the
// planner; this component only paints what the plan describes. The external prop interface is PRESERVED
// (PostRenderer + Path B's ReliabilityPipeline pass nodes/perStepLabel/endLabel/endAccent/nodesReveal/
// signalProgress/endpointReveal unchanged), and the painted output is BYTE-IDENTICAL to the pre-retrofit
// code (gated by tools/qa-pipeline.mjs against a captured baseline). Numbered constraints C1–C6 are
// declared in src/lib/pipeline.ts.
//
// Internal bounding boxes (source pixels, viewBox 1000×280):
//   per-step label:   x  24  y  38   (mono 24px == text.axisLabel, 0.22em)
//   node chips (×N):  56×56 on the track at trackY 130 (chip top y 102), rx 12, evenly spaced
//   node step "NN":   centered in the chip (22px mono)
//   cumulative label: centered under the chip (24px Space Grotesk == text.axisLabel)
//   signal dot:       r9 cyan, on the track centerline; hidden once arrived (signalProgress ≥ 0.998)
//   endpoint:         endLabel 72px right-anchored + END-TO-END eyebrow

import { useId } from "react";
import type { AccentKey } from "@/content/schema";
import { colors, stroke, text } from "@/tokens/design";
import {
  planPipeline,
  nodeOpacity,
  cumulativeOpacity,
  signalX as signalXOf,
} from "@/lib/pipeline";

const accentToColor: Record<AccentKey, string> = {
  cyan: colors.accent.cyan,
  amber: colors.accent.amber,
  violet: colors.accent.violet,
  mint: colors.accent.mint,
  burnt: colors.accent.burnt,
};

export type PipelineNodeSpec = {
  step: number;
  cumulativeLabel: string;
};

type Props = {
  nodes: PipelineNodeSpec[];
  perStepLabel: string;
  endLabel: string;
  endAccent?: AccentKey;
  nodesReveal?: number;
  signalProgress?: number;
  endpointReveal?: number;
  caption?: string;
};

export function Pipeline({
  nodes: rawNodes,
  perStepLabel,
  endLabel,
  endAccent = "cyan",
  nodesReveal = 1,
  signalProgress = 1,
  endpointReveal = 1,
  caption,
}: Props) {
  const uid = useId();

  // The pure brain — node layout, the MAX_NODES cap, the signal-dot path, all decided ONCE, from DATA
  // only (never from a reveal). Geometry pure-from-DATA; the reveals below drive opacity / color only.
  const plan = planPipeline({ nodes: rawNodes, perStepLabel, endLabel, endAccent });
  const { nodes, n: N, nodeWidth, trackY, nodeY } = plan;

  const width = 1000;
  const height = 280;
  const nodeHeight = 56;
  const endLabelFontSize = 72;

  const signalXPos = signalXOf(plan, signalProgress);

  const accentColor = accentToColor[plan.endAccent];
  const signalColor = colors.accent.cyan;

  return (
    <svg
      data-pipeline=""
      viewBox={`0 0 ${width} ${height}`}
      className="block h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={caption ?? "workflow pipeline"}
    >
      <text
        data-pipeline-perstep=""
        x={plan.padLeft}
        y={38}
        fill={colors.text.tertiary}
        fontFamily="'JetBrains Mono', monospace"
        fontSize={text.axisLabel}
        letterSpacing="0.22em"
      >
        {plan.perStepLabel}
      </text>

      {Array.from({ length: N - 1 }).map((_, i) => {
        const x1 = nodes[i].x + nodeWidth;
        const x2 = nodes[i + 1].x;
        const visible = nodeOpacity(nodesReveal, i + 1, N);
        const passed = Math.max(0, Math.min(1, signalProgress * N - (i + 0.5)));
        return (
          <g key={`${uid}-conn-${i}`} opacity={visible} data-pipeline-connector={i}>
            <line
              x1={x1}
              x2={x2}
              y1={trackY}
              y2={trackY}
              stroke="rgba(184,178,167,0.18)"
              strokeWidth={stroke.signal}
              strokeLinecap="round"
            />
            <line
              x1={x1}
              x2={x1 + (x2 - x1) * passed}
              y1={trackY}
              y2={trackY}
              stroke={signalColor}
              strokeWidth={stroke.signal}
              strokeLinecap="round"
              opacity={passed > 0 ? 0.9 : 0}
              style={passed > 0 ? { filter: `drop-shadow(0 0 6px ${signalColor}55)` } : undefined}
            />
          </g>
        );
      })}

      {nodes.map((nd, i) => {
        const x = nd.x;
        const op = nodeOpacity(nodesReveal, i, N);
        const cumOp = cumulativeOpacity(signalProgress, i, N);
        const isPassed = signalProgress >= nd.passedThreshold;
        return (
          <g key={`${uid}-node-${i}`} opacity={op} data-pipeline-node={i}>
            <rect
              data-pipeline-chip={i}
              x={x}
              y={nodeY}
              width={nodeWidth}
              height={nodeHeight}
              rx={12}
              fill="#202735"
              stroke={isPassed ? signalColor : "rgba(184,178,167,0.20)"}
              strokeWidth={1.5}
              style={
                isPassed
                  ? { filter: `drop-shadow(0 0 10px ${signalColor}55)` }
                  : undefined
              }
            />
            <text
              data-pipeline-step={i}
              x={x + nodeWidth / 2}
              y={trackY + 8}
              textAnchor="middle"
              fill={isPassed ? colors.text.primary : colors.text.secondary}
              fontFamily="'JetBrains Mono', monospace"
              fontSize={22}
              fontWeight={500}
              letterSpacing="0.04em"
            >
              {String(nd.step).padStart(2, "0")}
            </text>
            <text
              data-pipeline-cumulative={i}
              x={x + nodeWidth / 2}
              y={nodeY + nodeHeight + 42}
              textAnchor="middle"
              fill={colors.text.secondary}
              fontFamily="'Space Grotesk', sans-serif"
              fontWeight={600}
              fontSize={text.axisLabel}
              opacity={cumOp}
              letterSpacing="-0.01em"
            >
              {nd.cumulativeLabel}
            </text>
          </g>
        );
      })}

      {nodesReveal > 0.95 && signalProgress > 0.002 && signalProgress < 0.998 && (
        <circle
          data-pipeline-signal=""
          cx={signalXPos}
          cy={trackY}
          r={9}
          fill={signalColor}
          style={{ filter: `drop-shadow(0 0 14px ${signalColor})` }}
        />
      )}

      <g opacity={endpointReveal} data-pipeline-endpoint="">
        <text
          data-pipeline-endlabel=""
          x={width - 24}
          y={trackY + 24}
          textAnchor="end"
          fill={accentColor}
          fontFamily="'Space Grotesk', sans-serif"
          fontWeight={700}
          fontSize={endLabelFontSize}
          letterSpacing="-0.02em"
          style={{ filter: `drop-shadow(0 0 16px ${accentColor}55)` }}
        >
          {plan.endLabel}
        </text>
        <text
          x={width - 24}
          y={trackY + 86}
          textAnchor="end"
          fill={colors.text.tertiary}
          fontFamily="'JetBrains Mono', monospace"
          fontSize={text.axisLabel}
          letterSpacing="0.22em"
        >
          END-TO-END
        </text>
      </g>
    </svg>
  );
}
