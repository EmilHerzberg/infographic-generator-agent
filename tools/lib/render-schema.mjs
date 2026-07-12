// Per-provider RenderPost generation schema (Epic 01 / Sprint 1.3). The base schema
// (schemas/render-post.schema.json) is a lean discriminated union on `kind`. Provider
// structured-output engines disagree on what they accept, so we derive a variant:
//
//   Anthropic — grammar-constrained decoding caps BOTH optional params (≤24) and union-typed
//               params (≈≤17). The lean union (few optionals, one anyOf) fits.
//   OpenAI    — json_schema response_format requires EVERY object to set additionalProperties:false
//               and list ALL properties in `required`; optionals must be nullable. → strict variant.
//   DeepSeek  — compat mode injects the schema into the prompt; accepts either.
//
// These two strict modes are mutually exclusive (OpenAI's nullable-everything blows Anthropic's
// union cap), so we pick per provider. The RUNTIME output shape is identical either way — OpenAI
// just emits explicit nulls for unused optionals, which the renderer already treats as absent.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { budget, grammarProxy } from "./schema-budget.mjs";

export async function loadRenderSchema(root) {
  return JSON.parse(await readFile(join(root, "schemas", "render-post.schema.json"), "utf8"));
}

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

// Inline local $defs/$ref — providers vary in $ref support; inlining sidesteps it.
function inlineRefs(node, defs) {
  if (Array.isArray(node)) return node.map((n) => inlineRefs(n, defs));
  if (node && typeof node === "object") {
    if (typeof node.$ref === "string") {
      const name = node.$ref.split("/").pop();
      return inlineRefs(clone(defs[name]), defs);
    }
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "$defs") continue;
      out[k] = inlineRefs(v, defs);
    }
    return out;
  }
  return node;
}

function makeNullable(p) {
  if (Array.isArray(p.type)) {
    if (!p.type.includes("null")) p.type.push("null");
  } else if (p.type) {
    p.type = [p.type, "null"];
  }
  if (p.enum && !p.enum.includes(null)) p.enum.push(null);
  if (!p.type && !p.enum && Array.isArray(p.anyOf)) p.anyOf.push({ type: "null" });
}

// OpenAI strict form: every object property required + additionalProperties:false; former
// optionals become nullable.
function strictify(node) {
  if (Array.isArray(node)) return node.forEach(strictify);
  if (!node || typeof node !== "object") return;
  for (const k of ["anyOf", "oneOf", "allOf"]) if (node[k]) node[k].forEach(strictify);
  if (node.items) strictify(node.items);
  // Any node with `properties` is an object schema — including nullable ones whose type became
  // ["object","null"] via makeNullable (e.g. an optional nested object like ranges.marketLine).
  if (node.properties && typeof node.properties === "object") {
    node.additionalProperties = false;
    const wasReq = new Set(node.required || []);
    node.required = Object.keys(node.properties);
    for (const [k, p] of Object.entries(node.properties)) {
      if (!wasReq.has(k)) makeNullable(p);
      strictify(p);
    }
  }
}

