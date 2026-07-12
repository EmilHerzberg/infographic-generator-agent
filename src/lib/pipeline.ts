// PL-4.3 — Pipeline plan (the `pipeline` viz): the pure brain for the COMPOUNDING-process track.
// Equal-weight nodes (56×56 chips) on a horizontal track, a signal dot travels it, per-step rate →
// cumulative payoff label, end-to-end endpoint label. Node layout along the track, the MAX_NODES=8
// even-stride downsample (keep first+last, surface the drop), cumulative-label resolution, the
// signal-dot path, the per-node passed-threshold, and the defensive clamps (empty / single node, the
// node-gap, label-char caps) — all decided ONCE, from DATA only (never from a reveal / `t`). Pure and
// dependency-free except `estW` (the shared char-class width estimate from stack.ts), so the
// deterministic gate (tools/qa-pipeline.mjs) can unit-test it without a DOM via Node's native type
// stripping (mirrors stack.ts / matrix.ts / ranges.ts / line.ts).
//
// Single source of truth for the pipeline render: PostRenderer → Pipeline, ReliabilityPipeline →
// Pipeline, and the checks all share this one brain. The RETROFIT contract (handoff §1) is
// byte-identity — so the geometry here reproduces the legacy component's painted decisions EXACTLY on
// in-spec input (same node X, same gap, same signal-dot endpoints, same cumulative-trigger arithmetic).
// The defensive clamps (the MAX_NODES downsample that ALREADY existed inline, an ABSURDLY long label, a
// degenerate empty/1-node track) are no-ops on every shipping/in-spec input and only fire on degenerate
// data.
//
// IMPORTANT — the EXTERNAL prop interface of Pipeline is PRESERVED (PostRenderer + Path B's
// ReliabilityPipeline pass nodes/perStepLabel/endLabel/endAccent/nodesReveal/signalProgress/
// endpointReveal unchanged). planPipeline is an internal layout helper the component consumes; it does
// NOT change any prop, class, style or painted pixel.
//
// Numbered constraints (handoff §2C — lifted from the component header into a spec):
//   C1  viewBox 1000×280; layout reserved from Beat 1 (node count constant across reveals; the reveals
//       drive opacity / signal color ONLY, never the layout box).
//   C2  nodes: 56×56 chips, rx 12, on the track at trackY 130 (nodeY 102); equal-weight, evenly spaced.
//   C3  track padding: padLeft 24; padRight = endLabelEstimatedWidth 140 + 40 (betweenTextAndVisual) +
//       80 = 260; nodeAreaWidth 716. nodeGap = (716 − N·56)/(N−1) for N>1, else 0.
//   C4  the signal dot travels firstCenterX → lastCenterX (node centers); connectors span chip edges.
//   C5  per-step label (axisLabel mono, x24 y38); node step "NN" (22px mono); cumulative label
//       (axisLabel Space Grotesk, below the chip); endpoint endLabel (72px) + END-TO-END eyebrow.
//   C6  caps: ≤ MAX_NODES (8) nodes — the fitNodes even-stride downsample ALWAYS keeps first+last and
//       evenly samples the middle (surfaced via nodesDropped); a label over MAX_LABEL_CHARS is flagged
//       (cumulativeOverflowRisk) for the gate; the degenerate empty/1-node track produces finite geom.

import { estW } from "./stack.ts";

export type PipelineAccent = "cyan" | "amber" | "violet" | "mint" | "burnt";
export const ACCENTS: PipelineAccent[] = ["cyan", "amber", "violet", "mint", "burnt"];
const DEFAULT_END_ACCENT: PipelineAccent = "cyan";

// ── Geometry constants (C1–C5). Source pixels (viewBox 1000×280). These reproduce the legacy
//    component's inline literals EXACTLY — changing any one breaks byte-identity. ──────────────────
export const VIEW_W = 1000; // C1
export const VIEW_H = 280; // C1
export const NODE_WIDTH = 56; // C2
export const NODE_HEIGHT = 56; // C2
export const NODE_RX = 12; // C2
export const TRACK_Y = 130; // C2 — track centerline
export const NODE_Y = TRACK_Y - NODE_HEIGHT / 2; // 102 — C2 chip top
const PAD_LEFT = 24; // C3
const END_LABEL_FONT = 72; // C5
const END_LABEL_EST_WIDTH = 140; // C3 — reserved space for the endpoint label
const BETWEEN_TEXT_AND_VISUAL = 40; // C3 — design token spacing.betweenTextAndVisual
const PAD_RIGHT = END_LABEL_EST_WIDTH + BETWEEN_TEXT_AND_VISUAL + 80; // 260 — C3
const NODE_AREA_WIDTH = VIEW_W - PAD_LEFT - PAD_RIGHT; // 716 — C3

