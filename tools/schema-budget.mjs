#!/usr/bin/env node
// Schema-budget linter CLI (PL-0.4). Derives the per-provider generation schema and lints it
// against the provider caps in tools/lib/schema-budget.mjs. Deterministic, no network.
//
//   npm run schema:budget                      # full table, exit 1 over any hard cap / proxy
//   npm run schema:budget -- --kinds stat,chart  # budget of a viz-kind-pruned derivation
//   node tools/schema-budget.mjs --schema planning/fixtures/schema-budget/over-budget.schema.json
//                                              # lint an arbitrary derived schema (self-test fixture)
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadRenderSchema,
  schemaForProvider,
  vizKindsOf,
  packAnthropicKinds,
  SAFE_CORE,
  ANTHROPIC_PACK_MARGIN,
} from "./lib/render-schema.mjs";
import { budget, lintBudget, grammarProxy, CAPS } from "./lib/schema-budget.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const argOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const kindsArg = argOf("--kinds");
const kinds = kindsArg ? kindsArg.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
const schemaPath = argOf("--schema");

// PL-0.5 — budget-safe-by-construction unit battery for packAnthropicKinds (no tokens, no network).
// Feeds an adversarial battery of candidate arrays through the PURE packer and asserts EVERY output:
//   (a) grammarProxy ≤ MARGIN 11,200   (b) non-empty   (c) ⊆ vizKindsOf(base)   (d) ⊇ SAFE_CORE
//   (e) determinism — same input ⇒ identical output; null/empty/all-unknown ⇒ exactly SAFE_CORE.
// Also asserts the default-8 (no-kinds) Anthropic path stays byte-identical (proxy 11,298 / 8 branches).
//   node tools/schema-budget.mjs --unit
if (args.includes("--unit")) {
  const base = await loadRenderSchema(ROOT);
  const known = vizKindsOf(base);
  const proxyOf = (ks) => grammarProxy(budget(schemaForProvider(base, "anthropic", { kinds: ks })));
  const core = SAFE_CORE.filter((k) => known.includes(k));

  const heaviestFull = ["bar", "histogram", "scatter", "area", "donut", "chart", "comparison", "pipeline"];
  const battery = [
    { name: "all-15", cand: known.slice() },
    { name: "heaviest-full", cand: heaviestFull },
    { name: "heaviest-full reversed", cand: heaviestFull.slice().reverse() },
    { name: "heaviest-full shuffled", cand: ["chart", "donut", "bar", "pipeline", "histogram", "area", "scatter", "comparison"] },
    { name: "empty []", cand: [] },
    { name: "null", cand: null },
    { name: "all-unknown", cand: ["frobnicate", "wibble"] },
    { name: "unknown+bar", cand: ["frobnicate", "bar"] },
    { name: "duplicates", cand: ["bar", "bar", "stat", "stat", "bar"] },
    { name: "loose-only", cand: ["claims", "ranges", "matrix", "divergence", "tiers"] },
    { name: "bar-brief", cand: ["bar", "comparison", "stat"] },
    { name: "scatter-brief", cand: ["scatter", "stat"] },
  ];

  let fail = 0;
  const note = (ok, msg) => {
    if (!ok) fail++;
    console.log(`${ok ? "✔" : "✖"} ${msg}`);
  };

  for (const { name, cand } of battery) {
    const out = packAnthropicKinds(cand, base);
    const proxy = proxyOf(out);
    const subsetKnown = out.every((k) => known.includes(k));
    const supersetCore = core.every((k) => out.includes(k));
    const out2 = packAnthropicKinds(cand, base);
    const deterministic = JSON.stringify(out) === JSON.stringify(out2);
    const ok = proxy <= ANTHROPIC_PACK_MARGIN && out.length >= 1 && subsetKnown && supersetCore && deterministic;
    note(
      ok,
      `${name.padEnd(24)} → [${out.join(",")}] proxy=${proxy}` +
        `${proxy > ANTHROPIC_PACK_MARGIN ? " OVER-MARGIN" : ""}${out.length < 1 ? " EMPTY" : ""}` +
        `${subsetKnown ? "" : " UNKNOWN-KIND"}${supersetCore ? "" : " MISSING-CORE"}${deterministic ? "" : " NON-DETERMINISTIC"}`,
    );
  }

  // null / empty / all-unknown ⇒ exactly SAFE_CORE.
  for (const cand of [null, [], ["frobnicate", "wibble"]]) {
    const out = packAnthropicKinds(cand, base);
    note(JSON.stringify(out) === JSON.stringify(core), `${JSON.stringify(cand)} ⇒ exactly SAFE_CORE [${out.join(",")}]`);
  }

  // Default-8 (no-kinds) Anthropic path stays byte-identical to its known-good shape.
  const def8 = budget(schemaForProvider(base, "anthropic"));
  const def8proxy = grammarProxy(def8);
  note(def8.branches === 8 && def8proxy === 11298, `default-8 (no selector) unchanged: ${def8.branches} branches, proxy ${def8proxy} (expect 8 / 11298)`);

  console.log(`\nMARGIN=${ANTHROPIC_PACK_MARGIN} · SAFE_CORE=[${core.join(",")}] · ${fail ? `✖ ${fail} failure(s)` : "✔ all pass"}`);
  process.exit(fail ? 1 : 0);
}

const rows = [];
if (schemaPath) {
  // Lint a pre-derived schema file as-is (no derivation) against one provider's caps.
  const provider = argOf("--provider") || "anthropic";
  const schema = JSON.parse(await readFile(join(ROOT, schemaPath), "utf8"));
  rows.push({ provider, label: `${provider} (${schemaPath})`, b: budget(schema) });
} else {
  const base = await loadRenderSchema(ROOT);
  console.log(
    `Schema budget — schemas/render-post.schema.json, kinds: ${kinds ? kinds.join(",") : `all (${vizKindsOf(base).join(",")})`}\n`,
  );
  for (const provider of Object.keys(CAPS)) {
    rows.push({ provider, label: provider, b: budget(schemaForProvider(base, provider, { kinds })) });
  }
}

const fmtCap = (v, cap) => `${v}${cap != null ? "/" + cap : ""}`;
let worst = "ok";
console.log(
  "provider".padEnd(11) +
    "optionals".padEnd(11) +
    "unions".padEnd(8) +
    "branches".padEnd(10) +
    "bytes".padEnd(7) +
    "depth".padEnd(7) +
    "proxy".padEnd(14) +
    "status",
);
for (const { provider, label, b } of rows) {
  const caps = CAPS[provider] ?? {};
  const { level, proxy, messages } = lintBudget(b, provider);
  if (level === "fail" || (level === "warn" && worst !== "fail")) worst = level;
  console.log(
    label.padEnd(11) +
      fmtCap(b.optionals, caps.optionals).padEnd(11) +
      fmtCap(b.unions, caps.unions).padEnd(8) +
      String(b.branches).padEnd(10) +
      String(b.bytes).padEnd(7) +
      String(b.depth).padEnd(7) +
      fmtCap(proxy, caps.proxyMax).padEnd(14) +
      (messages.length ? messages.join(" · ") : "ok"),
  );
}
console.log(
  `\n${worst === "fail" ? "FAIL — over a hard cap or the calibrated grammar proxy" : worst === "warn" ? "WARN — within caps but near the cliff (live probe in provider:matrix stays authoritative)" : "OK — all budgets within caps"}`,
);
process.exit(worst === "fail" ? 1 : 0);
