#!/usr/bin/env node
// PL-1.2 deterministic gate — StatHero count-up + entrance pop + proportion ring (no LLM).
//
//   node tools/qa-stathero.mjs --unit          # planRing + count spot-check suites (no dev server)
//   node tools/qa-stathero.mjs --c13-capture   # capture the C13 static-identity baseline screenshots
//                                              #   (run BEFORE changing PostRenderer/StatHero!)
//   npm run dev                                # in another terminal — DOM passes need the dev server
//   npm run qa:stathero                        # full: unit + sampled-t geometry + C13 pixel diff
//
// Covers handoff §2.7 (planning/primitive-library/handoffs/PL-1.2-stat-countup-pop.md):
//   1. planRing unit suite — the §2.7 decision table verbatim (eligibility, clamp, skip reasons).
//   2. Stat count spot-checks — fixture values through the (unchanged) PL-1.1 planCountUp.
//   3. Sampled-t geometry check at T = {0, .30, .33, .36, .40, .44, .50, .56, .62, .83, 1}:
//      LAYOUT via offset* (transform-blind — constant across t), PAINTED via bounding rects
//      (⊆ t=1 rect + 1.5px/side, ⊆ Panel content box, ≥14px gap to sub), transform-matrix
//      discipline (scale ∈ [0.94, 1.002]; computed `transform: none` at every t ≥ 0.36 — PM §3
//      hardening), dashoffset monotone + exact C·(1−f) from t=0.50, overlay advance width,
//      collisions/clipped/outOfSafeMargin/belowMobileFloor clean at EVERY sample, settle order
//      at t=0.56 (stat done, metric overlays still hidden), final-frame byte-for-byte exactness.
//   4. C13 static identity — fuzz-06/07/08 at t=1 screenshot-diffed against the pre-PL-1.2
//      baseline (pixel diff must be 0 for posts without `proportion`).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { BASE, VIEWPORT, loadReport, sampleFixture, assertGatingClean } from "./lib/sampled-t.mjs";
import { planRing } from "../src/lib/ring.ts";
import { planCountUp } from "../src/lib/countup.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UNIT_ONLY = process.argv.includes("--unit");
const C13_CAPTURE = process.argv.includes("--c13-capture");

// §2.7 sample set: pre-reveal, pop mid/end, count mid ×2, count settle, sub mid, note settle,
// metric start, metric mid, final.
const T_SAMPLES = [0, 0.3, 0.33, 0.36, 0.4, 0.44, 0.5, 0.56, 0.62, 0.83, 1];
const FIXTURES = ["fuzz-20-stat-ring-anim", "fuzz-21-stat-ring-edge"];

// C13 baseline — captured from the PRE-PL-1.2 renderer (mechanism documented in handoff §5).
const C13_FIXTURES = ["fuzz-06-stat-min", "fuzz-07-stat-formula-m1", "fuzz-08-stat-m2"];
const C13_DIR = join(ROOT, "planning", "primitive-library", "baselines", "pl-1.2-c13");

// Ring geometry constants (spec C7) — must match StatHero.tsx.
const RING_R = (320 - 18) / 2; // 151
const RING_C = 2 * Math.PI * RING_R; // ≈ 948.76

let failures = 0;
const check = (ok, name, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "✔" : "✖"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  return ok;
};

