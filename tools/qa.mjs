#!/usr/bin/env node
// Standalone QA runner / CI gate.
//   node tools/qa.mjs <post-id> [--judge --brief "..."] [--vision]
// Structural checks need only the dev server (npm run dev). --judge / --vision call an LLM
// (keys from .env). Exits non-zero if any error-level finding is present.
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runQA, formatFindings } from "./lib/qa.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const BOOL = new Set(["judge", "vision", "motion"]);
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x.startsWith("--")) {
      const k = x.slice(2);
      if (BOOL.has(k)) a[k] = true;
      else a[k] = argv[++i];
    } else if (!a.id) a.id = x;
  }
  return a;
}

function loadDotEnv(text) {
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const args = parseArgs(process.argv.slice(2));
if (!args.id) {
  console.error('Usage: node tools/qa.mjs <post-id> [--judge --brief "..."] [--vision]');
  process.exit(1);
}
try {
  loadDotEnv(await readFile(join(ROOT, ".env"), "utf8"));
} catch {}

const { findings, pass } = await runQA(args.id, {
  judge: args.judge,
  vision: args.vision,
  motion: args.motion,
  brief: args.brief,
});

const n = (sev) => findings.filter((f) => f.severity === sev).length;
console.log(`QA report for "${args.id}":`);
console.log(formatFindings(findings));
console.log(`\n${pass ? "✔ PASS (no errors)" : "✖ FAIL"} — ${n("error")} error(s), ${n("warn")} warn(s), ${n("info")} info(s)`);
process.exit(pass ? 0 : 2);
