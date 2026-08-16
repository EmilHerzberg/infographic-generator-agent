// Path A generation service (Epic 01 / Sprint 1.3). The orchestrator calls generatePost()
// with a per-user BYOK key; it generates a RenderPost, self-corrects it through the QA gate,
// and returns a structured result. Contracts:
//   • the key is a parameter, used in-memory — never read from .env here, never written to disk,
//     never logged (this module logs progress to stderr but only counts/findings, not the key);
//   • the spec is RETURNED as an object — the caller decides where it goes (DB/queue/disk). A
//     copy is written under src/posts/generated/<id>.render.json only because the local QA
//     inspector renders it by URL; that is the spec, not the key.
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { generateObject, jsonSchema, NoObjectGeneratedError } from "ai";
import { resolveModel, llmCallSignal } from "./model.mjs";
import { assembleBriefing } from "./context.mjs";
import { loadRenderSchema, schemaForProvider } from "./render-schema.mjs";
import { runQA, findingsForAgent } from "./qa.mjs";
import { classifyFindings } from "./classify.mjs";
import { scanOutput, specTexts } from "./guard.mjs";

const HMR_SETTLE_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tokensOf = (u) => (u?.inputTokens ?? 0) + (u?.outputTokens ?? 0);

export const RENDER_CONTRACT = `<<< RENDER OUTPUT CONTRACT (Path A) >>>

Emit ONE post as a RenderPost JSON object. A fixed renderer turns it into pixels — you do NOT write code,
you choose content + structure. Pick ONE visualization kind that fits the content:

- "chart": for change-over-time / trend / decay. Provide 1–4 \`series\`, each { label, values (array of 0..1
  fractions), color (accent), endValueLabel }. Add \`xLabels\` and \`yMax\` (usually 1). LABEL EACH SERIES
  meaningfully (e.g. "99%/step"). Only use a chart for genuine trends — it is NOT the default. Optional
  knobs (default = a plain line): \`variant\` "area" (shade the volume under ONE trend) or "stepped"
  (discrete state changes that hold then jump); \`markers\`:"on" to dot every data point; \`yMin\` for a
  non-zero baseline; \`annotations\` (≤3) to label key moments — each { x (index or xLabels entry), label (≤18 chars) }.
- "comparison": two columns \`left\` and \`right\`, each { title, tone (accent), items (≤4 short strings) }.
  Use cyan/mint tone for the good side, burnt/amber for the friction side. Optional \`revealMode\`
  (default "paired" = both columns at once, per-row point/counterpoint): "sequential" reveals the left
  column's items then the right, both columns on screen side-by-side throughout (≤5 items/col here);
  "sequentialCentered" shows one column centered alone, slides it aside, brings the other in, then
  settles both side-by-side. Pick a sequential mode to walk the viewer through a point-by-point
  argument; keep "paired" for an at-a-glance contrast.
- "stat": a single hero number — { big (the number/formula), sub (one explanatory line), note (short tag) }.
  If big IS a proportion of a whole ("19%", "1 in 5"), also set proportion (number 0..1, e.g. 0.19) —
  the renderer draws a ring that sweeps to it; omit otherwise. Keep big ≤ 12 chars when using it.
- "claims": a claim-vs-reality ledger — \`entries\` (≤4), each { date, source, claim (≤90 chars),
  reality (≤60 chars), note? }. Use for "predicted X / actually Y" or hype-vs-outcome content. Optional
  \`revealMode\` (default "stagger" = all entries fade in together, each striking its own reality):
  "spotlight" reveals + strikes the entries ONE AT A TIME down the list with reading time per claim —
  a slower, dramatic walk-through. Pick "spotlight" when each claim deserves its own beat.
- "pipeline": compounding/erosion across discrete steps — \`nodes\` (≤8), each { step (int), cumulative
  (short label, e.g. "90%") }, plus \`perStepLabel\` (e.g. "99% per step"), \`endLabel\` (the final value),
  \`endAccent\`. Use when a per-step rate compounds to a striking end state.
- "stack": a single composition/decomposition bar — \`segments\` (≤5), each { width (0..1 fraction of the
  bar), color (accent), label? }. Widths should sum to ~1. Use for "where the budget/time/risk goes".
- "ranges": a two-lane horizontal TIMELINE — compare two groups' time/interval ranges on a shared YEAR axis.
  Provide \`topGroupLabel\`, \`bottomGroupLabel\`, \`topEntries\` & \`bottomEntries\` (≤4 each), each entry
  { label (≤26 chars), start (year int), end (year int), openEnd? (true for an open-ended range like "2040+") },
  plus \`topAccent\`/\`bottomAccent\`, \`minYear\`, \`maxYear\`, and optionally \`marketLine\` { year, label } for a
  consensus marker. USE THIS for timelines, forecasts/predictions across years, confidence intervals, or
  before/after windows — anything whose message is "who sits where on a time axis" (NOT a text comparison).
- "matrix": a 2×2 DECISION MATRIX — \`rowHeaders\` [2] and \`colHeaders\` [2] label the axes; four cells
  \`tl\`/\`tr\`/\`bl\`/\`br\`, each { value (≤12 chars — the hero number/label), delta? (short tag), accent }.
  Optional \`rowAccents\` [2] and \`highlightCell\` (tl|tr|bl|br) to spotlight one quadrant. Use for trade-off /
  quadrant content (two options × two dimensions, e.g. cost vs quality).
- "divergence": the GAP between two paired values where the gap/direction is the point — predicted vs actual,
  before vs after, or a ranking that flipped. Give 2–5 \`items\`, each { label (≤24 chars), start (the
  expectation/before/predicted number), end (the reality/after/actual number), optional startText/endText
  display strings (≤12 chars, e.g. "19% slower") }; optionally startLabel/endLabel (axis legends), startAccent/
  endAccent, and axisMin/axisMax (derived if omitted). Default mode draws a dumbbell connector per gap; set
  \`mode\`:"slope" for a ranking inversion / crossing lines. NOT for a single pair (use stat or a metric delta).
- "tiers": items sorted into a few RANKED bands — "high / moderate / low", "tier S / A / B", "what's worth your
  time vs not". Give 2–4 \`tiers\`, each { label (≤18 chars), accent?, items (≤5 each, each { label ≤14 chars }) };
  keep ~12 items total (extras are dropped). Order tiers best→worst (top to bottom); colors are assigned by
  position automatically (high=mint, mid=amber, low=burnt). Use when the point is which bucket each thing lands in.
- "bar": compare N named MAGNITUDES (3–8 vertical, up to 10 horizontal) on one 0-anchored value axis — pick it
  when the story is "which is biggest / by how much" across labelled things (scores, costs, counts). Give
  \`categories\`, each { label (≤18 chars), value } (\`values\`[] + \`seriesLabels\`/\`seriesAccents\` for grouped/stacked);
  optional unit, axisMin/axisMax (derived if omitted). Use \`orientation\`:"horizontal" for long labels; \`mode\`:"grouped"
  (≤4 series) to compare the SAME categories across conditions; "stacked" (≤5 segments) for what a total is made of;
  keep "simple" otherwise. \`sort\`:"desc" to rank. NOT for one hero number (stat), a trend over time (chart),
  part-of-one-whole (stack), a before/after gap (divergence), or qualitative buckets (tiers).
- "scatter": a RELATIONSHIP between two numeric variables across N items — "as X rises, Y falls/rises",
  correlation, inverse relationships, or 2-D positioning (cost vs value, risk vs reward). Give 2–20
  \`points\`, each { x (number), y (number), label? (≤20 chars), accent? }; add \`xLabel\`/\`yLabel\` (axis
  titles ≤24 chars) and optional \`xUnit\`/\`yUnit\`, \`xMin\`/\`xMax\`/\`yMin\`/\`yMax\` (per-dim domains, derived
  if omitted — NOT 0-anchored). Set \`trendLine\`:"fit" when the message IS the correlation/direction (one
  auto-fit least-squares line, handles inverse slope automatically); \`quadrants\`:"on" (+ optional
  \`xDivider\`/\`yDivider\` and ≤4 \`quadrantLabels\` in TL,TR,BL,BR order) when items split into four regions.
  Use for two DIFFERENT measured variables — NOT a before/after of the same metric (divergence), one
  magnitude per item (bar), or a value over ordered time (chart).
- "donut": the RADIAL composition of ONE whole into a FEW parts — a ring of 2–6 \`segments\`, each
  { label (≤14 chars), value, accent? }, normalized to sum to the whole (deployment mix, budget split,
  traffic sources, market share). The center hole carries a headline (\`centerValue\` + small \`centerLabel\`
  caption; defaults to "100%"); set \`unit\` (e.g. "%") for derived value labels; \`valueLabels\`:"off" to drop
  them; \`centerTotal\`:"off" for an empty hole. Pick it when the WHOLE is the subject and "a pie of the
  total" reads better than a bar. NOT for ranked magnitudes that needn't sum (bar), a linear part-to-whole
  row (stack), a single proportion (stat), or a before/after gap (divergence).
- "area": MAGNITUDE / VOLUME under a curve over an ORDERED axis — "how much, as it moves across an
  ordered dimension (time, stage, index)", where the FILLED region (not just the top edge) is the
  message. Give 1–3 \`series\`, each { label? (≤18 chars), values[] (2–24 numbers, ordered along x,
  from 0), accent?, endValueLabel? }; optional \`xLabels\` (≤8 chars each), \`unit\`, axisMin/axisMax
  (derived if omitted). \`mode\`:"stacked" (≤3 layers) shows how a TOTAL is COMPOSED across the axis
  (the top edge is the running total); keep "simple" (one filled volume) otherwise. Pick it when x is
  an ordered continuum AND the filled volume is the point. NOT for comparing trend LINES (chart),
  discrete labelled magnitudes (bar), one bar's part-to-whole (stack), or radial proportion (donut).
- "histogram": the SHAPE / SPREAD of ONE metric across MANY observations — "how is X distributed?",
  where the mass sits, how wide the tail is, skew/bimodality (request-latency, score spread, response
  length). Give raw \`values\` (a list of observations — the planner bins them; PREFERRED, and the only
  form that yields honest median/mean/p95 markers) OR pre-binned \`bins\` (each { x0, x1, count }; stat
  markers are then suppressed). Optional \`binCount\` (clamped 5–14; Sturges default), \`xLabel\`/\`yLabel\`/
  \`xUnit\`, \`axisMin\`/\`axisMax\` (derived if omitted), \`accent\`. Set \`markers\`:"median"|"mean"|"medianMean"
  (skew)|"p95" (tail/SLA) for NEUTRAL stat lines, or \`markerLines\`[{value,label?}] (≤3) for explicit
  reference lines. Pick it when the message is the DISTRIBUTION of one variable across observations —
  NOT a few named magnitudes (bar), a two-variable relationship (scatter), or volume over ordered time (area).
- "funnel": a measured population SHRINKS as it passes through ORDERED stages — conversion funnels
  (visitors→signups→activated→paid), pipeline yield, hiring funnels, retention cohorts. Give 2–5
  \`stages\` top→down (entry total first, final converted last), each { label (≤22 chars), value
  (absolute magnitude) }; optional \`valueText\` (display string e.g. "1.2M"), \`unit\`, per-stage
  \`accent\` (a bottleneck). The drop-off % between stages is computed for you — do NOT author it. The
  default centered-trapezoid silhouette shows the narrowing; set \`mode\`:"bars" for a left-aligned
  attrition list. NOT for part-of-one-whole percentages (stack/donut — those sum to 100%), an UNORDERED
  magnitude comparison (bar), a COMPOUNDING per-step rate with a cumulative payoff (pipeline), or items
  sorted into ranked buckets (tiers).
- "candlestick": an OPEN/HIGH/LOW/CLOSE (OHLC) range over an ORDERED time axis — each period has FOUR
  values and the message is the per-period RANGE (high–low) AND the open→close move + its up/down
  direction (daily p95 latency open/peak/trough/last, error-budget burn, queue depth per period; or
  markets). Give 2–14 \`candles\` in time order, each { label? (≤10 chars), open, high, low, close };
  optional \`mode\`:"ohlc" (the bar glyph), \`axisMin\`/\`axisMax\` (a price WINDOW, derived NOT 0-anchored),
  \`upAccent\`/\`downAccent\` (default up=mint/down=burnt), \`unit\`. NOT for ONE value per period (chart/area —
  those throw away the intra-period range), a min–max range with no open/close or direction (RangeBars),
  or an unordered magnitude comparison (bar).
- "distribution": the SPREAD of a metric — median, inter-quartile range (the middle-half box), the
  full range (whiskers), and outliers — for one or a FEW groups compared on a SHARED value axis
  (p50/p90/p99 latency across models, score distribution by tier, response-time spread per cohort).
  Give 1–5 \`groups\`, each either raw \`values\` (a list of observations — the planner computes the
  five-number summary + Tukey outliers; PREFERRED) OR a pre-computed { min, q1, median, q3, max, mean?,
  outliers? }; plus optional \`label\` (≤14 chars). Optional \`mode\`:"rangeMarkers" (a thin range line +
  quartile ticks instead of the box), \`showMean\`:"on" (a distinct mean diamond — mean≠median ⇒ skew),
  \`axisMin\`/\`axisMax\` (a value WINDOW, derived NOT 0-anchored), \`accent\` (one group) or \`groupAccents\`
  (per group), \`unit\`. Pick it when the message is the SPREAD/variance/quartile shape of a few cohorts
  — NOT a binned single-sample shape (histogram), a min–max-only timeline (ranges), an unordered
  magnitude (bar), or a two-variable relationship (scatter).
- "taxonomy": a grouped HIERARCHY — N qualitative CATEGORIES each containing named CHILDREN, where the
  belongs-to STRUCTURE (what nests under what) is the point — a taxonomy, a system breakdown (the agent
  stack: layers → components), a categorized inventory (automation surface: categories → tools), "where
  the budget goes" (categories → line items). Drawn as a tidy node-link TREE (root → category nodes →
  leaf nodes, connected by links). Give 1–4 \`categories\`, each { label (≤16 chars), accent?, children
  (≤6 each, each { label ≤14 chars, value? }) }; ~14 leaves total max (extras dropped). Optional
  \`rootLabel\` (≤18 chars; omit for a small neutral hub), \`mode\`:"elbow" (org-chart right-angle links
  instead of the default smooth curves), \`showValues\`:"on" (+ \`unit\`) to show a leaf's value as a count
  chip. Pick it when the message is how things are ORGANIZED / what's in each group — NOT a ranked
  bucketing (tiers — that's an ORDER, no parent→child links), part-of-one-whole (stack/donut), or a
  two-flat-list contrast (comparison).

PREFER A GRAPHICAL kind (chart / pipeline / stack / ranges / matrix / divergence / tiers / bar / scatter / donut / area / histogram / funnel / candlestick / distribution / taxonomy) over the text kinds (comparison / claims /
stat) whenever the content has temporal, quantitative, or structural shape — e.g. timelines→ranges, a 2×2
trade-off→matrix, compounding→pipeline, composition→stack. A graphic reads far better than a column of text;
only fall back to comparison/claims when the content is genuinely a list of qualitative points.

Also set: eyebrow (short kebab/label), headline (≤12 words, the message), up to 4 \`metrics\`
({ label, value, delta, accent }), a \`takeaway\` (≤18 words), and optionally \`signal\`.

Rules from the briefing apply: one main idea, generous whitespace, ≤4 metrics, multi-accent (assign accents
with meaning: cyan=primary path, amber=insight, burnt=friction, mint=success, violet=differentiator).
Use a proper superscript for exponents in any text (e.g. 0.95¹⁰, not 0.95^10). The creator signature is added
automatically — do not include it.`;