// Anthropic constrained decoding has TWO limits that 8 viz kinds blow past: optional-param count (≤24)
// and total compiled-grammar size. We address both:
//   1) promote always-sensible optionals (`caption` everywhere, matrix `rowAccents`, metric `accent`)
//      to REQUIRED — cuts the optional count with no loss (the model always emits them anyway);
//   2) strip value constraints (maxLength/min/maxItems/pattern) — these bloat the grammar and are
//      already enforced downstream by the renderer, QA gate, and the primitives' defensive clamping.
const ANTHROPIC_STRIP = ["maxLength", "minLength", "maxItems", "minItems", "minimum", "maximum", "pattern", "format"];
function stripConstraints(node) {
  if (Array.isArray(node)) return node.forEach(stripConstraints);
  if (!node || typeof node !== "object") return;
  for (const k of ANTHROPIC_STRIP) delete node[k];
  for (const v of Object.values(node)) stripConstraints(v);
}
// The field-heavy kinds whose full strict shape overflows Anthropic's grammar. For Anthropic only,
// collapse them to a loose {kind, ...freeform} object; the model fills the fields from the RENDER_CONTRACT
// prompt and the renderer defends against omissions. OpenAI/DeepSeek keep the full strict shape.
// PL-0.4 live calibration: the grammar cost is dominated by FULL union branches — 6 full branches
// (pre-PL-1) sat exactly at the cliff (adding even one tiny {kind,caption} branch failed), and with
// 8 kinds the probe ladder showed 6 full + 2 loose FAILS while 5 full + 3 loose COMPILES. "claims"
// is the field-heaviest remaining kind (entries[] of 5-string objects) → collapsed. Promotions
// alone (chart xLabels/yMax, pipeline endAccent) were probed and do NOT suffice.
// PL-3.1: "divergence" (the 9th viz kind) also ships loose — its full strict branch (items[] of
// {label,start,end,startText?,endText?} + axisMin/Max/accents/labels/mode) is field-heavy and the
// 8-kind schema already sat at the grammar cliff. The model fills the fields from RENDER_CONTRACT;
// the renderer (planDivergence) defends every omission. The grammar-proxy linter flags the 9th
// branch (it weights all branches equally) but the LIVE provider:matrix probe stays authoritative
// (a loose branch compiles to almost nothing) — proxy recalibration is deferred to PL-3.2.
// PL-3.2: "tiers" (the 10th viz kind) ships loose for the same reason divergence did — its full
// strict branch (tiers[] of {label, accent?, items[] of {label, note?}} — a doubly-nested array)
// is the field-heaviest shape yet, and the union already sits at the Anthropic grammar cliff. It
// records the intent for when viz-kind pruning (PL-0.5) lands; the active prune is in
// DEFERRED_FROM_ANTHROPIC below. The renderer (planTiers) defends every omission.
// PL-3.3: "funnel" records the loose-collapse intent alongside divergence/tiers for when PL-0.5's
// per-request selector is the live path; the active prune is DEFERRED_FROM_ANTHROPIC below.
// PL-2.5: "candlestick" records the loose-collapse intent alongside divergence/tiers/funnel for when
// PL-0.5's per-request selector is the live path; the active prune is DEFERRED_FROM_ANTHROPIC below.
// PL-3.5: "distribution" records the loose-collapse intent alongside the above for when PL-0.5's
// per-request selector is the live path; the active prune is DEFERRED_FROM_ANTHROPIC below.
// PL-3.4: "taxonomy" records the loose-collapse intent alongside the above for when PL-0.5's
// per-request selector is the live path; the active prune is DEFERRED_FROM_ANTHROPIC below.
const ANTHROPIC_LOOSE_KINDS = new Set(["ranges", "matrix", "claims", "divergence", "tiers", "funnel", "candlestick", "distribution", "taxonomy"]);