// ── 1+2. Unit suites (pure — no DOM) ─────────────────────────────────────────
function unitSuite() {
  console.log("planRing unit suite (§2.7 decision table — eligibility, clamp, reasons):");
  // [proportion, big, ring?, f-or-reason]
  const table = [
    [undefined, "19%", false, "absent"],
    [null, "19%", false, "absent"], // OpenAI nullable-optional emits null ⇒ same as absent
    [0.19, "19%", true, 0.19],
    [1, "100%", true, 1],
    [1.2, "120%", true, 1], // > 1 ⇒ clamped to a full circle (model rounding slack)
    [0, "0%", false, "tooSmall"],
    [0.005, "0.5%", false, "tooSmall"],
    [0.01, "1%", true, 0.01], // boundary: smallest visible arc (≈ a dot at 12 o'clock)
    [NaN, "19%", false, "nonFinite"],
    [Infinity, "19%", false, "nonFinite"],
    [-Infinity, "19%", false, "nonFinite"],
    [-0.3, "19%", false, "nonFinite"],
    ["0.2", "19%", false, "nonFinite"], // string — Anthropic's stripped-constraints schema slack
    [0.2, "13 characters", false, "bigTooLong"], // 13 chars > 12 cap (C8 / in-ring floor C4)
    [0.2, "12 chars max", true, 0.2], // 12-char boundary
    [0.2, "  1 in 5  ", true, 0.2], // trimmed length decides
    [0.2, "1 in 5", true, 0.2], // non-animatable big still rings (fade + sweep)
  ];
  for (const [proportion, big, ring, expect] of table) {
    const plan = planRing(proportion, big);
    const ok = plan.ring === ring && (ring ? Math.abs(plan.f - expect) < 1e-9 : plan.reason === expect);
    check(
      ok,
      `planRing(${typeof proportion === "string" ? JSON.stringify(proportion) : proportion}, ${JSON.stringify(big)}) → ${ring ? `f ${expect}` : `skip(${expect})`}`,
      `got ${plan.ring ? `f ${plan.f}` : `skip(${plan.reason})`}`,
    );
  }

  console.log("Stat count spot-checks (PL-1.1 planCountUp reused verbatim — C1):");
  const p19 = planCountUp("19%");
  check(p19.animate && p19.display(0) === "0%" && p19.display(1) === "19%" && p19.display(1.5) === "19%",
    `"19%" counts: display(0) "0%", display(≥1) "19%" verbatim`);
  const p818 = planCountUp("81.8%");
  check(p818.animate && p818.display(0) === "0.0%" && p818.display(1) === "81.8%",
    `"81.8%" counts: fixed 1 decimal, display(1) verbatim`);
  const p1in5 = planCountUp("1 in 5");
  check(!p1in5.animate && p1in5.reason === "regex", `"1 in 5" → fade(regex) — fade + ring sweep together`);
  const pFormula = planCountUp("0.99²⁰ = 81.8%");
  check(!pFormula.animate && pFormula.reason === "regex", `"0.99²⁰ = 81.8%" → fade(regex) (fuzz-07 path)`);
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
// Driver is the shared sampled-`t` harness (tools/lib/sampled-t.mjs, CHECKS.md gap #2). The
// `extend` hook attaches the metric-row overlay opacities (settle-order check at t=0.56) — not
// part of measure() — exactly as the inlined loadPage() did.
const overlayExtend = () => ({
  metricOverlayOpacities: [...document.querySelectorAll("[data-metric-value-text]")].map((el) => {
    let o = 1;
    for (let n = el; n && n !== document.body; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity || "1");
    return +o.toFixed(3);
  }),
});
const loadPage = (page, id, t) => loadReport(page, id, t, overlayExtend);

async function screenshotCanvas(page, id) {
  await page.goto(`${BASE}/?id=${encodeURIComponent(id)}&t=1`, { waitUntil: "networkidle", timeout: 20000 });
  const canvas = await page.waitForSelector("#post-canvas", { timeout: 20000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(250);
  return canvas.screenshot();
}

// Tolerance-aware pixel diff via pixelmatch (ISC — FRAMEWORKS.md §D adoption, PL-0.3 deliverable C).
// Replaces the hand-rolled in-page byte-compare. threshold 0.1 (tight) so sub-AA noise can't false-
// fail while a real repaint still does; 0 diff pixels expected for the C13 static-identity gate.
// On any diff, `diffOut` (when given) receives a highlighted diff PNG for inspection. The return
// shape matches the old helper (diffPixels / maxDelta / byteIdentical / sizeMismatch).
const PIXELMATCH_THRESHOLD = 0.1;
async function pixelDiff(bufA, bufB, diffOut) {
  if (Buffer.compare(bufA, bufB) === 0) return { diffPixels: 0, maxDelta: 0, byteIdentical: true };
  const a = PNG.sync.read(bufA), b = PNG.sync.read(bufB);
  if (a.width !== b.width || a.height !== b.height)
    return { diffPixels: -1, maxDelta: 255, sizeMismatch: `${a.width}×${a.height} vs ${b.width}×${b.height}` };
  const diff = new PNG({ width: a.width, height: a.height });
  const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: PIXELMATCH_THRESHOLD });
  // maxDelta over differing pixels — kept for the failure message (parity with the old report).
  let maxDelta = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(
      Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]),
      Math.abs(a.data[i + 2] - b.data[i + 2]), Math.abs(a.data[i + 3] - b.data[i + 3]),
    );
    if (d > maxDelta) maxDelta = d;
  }
  if (diffPixels > 0 && diffOut) await writeFile(diffOut, PNG.sync.write(diff));
  return { diffPixels, maxDelta };
}