// OpenAI's strict schema emits explicit nulls for unused optionals; treat null as absent so the
// spec matches the lean shape and the renderer's `?? default` paths work cleanly.
function stripNulls(v) {
  if (Array.isArray(v)) return v.map(stripNulls);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (val === null) continue;
      out[k] = stripNulls(val);
    }
    return out;
  }
  return v;
}

/**
 * Generate + QA-gate a RenderPost using a BYOK key.
 * @returns {Promise<{status:'ok'|'qa_failed'|'provider_error', reason?:string, spec?:object,
 *   qa?:object, iterations:number, tokens:number, rendererFindings?:object[]}>}
 *   (Epic 02 will add 'triage_rejected'.)
 */
export async function generatePost({ brief, provider, model: modelId, apiKey, root, id, base, vizKinds, format, opts = {} }) {
  const maxIter = opts.maxIter ?? 4;
  // Output aspect the user chose (portrait default). NOT model-authored — never in the generation
  // schema — so we STAMP it onto the generated spec below. That written spec drives the QA canvas size
  // (Preview reads it) AND the render size (Remotion reads it), keeping QA honest at the true format.
  const fmt = format === "square" || format === "vertical" ? format : undefined; // non-default aspects; else absent = portrait
  const tokenBudget = opts.tokenBudget ?? 220000;
  const judge = opts.judge ?? true;
  const vision = !!opts.vision;
  const motion = !!opts.motion;
  const log = typeof opts.log === "function" ? opts.log : () => {}; // progress only — never the key

  let model;
  try {
    ({ model } = resolveModel(provider, { modelOverride: modelId, apiKey }));
  } catch (e) {
    return { status: "provider_error", reason: e.message, iterations: 0, tokens: 0 };
  }

  // PL-0.4: optional vizKinds prunes the visualization union per request (Anthropic grammar
  // headroom — see tools/lib/schema-budget.mjs). Default (undefined) keeps all kinds.
  const base$ = await loadRenderSchema(root);
  const schema = schemaForProvider(base$, provider, { kinds: vizKinds });
  const briefing = await assembleBriefing(root, { motion });
  const system = `${briefing}\n\n${RENDER_CONTRACT}\n\nUse id "${id}".`;

  const outDir = join(root, "src", "posts", "generated");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, `${id}.render.json`);

  let feedback = "";
  let lastSpec = null;
  let prevChecks = new Set();
  let tokens = 0;

  for (let iter = 1; iter <= maxIter; iter++) {
    const prompt = feedback
      ? `${brief}\n\n<<< REVISION ${iter} — fix the issues below >>>\n${feedback}\n\n` +
        `Your previous attempt (correct it; do not start over unless necessary):\n${JSON.stringify(lastSpec)}`
      : brief;

    log(`iteration ${iter}/${maxIter}: generating${feedback ? " (revision)" : ""}...`);
    let object, usage;
    try {
      ({ object, usage } = await generateObject({ model, schema: jsonSchema(schema), system, prompt, maxRetries: 2, abortSignal: llmCallSignal() }));
    } catch (err) {
      if (NoObjectGeneratedError.isInstance(err) && err.text) {
        await writeFile(join(outDir, `${id}.raw.txt`), err.text);
        return { status: "provider_error", reason: "model output did not conform to the schema (raw saved)", iterations: iter, tokens };
      }
      return { status: "provider_error", reason: err.message, iterations: iter, tokens };
    }
    object = stripNulls(object);
    object.id = id;
    if (fmt) object.format = fmt; // stamp the chosen output aspect (absent ⇒ portrait, byte-identical)
    lastSpec = object;
    tokens += tokensOf(usage);
    await writeFile(outPath, JSON.stringify(object, null, 2));
    await sleep(HMR_SETTLE_MS);

    const qa = await runQA(id, { base, motion, judge, vision, brief });
    const errors = qa.findings.filter((f) => f.severity === "error");
    log(`  QA: ${errors.length ? `${errors.length} error(s)` : "PASS"} · ${tokens} tok cumulative`);
    if (errors.length === 0) {
      // Output moderation — never deliver a spec whose text leaks PII / a secret.
      const out = scanOutput(specTexts(object));
      if (out.flagged) {
        log(`  output moderation: blocked [${out.categories.join(",")}]`);
        return { status: "qa_failed", reason: "output_moderation", spec: object, qa, iterations: iter, tokens, outputFindings: out.categories };
      }
      return { status: "ok", spec: object, qa, iterations: iter, tokens };
    }

    const { model: modelErrs, renderer: rendErrs } = classifyFindings(errors, prevChecks);
    if (rendErrs.length > 0) {
      return { status: "qa_failed", reason: "renderer_blocked", spec: object, qa, iterations: iter, tokens, rendererFindings: rendErrs };
    }
    if (tokens > tokenBudget) {
      return { status: "qa_failed", reason: "token_budget", spec: object, qa, iterations: iter, tokens };
    }
    feedback = findingsForAgent([...modelErrs, ...qa.findings.filter((f) => f.severity === "warn")]);
    prevChecks = new Set(errors.map((f) => f.check));
  }
  return { status: "qa_failed", reason: "max_iterations", spec: lastSpec, iterations: maxIter, tokens };
}
