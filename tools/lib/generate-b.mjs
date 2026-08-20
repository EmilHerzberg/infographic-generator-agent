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
import { resolveModel, genLoopSignal, isLlmTimeout, GEN_LOOP_TIMEOUT_MS } from "./model.mjs";
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
const PRIMITIVE_PROPS = `PROP QUICK-REFERENCE (compose from this; accent ∈ cyan|amber|violet|mint|burnt everywhere).
ANIMATION — READ THIS: EVERY animated primitive accepts a global progress prop \`t\` (0..1, default 1 = the
settled FINAL frame). ALWAYS pass \`t={t}\` — omitting it FREEZES the visual at its final frame (a dead,
block-only reveal where only the surrounding panels move). Some primitives ALSO expose fine-grained reveal
props (LineChart \`reveal\`; ClaimList \`entriesReveal\`; Pipeline \`nodesReveal\`/\`signalProgress\`/\`endpointReveal\`;
RangeBars \`axisReveal\`/\`topLaneReveal\`/\`bottomLaneReveal\`/\`marketLineReveal\`; ComparisonMatrix
\`headersReveal\`/\`tlReveal\`/\`trReveal\`/\`blReveal\`/\`brReveal\`): any one you OMIT derives from \`t\` via the
standard stagger, and any one you PASS overrides it — so \`t={t}\` alone is always enough, and explicit reveal
props are only for custom timing. Marked (anim) below. (progress props are 0..1, default 1 = final frame):
  PostFrame({ eyebrow?, headline (req), visualization:ReactNode (req), summary?:ReactNode, signal?, signalReveal?:0..1 }) — the frame; renders the signature for you (never add your own).
  Panel({ label?, children, overlay?:ReactNode }) — labeled container; spreads div attrs.
  MetricCard({ label (req), value:string (req), delta?, accent?, t?, index?:0..3, countUp? }) — value is a STRING.
  StatHero({ big:string (req), sub?, note?, proportion?:0..1, accent?, t?, pop?, countUp? }) — hero number; proportion draws a sweep ring.
  TextBox({ role:"headline"|"subtitle"|"body"|"label"|"annotation"|"metricValue"|"finalTakeaway" (req), children, maxLines?, fontSize? }).
  ClaimList({ entries:[{ id, date, source, claim, reality, realityNote? }] (req), entriesReveal?:0..1, revealMode?:"stagger"|"spotlight", t? }).
  BarChart({ categories:[{ label, value?, values?:number[], valueText?, accent? }] (req), mode?:"simple"|"grouped"|"stacked", orientation?:"vertical"|"horizontal", sort?:"none"|"desc"|"asc", seriesLabels?:string[], seriesAccents?, unit?, axisMin?, axisMax?, valueLabels?:"auto"|"off", caption?, t? }).
  LineChart({ series:[{ label, values:number[], color (RAW css color/hex, NOT an accent key), endValueLabel? }] (req), xLabels?:string[], yMin?, yMax?, yTicks?:number[], yFormat?:(v)=>string, variant?:"line"|"area"|"stepped", markers?:"on"|"off", annotations?:[{ seriesIndex?, x:number|string, label }], t?, reveal?:0..1 (anim — t={t} is enough; reveal overrides for custom timing), caption? }) — give it FULL width.
  AreaChart({ series:[{ label?, values?:number[], accent?, endValueLabel? }] (req), xLabels?:string[], mode?:"simple"|"stacked", unit?, axisMin?, axisMax?, valueLabels?:"auto"|"off", caption?, t? }).
  ScatterPlot({ points:[{ x:number, y:number, label?, accent? }] (req), xLabel?, yLabel?, xMin?, xMax?, yMin?, yMax?, xUnit?, yUnit?, trendLine?:"off"|"fit", quadrants?:"off"|"on", xDivider?, yDivider?, quadrantLabels?:string[], pointLabels?:"auto"|"off", caption?, t? }).
  HistogramChart({ values?:number[] OR bins?:[{ x0, x1, count }], binCount?, xLabel?, yLabel?, xUnit?, markers?:"off"|"median"|"mean"|"medianMean"|"p95", axisMin?, axisMax?, valueLabels?:"auto"|"off", accent?, caption?, t? }).
  Donut({ segments:[{ label?, value?, accent? }] (req), centerLabel?, centerValue?, centerTotal?:"on"|"off", valueLabels?:"auto"|"off", unit?, caption?, t? }).
  Candlestick({ candles:[{ label?, open, high, low, close }] (req), mode?:"candles"|"ohlc", axisMin?, axisMax?, upAccent?, downAccent?, unit?, caption?, t? }).
  Divergence({ items:[{ label, start:number, end:number, startText?, endText? }] (req), mode?:"dumbbell"|"slope", startAccent?, endAccent?, startLabel?, endLabel?, axisMin?, axisMax?, caption?, t? }).
  Funnel({ stages:[{ label, value:number, valueText?, accent? }] (req), mode?:"funnel"|"bars", unit?, dropLabels?:"auto"|"off", accent?, caption?, t? }).
  Pipeline({ nodes:[{ step:number, cumulativeLabel:string }] (req), perStepLabel (req), endLabel (req), endAccent?, t?, nodesReveal?, signalProgress?, endpointReveal?:0..1 (anim — t={t} is enough; explicit props override), caption? }).
  TierStack({ tiers:[{ label, accent?, items:[{ label, note? }] }] (req), mode?:"tiers"|"ranked", showValue?, t? }).
  Taxonomy({ categories:[{ label?, accent?, children?:[{ label?, value? }] }] (req), rootLabel?, mode?:"curve"|"elbow", showValues?:"on"|"off", unit?, caption?, t? }).
  Distribution({ groups:[{ label?, values?:number[] OR min?,q1?,median?,q3?,max?,mean?,outliers?:number[] }] (req), mode?:"box"|"rangeMarkers", showMean?:"on"|"off", accent?, groupAccents?, axisMin?, axisMax?, unit?, caption?, t? }).
  DecompBar({ segments:[{ width:0..1 (sum=1), color (RAW css color), label?, labelInside?, labelColor?, labelSize?, labelWeight? }] (req), height:number (req), radius?, t?, containLabels? }).
  RangeBars({ topGroupLabel (req), bottomGroupLabel (req), topEntries:[{ id, label, start:number, end:number, openEnd? }] (req), bottomEntries:[same] (req), topAccent (req), bottomAccent (req), minYear:number (req), maxYear:number (req), marketLine?:{ year, label }, t?, axisReveal?, topLaneReveal?, bottomLaneReveal?, marketLineReveal?:0..1 (anim — t={t} is enough; explicit props override), caption? }).
  ComparisonColumns({ left:{ title, tone?, items:string[] } (req), right:{ same } (req), revealMode?:"paired"|"sequential"|"sequentialCentered", t? }).
  ComparisonMatrix({ rowHeaders:[string,string] (req), rowAccents:[accent,accent] (req), colHeaders:[string,string] (req), tl/tr/bl/br:{ value:string, delta?, accent } (req), highlightCell?:"tl"|"tr"|"bl"|"br", focusOn?:same|null, t?, headersReveal?, tlReveal?, trReveal?, blReveal?, brReveal?:0..1 (anim — t={t} is enough; explicit props override) }).`;

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