const matrixOf = (transform) => {
  if (transform === "none") return { scaleX: 1, scaleY: 1, none: true };
  const m = (transform.match(/matrix\(([^)]+)\)/) || [])[1]?.split(",").map(Number);
  if (!m || m.length < 6) return null;
  return { scaleX: m[0], scaleY: m[3], none: false };
};

// ── 3. Sampled-t geometry suite ───────────────────────────────────────────────
async function geometrySuite(page) {
  for (const id of FIXTURES) {
    const spec = JSON.parse(await readFile(join(ROOT, "planning", "fixtures", "renderfuzz", `${id}.render.json`), "utf8"));
    const viz = spec.visualization;
    const ringPlan = planRing(viz.proportion, viz.big);
    console.log(`Sampled-t geometry — ${id} (t ∈ {${T_SAMPLES.join(", ")}}):`);

    const reports = await sampleFixture(page, id, T_SAMPLES, overlayExtend);
    const base = reports[1];
    const S = base.statHero;
    if (!check(!!S, "statHero section present at t=1")) continue;

    // Mode is a pure function of DATA, never of t (C2/C8).
    check(
      T_SAMPLES.every((t) => reports[t].statHero?.mode === S.mode && reports[t].statHero?.countMode === S.countMode),
      `mode [${S.mode}/${S.countMode}] constant across all 11 samples (data-decided, never t)`,
    );
    check(S.mode === "ring", "ring mode active (fixture has a valid proportion)", `got ${S.mode}`);
    check(S.countMode === (planCountUp(viz.big).animate ? "count" : "fade"), `count mode matches planCountUp("${viz.big}")`);

    // LAYOUT (transform-blind): offset* of wrapper/zone/ghost/ringBox/sub/note constant ≤0.5px;
    // FitLine zoom constant ≤0.002.
    let layoutOk = true, layoutDetail = "";
    for (const t of T_SAMPLES) {
      const L = reports[t].statHero.layout;
      for (const part of ["wrapper", "zone", "ghost", "ringBox", "sub", "note"]) {
        const a = L[part], b = S.layout[part];
        if (!a !== !b) { layoutOk = false; layoutDetail = `${part} presence differs at t=${t}`; continue; }
        if (!a) continue;
        for (const k of ["left", "top", "width", "height"]) {
          if (Math.abs(a[k] - b[k]) > 0.5) { layoutOk = false; layoutDetail = `${part}.${k} drifts ${Math.abs(a[k] - b[k]).toFixed(2)}px at t=${t}`; }
        }
      }
      if (Math.abs(reports[t].statHero.zoom - S.zoom) > 0.002) { layoutOk = false; layoutDetail = `zoom ${reports[t].statHero.zoom} vs ${S.zoom} at t=${t}`; }
    }
    check(layoutOk, "LAYOUT: offset* boxes (W,Z,G,R,S,N) + FitLine zoom constant across all samples (≤0.5px / ≤0.002)", layoutDetail);

    // PAINTED: wrapper rect ⊆ t=1 rect inflated ≤1.5px/side, ⊆ Panel content box;
    // ring SVG rect inside the same envelope; gap painted-W-bottom → painted-sub-top ≥ 14px.
    let paintOk = true, paintDetail = "";
    for (const t of T_SAMPLES) {
      const P = reports[t].statHero.painted;
      const inEnvelope = (r, b, label) => {
        if (r.x < b.x - 1.5 || r.y < b.y - 1.5 || r.right > b.right + 1.5 || r.bottom > b.bottom + 1.5) {
          paintOk = false; paintDetail = `${label} escapes the t=1 envelope at t=${t}`;
        }
      };
      inEnvelope(P.wrapper, S.painted.wrapper, "wrapper painted rect");
      if (P.ringSvg) inEnvelope(P.ringSvg, S.painted.ringSvg, "ring svg painted rect");
      const pc = P.panelContent;
      if (P.wrapper.x < pc.x - 0.5 || P.wrapper.y < pc.y - 0.5 || P.wrapper.right > pc.right + 0.5 || P.wrapper.bottom > pc.bottom + 0.5) {
        paintOk = false; paintDetail = `wrapper escapes the Panel content box at t=${t}`;
      }
      if (P.sub) {
        const gap = P.sub.y - P.wrapper.bottom;
        if (gap < 14) { paintOk = false; paintDetail = `wrapper→sub painted gap ${gap.toFixed(1)}px < 14px at t=${t}`; }
      }
    }
    check(paintOk, "PAINTED: wrapper ⊆ t=1 rect +1.5px/side ⊆ Panel content; ring svg in envelope; gap to sub ≥ 14px", paintDetail);

    // Transform discipline (C5 + PM §3 hardening): scale ∈ [0.94, 1.002] always;
    // computed transform EXACTLY "none" at every t ≥ 0.36 (identity via omission, never scale(1)).
    let txOk = true, txDetail = "";
    for (const t of T_SAMPLES) {
      const m = matrixOf(reports[t].statHero.transform);
      if (!m) { txOk = false; txDetail = `unparseable transform at t=${t}`; continue; }
      if (Math.abs(m.scaleX - m.scaleY) > 0.001) { txOk = false; txDetail = `scaleX≠scaleY at t=${t}`; }
      if (m.scaleX < 0.94 - 1e-6 || m.scaleX > 1.002) { txOk = false; txDetail = `scale ${m.scaleX} out of [0.94, 1.002] at t=${t}`; }
      if (t >= 0.36 && !m.none) { txOk = false; txDetail = `transform is "${reports[t].statHero.transform}" at t=${t} — must be omitted (none) once settled`; }
    }
    check(txOk, `transform discipline: scale ∈ [0.94, 1.002]; computed "none" at every t ≥ 0.36`, txDetail);

    // Ring sweep (C7/C9/C12): dasharray = C; dashoffset monotone non-increasing;
    // exact C·(1−f) ± 0.5px at every t ≥ 0.50.
    if (ringPlan.ring) {
      const f = ringPlan.f;
      check(Math.abs(S.ring.f - f) < 1e-6, `data-ring-f ${S.ring.f} matches planRing f ${f}`);
      check(Math.abs(S.ring.dasharray - RING_C) <= 0.5, `dasharray ${S.ring.dasharray.toFixed(2)} = C ${RING_C.toFixed(2)} ± 0.5`);
      let mono = true, exact = true, detail = "";
      let prev = Infinity;
      for (const t of T_SAMPLES) {
        const off = reports[t].statHero.ring.dashoffset;
        if (off > prev + 0.5) { mono = false; detail = `dashoffset rises ${prev.toFixed(2)} → ${off.toFixed(2)} at t=${t}`; }
        prev = off;
        if (t >= 0.5 && Math.abs(off - RING_C * (1 - f)) > 0.5) { exact = false; detail = `|${off.toFixed(2)} − C·(1−f) ${(RING_C * (1 - f)).toFixed(2)}| > 0.5 at t=${t}`; }
      }
      check(mono, "dashoffset monotone non-increasing across ordered samples (≤ +0.5px)", detail);
      check(exact, `dashoffset exactly C·(1−f) = ${(RING_C * (1 - f)).toFixed(2)} ± 0.5px at every t ≥ 0.50`, detail);
    }

    // Overlay advance width (C3): value text width(t) ≤ width(1) + 0.5px.
    let widthOk = true, widthDetail = "";
    for (const t of T_SAMPLES) {
      const w = reports[t].statHero.valueTextWidth;
      if (w > S.valueTextWidth + 0.5) { widthOk = false; widthDetail = `width(t=${t}) ${w} > width(1) ${S.valueTextWidth}`; }
    }
    check(widthOk, "overlay advance width(t) ≤ width(1) + 0.5px at every sample", widthDetail);

    // Mobile floor (C4) for the hero itself (belowMobileFloor also gates globally below).
    const heroFont = S.mode === "ring" ? 84 : 104;
    check(heroFont * S.zoom >= 18, `effective hero size ${(heroFont * S.zoom).toFixed(1)}px ≥ 18px mobile floor`);

    // Gating checks clean at EVERY sample (mid-pop, mid-sweep, mid-count included).
    assertGatingClean(check, reports, T_SAMPLES);

    // Settle order (C10) at t=0.56: stat fully settled, metric overlays still hidden (< 0.62).
    const s56 = reports[0.56].statHero;
    check(
      s56.valueText === viz.big && matrixOf(s56.transform)?.none && s56.opacity === 1 &&
        (viz.sub ? s56.subOpacity === 1 : true) && (viz.note ? s56.noteOpacity === 1 : true) &&
        (!ringPlan.ring || Math.abs(s56.ring.dashoffset - RING_C * (1 - ringPlan.f)) <= 0.5),
      "t=0.56: stat fully settled (verbatim text, transform none, opacities 1, ring at final fraction)",
      `text=${JSON.stringify(s56.valueText)} transform=${s56.transform} op=${s56.opacity} sub=${s56.subOpacity} note=${s56.noteOpacity}`,
    );
    if ((spec.metrics || []).length > 0) {
      const overlays = reports[0.56].metricOverlayOpacities;
      check(overlays.length > 0 && overlays.every((o) => o === 0),
        "t=0.56: metric-row overlays still opacity 0 (stagger starts 0.62 — eye path viz → metrics)",
        `opacities: ${overlays.join(",")}`);
    }

    // Final-frame exactness (C12): verbatim big, opacity 1, sub/note settled.
    check(S.valueText === viz.big, `t=1: big textContent === schema big byte-for-byte (${JSON.stringify(viz.big)})`,
      `got ${JSON.stringify(S.valueText)}`);
    check(S.opacity === 1 && (!viz.sub || S.subOpacity === 1) && (!viz.note || S.noteOpacity === 1),
      "t=1: wrapper/sub/note opacity exactly 1");
  }
}