// PL-3.1 ARCHITECTURE FINDING + Emil ruling (Y, 2026-06-15): Anthropic's compiled-grammar limit is
// reached at the 9th viz branch and loose-collapsing the new branch does NOT save it (the branch
// COUNT of the union, weighted by per-branch complexity, dominates). Rather than degrade Anthropic
// by collapsing ever more kinds to prose, we DEFER the new kinds OUT of Anthropic's structured
// schema until viz-kind pruning lands (backlog sprint PL-0.5). For Anthropic only, these kinds are
// pruned from the union by default (OpenAI/DeepSeek + all of Path B keep them). The model can't emit
// a pruned kind (the grammar forbids it) → it picks from the 8 kinds Anthropic still holds.
// This is the PL-0.4 `{kinds}` lever applied as a hardcoded per-provider default; PL-0.5 replaces it
// with a per-request selector that sends Anthropic only the brief's plausible kinds.
// PL-3.2: "tiers" is deferred from Anthropic alongside "divergence" (Emil ruling Y, 2026-06-15).
// The union genuinely overflows Anthropic's compiled grammar at the 9th/10th branch regardless of
// loose-collapse (the branch COUNT dominates), so the new kinds are pruned OUT of Anthropic's
// structured schema until PL-0.5's per-request viz-kind selector lands. Anthropic's derivation
// therefore stays byte-identical to its known-good 8-kind shape; OpenAI/DeepSeek + all of Path B
// keep tiers. NOT a recalibration — a hardcoded per-provider default (the PL-0.4 `{kinds}` lever).
// PL-2.1: "bar" (the 11th viz kind, opening Epic PL-2) is deferred from Anthropic alongside
// "divergence"/"tiers" for the SAME reason — the union already sits at the Anthropic grammar
// cliff and the branch COUNT dominates, so a new full strict branch (categories[] of
// {label,value?,values?[],valueText?,accent?} + 4 knobs + axis/unit) overflows it regardless of
// loose-collapse. Per project_anthropic_union_ceiling it ships Path B + OpenAI/DeepSeek and is
// pruned OUT of Anthropic's structured schema until PL-0.5's per-request viz-kind selector lands.
// Anthropic's derivation stays byte-identical to its known-good shape. The renderer (planBars)
// defends every omission.
// PL-2.2: "scatter" (the 12th viz kind, Epic PL-2) is deferred from Anthropic alongside
// "divergence"/"tiers"/"bar" for the SAME reason — the union already sits at the Anthropic grammar
// cliff and the branch COUNT dominates, so a new full strict branch (points[] of {x,y,label?,accent?}
// + trendLine/quadrants/pointLabels knobs + per-dim axis/unit/divider/quadrantLabels) overflows it
// regardless of loose-collapse. Per project_anthropic_union_ceiling it ships Path B + OpenAI/DeepSeek
// and is pruned OUT of Anthropic's structured schema until PL-0.5's per-request viz-kind selector
// lands. Anthropic's derivation stays byte-identical to its known-good shape. The renderer
// (planScatter) defends every omission.
// PL-2.3: "donut" (the 13th viz kind, Epic PL-2) is deferred from Anthropic alongside
// "divergence"/"tiers"/"bar"/"scatter" for the SAME reason — the union already sits at the
// Anthropic grammar cliff and the branch COUNT dominates, so a new full strict branch (segments[]
// of {label, value, accent?} + valueLabels/centerTotal knobs + centerLabel/centerValue/unit)
// overflows it regardless of loose-collapse. Per project_anthropic_union_ceiling it ships Path B +
// OpenAI/DeepSeek and is pruned OUT of Anthropic's structured schema until PL-0.5's per-request
// viz-kind selector lands. Anthropic's derivation stays byte-identical to its known-good shape.
// The renderer (planDonut) defends every omission.
// PL-2.4: "area" (the 14th viz kind, Epic PL-2) is deferred from Anthropic alongside
// "divergence"/"tiers"/"bar"/"scatter"/"donut" for the SAME reason — the union already sits at the
// Anthropic grammar cliff and the branch COUNT dominates, so a new full strict branch (series[] of
// {label?, values[], accent?, endValueLabel?} + xLabels/mode/valueLabels knobs + axisMin/Max/unit)
// overflows it regardless of loose-collapse. Per project_anthropic_union_ceiling it ships Path B +
// OpenAI/DeepSeek and is pruned OUT of Anthropic's structured schema until PL-0.5's per-request
// viz-kind selector lands. Anthropic's derivation stays byte-identical to its known-good shape.
// The renderer (planArea) defends every omission.
// PL-2.6: "histogram" (the 15th viz kind, Epic PL-2) is deferred from Anthropic alongside
// "divergence"/"tiers"/"bar"/"scatter"/"donut"/"area" for the SAME reason — the union already sits
// at the Anthropic grammar cliff and the branch COUNT dominates, so a new full strict branch
// (values[] XOR bins[] of {x0,x1,count} + binCount/markers/markerLines/valueLabels knobs +
// axisMin/Max/xLabel/yLabel/xUnit/accent) overflows it regardless of loose-collapse. Per
// project_anthropic_union_ceiling it ships Path B + OpenAI/DeepSeek and is pruned OUT of Anthropic's
// structured schema until PL-0.5's per-request viz-kind selector lands. Anthropic's derivation stays
// byte-identical to its known-good shape. The renderer (planHistogram) defends every omission.
// PL-3.3: "funnel" (the 16th viz kind, Epic PL-3) is deferred from Anthropic alongside
// "divergence"/"tiers"/"bar"/"scatter"/"donut"/"area"/"histogram" for the SAME reason — the union
// already sits at the Anthropic grammar cliff and the branch COUNT dominates, so a new full strict
// branch (stages[] of {label,value,valueText?,accent?} + mode/unit/dropLabels/accent knobs) overflows
// it regardless of loose-collapse. Per project_anthropic_union_ceiling it ships Path B + OpenAI/DeepSeek
// and is pruned OUT of Anthropic's structured schema until PL-0.5's per-request viz-kind selector lands.
// Anthropic's derivation stays byte-identical to its known-good shape. The renderer (planFunnel)
// defends every omission.
// PL-2.5: "candlestick" (the 17th viz kind, closing Epic PL-2) is deferred from Anthropic alongside
// "divergence"/"tiers"/"bar"/"scatter"/"donut"/"area"/"histogram"/"funnel" for the SAME reason — the
// union already sits at the Anthropic grammar cliff and the branch COUNT dominates, so a new full
// strict branch (candles[] of {label?,open,high,low,close} + mode/axisMin/axisMax/upAccent/downAccent/
// unit knobs) overflows it regardless of loose-collapse. Per project_anthropic_union_ceiling it ships
// Path B + OpenAI/DeepSeek and is pruned OUT of Anthropic's structured schema until PL-0.5's
// per-request viz-kind selector lands. Anthropic's derivation stays byte-identical to its known-good
// shape. The renderer (planCandles) defends every omission.
// PL-3.5: "distribution" (the 18th viz kind) is deferred from Anthropic alongside the rest of the
// PL-2.x/3.x chart family for the SAME reason — the union already sits at the Anthropic grammar cliff
// and the branch COUNT dominates, so a new full strict branch (groups[] of {label?,values?[],min?,q1?,
// median?,q3?,max?,mean?,outliers?[]} + mode/axisMin/axisMax/showMean/accent/groupAccents/unit knobs)
// overflows it regardless of loose-collapse. Per project_anthropic_union_ceiling it ships Path B +
// OpenAI/DeepSeek and is pruned OUT of Anthropic's structured schema until PL-0.5's per-request
// viz-kind selector lands. Anthropic's derivation stays byte-identical to its known-good shape.
// The renderer (planDistribution) defends every omission.
// PL-3.4: "taxonomy" (the 19th viz kind, the LAST new shape) is deferred from Anthropic alongside the
// rest of the PL-2.x/3.x family for the SAME reason — the union already sits at the Anthropic grammar
// cliff and the branch COUNT dominates, so a new full strict branch (categories[] of {label, accent?,
// children[] of {label, value?}} — a doubly-nested array + rootLabel/mode/showValues/unit knobs)
// overflows it regardless of loose-collapse. Per project_anthropic_union_ceiling it ships Path B +
// OpenAI/DeepSeek and is pruned OUT of Anthropic's structured schema until PL-0.5's per-request
// viz-kind selector lands. Anthropic's derivation stays byte-identical to its known-good shape.
// The renderer (planTaxonomy) defends every omission.
const DEFERRED_FROM_ANTHROPIC = new Set(["divergence", "tiers", "bar", "scatter", "donut", "area", "histogram", "funnel", "candlestick", "distribution", "taxonomy"]);

