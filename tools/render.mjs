#!/usr/bin/env node
// Path A generator CLI — a thin wrapper over the generatePost() service (tools/lib/generate.mjs).
// A model emits a RenderPost (validated JSON), the fixed PostRenderer turns it into pixels, and a
// self-correcting QA loop gates it (structural + motion + data-fidelity judge [+ vision]). Findings
// are classified (docs/QA_TAXONOMY.md): model-fixable → regenerate; renderer-fixable → stop + flag.
//
//   node tools/render.mjs --provider <anthropic|deepseek|gemini|openai|vertex> --brief "..." [--id my-post]
//   flags: --once (single-shot, no gate) --vision --no-judge --max-iter N --token-budget N --motion --base URL
//          --kinds a,b,c (PL-0.5: prune the viz union to these kinds — exercises the Anthropic per-request selector)
//
// The gated loop needs the Vite dev server (npm run dev). Writes src/posts/generated/<id>.render.json.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateObject, jsonSchema, NoObjectGeneratedError } from "ai";
import { resolveModel, providerNames, llmCallSignal, genLoopSignal } from "./lib/model.mjs";
import { assembleBriefing } from "./lib/context.mjs";
import { loadRenderSchema, schemaForProvider } from "./lib/render-schema.mjs";
import { formatFindings } from "./lib/qa.mjs";
import { generatePost, RENDER_CONTRACT } from "./lib/generate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const BOOL = new Set(["once", "vision", "no-judge", "motion"]);
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      if (BOOL.has(k)) args[k] = true;
      else args[k] = argv[++i];
    }
  }
  return args;
}
function loadDotEnv(text) {
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
async function devServerReachable(base) {
  try {
    return (await fetch(base, { method: "GET" })).ok;
  } catch {
    return false;
  }
}

async function runOnce({ provider, modelId, id, brief, format }) {
  // Single-shot, ungated — quick drafting / offline use.
  const base$ = await loadRenderSchema(ROOT);
  const schema = schemaForProvider(base$, provider);
  const briefing = await assembleBriefing(ROOT, { motion: false });
  const { model } = resolveModel(provider, { modelOverride: modelId });
  const system = `${briefing}\n\n${RENDER_CONTRACT}\n\nUse id "${id}".`;
  const outDir = join(ROOT, "src", "posts", "generated");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, `${id}.render.json`);
  try {
    const { object } = await generateObject({ model, schema: jsonSchema(schema), system, prompt: brief, maxRetries: 2, abortSignal: llmCallSignal() });
    object.id = id;
    if (format && format !== "portrait") object.format = format; // stamp the chosen aspect (absent ⇒ portrait)
    await writeFile(outPath, JSON.stringify(object, null, 2));
    console.error(`✔ wrote ${outPath} (single-shot, no gate). QA it: npm run qa -- ${id}`);
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err) && err.text) {
      await writeFile(join(outDir, `${id}.raw.txt`), err.text);
      console.error(`✖ output did not conform; raw saved to ${id}.raw.txt`);
      process.exit(2);
    }
    throw err;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.provider || !args.brief) {
    console.error(`Usage: node tools/render.mjs --provider <${providerNames().join("|")}> --brief "..." [--id my-post]`);
    console.error(`  flags: --once (single-shot, no gate) --vision --no-judge --max-iter N --token-budget N --motion --base URL --format portrait|square|vertical`);
    process.exit(1);
  }
  try {
    loadDotEnv(await readFile(join(ROOT, ".env"), "utf8"));
  } catch {}
  const id = args.id || "render-post";
  const { modelId } = resolveModel(args.provider, { modelOverride: args.model });
  // Validate --format loudly — a typo ("sqare") must not silently produce a portrait post.
  if (args.format && !["portrait", "square", "vertical"].includes(args.format)) {
    console.error(`✖ unknown --format "${args.format}" — use portrait | square | vertical`);
    process.exit(1);
  }

  if (args.once) {
    console.error(`→ ${args.provider} (${modelId}) generating "${id}" (single-shot, no gate)...`);
    await runOnce({ provider: args.provider, modelId: args.model, id, brief: args.brief, format: args.format });
    return;
  }

  const base = args.base || process.env.PREVIEW_URL || "http://localhost:5173";
  if (!(await devServerReachable(base))) {
    console.error(`✖ the QA gate needs the Vite dev server. Start it (npm run dev) then re-run, or use --once to skip the gate.`);
    process.exit(1);
  }

  const opts = {
    maxIter: Number(args["max-iter"] || 4),
    tokenBudget: Number(args["token-budget"] || 220000),
    judge: !args["no-judge"],
    vision: !!args.vision,
    motion: !!args.motion,
    log: (m) => console.error(m),
  };
  // PL-0.5 — optional --kinds passthrough lets an operator exercise the per-request viz-kind selector
  // path (e.g. --kinds bar,comparison,stat to author a bar on Anthropic). Omitted ⇒ today's default
  // (Anthropic default-8 prune; others all-15).
  const vizKinds = args.kinds ? args.kinds.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  console.error(`→ ${args.provider} (${modelId}) generating + gating "${id}" — up to ${opts.maxIter} iterations` +
    ` (judge=${opts.judge}, vision=${opts.vision}, motion=${opts.motion}${vizKinds ? `, kinds=${vizKinds.join(",")}` : ""})...`);
  const t0 = Date.now();
  // CLI use: apiKey omitted → the service falls back to the provider's env key.
  const res = await generatePost({ brief: args.brief, provider: args.provider, model: args.model, root: ROOT, id, base, vizKinds, format: args.format, opts });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  if (res.status === "ok") {
    console.error(`\n✔ PASS in ${res.iterations} iteration(s) · ${secs}s · ${res.tokens} tok → src/posts/generated/${id}.render.json`);
    console.error(`  preview/QA: npm run qa -- ${id}    (render: npm run remotion:render:gen -- ${id} out/${id}.mp4)`);
    process.exit(0);
  }

  console.error(`\n✖ DID NOT PASS (${res.reason}) after ${res.iterations} iteration(s) · ${secs}s · ${res.tokens} tok`);
  if (res.reason === "renderer_blocked") {
    console.error(`  Renderer-fixable findings (need an engineering fix, not regeneration):`);
    console.error(formatFindings(res.rendererFindings));
    console.error(`  → file a renderer hardening task; see docs/QA_TAXONOMY.md.`);
  } else if (res.qa) {
    console.error(formatFindings(res.qa.findings.filter((f) => f.severity === "error")));
  }
  if (res.reason === "max_iterations") console.error(`  → could not satisfy the gate in ${opts.maxIter} tries (brief may be too dense — reduce scope).`);
  if (res.reason === "token_budget") console.error(`  → token budget (${opts.tokenBudget}) exhausted.`);
  if (res.status === "provider_error") console.error(`  → provider error: ${res.reason}`);
  process.exit(2);
}

main().catch((err) => {
  console.error(`\n✖ ${err.message}`);
  process.exit(1);
});