// ── 4. C13 static identity ────────────────────────────────────────────────────
async function c13Suite(page) {
  console.log(`C13 static identity — fuzz-06/07/08 t=1 vs pre-PL-1.2 baseline (${C13_DIR.replace(ROOT, ".")}):`);
  for (const id of C13_FIXTURES) {
    let baseline;
    try {
      baseline = await readFile(join(C13_DIR, `${id}.t1.png`));
    } catch {
      check(false, `${id}: baseline missing`, "run `node tools/qa-stathero.mjs --c13-capture` on the PRE-change renderer");
      continue;
    }
    const current = await screenshotCanvas(page, id);
    const diff = await pixelDiff(baseline, current, join(ROOT, "out", `c13-diff-${id}.png`));
    check(diff.diffPixels === 0,
      `${id}: pixel diff = 0${diff.byteIdentical ? " (PNG byte-identical)" : ""} (pixelmatch, threshold ${PIXELMATCH_THRESHOLD})`,
      diff.sizeMismatch ? `size mismatch ${diff.sizeMismatch}` : `${diff.diffPixels} px differ (max channel Δ ${diff.maxDelta}) — see out/c13-diff-${id}.png`);
    if (diff.diffPixels !== 0) await writeFile(join(ROOT, "out", `c13-current-${id}.png`), current);
  }
}

async function captureBaseline() {
  await mkdir(C13_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    for (const id of C13_FIXTURES) {
      const buf = await screenshotCanvas(page, id);
      await writeFile(join(C13_DIR, `${id}.t1.png`), buf);
      console.log(`captured ${id}.t1.png (${buf.length} bytes)`);
    }
  } finally {
    await browser.close();
  }
}

if (C13_CAPTURE) {
  console.log(`Capturing C13 baseline from the CURRENT renderer at ${BASE} → ${C13_DIR}\n`);
  await captureBaseline();
  process.exit(0);
}

unitSuite();
if (!UNIT_ONLY) {
  console.log(`\nDOM passes — need the dev server at ${BASE} (npm run dev)\n`);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await geometrySuite(page);
    await c13Suite(page);
  } finally {
    await browser.close();
  }
}
console.log(`\n${failures ? "✖ FAIL" : "✔ PASS"} — ${failures} failing check(s)`);
process.exit(failures ? 2 : 0);
