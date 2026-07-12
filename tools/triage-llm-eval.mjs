#!/usr/bin/env node
// LLM triage calibration (Epic 02 / Sprint 2.2 DoD). Runs the BYOK LLM triage over the labeled
// good set (false-reject must be <5%) plus the three spec test cases (off-brand promo → reject,
// multi-idea → revise, strong single idea → accept). Uses a cheap model by default.
//
//   npm run triage:llm-eval            # default provider deepseek
//   npm run triage:llm-eval -- --provider anthropic
import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { triageLLM } from "./lib/triage.mjs";
import { loadBrandPurpose } from "./lib/context.mjs";

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

const provider = (process.argv.includes("--provider") && process.argv[process.argv.indexOf("--provider") + 1]) || "deepseek";
const purpose = await loadBrandPurpose(ROOT);
const judge = (brief) => triageLLM({ brief, provider, root: ROOT, purpose });

console.log(`LLM triage calibration — provider ${provider}\n`);

// Good set — must not be rejected (false-reject < 5%).
const goodDir = join(ROOT, "planning", "fixtures", "briefs", "good");
const goodFiles = (await readdir(goodDir)).filter((f) => f.endsWith(".txt")).sort();
let rejects = 0;
for (const f of goodFiles) {
  const brief = await readFile(join(goodDir, f), "utf8");
  const v = await judge(brief);
  if (v.decision === "reject") rejects++;
  console.log(`${v.decision === "reject" ? "✖" : "✔"} good/${f}: ${v.decision} (fit=${v.fitsPurpose}, scope=${v.scope})`);
}
const falseRejectRate = rejects / goodFiles.length;

// Spec test cases.
const cases = [
  { name: "off-brand promo", brief: "Buy my new productivity course! 50% off this week only — sign up now and 10x your output with these 5 simple morning-routine hacks. Link in bio.", expect: "reject" },
  { name: "three ideas", brief: "AI reliability compounds downward across steps, and also single-agent beats multi-agent for most automation, plus BYOK changes how you price an AI product entirely.", expect: "revise" },
  { name: "strong single idea", brief: "Reliability compounds downward: twenty steps at 99% each chain to 81.8% end-to-end, which is why per-step accuracy is the wrong thing to optimize.", expect: "accept" },
];

// File-backed cases that are LLM-ONLY judgments (the deterministic stage can't make them — e.g.
// breadth, which is semantic, not length-based). Named `<decision>-<label>.txt`. These used to live
// in bad/ as deterministic too_broad cases; PL-0.6 moved breadth detection to the LLM `scope` field.
const llmOnlyDir = join(ROOT, "planning", "fixtures", "briefs", "bad-llm");
try {
  for (const f of (await readdir(llmOnlyDir)).filter((x) => x.endsWith(".txt")).sort()) {
    cases.push({ name: `bad-llm/${f}`, brief: await readFile(join(llmOnlyDir, f), "utf8"), expect: f.split("-")[0] });
  }
} catch {}
console.log("");
let caseFail = 0;
for (const c of cases) {
  const v = await judge(c.brief);
  const ok = v.decision === c.expect;
  if (!ok) caseFail++;
  console.log(`${ok ? "✔" : "✖"} ${c.name}: ${v.decision} (expected ${c.expect}) — ${v.suggestion?.slice(0, 80) || ""}`);
}

const pass = falseRejectRate < 0.05 && caseFail === 0;
console.log(`\nfalse-reject on good set: ${(falseRejectRate * 100).toFixed(1)}% (${rejects}/${goodFiles.length}) · test cases: ${cases.length - caseFail}/${cases.length} · ${pass ? "✔ pass" : "✖ FAIL"}`);
process.exit(pass ? 0 : 1);
