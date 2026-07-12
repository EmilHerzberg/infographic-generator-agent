// Path B generation service — the TSX agent (tools/agent.mjs) wrapped as a CALLABLE that
// mirrors generatePost() (Path A, generate.mjs): same inputs, same result shape, so the two
// engines are directly comparable in the A/B testbench (tools/benchmark.mjs).
//
// Path B = "power mode": the model WRITES a real React/Remotion component and self-corrects it
// through the QA gate (write_post → typecheck → inspect_layout → finish). It executes AI-authored
// code, so on the server it must render under the gVisor sandbox (Epic 06/08). It needs a reachable
// dev server (`base`) for the layout inspector.
//
// The two big contract strings and the tool set live HERE and are imported by agent.mjs so the CLI
// and the service stay byte-identical (one source of truth).
import { tool, generateText, stepCountIs } from "ai";
import { z } from "zod";
import { assembleBriefing } from "./context.mjs";
import { resolveModel } from "./model.mjs";
import { repoRead, repoList, writePost, typecheckPost } from "./agent-tools.mjs";
import { runQA, findingsForAgent } from "./qa.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const tokensOf = (u) => (u?.inputTokens ?? 0) + (u?.outputTokens ?? 0);

// PL-5.3 — anti-regression scoring. A component's structural quality = pass beats fail; among
// fails, fewer error-severity findings is better. Shared by the loop's best-of memory + the final
// restore so both rank states by the SAME metric (structural QA, no judge/vision — consistent at
// every step). Path B's qa_regressed failures were the loop shipping the LAST write, not the best.
const errCount = (findings) => findings.filter((f) => f.severity === "error").length;
const scoreOf = (pass, findings) => (pass ? Number.POSITIVE_INFINITY : -errCount(findings));

// PL-5.3 #5 — the FULL visual library, shared by both contracts. The prior contract named only ~8
// primitives, so Path B didn't know the other ~12 existed and hand-rolled those shapes from scratch
// (a big driver of its 17× token cost vs Path A). Composing layout-safe primitives — not coding from a
// blank slate — is why Path A converges in ~2 iterations. The #4 scaffold pointer (read an existing
// passing post) is folded into the last line.
const VISUAL_LIBRARY = `The VISUAL LIBRARY — CLASSIFY the content shape first, then pick ONE main visual. All under @/components/primitives/; props are in the PROP QUICK-REFERENCE below — compose directly from it, do NOT read_file each primitive's source (only read_file one if you need an internal detail the reference doesn't cover):
  CHARTS (data on axes): BarChart (categorical magnitudes) · LineChart (a trend over time) · AreaChart (magnitude / stacked over an ordered x) · ScatterPlot (the relationship between two numeric variables) · HistogramChart (the binned distribution of ONE metric) · Donut (part-of-one-whole, radial) · Candlestick (open/high/low/close RANGE over an ordered time axis).
  STRUCTURE / COMPARISON: Divergence (the GAP between two paired values — predicted-vs-actual, before→after, rank inversions) · Funnel (a population dropping off through ordered STAGES) · Pipeline (a COMPOUNDING per-step process → cumulative payoff) · TierStack (items ranked into a few ordered buckets) · Taxonomy (N categories each with named CHILDREN — a hierarchy tree) · Distribution (box-plot — the quantile SPREAD + median across 2–5 groups) · DecompBar (part-to-whole of ONE bar) · RangeBars (intervals / timelines, two lanes on a year axis) · ComparisonColumns (two qualitative A-vs-B lists) · ComparisonMatrix (a 2×2 quadrant trade-off).
  HERO / TEXT: StatHero (one hero number or ratio, optional proportion ring) · MetricCard (a supporting stat) · ClaimList (a claim-vs-reality ledger) · TextBox (role-sized text).
  CHART vs NOT — pick by CONTENT TYPE (charts are neither the default nor to be avoided): USE a chart when the insight is QUANTITATIVE — a trend over TIME, a COMPARISON of magnitudes, a DISTRIBUTION/spread, a RELATIONSHIP between two variables, or a GAP between paired values — because the data SHAPE carries the point. This holds for QUALITATIVE/illustrative trends too: "trust recovers vs collapses over time" IS a 2-series LineChart (supply illustrative values) — do NOT flatten an inherently-quantitative idea into a text/box layout. CONVERSELY, do NOT force a chart onto non-quantitative content: one hero number/ratio → StatHero/MetricCard; a process/sequence → Pipeline/Funnel; qualitative claims or A-vs-B → ClaimList/ComparisonColumns/ComparisonMatrix; a ranking/hierarchy → TierStack/Taxonomy. Match the visual to the content — across typical briefs that lands a chart on roughly the QUANTITATIVE half, not all and not none.
  PREFER a primitive over hand-rolled SVG/markup — they are layout-safe + mobile-floor-correct by construction, and composing them (not coding from scratch) is what makes a post converge quickly. For a concrete starting pattern, read_file an existing passing post under src/posts/generated/ and adapt its structure.`;