// PL-4.1 (§3 ruling 1) — FIELD-level Anthropic prune (a sibling of DEFERRED_FROM_ANTHROPIC, but per
// FIELD not per kind). `comparison` is a FULL strict branch for Anthropic; the 8-kind schema sits at
// the grammar cliff, so we do NOT risk adding the new `revealMode` enum to Anthropic's derivation.
// Instead the field is DROPPED from Anthropic's comparison branch (stays byte-identical to today —
// Anthropic just doesn't get the narrative option yet), while OpenAI/DeepSeek + all of Path B keep
// it. `claims` is loose for Anthropic, so its `revealMode` rides the loose object free (all 3
// providers) — no entry needed here. Decision rule (deterministic): keep comparison full + drop only
// this field from Anthropic IF schema:budget + provider:matrix stay green (they must — Anthropic is
// then byte-identical to its known-good shape); the Impl ran both and recorded the result.
// PL-2.7 — `chart` is a FULL-STRICT Anthropic branch sitting at the grammar cliff; the new LineChart
// variant knobs (variant / markers / yMin / annotations) ship on the base schema (OpenAI/DeepSeek +
// Path B) but are DROPPED from Anthropic's `chart` derivation so it stays byte-identical to its known-
// good plain-line shape (no new optional/union/array param). The renderer (planLine) defends every
// omission — an absent knob is exactly today's plain line. schema:budget + provider:matrix must stay
// green (Anthropic unchanged → they must); the Impl ran both and recorded the result (§5).
// PL-4.2 — `metrics` is the TOP-LEVEL metrics array (the MetricCard data, the design's "stat"-family
// knob). It is a STRICT Anthropic part sitting at the grammar cliff (`accent` is even promoted to
// required below to hold the optional count). The new `deltaTrend` enum ships on the base schema
// (OpenAI/DeepSeek + all of Path B) but is DROPPED from Anthropic's metrics derivation so it stays
// byte-identical to its known-good shape (no new optional). The renderer (MetricCard) defends the
// omission — absent deltaTrend is exactly today's neutral delta. Keyed `metrics` (not a viz kind) and
// applied in the metrics block below; schema:budget must stay byte-identical (Anthropic line unchanged).
const DEFERRED_FIELDS_FROM_ANTHROPIC = { comparison: ["revealMode"], chart: ["variant", "markers", "yMin", "annotations"], metrics: ["deltaTrend"] };

