// PL-0.2 — `definePrimitiveGate`: the SHARED machinery every `tools/qa-<name>.mjs` gate hand-rolled.
//
// A primitive gate is ~3 parts (handoff PL-0.2): a pure UNIT suite over the planner, an OPTIONAL
// byte-identity BASELINE (capture + regression — only the legacy-retrofit gates have one), and a
// SAMPLED-t DOM pass over the fixtures. The boilerplate around those parts is identical across all
// ~21 gates: parse `--unit`/`--baseline-capture`, own the `check`/`approx`/`failures` scoreboard,
// launch ONE headless Chromium (via sampled-t's withBrowser), drive the fixture loop, print the
// `DOM passes — need the dev server …` banner, and emit the pass/fail summary + exit code.
//
// This module extracts ALL of that ONCE. A gate becomes a DECLARATION: it supplies `name`, the
// `fixtures`/`sampledT` schedule, a `planFor` (spec.visualization → plan), a pure `unit(check,
// helpers)`, and the bespoke per-fixture `domChecks(ctx)`. The registry hands `domChecks` a context
// with everything it needs (the parsed spec + viz, the computed plan, the sampled reports, and the
// shared `check`/`approx`/`assertGatingClean`). A gate with a byte-identity baseline opts in by also
// declaring `baselineDir` + a `captureState` page-reader + a `compareBaseline` field comparator; a
// gate WITHOUT one (e.g. donut — a green-field PL-2.3 gate with no legacy render to protect) simply
// omits those, and `--baseline-capture` is then a no-op pass-through exactly as before.
//
// Behaviour is byte-identical to the inlined version each gate had (same arg parsing, same `check`
// formatting, same banner/summary strings, same browser lifecycle, same exit codes 0/2), so a
// migrated gate's pass/fail + check counts + baseline bytes are unchanged.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE, VIEWPORT, sampleFixture, assertGatingClean, withBrowser } from "./sampled-t.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The fixture path every gate built the same way (planning/fixtures/renderfuzz/<id>.render.json).
export const fixturePath = (id) => join(ROOT, "planning", "fixtures", "renderfuzz", `${id}.render.json`);
export const readFixture = async (id) => JSON.parse(await readFile(fixturePath(id), "utf8"));