// PROP QUICK-REFERENCE — the exact prop names/types per primitive, so the agent composes WITHOUT
// read_file-ing each source (the per-primitive 9KB read round-trips were a big driver of Path B's
// token cost). ONE line each, KEY props only (omit rarely-used knobs). Verified against the
// component `type Props` blocks + exported input types. accent values are ALWAYS one of
// cyan|amber|violet|mint|burnt (stated once here — never repeated per primitive). `t?` (0..1) is the
// animation progress on the animated primitives; default 1 = settled/final frame. Interpolated into
// BOTH contracts right after ${VISUAL_LIBRARY} (single source of truth).
const PRIMITIVE_PROPS = `PROP QUICK-REFERENCE (compose from this; accent ∈ cyan|amber|violet|mint|burnt everywhere; t? = 0..1 progress, default 1 = final frame):
  PostFrame({ eyebrow?, headline (req), visualization:ReactNode (req), summary?:ReactNode, signal?, signalReveal?:0..1 }) — the frame; renders the signature for you (never add your own).
  Panel({ label?, children, overlay?:ReactNode }) — labeled container; spreads div attrs.
  MetricCard({ label (req), value:string (req), delta?, accent?, t?, index?:0..3, countUp? }) — value is a STRING.
  StatHero({ big:string (req), sub?, note?, proportion?:0..1, accent?, t?, pop?, countUp? }) — hero number; proportion draws a sweep ring.
  TextBox({ role:"headline"|"subtitle"|"body"|"label"|"annotation"|"metricValue"|"finalTakeaway" (req), children, maxLines?, fontSize? }).
  ClaimList({ entries:[{ id, date, source, claim, reality, realityNote? }] (req), entriesReveal?:0..1, revealMode?:"stagger"|"spotlight", t? }).
  BarChart({ categories:[{ label, value?, values?:number[], valueText?, accent? }] (req), mode?:"simple"|"grouped"|"stacked", orientation?:"vertical"|"horizontal", sort?:"none"|"desc"|"asc", seriesLabels?:string[], seriesAccents?, unit?, axisMin?, axisMax?, valueLabels?:"auto"|"off", caption?, t? }).
  LineChart({ series:[{ label, values:number[], color (RAW css color/hex, NOT an accent key), endValueLabel? }] (req), xLabels?:string[], yMin?, yMax?, yTicks?:number[], yFormat?:(v)=>string, variant?:"line"|"area"|"stepped", markers?:"on"|"off", annotations?:[{ seriesIndex?, x:number|string, label }], reveal?:0..1, caption? }) — give it FULL width.
  AreaChart({ series:[{ label?, values?:number[], accent?, endValueLabel? }] (req), xLabels?:string[], mode?:"simple"|"stacked", unit?, axisMin?, axisMax?, valueLabels?:"auto"|"off", caption?, t? }).
  ScatterPlot({ points:[{ x:number, y:number, label?, accent? }] (req), xLabel?, yLabel?, xMin?, xMax?, yMin?, yMax?, xUnit?, yUnit?, trendLine?:"off"|"fit", quadrants?:"off"|"on", xDivider?, yDivider?, quadrantLabels?:string[], pointLabels?:"auto"|"off", caption?, t? }).
  HistogramChart({ values?:number[] OR bins?:[{ x0, x1, count }], binCount?, xLabel?, yLabel?, xUnit?, markers?:"off"|"median"|"mean"|"medianMean"|"p95", axisMin?, axisMax?, valueLabels?:"auto"|"off", accent?, caption?, t? }).
  Donut({ segments:[{ label?, value?, accent? }] (req), centerLabel?, centerValue?, centerTotal?:"on"|"off", valueLabels?:"auto"|"off", unit?, caption?, t? }).
  Candlestick({ candles:[{ label?, open, high, low, close }] (req), mode?:"candles"|"ohlc", axisMin?, axisMax?, upAccent?, downAccent?, unit?, caption?, t? }).
  Divergence({ items:[{ label, start:number, end:number, startText?, endText? }] (req), mode?:"dumbbell"|"slope", startAccent?, endAccent?, startLabel?, endLabel?, axisMin?, axisMax?, caption?, t? }).
  Funnel({ stages:[{ label, value:number, valueText?, accent? }] (req), mode?:"funnel"|"bars", unit?, dropLabels?:"auto"|"off", accent?, caption?, t? }).
  Pipeline({ nodes:[{ step:number, cumulativeLabel:string }] (req), perStepLabel (req), endLabel (req), endAccent?, nodesReveal?:0..1, signalProgress?:0..1, endpointReveal?:0..1, caption? }).
  TierStack({ tiers:[{ label, accent?, items:[{ label, note? }] }] (req), mode?:"tiers"|"ranked", showValue?, t? }).
  Taxonomy({ categories:[{ label?, accent?, children?:[{ label?, value? }] }] (req), rootLabel?, mode?:"curve"|"elbow", showValues?:"on"|"off", unit?, caption?, t? }).
  Distribution({ groups:[{ label?, values?:number[] OR min?,q1?,median?,q3?,max?,mean?,outliers?:number[] }] (req), mode?:"box"|"rangeMarkers", showMean?:"on"|"off", accent?, groupAccents?, axisMin?, axisMax?, unit?, caption?, t? }).
  DecompBar({ segments:[{ width:0..1 (sum=1), color (RAW css color), label?, labelInside?, labelColor?, labelSize?, labelWeight? }] (req), height:number (req), radius?, t?, containLabels? }).
  RangeBars({ topGroupLabel (req), bottomGroupLabel (req), topEntries:[{ id, label, start:number, end:number, openEnd? }] (req), bottomEntries:[same] (req), topAccent (req), bottomAccent (req), minYear:number (req), maxYear:number (req), marketLine?:{ year, label }, *Reveal?:0..1, caption? }).
  ComparisonColumns({ left:{ title, tone?, items:string[] } (req), right:{ same } (req), revealMode?:"paired"|"sequential"|"sequentialCentered", t? }).
  ComparisonMatrix({ rowHeaders:[string,string] (req), rowAccents:[accent,accent] (req), colHeaders:[string,string] (req), tl/tr/bl/br:{ value:string, delta?, accent } (req), highlightCell?:"tl"|"tr"|"bl"|"br", focusOn?:same|null, *Reveal?:0..1 }).`;

