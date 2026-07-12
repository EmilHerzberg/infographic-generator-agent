#!/usr/bin/env node
// Triage calibration (Epic 02 / Sprint 2.1 DoD). Runs the deterministic triage over the labeled
// brief corpus and asserts: 0 false-rejects on the good set, the bad set is classified as its
// filename declares (`<decision>-<code>.txt`), and every check runs <50ms with no LLM call.
//
//   npm run triage:eval
import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { triage } from "./lib/triage.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "planning", "fixtures", "briefs");
const codesOf = (r) => r.reasons.map((x) => x.code);

function timed(brief) {
  const t0 = process.hrtime.bigint();
  const res = triage(brief);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { res, ms };
}

let fail = 0;
let falseRejects = 0;
let maxMs = 0;

const goodFiles = (await readdir(join(DIR, "good"))).filter((f) => f.endsWith(".txt")).sort();
for (const f of goodFiles) {
  const { res, ms } = timed(await readFile(join(DIR, "good", f), "utf8"));
  maxMs = Math.max(maxMs, ms);
  if (res.decision !== "accept") {
    falseRejects++;
    fail++;
    console.log(`✖ good/${f}: expected accept, got ${res.decision} [${codesOf(res)}]`);
  } else {
    console.log(`✔ good/${f}: accept (${ms.toFixed(2)}ms)`);
  }
}

const badFiles = (await readdir(join(DIR, "bad"))).filter((f) => f.endsWith(".txt")).sort();
for (const f of badFiles) {
  const base = f.replace(/\.txt$/, "");
  const dash = base.indexOf("-");
  const expDecision = base.slice(0, dash);
  const expCode = base.slice(dash + 1);
  const { res, ms } = timed(await readFile(join(DIR, "bad", f), "utf8"));
  maxMs = Math.max(maxMs, ms);
  const ok = res.decision === expDecision && codesOf(res).includes(expCode);
  if (!ok) {
    fail++;
    console.log(`✖ bad/${f}: expected ${expDecision}/${expCode}, got ${res.decision} [${codesOf(res)}]`);
  } else {
    console.log(`✔ bad/${f}: ${res.decision} (${expCode}) (${ms.toFixed(2)}ms)`);
  }
}

// Synthetic edges that are awkward as committed files.
const edges = [
  { name: "empty", brief: "   \n  ", expect: "reject", code: "empty" },
  { name: "paste-bomb", brief: "automation reliability compounds ".repeat(250), expect: "reject", code: "too_long_chars" },
];
for (const e of edges) {
  const { res, ms } = timed(e.brief);
  maxMs = Math.max(maxMs, ms);
  const ok = res.decision === e.expect && codesOf(res).includes(e.code);
  if (!ok) {
    fail++;
    console.log(`✖ edge/${e.name}: expected ${e.expect}/${e.code}, got ${res.decision} [${codesOf(res)}]`);
  } else {
    console.log(`✔ edge/${e.name}: ${res.decision} (${e.code}) (${ms.toFixed(2)}ms)`);
  }
}

if (maxMs >= 50) {
  fail++;
  console.log(`✖ latency: max ${maxMs.toFixed(2)}ms exceeds the 50ms budget`);
}

console.log(`\nfalse-rejects on good set: ${falseRejects} · max latency: ${maxMs.toFixed(2)}ms · ${fail ? `✖ ${fail} failure(s)` : "✔ all pass"}`);
process.exit(fail ? 1 : 0);