function leanForAnthropic(schema) {
  const branches = schema.properties?.visualization?.anyOf || [];
  for (const b of branches) {
    if (!b || !b.properties) continue;
    const kind = b.properties.kind?.enum?.[0];
    if (ANTHROPIC_LOOSE_KINDS.has(kind)) {
      b.properties = { kind: b.properties.kind, caption: { type: "string" } };
      b.required = ["kind"];
      b.additionalProperties = true;
      continue;
    }
    // Field-level prune (PL-4.1): drop deferred fields from this kind's Anthropic derivation so the
    // branch stays byte-identical to its known-good strict shape (no new optional/union param).
    for (const field of DEFERRED_FIELDS_FROM_ANTHROPIC[kind] ?? []) {
      delete b.properties[field];
      if (Array.isArray(b.required)) b.required = b.required.filter((r) => r !== field);
    }
    const promote = (key) => {
      if (b.properties[key] && !(b.required || []).includes(key)) (b.required ||= []).push(key);
    };
    promote("caption");
  }
  const metricItem = schema.properties?.metrics?.items;
  if (metricItem?.properties) {
    // PL-4.2 field-level prune: drop deferred fields (deltaTrend) from Anthropic's metrics derivation
    // so the top-level metrics object stays byte-identical to its known-good shape (no new optional).
    for (const field of DEFERRED_FIELDS_FROM_ANTHROPIC.metrics ?? []) {
      delete metricItem.properties[field];
      if (Array.isArray(metricItem.required)) metricItem.required = metricItem.required.filter((r) => r !== field);
    }
    if (metricItem.properties.accent && !(metricItem.required || []).includes("accent")) {
      (metricItem.required ||= []).push("accent");
    }
  }
  stripConstraints(schema);
}

// List the viz kinds a base schema's visualization union carries.
export function vizKindsOf(baseSchema) {
  return (baseSchema.properties?.visualization?.anyOf || [])
    .map((b) => b?.properties?.kind?.enum?.[0])
    .filter(Boolean);
}

/**
 * Derive the provider-specific generation schema. PL-0.4: `kinds` prunes the visualization union
 * to the given branches BEFORE provider lean-ing — the docs' "split requests" mitigation for
 * Anthropic's compiled-grammar limit (each pruned branch buys real headroom; see schema-budget.mjs).
 * Omitted/undefined `kinds` keeps all branches — the derived schema is byte-identical to before.
 */