Rules: pick the visual by content type (line charts are not a DEFAULT, but DO use a chart when the data shape is the insight — see CHART vs NOT above); no overlapping text; respect the mobile source-pixel floors; vertically CENTER the visualization block within its zone (flex + justify-center on your viz wrapper) — never pin it to the top of the viz zone with dead space below it;
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
USE IT — don't hand-roll a standard chart: the primitive already LABELS EVERY MARK (every bar, wedge, stage), sizes type to the mobile floor, and can't overflow, so re-coding a chart by hand is the #1 source of broken output — bars/segments shipped with missing labels, clipped values, unreadable axes. But when the idea genuinely needs a visual NO primitive can
express (a conceptual diagram, an annotated metaphor, a custom illustration), BUILD IT bespoke — that
creative reach is the POINT of this engine; do NOT dumb a rich idea down into a generic primitive just to
play safe. EITHER WAY the legibility gate is NON-NEGOTIABLE: the inspector REJECTS any text a stroke/line
is drawn through (textOccluded), any clipping, any collision, any sub-floor label, and any categorical mark (bar / pie or donut wedge / funnel stage) left UNLABELLED — a hand-rolled chart MUST label every one of its marks with its category and/or value. If a bespoke visual
flags, ITERATE it clean — move labels OFF the lines, add gutters, reposition — do NOT ship overlaps, and
do NOT abandon a strong bespoke idea for a generic primitive just to dodge the gate. A CLEAN ambitious
visual beats a safe generic one; a BROKEN one loses to both.
HARD TEXT RULE: NEVER put whitespace-nowrap (white-space: nowrap) on multi-word text — a sentence that
cannot wrap WILL clip on x at some width and NO rewording fixes it (a real run burned its whole budget
rewriting the words seven times against the same 96px overflow). Sentences — takeaways, subtitles,
captions — must be allowed to wrap; a long single-line VALUE belongs inside <FitLine> instead.`;

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
- STABLE HEIGHT (anti-shake) — the single most common defect: the viz/mid-section's HEIGHT and any
  chart's AXIS SCALE must be CONSTANT for every t. NEVER derive a container height, a bar-column height,
  an SVG height/viewBox, or an axis min/max from an ANIMATING value. Doing so resizes the mid-section on
  every frame, which shoves the footer up and down — a visible shake. The gate RE-MEASURES at
  mid-animation and REJECTS the post if a settled label moves. Grow bars/areas by TRANSFORM (scaleY about
  a fixed baseline) inside a fixed-height plot; count numbers up as text; fade with opacity — the layout
  boxes never move. The safest route for any standard chart is the BarChart / LineChart / AreaChart /
  Divergence / etc. primitive: its viewBox + layout BOX are fixed (a function of the DATA, never of t) so
  it CANNOT shake. "Anti-shake" is about the primitive's BOX not resizing — it is NOT a reason to withhold
  t (see next). Do NOT hand-roll a chart whose CONTAINER is sized by t.
- ANIMATE THE MAIN VISUAL — every animated primitive takes a progress prop \`t\` that DEFAULTS TO 1 (the
  frozen FINAL frame). You MUST thread the component's t INTO it — <Divergence items={...} t={t} />,
  <BarChart ... t={t} />, <Funnel ... t={t} />, <Pipeline ... t={t} />, etc. — so its internals actually
  move (bars grow, connectors draw edge-style, dots pop, lines extend). OMITTING t freezes the entire
  visual while only the surrounding panels fade in: a dead, block-only reveal that reads as broken. If you
  hand-roll a visual instead of composing a primitive, drive its key marks (bars / connectors / dots /
  lines) from t the SAME way. A main visual that looks IDENTICAL at t≈0.4 and t=1 has failed its one job.
  NOTE: inspect_layout only shows the FINAL (t=1) frame — a correct final frame does NOT prove it animates,
  so getting the motion right is on you, not the gate.
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
shorten them, or widen the container. Use a FIXED fontSize chosen so the value fits (or the FitLine primitive
if you truly need shrink-to-fit) — NEVER hand-roll a per-frame measured scale: no useLayoutEffect /
getBoundingClientRect that derives a scaleX / zoom / transform on a number or label. The video re-measures
every rendered frame, so any measured fit makes the value visibly FLUTTER small↔normal across frames.
Keep total text elements ≤ ~18 — crowding causes overflow.
WHITESPACE: the inspector also REJECTS over-crowded layouts (text covering more than ~35% of the canvas).
One main visual idea per frame; ≤4 metrics; generous whitespace; remove secondary elements rather than shrink them.
CHARTS: if you use LineChart, give it the FULL content width (never a narrow column) — its axis labels are sized
for a full-width chart and drop below the mobile floor if squeezed.
PRIMITIVES FOR STANDARD VISUALS, BESPOKE FOR NOVEL ONES: if a VISUAL LIBRARY primitive expresses the
content well (any standard chart/plot/comparison — bar, line, scatter, divergence, tiers, columns, …),
USE IT — don't hand-roll a standard chart: the primitive already LABELS EVERY MARK (every bar, wedge, stage), sizes type to the mobile floor, and can't overflow, so re-coding a chart by hand is the #1 source of broken output — bars/segments shipped with missing labels, clipped values, unreadable axes. But when the idea genuinely needs a visual NO primitive can
express (a conceptual diagram, an annotated metaphor, a custom illustration), BUILD IT bespoke — that
creative reach is the POINT of this engine; do NOT dumb a rich idea down into a generic primitive just to
play safe. EITHER WAY the legibility gate is NON-NEGOTIABLE: the inspector REJECTS any text a stroke/line
is drawn through (textOccluded), any clipping, any collision, any sub-floor label, and any categorical mark (bar / pie or donut wedge / funnel stage) left UNLABELLED — a hand-rolled chart MUST label every one of its marks with its category and/or value. If a bespoke visual
flags, ITERATE it clean — move labels OFF the lines, add gutters, reposition — do NOT ship overlaps, and
do NOT abandon a strong bespoke idea for a generic primitive just to dodge the gate. A CLEAN ambitious
visual beats a safe generic one; a BROKEN one loses to both.
HARD TEXT RULE: NEVER put whitespace-nowrap (white-space: nowrap) on multi-word text — a sentence that
cannot wrap WILL clip on x at some width and NO rewording fixes it (a real run burned its whole budget
rewriting the words seven times against the same 96px overflow). Sentences — takeaways, subtitles,
captions — must be allowed to wrap; a long single-line VALUE belongs inside <FitLine> instead.`;