export const TSX_CONTRACT = `<<< TSX OUTPUT CONTRACT (Path B) >>>

You build the post by writing a React component, then rendering and inspecting it, fixing until it passes.

Workflow (use the tools — do not just describe):
1. Plan the post per the briefing (content type → visual format → layout/color/safety).
2. write_post: a SELF-CONTAINED default-export React component. Compose ONLY from the existing
   primitives (do not invent new visual systems). Import via the "@/..." alias. Inline the content data.
3. typecheck: fix any errors in your file before proceeding.
4. inspect_layout: read the measured report. It is authoritative for collisions, mobile floors,
   safe margins, and signature presence. Fix every violation and re-inspect.
5. finish: only when both typecheck and inspect_layout pass. The gate re-verifies.

Available building blocks — props are in the PROP QUICK-REFERENCE below; compose directly from it. Only
read_file a primitive's source if you need an internal detail the reference doesn't cover. PostFrame
already renders the mandatory creator signature — do NOT add your own.
${VISUAL_LIBRARY}
${PRIMITIVE_PROPS}
- Design tokens: @/tokens/design (colors, text scale, formats). Never hardcode hex — use tokens/Tailwind classes.

Rules: pick the visual by content type (line charts are not a DEFAULT, but DO use a chart when the data shape is the insight — see CHART vs NOT above); no overlapping text; respect the mobile source-pixel floors;
keep everything inside safe margins; the signature is added by PostFrame (don't duplicate it).
FIT: every display number/label must fully fit its container — the inspector REJECTS any text clipped or
overflowing its box (e.g. a big value wider than its panel). Size large values to fit, shorten them, or widen
the container. Keep total text elements ≤ ~18 — crowding causes overflow.
WHITESPACE: the inspector also REJECTS over-crowded layouts (text covering more than ~35% of the canvas).
One main visual idea per frame; ≤4 metrics; generous whitespace; remove secondary elements rather than shrink them.
CHARTS: if you use LineChart, give it the FULL content width (never a narrow column) — its axis labels are sized
for a full-width chart and drop below the mobile floor if squeezed.
PRIMITIVES FOR STANDARD VISUALS, BESPOKE FOR NOVEL ONES: if a VISUAL LIBRARY primitive expresses the
content well (any standard chart/plot/comparison — bar, line, scatter, divergence, tiers, columns, …),
USE IT — don't hand-roll a standard chart. But when the idea genuinely needs a visual NO primitive can
express (a conceptual diagram, an annotated metaphor, a custom illustration), BUILD IT bespoke — that
creative reach is the POINT of this engine; do NOT dumb a rich idea down into a generic primitive just to
play safe. EITHER WAY the legibility gate is NON-NEGOTIABLE: the inspector REJECTS any text a stroke/line
is drawn through (textOccluded), any clipping, any collision, any sub-floor label. If a bespoke visual
flags, ITERATE it clean — move labels OFF the lines, add gutters, reposition — do NOT ship overlaps, and
do NOT abandon a strong bespoke idea for a generic primitive just to dodge the gate. A CLEAN ambitious
visual beats a safe generic one; a BROKEN one loses to both.`;