export function schemaForProvider(baseSchema, provider, { kinds } = {}) {
  const defs = baseSchema.$defs || {};
  const schema = inlineRefs({ ...baseSchema }, defs);
  delete schema.$defs;
  delete schema.$schema;
  delete schema.$id;
  // Anthropic interim default (PL-3.1 ruling Y): prune the deferred kinds unless the caller passed an
  // explicit `kinds` list (which always wins — that's the PL-0.5 per-request selector path).
  if (kinds == null && provider === "anthropic" && DEFERRED_FROM_ANTHROPIC.size) {
    kinds = vizKindsOf(schema).filter((k) => !DEFERRED_FROM_ANTHROPIC.has(k));
  }
  if (kinds != null) {
    const known = vizKindsOf(schema);
    const unknown = kinds.filter((k) => !known.includes(k));
    if (unknown.length) throw new Error(`Unknown viz kind(s): ${unknown.join(", ")}. Known: ${known.join(", ")}`);
    if (kinds.length === 0) throw new Error("Viz-kind pruning needs at least one kind.");
    schema.properties.visualization.anyOf = schema.properties.visualization.anyOf.filter((b) =>
      kinds.includes(b?.properties?.kind?.enum?.[0]),
    );
  }
  if (provider === "openai") strictify(schema);
  else if (provider === "anthropic") leanForAnthropic(schema);
  return schema;
}

// PL-0.5 — per-request viz-kind selector (the budget-safe packer).
//
// SAFE_CORE — the always-included base set the relevant candidates add onto. `stat` (a hero number,
// fits any brief), `comparison` (the qualitative two-column fallback), `claims` (loose-collapsed →
// nearly free, the ledger fallback). All three render for essentially any content, so a packed
// Anthropic schema is never empty and always has a viable kind.
export const SAFE_CORE = ["stat", "comparison", "claims"];

// MARGIN — the packer keeps the derived Anthropic grammar-proxy at or below this. It is STRICTLY
// below the WARN line the fixed default-8 sits at (11,298) and the calibrated cap (11,350), and well
// below the lowest live FAIL (11,421) — ~150 proxy of slack against measurement noise. (The default-8
// path is exempt from this margin: it is the known-good shipped schema, a by-design WARN, untouched.)
export const ANTHROPIC_PACK_MARGIN = 11200;

/**
 * PURE, deterministic budget-safe packer for the Anthropic per-request viz-kind selector (PL-0.5).
 *
 * Given a ranked candidate list (most-plausible first — the relevance SOURCE, today triage-fed), return
 * the final Anthropic `kinds` array such that:
 *   grammarProxy(budget(schemaForProvider(base,'anthropic',{kinds}))) ≤ margin  AND  kinds.length ≥ 1
 *   AND every element ∈ vizKindsOf(base).
 * It is IMPOSSIBLE to return an over-budget, empty, or unknown-kind set — proven by construction (the
 * proxy is re-measured after every add) and asserted by the headline unit battery. No DOM, no LLM, no
 * clock/RNG/I/O → same input ⇒ same output.
 *
 * Algorithm: start from SAFE_CORE (∩ known); for each ranked candidate (unknowns & dups dropped,
 * rank order preserved) admit it iff the trial set's proxy stays ≤ margin, else SKIP it and continue
 * (a later, cheaper loose candidate may still fit — do NOT break). The REAL proxy is used after each
 * add, not a fixed count, because per-kind grammar cost is wildly non-linear.
 */
export function packAnthropicKinds(candidateKinds, baseSchema, { margin = ANTHROPIC_PACK_MARGIN, core = SAFE_CORE } = {}) {
  const known = vizKindsOf(baseSchema);
  const proxy = (kinds) => grammarProxy(budget(schemaForProvider(baseSchema, "anthropic", { kinds })));

  // Defensive: core is always a subset of known; the start state's proxy is « margin, so it passes.
  const kinds = core.filter((k) => known.includes(k));
  const seen = new Set(kinds);

  for (const k of candidateKinds || []) {
    if (!known.includes(k) || seen.has(k)) continue; // drop unknowns & dups, preserve rank order
    seen.add(k);
    const trial = [...kinds, k];
    if (proxy(trial) <= margin) kinds.push(k); // re-measure after each add ⇒ never over-margin
  }
  return kinds;
}
