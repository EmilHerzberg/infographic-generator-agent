#!/usr/bin/env node
// Regression gate — known-good posts must stay green (no error findings) under the
// deterministic checks (structural + motion; no LLM). Run after any threshold/check
// change so calibration tweaks can't silently start rejecting good designs.
// Requires the dev server (npm run dev).
import { runQA, formatFindings } from "./lib/qa.mjs";

// Known-good anchors that must stay green. Two independently-generated clean posts
// (different models, different designs). NOTE: the legacy hand-built
// "ai-prediction-graveyard" is intentionally excluded — the QA system correctly flags it
// as ~16px over the frame (content overflow at the strict 64px margins). It predates these
// standards; run `npm run qa -- ai-prediction-graveyard` to see the finding.
const FIXTURES = [
  { id: "compounding-failure-rate", motion: true },
  { id: "compounding-failure-rate-deepseek-v4", motion: true },
];

let failed = 0;
for (const fx of FIXTURES) {
  try {
    const { findings, pass } = await runQA(fx.id, { motion: fx.motion });
    const errs = findings.filter((f) => f.severity === "error");
    console.log(`${pass ? "✔" : "✖"} ${fx.id} (${errs.length} error, ${findings.filter((f) => f.severity === "warn").length} warn)`);
    if (!pass) {
      console.log(formatFindings(errs));
      failed++;
    }
  } catch (e) {
    console.log(`✖ ${fx.id} — ${e.message}`);
    failed++;
  }
}
console.log(failed ? `\n✖ ${failed} fixture(s) regressed` : "\n✔ all fixtures green");
process.exit(failed ? 1 : 0);
