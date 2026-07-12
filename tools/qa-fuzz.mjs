#!/usr/bin/env node
// Renderer no-overflow gate (Epic 01 / Sprint 1.1). Runs the full structural + motion
// QA suite over every spec in planning/fixtures/renderfuzz/ and fails if ANY produces an
// error-level finding (overflow, collision, clip, safe-margin breach, missing signature).
//
//   npm run dev          # in another terminal — the inspector needs the dev server
//   npm run qa:fuzz      # gate the whole corpus
//   npm run qa:fuzz -- --motion=false   # structural only (skip multi-frame motion checks)
import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runQA, formatFindings } from "./lib/qa.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS = join(ROOT, "planning", "fixtures", "renderfuzz");

const argv = process.argv.slice(2);
const motion = !argv.includes("--motion=false");

async function main() {
  const files = (await readdir(CORPUS)).filter((f) => f.endsWith(".render.json")).sort();
  if (!files.length) {
    console.error("No fuzz specs found. Run: node tools/make-fuzz-corpus.mjs");
    process.exit(1);
  }

  // each spec carries its own registered id ("fuzz-...")
  const ids = [];
  for (const f of files) {
    const spec = JSON.parse(await readFile(join(CORPUS, f), "utf8"));
    ids.push({ id: spec.id, file: f });
  }

  console.log(`Fuzz QA over ${ids.length} specs (motion=${motion}) — needs dev server at ${process.env.PREVIEW_URL || "http://localhost:5173"}\n`);

  const failures = [];
  for (const { id, file } of ids) {
    let res;
    try {
      res = await runQA(id, { motion });
    } catch (e) {
      res = { pass: false, findings: [{ check: "harness", severity: "error", message: e.message }] };
    }
    const errs = res.findings.filter((x) => x.severity === "error").length;
    const warns = res.findings.filter((x) => x.severity === "warn").length;
    console.log(`${res.pass ? "✔" : "✖"} ${file.padEnd(34)} ${res.pass ? "PASS" : "FAIL"}  (${errs}e/${warns}w)`);
    if (!res.pass) {
      console.log(formatFindings(res.findings.filter((x) => x.severity === "error")).replace(/^/gm, "    "));
      failures.push(file);
    }
  }

  console.log(`\n${failures.length ? "✖" : "✔"} ${ids.length - failures.length}/${ids.length} specs pass the renderer gate.`);
  if (failures.length) {
    console.log(`Failing: ${failures.join(", ")}`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