export const STEP_FONT = 22; // C5 — node "NN"
export const CUMULATIVE_FONT = 24; // C5 — design token text.axisLabel
export const PER_STEP_FONT = 24; // C5 — design token text.axisLabel
export { END_LABEL_FONT };

// ── Defensive caps (C6) — no-ops on every in-spec input. ─────────────────────────────────────────
// The track fits ~8 nodes before labels collide. A misbehaving model can emit far more (DeepSeek
// dumped all 20 steps → negative node gap → overlap). Downsample to MAX_NODES, ALWAYS keeping the
// first and last (the start state and the end-to-end payoff), evenly sampling the middle. This is the
// renderer-side guarantee — it holds even for models that ignore the ≤8 prompt rule.
export const MAX_NODES = 8; // C6 — lifted verbatim from the component
// A cumulative label is flagged when its estimated advance at 24px exceeds the node pitch (a label
// wider than the column would visually collide with its neighbour). estW is calibrated @26px → scale.
export const MAX_LABEL_CHARS = 24; // C6 — beyond this a cumulative label is absurd → flagged
const CUM_FONT_SCALE = CUMULATIVE_FONT / 26; // estW is @26px; scale its advance to the 24px label size

const isAccent = (a: unknown): a is PipelineAccent =>
  typeof a === "string" && (ACCENTS as string[]).includes(a);

// fitNodes — the even-stride downsample, lifted verbatim from the component (keep first+last, guard
// against rounding collisions). Pure + generic so it stays the single source of truth for the cap.
export function fitNodes<T>(arr: T[], max = MAX_NODES): T[] {
  if (arr.length <= max) return arr;
  const out: T[] = [];
  let lastIdx = -1;
  for (let i = 0; i < max; i++) {
    const idx = Math.round((i * (arr.length - 1)) / (max - 1));
    if (idx !== lastIdx) out.push(arr[idx]); // guard against rounding collisions
    lastIdx = idx;
  }
  return out;
}

export type PipelineNodeInput = {
  step?: number;
  cumulativeLabel?: string;
};

export type PipelinePlanNode = {
  step: number;
  cumulativeLabel: string;
  /** Chip top-left x in viewBox px (the stable LAYOUT, never a fn of a reveal). */
  x: number;
  /** Chip center x (where the signal dot / connector terminate). */
  centerX: number;
  /** Signal-progress threshold at which this node is "passed" (chip lights up). */
  passedThreshold: number;
  /** False when the cumulative label is estimated too wide for the node pitch (flagged, never hidden
   *  — the legacy paints it regardless; the gate uses this to exempt the floor check). */
  cumulativeOverflowRisk: boolean;
};

export type PipelinePlan = {
  nodes: PipelinePlanNode[];
  /** Node count after the cap (== nodes.length). */
  n: number;
  perStepLabel: string;
  endLabel: string;
  endAccent: PipelineAccent;
  /** Track geometry (C3). */
  padLeft: number;
  nodeAreaWidth: number;
  nodeWidth: number;
  nodeGap: number;
  trackY: number;
  nodeY: number;
  /** Signal-dot path endpoints (C4): the first/last node centers. */
  firstCenterX: number;
  lastCenterX: number;
  /** Chip top-left x for node i (exposed so the component + checks agree). */
  nodeX: (i: number) => number;
  dropped: {
    /** Nodes beyond MAX_NODES removed by the even-stride downsample — surfaced, never silent (C6). */
    nodesDropped: number;
    /** Cumulative labels flagged as over-wide (C6) — surfaced for the gate's floor exemption. */
    labelsOverflow: number;
    /** Accents that were missing/invalid and fell back (C6). */
    invalidAccents: number;
  };
};

export type PlanPipelineInput = {
  nodes?: PipelineNodeInput[];
  perStepLabel?: string;
  endLabel?: string;
  endAccent?: unknown;
};

const isNum = (n: unknown): n is number => typeof n === "number" && !Number.isNaN(n) && Number.isFinite(n);