export const MOTION_CONTRACT = `<<< MOTION (VIDEO) OUTPUT CONTRACT (Path B) >>>

You are building an ANIMATED post (a vertical video), authored as ONE React component that animates from a single progress prop t (0..1).

Workflow (use the tools): write_post → typecheck → inspect_layout → fix → finish.
inspect_layout renders your component at its FINAL frame (t = 1) and measures it; the final frame must be
collision-free, inside margins, above the mobile floors, with the signature present.

Component contract:
- export default function Post({ t = 1 }: { t?: number }) { ... }
- Do NOT import from "remotion" and do NOT use useCurrentFrame — animation is purely a function of t.
- import { appear, rise, revealStyle } from "@/lib/reveal";
    appear(t, start, dur=0.14) -> 0..1 opacity · rise(t, start) -> px offset · revealStyle(t, start) -> { opacity, transform }
- Reserve layout for ALL t: every element is always rendered; animate ONLY opacity/transform via t.
  Never conditionally mount/unmount based on t (it breaks layout stability).
- At t = 1 everything is fully settled = the final frame (what inspect_layout checks). Build the final layout first, then add t-driven reveals.
- Compose from the existing primitives inside PostFrame (PostFrame renders the mandatory signature — don't add your own).

5-beat reveal — stagger via t start values:
  Beat 1 Hook (headline)                      ~ t 0.00
  Beat 2 Orientation (eyebrow / context / panel) ~ t 0.15
  Beat 3 Mechanism (the core number / visual) ~ t 0.35
  Beat 4 Insight (metric strip / payoff)      ~ t 0.60
  Beat 5 Memory anchor (takeaway)             ~ t 0.80
One main motion event; end cleaner than the middle; final frame thumbnail-ready.

Building blocks — props are in the PROP QUICK-REFERENCE below; compose directly from it (only read_file a
primitive's source if you need an internal detail the reference doesn't cover). PostFrame renders the
mandatory signature — don't add your own.
${VISUAL_LIBRARY}
${PRIMITIVE_PROPS}
Tokens in @/tokens/design; never hardcode hex. Pick the visual by content type (line charts are not a default, but use a chart when the data shape is the insight).
FIT: every display number/label must fully fit its container — the inspector REJECTS any text clipped or
overflowing its box (a big value wider than its panel is the most common failure). Size large values to fit,
shorten them, or widen the container. Keep total text elements ≤ ~18 — crowding causes overflow.
WHITESPACE: the inspector also REJECTS over-crowded layouts (text covering more than ~35% of the canvas).
One main visual idea per frame; ≤4 metrics; generous whitespace; remove secondary elements rather than shrink them.
CHARTS: if you use LineChart, give it the FULL content width (never a narrow column) — its axis labels are sized
for a full-width chart and drop below the mobile floor if squeezed.
PRIMITIVES FOR STANDARD VISUALS, BESPOKE FOR NOVEL ONES: if a VISUAL LIBRARY primitive expresses the
content well (any standard chart/plot/comparison — bar, line, scatter, divergence, tiers, columns, …),
USE IT — don't hand-roll a standard chart. But when the idea genuinely needs a visual NO primitive can
express (a conceptual diagram, an annotated metaphor, a custom illustration), BUILD IT bespoke — that
creative reach is the POINT of this engine; do NOT dumb a rich idea down into a generic primitive just to
play safe. EITHER WAY the legibility gate is NON-NEGOTIABLE: the inspector REJECTS any text a stroke/line
is drawn through (textOccluded), any clipping, any collision, any sub-floor label. If a bespoke visual
flags, ITERATE it clean — move labels OFF the lines, add gutters, reposition — do NOT ship overlaps, and
do NOT abandon a strong bespoke idea for a generic primitive just to dodge the gate. A CLEAN ambitious
visual beats a safe generic one; a BROKEN one loses to both.`;

