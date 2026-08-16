#!/usr/bin/env node
// Provider-agnostic post generator (Path A — JSON default), built on the Vercel AI SDK.
//
//   node tools/generate.mjs --provider <anthropic|deepseek|gemini|openai> \
//        --brief "your post content / idea" [--id my-post] [--motion] \
//        [--model X] [--out src/posts/generated]
//
// Loads the portable briefing bundle (context/), then uses AI SDK generateObject to
// have the chosen LLM emit a post spec conforming to schemas/infographic.schema.json.
// The AI only fills structured content — it does not write rendering code — so any
// provider can drive the system. See docs/SHIP_PLAN.md and docs/AGENT_HARNESS_PLAN.md.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateObject, jsonSchema, NoObjectGeneratedError } from "ai";
import { assembleBriefing } from "./lib/context.mjs";
import { validate } from "./lib/validate.mjs";
import { resolveModel, providerNames, llmCallSignal, genLoopSignal } from "./lib/model.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = { motion: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--motion") args.motion = true;
    else if (a.startsWith("--")) args[a.slice(2)] = argv[++i];
  }
  return args;
}

function loadDotEnv(text) {
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function buildSystem(briefing, id) {
  return (
    briefing +
    "\n\n<<< OUTPUT CONTRACT >>>\n\n" +
    "You are emitting ONE post specification as a single JSON object conforming to the infographic schema. " +
    "Follow every rule in the briefing: classify the content type, pick the visual format (line charts are NOT the default), " +
    "produce the layout safety map with non-overlapping bounding boxes, plan the three-role color strategy, include the " +
    `mandatory creator signature, and set every qualityChecklist boolean truthfully. Use id "${id}".`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.provider || !args.brief) {
    console.error(
      `Usage: node tools/generate.mjs --provider <${providerNames().join("|")}> --brief "..." [--id my-post] [--motion] [--model X] [--out DIR]`
    );
    process.exit(1);
  }

  try {
    loadDotEnv(await readFile(join(ROOT, ".env"), "utf8"));
  } catch {}

  const { model, modelId } = resolveModel(args.provider, { modelOverride: args.model });
  const schemaObj = JSON.parse(await readFile(join(ROOT, "schemas", "infographic.schema.json"), "utf8"));
  const briefing = await assembleBriefing(ROOT, { motion: args.motion });

  const id = args.id || "generated-post";
  const system = buildSystem(briefing, id);

  const outDir = args.out ? join(ROOT, args.out) : join(ROOT, "src", "posts", "generated");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, `${id}.json`);

  console.error(`→ ${args.provider} (${modelId}) generating "${id}"...`);
  const t0 = Date.now();

  let post;
  try {
    const { object, usage } = await generateObject({
      model,
      schema: jsonSchema(schemaObj),
      system,
      prompt: args.brief,
      maxRetries: 2,
      abortSignal: llmCallSignal(),
    });
    post = object;
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const tok = usage ? ` · ${usage.inputTokens ?? "?"}→${usage.outputTokens ?? "?"} tok` : "";
    console.error(`← received in ${secs}s${tok}`);
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err) && err.text) {
      // The model produced text that didn't validate. Save it raw so it can be inspected/fixed.
      const rawPath = join(outDir, `${id}.raw.txt`);
      await writeFile(rawPath, err.text);
      console.error(`\n✖ model output did not conform to the schema. Raw output saved to ${rawPath}`);
      console.error(`   reason: ${err.cause?.message || err.message}`);
      process.exit(2);
    }
    throw err;
  }

  await writeFile(outPath, JSON.stringify(post, null, 2));
  console.error(`\n✔ wrote ${outPath}`);

  // Secondary readable report (AI SDK already enforced the schema on success).
  const { valid, errors } = validate(schemaObj, post);
  if (valid) {
    console.error("✔ schema-valid");
  } else {
    console.error(`⚠ ${errors.length} schema note(s):`);
    for (const e of errors.slice(0, 25)) console.error(`   - ${e}`);
    if (errors.length > 25) console.error(`   ...and ${errors.length - 25} more`);
  }

  const qc = post.qualityChecklist || {};
  const failing = Object.entries(qc).filter(([, v]) => v === false).map(([k]) => k);
  if (failing.length) {
    console.error(`\n⚠ qualityChecklist not all true (${failing.length}): ${failing.join(", ")}`);
  }
  process.exit(valid ? 0 : 2);
}

main().catch((err) => {
  console.error(`\n✖ ${err.message}`);
  process.exit(1);
});