// The Path B tool set: read_file, list_dir, write_post, typecheck, inspect_layout, finish.
// `isDone()` flips true only when finish() re-verifies every gate. Shared by agent.mjs (CLI) and
// generatePostB (service).
export function makePathBTools(id, base, ctx = {}) {
  const { brief, motion = false, format, root = process.cwd(), tokRef = { v: 0 } } = ctx;
  let done = false;
  let lastTsx = null; // PL-5.3: the most recent write_post payload (snapshotted as "best" when it scores well)
  let best = { score: -Infinity, tsx: null }; // best-scoring component seen across inspects (anti-regression memory)
  let prevErrors = null; // structural error count at the previous inspect (drives the regression warning)
  const transcript = []; // PL-6 R3: per-step QA trajectory → out/bench/logs/<id>.jsonl (oscillation/cost diagnosis)
  // INCREMENTAL transcript flush: the jsonl is (re)written after EVERY entry, not once at the end —
  // it feeds (a) the gen-entry /work mirror that survives a container kill (timeout forensics) and
  // (b) the live user-facing progress tail in generate-dispatch. Serialized + best-effort: a flush
  // failure never breaks generation, and a flush in flight just gets superseded by the next one.
  const logDir = join(root, "out", "bench", "logs");
  let flushBusy = false;
  let flushDirty = false;
  const flushTranscript = () => {
    if (flushBusy) { flushDirty = true; return; }
    flushBusy = true;
    (async () => {
      do {
        flushDirty = false;
        try {
          await mkdir(logDir, { recursive: true });
          await writeFile(join(logDir, `${id}.jsonl`), transcript.map((e, i) => JSON.stringify({ step: i + 1, ...e })).join("\n") + "\n");
        } catch { /* best-effort */ }
      } while (flushDirty);
      flushBusy = false;
    })();
  };
  // Every entry carries the RUNNING token total (tokRef is updated by generatePostB's onStepFinish) —
  // the live progress feed shows the user what their key is spending while the loop runs.
  const record = (e) => { transcript.push({ ...e, tok: tokRef.v }); flushTranscript(); };
  // STALL-ABORT: inspects since the best score last improved. Calibrated on the 73-success bench corpus:
  // the largest gap between best-score improvements in a run that STILL converged was 5 inspects (p90=3),
  // so aborting after 8 non-improving inspects kills no viable run — it only cuts the tail of a run that
  // is grinding local edits against a blocker local edits cannot fix (the full-32-iteration burn).
  // At half the budget the model gets ONE structural-reset nudge first (the dominant stall cause is
  // anchoring: tuning fonts/margins when the honest fix is dropping content or switching the visual form).
  const STALL_K = Math.max(2, Number(process.env.GEN_STALL_INSPECTS) || 8);
  const NUDGE_AT = Math.ceil(STALL_K / 2);
  let sinceBest = 0; // inspects without a new best
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
        record({ t: "write", tsxLen: tsx.length }); // PL-6 R3
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
        // Invariant hardening (review finding): a throwing runQA must still ADVANCE the stall counter —
        // otherwise a wedged inspect path could disable the stall-abort entirely and the loop would
        // grind to the full step cap. The throw still propagates (the model sees the tool error).
        let qaRes;
        try {
          qaRes = await runQA(id, { base, motion, format });
        } catch (e) {
          sinceBest += 1;
          record({ t: "inspect", pass: false, errors: null, threw: true, sinceBest, findings: String(e?.message || e).slice(0, 200) });
          throw e;
        }
        const { findings, pass } = qaRes;
        // PL-5.3 anti-regression memory: snapshot the best-scoring component seen, and WARN the
        // agent when its last edit regressed (so it reverts rather than oscillating — the qa_regressed
        // failure mode). The best snapshot is restored before the final grade in generatePostB.
        const score = scoreOf(pass, findings);
        const improved = lastTsx != null && score > best.score;
        if (improved) best = { score, tsx: lastTsx };
        sinceBest = improved || pass ? 0 : sinceBest + 1;
        const errs = errCount(findings);
        const regressed =
          prevErrors != null && errs > prevErrors
            ? `your last change REGRESSED: structural errors went ${prevErrors} -> ${errs}. A previous version scored better — revert that change or try a different fix; do not pile more on top.`
            : undefined;
        prevErrors = errs;
        // Strategy-reset nudge at half the stall budget: local tuning has stopped moving the score, so
        // tell the model to change STRATEGY, not parameters — that (not more patience) is what fixes a
        // stalled run. If the score still doesn't improve, the loop aborts at STALL_K (stopWhen).
        const stalled =
          sinceBest >= NUDGE_AT && sinceBest < STALL_K
            ? `NO PROGRESS in your last ${sinceBest} inspects — stop tuning fonts/margins/sizes. Make ONE STRUCTURAL change instead: drop a secondary content block, switch to a simpler primitive from the library, or rebuild the layout from a passing scaffold. If the score does not improve within ${STALL_K - sinceBest} more inspects, the build will be stopped.`
            : undefined;
        // `checks` = the error-severity check CODES only (a fixed vocabulary, never free text) — the
        // live progress UI maps them to friendly labels; nothing model-authored crosses to the user.
        record({ t: "inspect", pass, errors: errs, regressed: !!regressed, stalledNudge: !!stalled, sinceBest, checks: findings.filter((f) => f.severity === "error").map((f) => f.check).slice(0, 8), findings: findingsForAgent(findings) }); // PL-6 R3
        // A green inspect is a state to LOCK IN, not a milestone to keep polishing past: observed runs
        // (gpt-5.5, 32 steps) hit all-green mid-loop, kept editing, regressed into crashes, and burned
        // the rest of the budget. Tell the model explicitly to call finish NOW.
        return {
          pass,
          findings: findingsForAgent(findings),
          ...(pass && !done ? { message: "ALL STRUCTURAL CHECKS PASSED — call finish NOW to lock this state in and run the final gates. Any further edit risks a regression that costs you the remaining budget." } : {}),
          ...(regressed ? { regressed } : {}),
          ...(stalled ? { stalled } : {}),
        };
      },
    }),
    finish: tool({
      description: "Declare the post done. Re-verifies ALL gates (typecheck + structural + motion + data-fidelity + vision). Only call when the post is complete.",
      inputSchema: z.object({}),
      execute: async () => {
        // Every finish attempt MUST leave a transcript entry — a throwing finish (judge/vision call
        // error) previously recorded NOTHING, and a real run burned 20 invisible steps re-calling it.
        let tc, qa;
        try {
          tc = await typecheckPost(id);
          qa = await runQA(id, { base, motion, judge: true, vision: true, brief, format });
        } catch (e) {
          record({ t: "finish", threw: true, reason: String(e?.message || e).slice(0, 200) });
          throw e;
        }
        const ok = tc.ok && qa.pass;
        if (ok) done = true;
        record({
          t: "finish", ok, qaPass: qa.pass, typecheckOk: tc.ok,
          // WHICH gate said no — the failing checks make a finish-churn loop diagnosable post-hoc.
          ...(ok ? {} : { checks: (qa.findings || []).filter((f) => f.severity === "error" || f.severity === "warn").map((f) => f.check).slice(0, 8) }),
        }); // PL-6 R3
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
  return { tools, isDone: () => done, getBest: () => best, getTranscript: () => transcript, isStalled: () => sinceBest >= STALL_K, record, flushTranscript };
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
// Tell the agent its target canvas when it's NOT the default portrait, so it DESIGNS for the aspect
// (fills a tall 9:16 frame / balances a compact 1:1) instead of centering a portrait-shaped block. Empty
// for portrait ⇒ the system prompt is byte-identical to today. The inspector also measures at this format
// (runQA ?format=), so the agent's own QA loop enforces a layout that actually works at the aspect.
export function targetCanvasLine(format) {
  const spec = {
    square: {
      dims: "1080×1080 (1:1 square)",
      guide:
        "a COMPACT, balanced frame — keep the composition centered and tight; do NOT assume a tall portrait canvas or leave large empty vertical bands. The viz zone is SHORT here: the visualization must DOMINATE it — keep the footer to one compact row (≤2 small metric cards), never stack extra text blocks above/below the chart inside the viz zone, and never place metric cards inside the viz zone (they belong in the summary slot). DENSITY: this format is ALLOWED to pack tighter than the others (the crowding gate accepts up to ~55% text coverage here vs ~42% on portrait) — do not over-trim content to chase whitespace; keep the substance, as long as spacing/floors hold.",
    },
    vertical: {
      dims: "1080×1920 (9:16 vertical)",
      guide:
        "a TALL frame — FILL the vertical height, don't pool it as dead space. Make the primary visualization occupy the FULL height of its zone: put `h-full` / `flex-1` on the viz container AND the chart/SVG itself, NOT a fixed width-limited box centered with big empty top/bottom bands. Scale its internals UP to match the extra height — taller bars with more space between them, a taller plot area, larger nodes/rings. Give the bottom metric/summary cards a little more height too. The FOOTER is still only 1080 WIDE: at most 2 metric cards beside the signal text (3+ cards squeeze each value below the mobile type floor — an automatic gate failure); fold extra numbers into the sub/note copy instead. The extra height is the whole point of 9:16 — use it.",
    },
  }[format];
  return spec ? `\n\nTARGET CANVAS: this post renders at ${spec.dims}. Design the layout to FILL and SUIT ${spec.guide}` : "";
}

export async function generatePostB({ brief, provider, model: modelId, apiKey, root, id, base, format, opts = {} }) {
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
  const system = `${briefing}\n\n${contract}${targetCanvasLine(format)}\n\nUse id "${id}" for the post file.`;
  const tokRef = { v: 0 }; // running token total, updated per step — feeds the live progress entries
  const { tools, isDone, getBest, getTranscript, isStalled, record, flushTranscript } = makePathBTools(id, base, { brief, motion, provider, format, root, tokRef });

  // First transcript entry the moment the loop is LIVE (vite up, model called): flips the user-facing
  // phase from "starting the environment" to "planning" long before the first write lands.
  record({ t: "start" });
  log(`Path B: ${provider} building ${motion ? "VIDEO" : "still"} "${id}" — up to ${maxSteps} steps...`);
  // LOOP-CONTINUATION (the gemini early-quit class, reproduced 3×): some models answer the build order
  // with PROSE and stop emitting tool calls — generateText then ends its tool loop after ~1 step with
  // nothing built. When the loop ends VOLUNTARILY (no done, no stall, step budget left), push the
  // model's own reply back plus a hard "use the tools NOW" directive and continue the SAME
  // conversation — up to GEN_CONTINUE_MAX times. Providers that follow the loop never trigger this.
  const CONTINUE_MAX = Math.max(0, Number(process.env.GEN_CONTINUE_MAX ?? 2));
  const NUDGE_BUILD =
    "You have NOT built the post. Do not reply with prose — you MUST use the tools NOW: call write_post with the full self-contained .tsx component, then typecheck, then inspect_layout, fix every finding, and call finish. Keep calling tools until finish reports ok.";
  const NUDGE_FINISH =
    "The post is not finished. Continue the build loop with the tools: call inspect_layout, fix every blocking finding via write_post, and call finish once it passes. Do not stop calling tools until finish reports ok.";
  let result, tokens = 0, totalSteps = 0;
  // ONE wall-clock signal spans the initial call AND all continuations, so the whole-loop cap stays a
  // hard total bound (timeout audit) — a wedged provider stream can't hang the slot indefinitely.
  const loopSignal = genLoopSignal();
  let convo = [{ role: "user", content: brief }];
  try {
    for (let round = 0; ; round++) {
      result = await generateText({
        model,
        system,
        messages: convo,
        tools,
        stopWhen: [stepCountIs(Math.max(1, maxSteps - totalSteps)), () => isDone(), () => isStalled()], // stall-abort: no new best in STALL_K inspects → stop burning the user's tokens
        abortSignal: loopSignal,
        // Live progress: keep the running token total fresh (the transcript entries stamp it) and
        // flush after every step so reasoning-only steps (no tool call) still move the live tail.
        onStepFinish: (s) => { tokRef.v += tokensOf(s?.usage); flushTranscript(); },
      });
      totalSteps += result.steps?.length ?? 0;
      tokens += tokensOf(result.totalUsage ?? result.usage);
      const voluntaryQuit = !isDone() && !isStalled() && totalSteps < maxSteps;
      if (!voluntaryQuit || round >= CONTINUE_MAX) break;
      const hasWritten = getTranscript().some((e) => e.t === "write");
      convo = [...convo, ...(result.response?.messages ?? []), { role: "user", content: hasWritten ? NUDGE_FINISH : NUDGE_BUILD }];
      record({ t: "continue", round: round + 1, afterSteps: totalSteps, hasWritten }); // PL-6 R3 telemetry
      log(`  Path B: model left the tool loop after ${totalSteps} step(s) without finishing — continuation nudge ${round + 1}/${CONTINUE_MAX}`);
    }
  } catch (e) {
    const reason = isLlmTimeout(e)
      ? `generation timed out after ${Math.round(GEN_LOOP_TIMEOUT_MS / 1000)}s (whole-loop cap)`
      : e.message;
    return { status: "provider_error", reason, iterations: totalSteps, tokens };
  }
  const steps = totalSteps;

  // PL-5.3 anti-regression: the loop may have ended on a worse write than its best (oscillation /
  // hitting the step cap mid-fix). Restore the best-scoring component seen before the final grade, so
  // a cell ALWAYS ships its best, never a regression. Decided on the consistent structural metric.
  const best = getBest();
  if (best.tsx != null) {
    const cur = await runQA(id, { base, motion, format });
    if (best.score > scoreOf(cur.pass, cur.findings)) {
      await writePost(id, best.tsx);
      log(`  Path B: restored best-scoring component (best ${best.score} > last ${scoreOf(cur.pass, cur.findings)}) before the final grade`);
    }
  }

  // Deterministic final grade (same graded reviewer for every provider — judge/vision = the
  // consistent JUDGE_PROVIDER, not the builder model). This is the metric AND the success gate,
  // independent of whether the model called finish (salvage path, like agent.mjs).
  const tc = await typecheckPost(id);
  const qa = await runQA(id, { base, motion, judge, vision, brief, format });
  const success = tc.ok && qa.pass;
  log(`  Path B done: ${steps} step(s) · ${success ? "PASS" : "did not converge"} · ${tokens} tok`);

  // PL-6 R3: persist the per-step QA trajectory (best-effort) so oscillation/cost is diagnosable
  // post-hoc (the loop history was previously never written to disk). Never break generation on it.
  try {
    const dir = join(root, "out", "bench", "logs");
    await mkdir(dir, { recursive: true });
    const entries = getTranscript();
    const lines = entries.map((e, i) => JSON.stringify({ step: i + 1, ...e }));
    lines.push(JSON.stringify({ t: "summary", id, provider, model: modelId ?? null, steps, tokens, success, reason: success ? null : isDone() ? "qa_regressed" : isStalled() ? "stalled_no_progress" : "did_not_converge" }));
    await writeFile(join(dir, `${id}.jsonl`), lines.join("\n") + "\n");
    log(`  Path B: transcript → out/bench/logs/${id}.jsonl (${entries.length} entries)`);
  } catch { /* logging is best-effort */ }

  return {
    status: success ? "ok" : "qa_failed",
    // stalled_no_progress = the loop was STOPPED EARLY by the stall-abort (no new best in STALL_K
    // inspects) — distinct from did_not_converge (ran the full step budget) so the user-facing reason
    // can say "we stopped early to save your tokens" instead of implying the model tried everything.
    reason: success ? undefined : isDone() ? "qa_regressed" : isStalled() ? "stalled_no_progress" : "did_not_converge",
    tsxPath: `src/posts/generated/${id}.tsx`,
    qa,
    iterations: steps,
    tokens,
  };
}