// The Path B tool set: read_file, list_dir, write_post, typecheck, inspect_layout, finish.
// `isDone()` flips true only when finish() re-verifies every gate. Shared by agent.mjs (CLI) and
// generatePostB (service).
export function makePathBTools(id, base, ctx = {}) {
  const { brief, motion = false } = ctx;
  let done = false;
  let lastTsx = null; // PL-5.3: the most recent write_post payload (snapshotted as "best" when it scores well)
  let best = { score: -Infinity, tsx: null }; // best-scoring component seen across inspects (anti-regression memory)
  let prevErrors = null; // structural error count at the previous inspect (drives the regression warning)
  const transcript = []; // PL-6 R3: per-step QA trajectory → out/bench/logs/<id>.jsonl (oscillation/cost diagnosis)
  const tools = {
    read_file: tool({
      description: "Read a repo file (components, tokens, prompts, schemas, context, docs).",
      inputSchema: z.object({ path: z.string().describe("repo-relative path, e.g. src/components/primitives/Panel.tsx") }),
      execute: async ({ path }) => (await repoRead(path)).slice(0, 9000),
    }),
    list_dir: tool({
      description: "List a directory in the repo.",
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => (await repoList(path)).join("\n"),
    }),
    write_post: tool({
      description: "Write the post component to src/posts/generated/<id>.tsx. Self-contained default-export React component.",
      inputSchema: z.object({ tsx: z.string().describe("full .tsx file contents") }),
      execute: async ({ tsx }) => {
        lastTsx = tsx; // PL-5.3: remember it so inspect_layout can snapshot it as "best" if it scores well
        transcript.push({ t: "write", tsxLen: tsx.length }); // PL-6 R3
        return { wrote: await writePost(id, tsx) };
      },
    }),
    typecheck: tool({
      description: "Typecheck the project and return any errors in your generated file.",
      inputSchema: z.object({}),
      execute: async () => typecheckPost(id),
    }),
    inspect_layout: tool({
      description: "Render the post headless and check it: collisions, mobile floors, safe margins, clipping, crowding, hierarchy, typography, signature, and (for video) motion. Returns actionable findings.",
      inputSchema: z.object({}),
      execute: async () => {
        const { findings, pass } = await runQA(id, { base, motion });
        // PL-5.3 anti-regression memory: snapshot the best-scoring component seen, and WARN the
        // agent when its last edit regressed (so it reverts rather than oscillating — the qa_regressed
        // failure mode). The best snapshot is restored before the final grade in generatePostB.
        const score = scoreOf(pass, findings);
        if (lastTsx != null && score > best.score) best = { score, tsx: lastTsx };
        const errs = errCount(findings);
        const regressed =
          prevErrors != null && errs > prevErrors
            ? `your last change REGRESSED: structural errors went ${prevErrors} -> ${errs}. A previous version scored better — revert that change or try a different fix; do not pile more on top.`
            : undefined;
        prevErrors = errs;
        transcript.push({ t: "inspect", pass, errors: errs, regressed: !!regressed, findings: findingsForAgent(findings) }); // PL-6 R3
        return { pass, findings: findingsForAgent(findings), ...(regressed ? { regressed } : {}) };
      },
    }),
    finish: tool({
      description: "Declare the post done. Re-verifies ALL gates (typecheck + structural + motion + data-fidelity + vision). Only call when the post is complete.",
      inputSchema: z.object({}),
      execute: async () => {
        const tc = await typecheckPost(id);
        const qa = await runQA(id, { base, motion, judge: true, vision: true, brief });
        const ok = tc.ok && qa.pass;
        if (ok) done = true;
        transcript.push({ t: "finish", ok, qaPass: qa.pass, typecheckOk: tc.ok }); // PL-6 R3
        return {
          ok,
          typecheckOk: tc.ok,
          qaPass: qa.pass,
          typecheck: tc,
          findings: findingsForAgent(qa.findings),
          message: ok ? "all gates passed — done" : "gates NOT passed — fix the findings above, then call finish again",
        };
      },
    }),
  };
  return { tools, isDone: () => done, getBest: () => best, getTranscript: () => transcript };
}