export function planPipeline(input: PlanPipelineInput = {}): PipelinePlan {
  const counters = { nodesDropped: 0, labelsOverflow: 0, invalidAccents: 0 };

  // ── Node cap (C6) — the even-stride downsample. Surfaces the drop (never silent). ──
  const rawNodes = Array.isArray(input.nodes) ? input.nodes : [];
  const kept = fitNodes(rawNodes);
  counters.nodesDropped += Math.max(0, rawNodes.length - kept.length);
  const N = kept.length;

  // ── Accent resolution (C6) — invalid/missing → a valid fallback, surfaced. ──
  let endAccent: PipelineAccent = DEFAULT_END_ACCENT;
  if (isAccent(input.endAccent)) endAccent = input.endAccent;
  else if (input.endAccent !== undefined) counters.invalidAccents += 1;

  // ── Track geometry (C3) — verbatim from the legacy inline math. nodeGap is 0 for N≤1 (no
  //    divide-by-zero); for N>1 the gap distributes the slack evenly. ──
  const nodeGap = N > 1 ? (NODE_AREA_WIDTH - N * NODE_WIDTH) / (N - 1) : 0;
  const nodeX = (i: number) => PAD_LEFT + i * (NODE_WIDTH + nodeGap);
  const firstCenterX = N > 0 ? nodeX(0) + NODE_WIDTH / 2 : PAD_LEFT + NODE_WIDTH / 2;
  const lastCenterX = N > 0 ? nodeX(N - 1) + NODE_WIDTH / 2 : firstCenterX;

  // ── Per-node resolution (C2/C4/C5/C6). step + cumulative label pass through; geometry from index. ──
  const nodes: PipelinePlanNode[] = kept.map((node, i) => {
    const step = isNum(node.step) ? node.step : i + 1;
    const cumulativeLabel = typeof node.cumulativeLabel === "string" ? node.cumulativeLabel : "";
    const x = nodeX(i);
    const centerX = x + NODE_WIDTH / 2;
    // passedThreshold: reproduces the legacy `(i + 1) / N - 0.02` chip-light trigger.
    const passedThreshold = N > 0 ? (i + 1) / N - 0.02 : 0;
    // Overflow flag (C6): a cumulative label estimated wider than the node pitch at 24px. The node
    // pitch is the chip + the gap; clamp to a positive width so a tight track still has a sane bound.
    const pitch = Math.max(NODE_WIDTH, NODE_WIDTH + nodeGap);
    const cumulativeOverflowRisk =
      cumulativeLabel.length > 0 &&
      ([...cumulativeLabel].length > MAX_LABEL_CHARS || estW(cumulativeLabel) * CUM_FONT_SCALE > pitch);
    if (cumulativeOverflowRisk) counters.labelsOverflow += 1;
    return { step, cumulativeLabel, x, centerX, passedThreshold, cumulativeOverflowRisk };
  });

  return {
    nodes,
    n: N,
    perStepLabel: typeof input.perStepLabel === "string" ? input.perStepLabel : "",
    endLabel: typeof input.endLabel === "string" ? input.endLabel : "",
    endAccent,
    padLeft: PAD_LEFT,
    nodeAreaWidth: NODE_AREA_WIDTH,
    nodeWidth: NODE_WIDTH,
    nodeGap,
    trackY: TRACK_Y,
    nodeY: NODE_Y,
    firstCenterX,
    lastCenterX,
    nodeX,
    dropped: counters,
  };
}

// ── Animation (pure — never geometry) ──────────────────────────────────────────────────────────
// The reveals drive opacity / the signal-trail extent ONLY (geometry is pure-from-DATA). These
// reproduce the legacy per-node opacity / cumulative-trigger / signal-X arithmetic EXACTLY
// (byte-identical motion).

/** Per-node chip opacity from the nodesReveal prop (the legacy `nodeOpacity`). */
export function nodeOpacity(nodesReveal: number, i: number, n: number): number {
  if (n <= 0) return 0;
  const start = i / n;
  const span = 1 / n;
  return Math.max(0, Math.min(1, (nodesReveal - start) / span));
}

/** Per-node cumulative-label opacity from signalProgress (the legacy `cumulativeOpacity`). */
export function cumulativeOpacity(signalProgress: number, i: number, n: number): number {
  if (n <= 0) return 0;
  const trigger = (i + 1) / n;
  return Math.max(0, Math.min(1, (signalProgress - trigger + 0.04) * (n * 2)));
}

/** Signal-dot x at a given signalProgress (the legacy `signalX`). */
export function signalX(plan: PipelinePlan, signalProgress: number): number {
  return plan.firstCenterX + signalProgress * (plan.lastCenterX - plan.firstCenterX);
}
