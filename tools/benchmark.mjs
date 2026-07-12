#!/usr/bin/env node
// A/B testbench runner — the production-decision tool.
// Runs the SAME briefs through BOTH engines (Path A = JSON renderer, Path B = TSX agent) across
// EVERY model whose key is present, renders each to an MP4, and records metrics. The output feeds
// tools/bench-gallery.mjs, where Emil judges final video quality side-by-side (the primary signal);
// the metrics here (QA pass, generate/render time, tokens, iterations) are supporting depth.
//
//   npm run dev                       # the layout inspector (both paths) needs the dev server
//   node tools/benchmark.mjs [--briefs a,b] [--providers anthropic,deepseek] [--paths A,B]
//                            [--models anthropic=claude-opus-4-8,...] [--resume] [--no-gallery]
//                            [--still]            # build stills instead of videos (faster, cheaper)
//
// Defaults: all 8 on-brand briefs × every provider with a working key × both paths × video.
// Robust by cell: a failed cell is recorded and the run continues. Writes the manifest after every
// cell, so --resume picks up where a crash left off.
import { readFile, writeFile, mkdir, readdir, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { generatePost } from "./lib/generate.mjs";
import { generatePostB } from "./lib/generate-b.mjs";
import { providerNames, modelIdFor } from "./lib/model.mjs";
import { buildGallery } from "./bench-gallery.mjs";

const pexecShell = promisify(exec);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BRIEF_DIR = join(ROOT, "planning", "fixtures", "briefs", "good");
const GEN_DIR = join(ROOT, "src", "posts", "generated");
const OUT_DIR = join(ROOT, "out", "bench");
const SPEC_DIR = join(OUT_DIR, "specs");
const MANIFEST = join(OUT_DIR, "manifest.json");
const BASE = process.env.PREVIEW_URL || "http://localhost:5173";
const RENDER_TIMEOUT_MS = Number(process.env.BENCH_RENDER_TIMEOUT_MS || 900000);

// Which env var signals a provider is usable. (vertex has two credential modes.)
const KEY_ENV = {
  anthropic: () => !!process.env.ANTHROPIC_API_KEY,
  openai: () => !!process.env.OPENAI_API_KEY,
  deepseek: () => !!process.env.DEEPSEEK_API_KEY,
  gemini: () => !!process.env.GEMINI_API_KEY,
  compatible: () => !!process.env.COMPATIBLE_API_KEY,
  vertex: () => !!(process.env.GOOGLE_VERTEX_API_KEY || process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_VERTEX_PROJECT),
};

function parseArgs(argv) {
  const args = { paths: ["A", "B"], resume: false, gallery: true, still: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--resume") args.resume = true;
    else if (a === "--no-gallery") args.gallery = false;
    else if (a === "--still") args.still = true;
    else if (a === "--briefs") args.briefs = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--providers") args.providers = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--paths") args.paths = argv[++i].split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    else if (a === "--models") {
      args.models = {};
      for (const pair of argv[++i].split(",")) {
        const [p, m] = pair.split("=");
        if (p && m) args.models[p.trim()] = m.trim();
      }
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

const sanitizeId = (s) => s.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

async function loadBriefs(filter) {
  const files = (await readdir(BRIEF_DIR)).filter((f) => f.endsWith(".txt"));
  const briefs = [];
  for (const f of files) {
    const slug = f.replace(/\.txt$/, "");
    if (filter && !filter.includes(slug)) continue;
    briefs.push({ slug, text: (await readFile(join(BRIEF_DIR, f), "utf8")).trim() });
  }
  return briefs;
}

async function devServerReachable() {
  try {
    return (await fetch(BASE, { method: "GET" })).ok;
  } catch {
    return false;
  }
}

// Render the just-generated composition (Path A .render.json or Path B .tsx) to an MP4 via the
// generic Remotion root. The composition id == the generated-file basename.
async function renderMp4(id, outPath) {
  await pexecShell(`npm run remotion:render:gen -- ${id} ${outPath}`, {
    cwd: ROOT,
    timeout: RENDER_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  return outPath;
}

// Move the generated spec out of src/posts/generated so the next render's bundle stays tiny
// (the Remotion root globs that whole dir). Keep the spec for reference under out/bench/specs.
async function archiveSpec(id) {
  for (const ext of [".tsx", ".render.json"]) {
    const from = join(GEN_DIR, id + ext);
    if (existsSync(from)) {
      await rename(from, join(SPEC_DIR, id + ext)).catch(() => {});
    }
  }
}

// Remove a cell's generated spec/draft from src/posts/generated (e.g. a partial Path B draft left
// by a tool call before a provider error — not a real output).
async function cleanSpec(id) {
  for (const ext of [".tsx", ".render.json"]) {
    await rm(join(GEN_DIR, id + ext), { force: true }).catch(() => {});
  }
}

async function cleanBenchSpecs() {
  if (!existsSync(GEN_DIR)) return;
  for (const f of await readdir(GEN_DIR)) {
    if (f.startsWith("bench-")) await rm(join(GEN_DIR, f), { force: true }).catch(() => {});
  }
}

async function loadManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    loadDotEnv(await readFile(join(ROOT, ".env"), "utf8"));
  } catch {}

  const motion = !args.still;
  await mkdir(SPEC_DIR, { recursive: true });

  // Providers: explicit --providers, else every registered provider whose key is present.
  const all = providerNames();
  let providers = args.providers || all.filter((p) => (KEY_ENV[p] ? KEY_ENV[p]() : false));
  providers = providers.filter((p) => all.includes(p));
  const missingKey = providers.filter((p) => KEY_ENV[p] && !KEY_ENV[p]());
  if (missingKey.length) console.error(`⚠ no key for: ${missingKey.join(", ")} — those cells will record provider_error`);
  if (!providers.length) {
    console.error("✖ no providers selected. Add a key to .env or pass --providers. Keys checked: " + Object.keys(KEY_ENV).join(", "));
    process.exit(1);
  }

  const briefs = await loadBriefs(args.briefs);
  if (!briefs.length) {
    console.error(`✖ no briefs found in ${BRIEF_DIR}` + (args.briefs ? ` matching ${args.briefs.join(",")}` : ""));
    process.exit(1);
  }

  if (!(await devServerReachable())) {
    console.error(`✖ dev server not reachable at ${BASE}. Both paths need it for the QA inspector. Start it: npm run dev`);
    process.exit(1);
  }

  // Resume: keep prior cells; recompute everything else.
  const prior = args.resume ? await loadManifest() : null;
  const priorCells = new Map((prior?.cells || []).map((c) => [c.id, c]));
  if (!args.resume) await cleanBenchSpecs();

  // Resolve the CONCRETE model id per provider (override → env → registry default) so the gallery
  // shows the tier (e.g. "deepseek-v4-pro") and the model used always equals the model displayed.
  const models = providers.map((p) => ({ provider: p, model: modelIdFor(p, args.models?.[p]) }));
  const total = briefs.length * models.length * args.paths.length;
  console.error(
    `▶ A/B testbench — ${briefs.length} brief(s) × ${models.length} model(s) × ${args.paths.join("/")} = ${total} cell(s) · ${motion ? "video" : "still"}\n` +
      `  providers: ${providers.join(", ")}\n` +
      `  briefs: ${briefs.map((b) => b.slug).join(", ")}`
  );

  const manifest = {
    generatedAt: new Date().toISOString(),
    motion,
    base: BASE,
    models,
    briefs: briefs.map((b) => ({ slug: b.slug, text: b.text })),
    cells: [],
  };

  let n = 0;
  for (const brief of briefs) {
    for (const { provider, model } of models) {
      for (const path of args.paths) {
        n++;
        const id = sanitizeId(`bench-${path}-${brief.slug}-${provider}`);
        const tag = `[${n}/${total}] ${path} · ${provider} · ${brief.slug}`;

        // Resume only SKIPS a cell that produced a video (a real result). Cells that failed to
        // generate (provider_error / error / no mp4) are retried — a credit top-up or transient
        // outage should not be frozen into the manifest.
        if (args.resume && priorCells.get(id)?.mp4) {
          const c = priorCells.get(id);
          manifest.cells.push(c);
          await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
          console.error(`  ⏭  ${tag} — resumed (${c.status})`);
          continue;
        }

        console.error(`\n● ${tag}`);
        const cell = { id, brief: brief.slug, path, provider, model, status: null, qaPass: null, iterations: 0, tokens: 0, genMs: 0, renderMs: 0, mp4: null, error: null };
        const log = (m) => process.stderr.write(`    ${m}\n`);
        const t0 = Date.now();
        try {
          const gen =
            path === "A"
              ? await generatePost({ brief: brief.text, provider, model, root: ROOT, id, base: BASE, opts: { motion, judge: true, log } })
              : await generatePostB({ brief: brief.text, provider, model, root: ROOT, id, base: BASE, opts: { motion, judge: true, log } });
          cell.genMs = Date.now() - t0;
          cell.status = gen.status;
          cell.iterations = gen.iterations ?? 0;
          cell.tokens = gen.tokens ?? 0;
          cell.qaPass = gen.qa ? !!gen.qa.pass : gen.status === "ok";
          cell.reason = gen.reason || null;

          // Render only a REAL generation attempt (passed QA, or honestly failed QA — both are
          // outputs worth seeing). A provider_error may have left a partial draft on disk from a
          // tool call before the API died; that is NOT a Path B result — clean it, don't render it.
          const realAttempt = gen.status === "ok" || gen.status === "qa_failed";
          const specExists = existsSync(join(GEN_DIR, id + ".tsx")) || existsSync(join(GEN_DIR, id + ".render.json"));
          if (realAttempt && specExists) {
            const mp4 = join(OUT_DIR, id + ".mp4");
            const r0 = Date.now();
            try {
              await renderMp4(id, mp4);
              cell.renderMs = Date.now() - r0;
              cell.mp4 = id + ".mp4"; // relative to out/bench (gallery lives there)
              log(`rendered ${id}.mp4 in ${(cell.renderMs / 1000).toFixed(0)}s`);
            } catch (e) {
              cell.renderMs = Date.now() - r0;
              cell.error = `render: ${String(e.message || e).split("\n")[0].slice(0, 200)}`;
              log(`✖ render failed: ${cell.error}`);
            }
            await archiveSpec(id);
          } else {
            // discard any partial draft so it can't pollute a later bundle or be mistaken for output
            await cleanSpec(id);
            log(`no usable output (${gen.status}${gen.reason ? ": " + gen.reason : ""}) — nothing to render`);
          }
        } catch (e) {
          cell.genMs = Date.now() - t0;
          cell.status = "error";
          cell.error = String(e.message || e).split("\n")[0].slice(0, 200);
          console.error(`    ✖ ${cell.error}`);
        }
        manifest.cells.push(cell);
        await writeFile(MANIFEST, JSON.stringify(manifest, null, 2)); // incremental — crash-safe
      }
    }
  }

  // Final authoritative write — guarantees the file matches the full in-memory manifest even when
  // the last cells were resume-skipped.
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));

  // Summary
  const ok = manifest.cells.filter((c) => c.status === "ok").length;
  const withVideo = manifest.cells.filter((c) => c.mp4).length;
  console.error(`\n✔ done — ${ok}/${total} passed QA · ${withVideo}/${total} produced a video · manifest: out/bench/manifest.json`);

  if (args.gallery) {
    const html = await buildGallery(manifest, OUT_DIR);
    console.error(`✔ gallery: ${html}\n  view it:  node tools/bench-serve.mjs   (then open the printed URL)`);
  }
}

main().catch((err) => {
  console.error(`\n✖ ${err.stack || err.message}`);
  process.exit(1);
});
