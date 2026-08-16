#!/usr/bin/env node
// Provider-agnostic agent harness (Path B — TSX power mode), built on the Vercel AI SDK.
// The model writes a post component, then renders/inspects/fixes it in a loop until it
// passes hard gates (typecheck clean + structural inspector pass). See docs/AGENT_HARNESS_PLAN.md.
//
//   node tools/agent.mjs --provider <anthropic|deepseek|gemini|openai> --brief "..." [--id my-post] [--base URL] [--steps N]
//   node tools/agent.mjs --selftest [--id selftest]      # exercise the machinery without an LLM
//
// Requires the Vite dev server running (npm run dev) so the inspector can render.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateText, stepCountIs } from "ai";
import { assembleBriefing } from "./lib/context.mjs";
import { resolveModel, providerNames, llmCallSignal, genLoopSignal } from "./lib/model.mjs";
import {
  ROOT,
  writePost,
  typecheckPost,
  inspectPost,
  renderPost,
  renderVideo,
} from "./lib/agent-tools.mjs";
import { runQA, findingsForAgent } from "./lib/qa.mjs";
// Contracts + tool set are shared with the Path B service (generate-b.mjs) — one source of truth.
import { TSX_CONTRACT, MOTION_CONTRACT, makePathBTools, targetCanvasLine } from "./lib/generate-b.mjs";

function parseArgs(argv) {
  const BOOL = new Set(["selftest", "motion"]);
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (BOOL.has(key)) args[key] = true;
      else args[key] = argv[++i];
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
    const res = await fetch(base, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

const SELFTEST_POST = `import { PostFrame } from "@/components/layout/PostFrame";
import { Panel } from "@/components/primitives/Panel";
import { MetricCard } from "@/components/primitives/MetricCard";

export default function Post() {
  return (
    <PostFrame
      eyebrow="systems / reliability"
      headline="Reliability compounds. Fragility compounds faster."
      visualization={
        <Panel label="why small per-step failure explodes">
          <div
            className="flex h-full items-center justify-center text-center text-text-secondary"
            style={{ fontSize: 30, lineHeight: 1.3 }}
          >
            99% per step → 90% over 10 steps → 61% over 50 steps.
          </div>
        </Panel>
      }
      summary={
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="per-step success" value="99%" delta="looks safe" accent="cyan" />
          <MetricCard label="over 50 steps" value="61%" delta="compounded" accent="burnt" />
        </div>
      }
    />
  );
}
`;

async function runSelftest(id, base) {
  console.error("● selftest: writing a known-good post, then typecheck + inspect (no LLM)...");
  const wrote = await writePost(id, SELFTEST_POST);
  console.error(`  wrote ${wrote}`);
  const tc = await typecheckPost(id);
  console.error(`  typecheck: ${tc.ok ? "ok" : "FAILED"}`);
  if (!tc.ok) tc.errors.slice(0, 10).forEach((e) => console.error(`    ${e}`));
  console.error("  inspecting (HMR settle)...");
  await new Promise((r) => setTimeout(r, 1500));
  const rep = await inspectPost(id, base);
  console.error(`  inspect.pass: ${rep.pass}`);
  console.error(JSON.stringify(rep, null, 2));
  const ok = tc.ok && rep.pass;
  console.error(`\n${ok ? "✔" : "✖"} selftest ${ok ? "PASSED" : "did not pass"} — the write→typecheck→inspect→gate machinery is wired.`);
  return ok;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const id = args.id || (args.selftest ? "selftest" : "agent-post");
  const base = args.base || process.env.PREVIEW_URL || "http://localhost:5173";

  try {
    loadDotEnv(await readFile(join(ROOT, ".env"), "utf8"));
  } catch {}

  if (!(await devServerReachable(base))) {
    console.error(`✖ dev server not reachable at ${base}. Start it first: npm run dev`);
    process.exit(1);
  }

  if (args.selftest) {
    process.exit((await runSelftest(id, base)) ? 0 : 2);
  }

  if (!args.provider || !args.brief) {
    console.error(`Usage: node tools/agent.mjs --provider <${providerNames().join("|")}> --brief "..." [--id X] [--base URL] [--steps N] [--format portrait|square|vertical]`);
    console.error(`   or: node tools/agent.mjs --selftest`);
    process.exit(1);
  }

  const motion = !!args.motion;
  // Output aspect (portrait 4:5 default · square 1:1 · vertical 9:16) — crosses into the system
  // prompt (TARGET CANVAS) AND the QA inspection so the post is designed + gated at the true size.
  const format = args.format && ["portrait", "square", "vertical"].includes(args.format) ? args.format : undefined;
  if (args.format && !format) {
    console.error(`✖ unknown --format "${args.format}" — use portrait | square | vertical`);
    process.exit(1);
  }
  const { model, modelId } = resolveModel(args.provider, { modelOverride: args.model });
  const briefing = await assembleBriefing(ROOT, { motion });
  const contract = motion ? MOTION_CONTRACT : TSX_CONTRACT;
  const system = `${briefing}\n\n${contract}${targetCanvasLine(format)}\n\nUse id "${id}" for the post file.`;
  const { tools, isDone } = makePathBTools(id, base, { brief: args.brief, motion, provider: args.provider, format });
  const maxSteps = Number(args.steps || 24);

  console.error(`→ ${args.provider} (${modelId}) building ${motion ? "VIDEO" : "still"} "${id}" — up to ${maxSteps} steps...`);
  const t0 = Date.now();

  const result = await generateText({
    model,
    system,
    prompt: args.brief,
    tools,
    stopWhen: [stepCountIs(maxSteps), () => isDone()],
    abortSignal: genLoopSignal(),
  });

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.error(`\nloop ended in ${secs}s over ${result.steps.length} step(s).`);

  // Salvage: the loop may have stopped (step cap / model stopped calling tools) on a
  // version that actually passes both gates without an explicit finish. Re-verify.
  let success = isDone();
  if (!success) {
    const tc = await typecheckPost(id);
    // format must reach the salvage gate too — omitting it re-verified square/vertical posts at portrait.
    const qa = await runQA(id, { base, motion, judge: true, vision: true, brief: args.brief, format });
    success = tc.ok && qa.pass;
    if (success) console.error("✔ final gate check passed (loop ended before an explicit finish).");
    else console.error("findings:\n" + findingsForAgent(qa.findings));
  }

  if (success) {
    // Non-portrait aspects ride the <id>.meta.json sidecar (generated.tsx reads it to size the
    // composition) — without it the preview screenshot AND the Remotion MP4 silently render portrait.
    if (format && format !== "portrait") {
      await writeFile(join(ROOT, "src", "posts", "generated", `${id}.meta.json`), JSON.stringify({ id, format }));
      console.error(`→ wrote ${id}.meta.json (format: ${format})`);
    }
    const outPng = join(ROOT, "out", `${id}.png`);
    await renderPost(id, outPng, base);
    console.error(`✔ post passed gates → src/posts/generated/${id}.tsx · final-frame screenshot: out/${id}.png`);
    if (motion) {
      console.error(`→ rendering MP4 via Remotion...`);
      const mp4 = await renderVideo(id);
      console.error(`✔ video rendered: ${mp4}`);
    }
  } else {
    console.error(`⚠ did not converge in ${maxSteps} steps. Inspect src/posts/generated/${id}.tsx and re-run, or fall back to Path A (npm run generate).`);
  }
  process.exit(success ? 0 : 2);
}

main().catch((err) => {
  console.error(`\n✖ ${err.message}`);
  process.exit(1);
});
