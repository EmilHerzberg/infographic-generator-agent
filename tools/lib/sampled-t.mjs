// Shared sampled-`t` driver (PL-0.3 — CHECKS.md gap #2). The six primitive gates
// (qa-countup/stathero/decompbar/divergence/tiers/reveal) each hand-rolled the SAME engine:
// launch one headless Chromium, drive the Preview `?id=<fix>&t=<sample>` URL over a sample set,
// await fonts.ready (render-truth parity — same offline fonts the MP4 uses, PL-0.3 deliverable A),
// let FitLine's layout-effect settle, and re-run the exported inspector `measure()` per sample.
// This module is that engine, extracted ONCE. The gates keep their own CLIs and per-primitive
// assertions; they just share the driver. Behavior is byte-identical to the inlined version each
// gate had (same waitUntil, same 150ms settle, same measure()), so pass/fail + check counts are
// unchanged.
import { chromium } from "playwright";
import { measure } from "./inspect.mjs";

export const BASE = process.env.PREVIEW_URL || "http://localhost:5173";

// The Preview viewport every gate uses: 1180 wide fits any 1080-wide canvas with margin; 2080 tall fits the
// TALLEST output (1080×1920 vertical / 9:16) whole, so a tall canvas is never clipped and its full height is
// measured + screenshot-able. Byte-neutral for the shorter formats: every inspector check is canvas-relative
// (measured off #post-canvas's own rect), so extra empty viewport below the canvas changes no measurement.
// deviceScaleFactor 1 so screen px == source px.
export const VIEWPORT = { width: 1180, height: 2080 };

// Load the Preview at (id, t) and return the inspector measure() report. Identical to the
// loadPage() each gate inlined: networkidle, fonts.ready (now the offline faces — render-truth),
// a 150ms settle for FitLine's layout-effect, then evaluate(measure). An optional `extend`
// callback runs in the page after measure() to attach gate-specific extras (e.g. stathero's
// metric-overlay opacities) without forking the driver.
export async function loadReport(page, id, t, extend) {
  await page.goto(`${BASE}/?id=${encodeURIComponent(id)}&t=${t}`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForSelector("#post-canvas", { timeout: 20000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(150); // let FitLine's layout-effect measurement settle
  const report = await page.evaluate(measure);
  if (extend) Object.assign(report, await page.evaluate(extend));
  return report;
}

// Drive one fixture over a sample set: returns { [t]: report } keyed by sample. One page, reused.
export async function sampleFixture(page, id, tSamples, extend) {
  const reports = {};
  for (const t of tSamples) reports[t] = await loadReport(page, id, t, extend);
  return reports;
}

// PL-4.1 narrative sampled-`t` extension (§2.7.1). Instead of a FIXED sample set, narrative samples
// are a pure function of the NarrativePlan: per focus window three points (enterMid/readMid/exitMid),
// plus switchMid (if any), assemblyMid, t=0 and t=1. This derives that t-set from the plan and reuses
// the one browser/measure() via sampleFixture — the fixed-set sampleFixture is untouched, so default-
// mode gates keep using it byte-identically. Returns { tSamples, reports }.
export function windowSamples(plan) {
  const round = (x) => +Math.max(0, Math.min(1, x)).toFixed(4);
  const set = new Set([0, 1]);
  for (const w of plan.windows) {
    set.add(round((w.enterStartT + w.readStartT) / 2)); // enterMid
    set.add(round((w.readStartT + w.readEndT) / 2)); // readMid
    set.add(round((w.exitStartT + w.exitEndT) / 2)); // exitMid
    set.add(round(w.readStartT)); // read window edges (N4 opacity-at-edges)
    set.add(round(w.readEndT));
  }
  if (plan.switchT) set.add(round((plan.switchT.startT + plan.switchT.endT) / 2)); // switchMid
  set.add(round((plan.assembly.startT + plan.assembly.endT) / 2)); // assemblyMid
  set.add(round(plan.assembly.endT)); // settle edge
  return [...set].sort((a, b) => a - b);
}

export async function sampleWindows(page, id, plan, extend) {
  const tSamples = windowSamples(plan);
  const reports = await sampleFixture(page, id, tSamples, extend);
  return { tSamples, reports };
}

// Run `fn(page)` inside one freshly-launched headless Chromium + page, always closing the browser.
// This is the exact lifecycle every gate's DOM suite used.
export async function withBrowser(fn) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    return await fn(page, browser);
  } finally {
    await browser.close();
  }
}

// The "gating checks clean at EVERY sample" assertion every gate repeats verbatim: for each of
// collisions/clipped/outOfSafeMargin/belowMobileFloor, no sample may carry a finding. Calls the
// gate's own `check(ok, name, detail)` so output/format/labels are unchanged. `nameSuffix` lets a
// gate keep its bespoke check label (e.g. "(C7/C10/C11)").
export const GATING_ARRAYS = ["collisions", "clipped", "outOfSafeMargin", "belowMobileFloor"];

export function assertGatingClean(check, reports, tSamples, nameSuffix = "") {
  for (const name of GATING_ARRAYS) {
    const dirty = tSamples.filter((t) => (reports[t][name] || []).length > 0);
    check(
      dirty.length === 0,
      `${name} clean at every sample${nameSuffix}`,
      dirty.map((t) => `t=${t}: ${JSON.stringify(reports[t][name][0])}`).join("; "),
    );
  }
}
