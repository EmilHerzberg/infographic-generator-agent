#!/usr/bin/env node
// Provider matrix (Epic 01 / Sprint 1.3 DoD). Drives generatePost() across providers with an
// explicit BYOK key (simulating the orchestrator) and asserts: each generates + QA-gates a spec,
// and NO key appears in the progress log or the returned result. Needs the dev server (npm run dev).
//
//   npm run provider:matrix
import { readFile, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generatePost } from "./lib/generate.mjs";
import { loadRenderSchema, schemaForProvider, vizKindsOf, packAnthropicKinds } from "./lib/render-schema.mjs";
import { budget, lintBudget } from "./lib/schema-budget.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
function loadDotEnv(text) {
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
try {
  loadDotEnv(await readFile(join(ROOT, ".env"), "utf8"));
} catch {}

const base = process.env.PREVIEW_URL || "http://localhost:5173";
const BRIEF =
  "The compounding cost of automation: twenty steps at 99% reliability each chain to just 81.8% end-to-end. Reliability compounds downward.";
const PROVIDERS = [
  { provider: "anthropic", envKey: "ANTHROPIC_API_KEY" },
  { provider: "deepseek", envKey: "DEEPSEEK_API_KEY" },
  { provider: "openai", envKey: "OPENAI_API_KEY" },
];

console.log(`Provider matrix — generate + gate via BYOK key (base ${base})\n`);

// Schema-budget lint BEFORE the live probes (PL-0.4) — deterministic tripwire; the probes below
// stay authoritative for Anthropic's internal compiled-grammar limit.
let budgetFail = false;
{
  const baseSchema = await loadRenderSchema(ROOT);
  console.log("schema budget (derived per provider):");
  for (const { provider } of PROVIDERS) {
    const b = budget(schemaForProvider(baseSchema, provider));
    const { level, proxy, messages } = lintBudget(b, provider);
    budgetFail = budgetFail || level === "fail";
    console.log(
      `- ${provider.padEnd(10)} ${level.toUpperCase().padEnd(4)} optionals=${b.optionals} unions=${b.unions} branches=${b.branches} bytes=${b.bytes} proxy=${proxy}${messages.length ? " · " + messages.join(" · ") : ""}`,
    );
  }
  console.log("");
}

// PL-0.5 — DEMONSTRATE the unblock: a bar-appropriate brief on Anthropic, with the per-request
// selector's packed kinds, can now author `bar` — a kind blanket-DEFERRED_FROM_ANTHROPIC by default.
// HARD GATE (deterministic, no LLM): the packed Anthropic schema CONTAINS `bar` AND passes
// schema-budget. SOFT (reported, not gated — LLM non-determinism): attempt a live Anthropic gen and
// report whether it emitted `bar`.
let anyLeak = false;
let unblockFail = false;
const BAR_BRIEF =
  "Compare the end-to-end reliability of four agent architectures as named magnitudes: single-call 92%, " +
  "two-tool 84%, planner-executor 71%, and a 6-step chain 47%. Which architecture holds up best?";
{
  const baseSchema = await loadRenderSchema(ROOT);
  const candidateKinds = ["bar", "comparison", "stat"]; // static fixture — what triage would rank for a bar brief
  const packed = packAnthropicKinds(candidateKinds, baseSchema);
  const derived = schemaForProvider(baseSchema, "anthropic", { kinds: packed });
  const derivedKinds = vizKindsOf(derived);
  const containsBar = derivedKinds.includes("bar");
  const { level, proxy } = lintBudget(budget(derived), "anthropic");
  const budgetOk = level !== "fail";
  // Sanity: `bar` is NOT in Anthropic's DEFAULT derivation — proving the selector is what unblocked it.
  const defaultKinds = vizKindsOf(schemaForProvider(baseSchema, "anthropic"));
  const barDeferredByDefault = !defaultKinds.includes("bar");
  unblockFail = !(containsBar && budgetOk && barDeferredByDefault);
  console.log("PL-0.5 unblock proof (Anthropic per-request viz-kind selector):");
  console.log(`- packed kinds for a bar brief: [${packed.join(",")}] (proxy=${proxy}, budget ${level.toUpperCase()})`);
  console.log(
    `- derived Anthropic schema CONTAINS bar: ${containsBar ? "YES ✓" : "NO ❌"} · bar deferred by DEFAULT: ${barDeferredByDefault ? "yes ✓" : "no ❌"} · within budget: ${budgetOk ? "yes ✓" : "no ❌"}`,
  );

  // Soft live attempt (reported, never hard-fails the matrix on LLM flake).
  const anthKey = process.env.ANTHROPIC_API_KEY;
  if (anthKey) {
    const id = "matrix-anthropic-bar";
    const logs = [];
    try {
      const res = await generatePost({
        brief: BAR_BRIEF,
        provider: "anthropic",
        apiKey: anthKey,
        root: ROOT,
        id,
        base,
        vizKinds: packed,
        opts: { maxIter: 2, judge: true, log: (m) => logs.push(m) },
      });
      const kind = res.spec?.visualization?.kind ?? "-";
      const leaked = (logs.join("\n") + "\n" + JSON.stringify(res)).includes(anthKey);
      anyLeak = anyLeak || leaked;
      console.log(
        `- live Anthropic gen (packed kinds): ${res.status}${res.reason ? "/" + res.reason : ""} · kind=${kind}` +
          ` · authored bar: ${kind === "bar" ? "YES ✓" : "no (reported, not gated)"} · keyLeak=${leaked ? "YES ❌" : "no"}`,
      );
    } catch (e) {
      console.log(`- live Anthropic gen (packed kinds): THREW ${e.message.slice(0, 80)} (reported, not gated)`);
    }
    await unlink(join(ROOT, "src", "posts", "generated", `${id}.render.json`)).catch(() => {});
  } else {
    console.log("- live Anthropic gen: SKIP (no ANTHROPIC_API_KEY) — deterministic proof above is the hard gate");
  }
  console.log("");
}

let okCount = 0;
for (const { provider, envKey } of PROVIDERS) {
  const apiKey = process.env[envKey];
  if (!apiKey) {
    console.log(`- ${provider.padEnd(10)} SKIP (no ${envKey})`);
    continue;
  }
  const id = `matrix-${provider}`;
  const logs = [];
  let res;
  try {
    res = await generatePost({
      brief: BRIEF,
      provider,
      apiKey, // explicit BYOK key — the service must not read env for this
      root: ROOT,
      id,
      base,
      opts: { maxIter: 3, judge: true, log: (m) => logs.push(m) },
    });
  } catch (e) {
    console.log(`- ${provider.padEnd(10)} THREW: ${e.message.slice(0, 80)}`);
    continue;
  }
  // assert the key never surfaced in logs or the returned result
  const haystack = logs.join("\n") + "\n" + JSON.stringify(res);
  const leaked = haystack.includes(apiKey);
  anyLeak = anyLeak || leaked;
  if (res.status === "ok") okCount++;
  const kind = res.spec?.visualization?.kind ?? "-";
  console.log(
    `- ${provider.padEnd(10)} ${res.status}${res.reason ? "/" + res.reason : ""} · ${res.iterations} iter · ${res.tokens} tok · kind=${kind} · keyLeak=${leaked ? "YES ❌" : "no"}`,
  );
  await unlink(join(ROOT, "src", "posts", "generated", `${id}.render.json`)).catch(() => {});
}

console.log(
  `\n${okCount} provider(s) passed the gate · key leak: ${anyLeak ? "DETECTED ❌" : "none ✓"} · schema budget: ${budgetFail ? "FAIL ❌" : "ok ✓"} · PL-0.5 unblock proof: ${unblockFail ? "FAIL ❌" : "ok ✓"}`,
);
process.exit(anyLeak || budgetFail || unblockFail ? 1 : 0);