/**
 * Generate a post via Path B (the TSX agent) using a BYOK key. Mirrors generatePost() (Path A):
 * same inputs, same return shape, so a caller can swap A↔B by path. The model's TSX is written to
 * src/posts/generated/<id>.tsx; the caller renders it via the generic Remotion root.
 *
 * Contract parity with Path A: the key is a parameter used in-memory (resolveModel), never logged
 * or written to disk; progress goes to opts.log (counts/findings only). Requires a reachable dev
 * server at `base` for the layout inspector. EXECUTES AI-AUTHORED CODE → sandbox in production.
 *
 * @returns {Promise<{status:'ok'|'qa_failed'|'provider_error', reason?:string, tsxPath?:string,
 *   qa?:object, iterations:number, tokens:number}>}
 *   `iterations` = agent steps taken (Path B's analogue of Path A's regenerate loops).
 */
export async function generatePostB({ brief, provider, model: modelId, apiKey, root, id, base, opts = {} }) {
  const motion = opts.motion ?? true; // the testbench compares VIDEOS
  const judge = opts.judge ?? true;
  const vision = !!opts.vision;
  const maxSteps = Number(opts.maxSteps ?? opts.steps ?? 32); // PL-5.3 #1: 24→32 — safe now under the best-of memory (extra steps can't ship a worse frame), gives slow-converge cells more room
  const log = typeof opts.log === "function" ? opts.log : () => {}; // progress only — never the key

  let model;
  try {
    ({ model } = resolveModel(provider, { modelOverride: modelId, apiKey }));
  } catch (e) {
    return { status: "provider_error", reason: e.message, iterations: 0, tokens: 0 };
  }

  const briefing = await assembleBriefing(root, { motion });
  const contract = motion ? MOTION_CONTRACT : TSX_CONTRACT;
  const system = `${briefing}\n\n${contract}\n\nUse id "${id}" for the post file.`;
  const { tools, isDone, getBest, getTranscript } = makePathBTools(id, base, { brief, motion, provider });

  log(`Path B: ${provider} building ${motion ? "VIDEO" : "still"} "${id}" — up to ${maxSteps} steps...`);
  let result, tokens = 0;
  try {
    result = await generateText({
      model,
      system,
      prompt: brief,
      tools,
      stopWhen: [stepCountIs(maxSteps), () => isDone()],
    });
  } catch (e) {
    return { status: "provider_error", reason: e.message, iterations: 0, tokens: 0 };
  }
  const steps = result.steps?.length ?? 0;
  tokens = tokensOf(result.totalUsage ?? result.usage);

  // PL-5.3 anti-regression: the loop may have ended on a worse write than its best (oscillation /
  // hitting the step cap mid-fix). Restore the best-scoring component seen before the final grade, so
  // a cell ALWAYS ships its best, never a regression. Decided on the consistent structural metric.
  const best = getBest();
  if (best.tsx != null) {
    const cur = await runQA(id, { base, motion });
    if (best.score > scoreOf(cur.pass, cur.findings)) {
      await writePost(id, best.tsx);
      log(`  Path B: restored best-scoring component (best ${best.score} > last ${scoreOf(cur.pass, cur.findings)}) before the final grade`);
    }
  }

  // Deterministic final grade (same graded reviewer for every provider — judge/vision = the
  // consistent JUDGE_PROVIDER, not the builder model). This is the metric AND the success gate,
  // independent of whether the model called finish (salvage path, like agent.mjs).
  const tc = await typecheckPost(id);
  const qa = await runQA(id, { base, motion, judge, vision, brief });
  const success = tc.ok && qa.pass;
  log(`  Path B done: ${steps} step(s) · ${success ? "PASS" : "did not converge"} · ${tokens} tok`);

  // PL-6 R3: persist the per-step QA trajectory (best-effort) so oscillation/cost is diagnosable
  // post-hoc (the loop history was previously never written to disk). Never break generation on it.
  try {
    const dir = join(root, "out", "bench", "logs");
    await mkdir(dir, { recursive: true });
    const entries = getTranscript();
    const lines = entries.map((e, i) => JSON.stringify({ step: i + 1, ...e }));
    lines.push(JSON.stringify({ t: "summary", id, provider, model: modelId ?? null, steps, tokens, success, reason: success ? null : isDone() ? "qa_regressed" : "did_not_converge" }));
    await writeFile(join(dir, `${id}.jsonl`), lines.join("\n") + "\n");
    log(`  Path B: transcript → out/bench/logs/${id}.jsonl (${entries.length} entries)`);
  } catch { /* logging is best-effort */ }

  return {
    status: success ? "ok" : "qa_failed",
    reason: success ? undefined : isDone() ? "qa_regressed" : "did_not_converge",
    tsxPath: `src/posts/generated/${id}.tsx`,
    qa,
    iterations: steps,
    tokens,
  };
}
