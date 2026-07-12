// Schema-budget linter (PL-0.4). Measures a DERIVED (post-schemaForProvider) JSON schema against
// the provider's structured-output limits so a sprint can never silently push the schema over the
// cliff again (FRAMEWORKS.md §F). Pure module — no I/O, no network; the live probe in
// tools/provider-matrix.mjs stays authoritative for the internal compiled-grammar limit.
//
// Verified Anthropic caps (structured-outputs docs, 2026-06): 24 optional parameters and 16
// union-typed parameters, combined across all strict schemas in a request; PLUS an internal
// compiled-grammar size limit that bytes alone do NOT track. PL-0.4 live calibration (9 probed
// variants, model claude-opus-4-8, 2026-06-12) showed the grammar cost is dominated by the
// visualization UNION BRANCH count × schema size — NOT by the optional count (a 13-optional
// variant failed while a 16-optional one compiled) and NOT by raw bytes (the failing working-tree
// derivation was 4,033 B vs the passing pre-PL-1 one at 4,061 B). The proxy that separates every
// probed pass/fail point:
//
//   grammarProxy = bytes × (1 + branches/4)
//
// Probe ladder (anthropic-derived schemas): PASS — 4,061 B × 6 br = 10,153; 3,377 B × 8 br =
// 10,131; 3,766 B × 8 br = 11,298. FAIL — 4,153 B × 7 br = 11,421; 4,033 B × 8 br = 12,099;
// 4,062 B × 8 br = 12,186; 6,114 B × 8 br = 18,342. Highest pass 11,298 < threshold 11,350 <
// lowest fail 11,421. The margin is thin because the SHIPPED schema sits at the cliff — the
// proxy is a CI tripwire, NOT ground truth; the live probe in provider:matrix stays authoritative.

const KEYWORD_SUBSCHEMAS = ["anyOf", "oneOf", "allOf"];

function isObj(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

/**
 * Measure a derived schema. Counting rules (deterministic):
 *  - optionals: every key in any `properties` object that is NOT listed in that object's
 *    `required`, counted recursively (anyOf branches, array items, nested objects).
 *  - unions: every property whose schema is union-typed — an `anyOf`/`oneOf` node or an array
 *    `type` (e.g. ["string","null"]) — counted recursively.
 *  - branches: number of branches in the top-level `properties.visualization.anyOf` union
 *    (0 when the schema has no visualization union).
 *  - bytes: UTF-8 byte length of JSON.stringify(schema).
 *  - depth: maximum JSON nesting depth of the serialized schema tree.
 * @returns {{optionals:number, unions:number, branches:number, bytes:number, depth:number}}
 */
export function budget(schema) {
  let optionals = 0;
  let unions = 0;

  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!isObj(node)) return;
    if (isObj(node.properties)) {
      const required = new Set(Array.isArray(node.required) ? node.required : []);
      for (const [key, prop] of Object.entries(node.properties)) {
        if (!required.has(key)) optionals++;
        if (isObj(prop) && (Array.isArray(prop.anyOf) || Array.isArray(prop.oneOf) || Array.isArray(prop.type))) {
          unions++;
        }
        walk(prop);
      }
    }
    for (const k of KEYWORD_SUBSCHEMAS) if (Array.isArray(node[k])) node[k].forEach(walk);
    if (node.items) walk(node.items);
    if (isObj(node.$defs)) Object.values(node.$defs).forEach(walk);
  };
  walk(schema);

  const depthOf = (node) => {
    if (Array.isArray(node)) return 1 + Math.max(0, ...node.map(depthOf));
    if (isObj(node)) return 1 + Math.max(0, ...Object.values(node).map(depthOf));
    return 0;
  };

  return {
    optionals,
    unions,
    branches: schema?.properties?.visualization?.anyOf?.length ?? 0,
    bytes: Buffer.byteLength(JSON.stringify(schema), "utf8"),
    depth: depthOf(schema),
  };
}

/** Grammar-size proxy (see header). A CI tripwire, NOT ground truth. */
export function grammarProxy(b) {
  return Math.round(b.bytes * (1 + b.branches / 4));
}

// Per-provider caps. `optionals`/`unions` are HARD documented caps (Anthropic structured-outputs
// docs); `proxyMax` is the empirically calibrated tripwire for Anthropic's internal compiled-
// grammar limit (calibration ladder in the header: highest live PASS 11,298 < 11,350 < lowest
// live FAIL 11,421). openai/deepseek have no equivalent published caps → report-only.
export const CAPS = {
  anthropic: { optionals: 24, unions: 16, proxyMax: 11350 },
  openai: {},
  deepseek: {},
};

// Warn margins (PL-0.4 spec): optionals ≥ 20, unions ≥ 12, proxy ≥ 85% of proxyMax.
const WARN = { optionals: 20, unions: 12, proxyFraction: 0.85 };

/**
 * Lint a measured budget against a provider's caps.
 * @returns {{level:'ok'|'warn'|'fail', proxy:number, messages:string[]}}
 */
export function lintBudget(b, provider) {
  const caps = CAPS[provider] ?? {};
  const proxy = grammarProxy(b);
  const messages = [];
  let level = "ok";
  const warn = (msg) => {
    if (level === "ok") level = "warn";
    messages.push(`WARN ${msg}`);
  };
  const fail = (msg) => {
    level = "fail";
    messages.push(`FAIL ${msg}`);
  };

  if (caps.optionals != null) {
    if (b.optionals > caps.optionals) fail(`optionals ${b.optionals} > hard cap ${caps.optionals}`);
    else if (b.optionals >= WARN.optionals) warn(`optionals ${b.optionals} ≥ margin ${WARN.optionals} (cap ${caps.optionals})`);
  }
  if (caps.unions != null) {
    if (b.unions > caps.unions) fail(`unions ${b.unions} > hard cap ${caps.unions}`);
    else if (b.unions >= WARN.unions) warn(`unions ${b.unions} ≥ margin ${WARN.unions} (cap ${caps.unions})`);
  }
  if (caps.proxyMax != null) {
    if (proxy > caps.proxyMax) fail(`grammar proxy ${proxy} > calibrated max ${caps.proxyMax}`);
    else if (proxy >= caps.proxyMax * WARN.proxyFraction)
      warn(`grammar proxy ${proxy} ≥ 85% of calibrated max ${caps.proxyMax}`);
  }
  return { level, proxy, messages };
}