// Build a gate from its declaration. Returns `{ run, check, approx }`; the gate file does
// `await definePrimitiveGate({...}).run();`. (Refinement vs the brief's bare-call sketch: returning a
// runnable handle keeps top-level-await error propagation honest and lets a meta-runner drive many
// gates — it does NOT change a gate's behaviour, which is still one `.run()` per file.)
export function definePrimitiveGate(spec) {
  const {
    name,
    fixtures = [],
    sampledT,
    unit,
    domChecks,
    plan: rawPlan, // the pure planner (planDonut, planBars, …) — for helpers.plan
    planFor = (viz) => (rawPlan ? rawPlan(viz) : undefined), // spec.visualization → plan
    extend, // optional page-fn passed to sampleFixture (e.g. stathero's overlay opacities)
    // ── byte-identity baseline (opt-in; a gate without a legacy render omits all of these) ──
    baselineDir,
    baselineFixtures,
    captureState, // page-fn read structurally (rects/texts/lines/…) at t=1
    compareBaseline, // (baseline, cur, { check, approx, id }) → void: the field-for-field regression
    loadState, // optional custom baseline loader; default mirrors sampled-t's loadReport
    captureSettleMs = 150, // settle before the baseline read (ranges-class gates use 200)
    captureSummary, // optional (state) → string for the `captured …` line
  } = spec;

  const hasBaseline = !!(baselineDir && captureState && compareBaseline);
  const baseFixtures = baselineFixtures || fixtures;

  // ── the shared scoreboard (identical formatting to every hand-rolled gate) ──
  let failures = 0;
  const check = (ok, name2, detail = "") => {
    if (!ok) failures++;
    console.log(`  ${ok ? "✔" : "✖"} ${name2}${!ok && detail ? ` — ${detail}` : ""}`);
    return ok;
  };
  const approx = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

  // Helpers handed to BOTH unit and domChecks (the "same check/approx helpers" contract).
  const helpers = { approx, plan: rawPlan, planFor, sampledT, assertGatingClean, fixturePath, readFixture, BASE };

  const defaultLoadState = async (page, id, t = 1) => {
    await page.goto(`${BASE}/?id=${encodeURIComponent(id)}&t=${t}`, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForSelector("#post-canvas", { timeout: 20000 });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForTimeout(captureSettleMs);
    return page.evaluate(captureState);
  };
  const load = loadState || defaultLoadState;

  // ── 1. unit suite (pure — no DOM) ──
  async function runUnit() {
    if (unit) await unit(check, helpers);
  }

  // ── 2a. baseline capture (writes BASELINE_DIR/<id>.t1.json — opt-in) ──
  async function runBaselineCapture() {
    await mkdir(baselineDir, { recursive: true });
    await withBrowser(async (page) => {
      for (const id of baseFixtures) {
        const state = await load(page, id, 1);
        if (state && state.error) {
          console.error(`✖ ${id}: ${state.error}`);
          process.exitCode = 1;
          continue;
        }
        await writeFile(join(baselineDir, `${id}.t1.json`), JSON.stringify(state, null, 2));
        console.log(captureSummary ? `captured ${id}.t1.json — ${captureSummary(state)}` : `captured ${id}.t1.json`);
      }
    });
  }

  // ── 2b. baseline regression (t=1 == captured baseline, field-for-field — opt-in) ──
  async function runBaselineRegression(page) {
    console.log(`Byte-identity vs baseline (${baselineDir.replace(ROOT, ".")}):`);
    for (const id of baseFixtures) {
      let baseline;
      try {
        baseline = JSON.parse(await readFile(join(baselineDir, `${id}.t1.json`), "utf8"));
      } catch {
        check(false, `${id}: baseline missing`, `run \`node tools/qa-${name}.mjs --baseline-capture\``);
        continue;
      }
      const cur = await load(page, id, 1);
      if (cur && cur.error) {
        check(false, `${id}: ${cur.error}`);
        continue;
      }
      await compareBaseline(baseline, cur, { check, approx, id });
    }
  }

  // ── 3. sampled-t DOM pass (the bespoke geometry, one ctx per fixture) ──
  async function runDom(page) {
    for (const id of fixtures) {
      const spc = await readFixture(id);
      const viz = spc.visualization;
      const plan = planFor(viz);
      const reports = await sampleFixture(page, id, sampledT, extend);
      const ctx = {
        ...helpers, // shared helpers FIRST so the per-fixture fields below win (helpers.plan is the
        page, id, spec: spc, viz, plan, reports, base: reports[1], // raw planner; ctx.plan must be this fixture's plan)
        T: sampledT, check, approx,
      };
      await domChecks(ctx);
    }
  }

  async function run() {
    const UNIT_ONLY = process.argv.includes("--unit");
    const BASELINE_CAPTURE = hasBaseline && process.argv.includes("--baseline-capture");

    if (BASELINE_CAPTURE) {
      console.log(`Capturing the t=1 baseline → ${baselineDir.replace(ROOT, ".")} (needs the dev server at ${BASE})\n`);
      await runBaselineCapture();
      console.log("\n✔ baseline captured");
      process.exit(process.exitCode || 0);
    }

    await runUnit();
    if (!UNIT_ONLY) {
      console.log(`\nDOM passes — need the dev server at ${BASE} (npm run dev)\n`);
      await withBrowser(async (page) => {
        if (hasBaseline) await runBaselineRegression(page);
        await runDom(page);
      });
    }
    console.log(`\n${failures ? "✖ FAIL" : "✔ PASS"} — ${failures} failing check(s)`);
    process.exit(failures ? 2 : 0);
  }

  return { run, check, approx };
}
