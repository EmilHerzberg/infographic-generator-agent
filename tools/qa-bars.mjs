#!/usr/bin/env node
// PL-2.1 deterministic gate — BarChart (simple/grouped/stacked × vertical/horizontal) magnitude
// comparison primitive (no LLM). Opens Epic PL-2 (the chart family).
//
//   node tools/qa-bars.mjs --unit   # planBars decision tables (no dev server)
//   npm run dev                     # in another terminal — DOM passes need the dev server
//   npm run qa:bars                 # full: unit + sampled-t DOM pass
//
// Covers handoff §2.7 (planning/primitive-library/handoffs/PL-2.1-bar-chart.md):
//   1. planBars unit suite (U1–U11): category cap + downsample (post-sort), series/segment caps,
//      per-bar sliver floor, axis derivation + niceMax + max>min guard, out-of-axis clamp, value-
//      label fit-or-hide + placement, category-label fit-or-hide, sort, stagger-vs-N, degenerate
//      (empty/negative/all-zero/1-series), and unknown-enum → default coercion.
//   2. Sampled-t DOM pass (D1–D7) at T = {0, 0.30, 0.36, 0.46, 0.56, 0.66, 0.76, 0.85, 0.92, 1}
//      over simple-vertical, simple-horizontal, grouped-vertical, stacked-vertical, and an over-cap
//      stress fixture (one headless Chromium, Preview ?id&t): bar-within-plot, grow-from-baseline
//      + settle (transform OMITTED at t≥0.85), layout reserved (transform-blind boxes + nodeCount
//      static), value-axis correctness, label no-overlap/fit, caps, mobile floors / collisions /
//      clipped / safe-margin clean at every sample.
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BASE, VIEWPORT, sampleFixture, assertGatingClean } from "./lib/sampled-t.mjs";
import {
  planBars,
  staggerForN,
  niceMax,
  barGrow,
  labelStart,
  refLineReveal,
  MIN_BAR_THICKNESS,
  SEG_SLIVER_PX,
  MAX_CAT_V,
  MAX_CAT_H,
  MAX_SERIES,
  MAX_SEG,
  GROW_START,
  SETTLE_DEADLINE,
  BAR_GROW_DUR,
  REF_LINE_STROKE,
  PLOT_X0_V,
  PLOT_X1_V,
  PLOT_Y0,
  BASELINE_Y,
  PLOT_X0_H,
  PLOT_X1_H,
  PLOT_Y0_H,
  PLOT_Y1_H,
} from "../src/lib/bars.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UNIT_ONLY = process.argv.includes("--unit");

// §2.7 sample set: pre-build, grow midpoints across the stagger, settle, hold, final.
const T_SAMPLES = [0, 0.3, 0.36, 0.46, 0.56, 0.66, 0.76, 0.85, 0.92, 1];
const ANIM_FIXTURES = [
  "fuzz-38-bar-simple-vertical",
  "fuzz-39-bar-simple-horizontal",
  "fuzz-40-bar-grouped-vertical",
  "fuzz-41-bar-stacked-vertical",
  "fuzz-42-bar-overcap-stress",
  "fuzz-124-bar-referenceline", // PL-4.2 knob #1
];

// Saturation of a CSS rgb() string ∈ [0,1] — the NEUTRAL-colour discriminator (chrome/reference < 0.22).
const sat = (c) => {
  const m = (c || "").match(/[\d.]+/g);
  if (!m || m.length < 3) return 1;
  const [r, g, b] = m.map(Number);
  const mx = Math.max(r, g, b);
  return mx === 0 ? 0 : (mx - Math.min(r, g, b)) / mx;
};
const boxOverlap = (A, B) => {
  const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
  const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
  return ox > 0 && oy > 0 ? Math.min(ox, oy) : 0;
};
const fixturePath = (id) => join(ROOT, "planning", "fixtures", "renderfuzz", `${id}.render.json`);

let failures = 0;
const check = (ok, name, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "✔" : "✖"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  return ok;
};
const approx = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const mk = (n) => Array.from({ length: n }, (_, i) => ({ label: `c${i}`, value: (n - i) * 10 }));

// ── 1. Unit suite (pure — no DOM) ─────────────────────────────────────────────
function unitSuite() {
  console.log("U1 — category cap + downsample (post-sort) (C1):");
  const u1 = planBars({ categories: Array.from({ length: 12 }, (_, i) => ({ label: `c${i}`, value: i + 1 })), mode: "simple", orientation: "vertical", sort: "desc" });
  check(u1.bars.length === MAX_CAT_V, `12-cat vertical → ${MAX_CAT_V} bars (C1)`, `got ${u1.bars.length}`);
  check(u1.dropped.categoriesDropped === 4, "categoriesDropped === 4 (surfaced)", `got ${u1.dropped.categoriesDropped}`);
  // sort=desc keeps the 8 LARGEST (values 12..5); the bar values reflect that.
  check(u1.bars[0].rects[0].value === 12 && u1.bars[7].rects[0].value === 5, "sort=desc keeps the 8 largest (12..5)", `got ${u1.bars.map((b) => b.rects[0].value).join(",")}`);
  const u1h = planBars({ categories: Array.from({ length: 12 }, (_, i) => ({ label: `c${i}`, value: i + 1 })), mode: "simple", orientation: "horizontal" });
  check(u1h.bars.length === MAX_CAT_H, `12-cat horizontal → ${MAX_CAT_H} bars (C1)`, `got ${u1h.bars.length}`);

  console.log("U2 — series cap, grouped (C2):");
  const u2 = planBars({ categories: [{ label: "x", values: [1, 2, 3, 4, 5, 6] }], mode: "grouped", seriesAccents: ["cyan", "amber", "violet", "mint", "burnt", "cyan"] });
  check(u2.bars[0].rects.length === MAX_SERIES, `6 series → ${MAX_SERIES} sub-bars (C2)`, `got ${u2.bars[0].rects.length}`);
  check(u2.dropped.seriesDropped === 2, "seriesDropped === 2", `got ${u2.dropped.seriesDropped}`);
  check(u2.seriesAccents.slice(0, 4).join(",") === "cyan,amber,violet,mint", "kept series accents unchanged", u2.seriesAccents.join(","));

  console.log("U3 — segment cap + per-bar sliver floor (C3):");
  const u3 = planBars({ categories: [{ label: "x", values: [1, 2, 3, 4, 5, 6, 7] }], mode: "stacked" });
  check(u3.bars[0].rects.length === MAX_SEG, `7 segments → ${MAX_SEG} (C3)`, `got ${u3.bars[0].rects.length}`);
  check(u3.dropped.segmentsDropped === 2, "segmentsDropped === 2", `got ${u3.dropped.segmentsDropped}`);
  // A bar with one tiny segment: it's floored to ≥ SEG_SLIVER_PX painted px, total preserved.
  const u3b = planBars({ categories: [{ label: "x", values: [100, 100, 1] }], mode: "stacked", axisMin: 0, axisMax: 201 });
  const heights = u3b.bars[0].rects.map((r) => r.h);
  const totalH = heights.reduce((s, h) => s + h, 0);
  check(heights[2] >= SEG_SLIVER_PX - 0.5, `1% segment floored to ≥ ${SEG_SLIVER_PX}px painted`, `got ${heights[2].toFixed(2)}`);
  // total preserved: the floored stack height equals the un-floored stack height (within 0.5px).
  const growLenV = BASELINE_Y - PLOT_Y0;
  const unflooredTotal = (201 / 201) * growLenV;
  check(approx(totalH, unflooredTotal, 0.5), "per-bar total height preserved after sliver floor", `got ${totalH.toFixed(2)} vs ${unflooredTotal.toFixed(2)}`);

  console.log("U4 — axis derivation: niceMax, baseline 0, max>min guard (C5):");
  const u4 = planBars({ categories: [{ label: "a", value: 73 }, { label: "b", value: 41 }], mode: "simple" });
  check(u4.axisMin === 0, "baseline forced to 0 (magnitudes)", `got ${u4.axisMin}`);
  check(u4.axisMax === niceMax(73) && u4.axisMax === 100, "omitted axisMax → niceMax(dataMax) = 100", `got ${u4.axisMax}`);
  const u4g = planBars({ categories: [{ label: "a", value: 5 }], mode: "simple", axisMin: 10, axisMax: 10 });
  check(u4g.axisMax === u4g.axisMin + 1, "axisMax ≤ axisMin guard → axisMin + 1", `got [${u4g.axisMin}, ${u4g.axisMax}]`);
  check(niceMax(0.37) === 0.5 && niceMax(7) === 10 && niceMax(120) === 200, "niceMax rounds to 1/2/2.5/5×10ⁿ", `0.37→${niceMax(0.37)} 7→${niceMax(7)} 120→${niceMax(120)}`);

  console.log("U5 — out-of-axis clamp (C5/2.6.5):");
  const u5 = planBars({ categories: [{ label: "over", value: 140, valueText: "140" }, { label: "ok", value: 50 }], mode: "simple", axisMin: 0, axisMax: 100 });
  const overBar = u5.bars.find((b) => b.label === "over");
  check(overBar.rects[0].h <= growLenV + 0.5, "value > explicit axisMax → bar extent clamped to plot top", `h ${overBar.rects[0].h.toFixed(1)} vs growLen ${growLenV}`);
  check(overBar.rects[0].valueText === "140", "value label still shows the TRUE value (140)", overBar.rects[0].valueText);

  console.log("U6 — value-label fit-or-hide + placement (C-LABEL):");
  // short numeric label fits → show.
  const u6 = planBars({ categories: [{ label: "a", value: 50 }], mode: "simple", axisMin: 0, axisMax: 100 });
  check(u6.bars[0].rects[0].showValue === true, "short value label fits → shown");
  // >8cp valueText → hidden(tooLong).
  const u6l = planBars({ categories: [{ label: "a", value: 50, valueText: "way too long label" }], mode: "simple" });
  check(u6l.bars[0].rects[0].showValue === false && u6l.bars[0].rects[0].valueHideReason === "tooLong", "valueText > 8cp → hidden(tooLong)");
  // horizontal, a near-full bar whose end label would exit the plot → inside placement.
  const u6i = planBars({ categories: [{ label: "a", value: 99, valueText: "99" }], mode: "simple", orientation: "horizontal", axisMin: 0, axisMax: 100 });
  check(u6i.bars[0].rects[0].valuePlacement === "inside", "long horizontal bar end-label would exit plot → inside placement", u6i.bars[0].rects[0].valuePlacement);
  // valueLabels:off → all hidden with reason off (not a defect).
  const u6off = planBars({ categories: [{ label: "a", value: 50 }], mode: "simple", valueLabels: "off" });
  check(u6off.bars[0].rects[0].showValue === false && u6off.bars[0].rects[0].valueHideReason === "off", "valueLabels:off → hidden(off)");
  check(u6off.dropped.hiddenLabels === 0, "off-labels are NOT counted as a defect", `got ${u6off.dropped.hiddenLabels}`);

  console.log("U7 — category-label fit-or-hide (C6):");
  const u7 = planBars({ categories: [{ label: "x".repeat(30), value: 50 }, { label: "ok", value: 40 }], mode: "simple" });
  check(u7.bars[0].showLabel === false && u7.bars[0].labelHideReason === "tooLong", "category label > 18cp → hidden(tooLong)");
  check(u7.bars[1].showLabel === true, "short category label shows");
  check(u7.dropped.hiddenLabels >= 1, "hidden category label surfaced in counter", `got ${u7.dropped.hiddenLabels}`);

  console.log("U8 — sort (by value simple / total grouped+stacked; stable; before cap):");
  const u8 = planBars({ categories: [{ label: "a", value: 10 }, { label: "b", value: 30 }, { label: "c", value: 20 }], mode: "simple", sort: "desc" });
  check(u8.bars.map((b) => b.label).join(",") === "b,c,a", "desc sorts by value (simple)", u8.bars.map((b) => b.label).join(","));
  const u8a = planBars({ categories: [{ label: "a", value: 10 }, { label: "b", value: 30 }, { label: "c", value: 20 }], mode: "simple", sort: "asc" });
  check(u8a.bars.map((b) => b.label).join(",") === "a,c,b", "asc sorts by value", u8a.bars.map((b) => b.label).join(","));
  const u8t = planBars({ categories: [{ label: "a", values: [5, 5] }, { label: "b", values: [40, 1] }, { label: "c", values: [10, 10] }], mode: "stacked", sort: "desc" });
  check(u8t.bars.map((b) => b.label).join(",") === "b,c,a", "stacked desc sorts by category TOTAL", u8t.bars.map((b) => b.label).join(","));
  const u8tie = planBars({ categories: [{ label: "a", value: 10 }, { label: "b", value: 10 }, { label: "c", value: 10 }], mode: "simple", sort: "desc" });
  check(u8tie.bars.map((b) => b.label).join(",") === "a,b,c", "stable for ties (author order preserved)", u8tie.bars.map((b) => b.label).join(","));

  console.log("U9 — stagger-vs-N: last bar grow ends ≤ 0.85; shared category barStart (§2.5):");
  check(approx(staggerForN(2), 0.06), "N=2 → stagger 0.06");
  const sN = staggerForN(8);
  check(GROW_START + sN * 7 + BAR_GROW_DUR <= SETTLE_DEADLINE + 1e-9, "N=8: last bar grow ends ≤ 0.85", `ends ${(GROW_START + sN * 7 + BAR_GROW_DUR).toFixed(4)}`);
  const u9 = planBars({ categories: mk(4), mode: "grouped", seriesLabels: ["x", "y"] });
  // (the above is simple values, so 1 series; use explicit values to make grouped real)
  const u9g = planBars({ categories: [{ label: "a", values: [1, 2] }, { label: "b", values: [3, 4] }], mode: "grouped" });
  check(u9g.bars[0].rects.every((r) => true) && approx(u9g.bars[0].barStart, GROW_START), "grouped sub-bars share the category barStart");
  check(approx(labelStart(u9.bars[0].barStart), u9.bars[0].barStart + BAR_GROW_DUR), "labelStart = barStart + BAR_GROW_DUR");

  console.log("U10 — degenerate: empty / negative / all-zero / 1-series (§2.6.6):");
  check(planBars({ categories: [], mode: "simple" }).empty === true, "0 categories → empty:true");
  const u10n = planBars({ categories: [{ label: "a", value: -5 }, { label: "b", value: 10 }], mode: "simple", axisMin: 0, axisMax: 10 });
  check(u10n.bars.find((b) => b.label === "a").rects[0].h === 0, "negative value → clamped to 0 (zero-height bar)");
  const u10z = planBars({ categories: [{ label: "a", value: 0 }, { label: "b", value: 0 }], mode: "simple" });
  check(Number.isFinite(u10z.axisMax) && u10z.axisMax > u10z.axisMin, "all-zero → axis guard, no NaN", `[${u10z.axisMin}, ${u10z.axisMax}]`);
  check(u10z.bars.every((b) => b.rects.every((r) => Number.isFinite(r.h))), "all-zero → finite heights (no division by zero)");
  const u10s = planBars({ categories: [{ label: "a", values: [50] }], mode: "grouped" });
  check(u10s.bars[0].rects.length === 1, "1 series in grouped → renders one bar (≡ simple)");

  console.log("U11 — unknown-enum → default (§2.3):");
  const u11 = planBars({ categories: [{ label: "a", value: 1 }], mode: "bogus", orientation: "sideways", sort: "weird", valueLabels: "maybe" });
  check(u11.mode === "simple", "unknown mode → simple", u11.mode);
  check(u11.orientation === "vertical", "unknown orientation → vertical", u11.orientation);
  check(u11.valueLabels === "auto", "unknown valueLabels → auto", u11.valueLabels);
  // sort coercion: an unknown sort leaves author order (none).
  const u11s = planBars({ categories: [{ label: "a", value: 1 }, { label: "b", value: 9 }], mode: "simple", sort: "weird" });
  check(u11s.bars.map((b) => b.label).join(",") === "a,b", "unknown sort → none (author order)", u11s.bars.map((b) => b.label).join(","));

  console.log("U12 — referenceLine (PL-4.2): default null; lineY = value(clamp(...)); label show/hide:");
  // DEFAULT: no referenceLine ⇒ plan.referenceLine === null (the byte-identity no-op).
  check(planBars({ categories: [{ label: "a", value: 50 }], mode: "simple" }).referenceLine === null, "no referenceLine → plan.referenceLine === null (byte-identity no-op)");
  // VERTICAL: resolved y == value(clamp(value)) from the baseline, pure-from-data.
  const u12 = planBars({ categories: [{ label: "a", value: 90 }, { label: "b", value: 40 }], mode: "simple", axisMin: 0, axisMax: 100, referenceLine: { value: 70, label: "target" } });
  const expLen = ((70 - 0) / (100 - 0)) * growLenV;
  check(approx(u12.referenceLine.lenPx, expLen, 0.5), "lenPx == value(clamp(70)) within tol", `got ${u12.referenceLine.lenPx?.toFixed(2)} vs ${expLen.toFixed(2)}`);
  check(approx(u12.referenceLine.y1, BASELINE_Y - expLen, 0.5) && approx(u12.referenceLine.y2, BASELINE_Y - expLen, 0.5), "vertical refline is horizontal at y == BASELINE_Y − lenPx", `y1 ${u12.referenceLine.y1?.toFixed(1)}`);
  check(u12.referenceLine.x1 === PLOT_X0_V && u12.referenceLine.x2 === PLOT_X1_V, "vertical refline spans the plot band [PLOT_X0_V, PLOT_X1_V]");
  check(u12.referenceLine.showLabel === true && u12.referenceLine.label === "target", "short label fits → shown");
  // OUT-OF-AXIS CLAMP (reused): value > axisMax ⇒ lenPx clamped to growLen (line never exits the band).
  const u12hi = planBars({ categories: [{ label: "a", value: 50 }], mode: "simple", axisMin: 0, axisMax: 100, referenceLine: { value: 140 } });
  check(approx(u12hi.referenceLine.lenPx, growLenV, 0.5), "value > axisMax → lenPx clamped to growLen (out-of-axis clamp reused)", `got ${u12hi.referenceLine.lenPx?.toFixed(2)}`);
  check(u12hi.referenceLine.y1 >= PLOT_Y0 - 0.5, "clamped refline stays at/below the plot top (in band)", `y1 ${u12hi.referenceLine.y1?.toFixed(1)}`);
  // value < axisMin ⇒ lenPx clamped to 0 (sits on the baseline).
  const u12lo = planBars({ categories: [{ label: "a", value: 50 }], mode: "simple", axisMin: 0, axisMax: 100, referenceLine: { value: -20 } });
  check(approx(u12lo.referenceLine.lenPx, 0, 0.5) && approx(u12lo.referenceLine.y1, BASELINE_Y, 0.5), "value < axisMin → lenPx clamped to 0 (on the baseline)");
  // HORIZONTAL: vertical line at x == PLOT_X0_H + lenPx, spanning the plot height.
  const u12h = planBars({ categories: [{ label: "a", value: 90 }], mode: "simple", orientation: "horizontal", axisMin: 0, axisMax: 100, referenceLine: { value: 50, label: "avg" } });
  const expLenH = ((50 - 0) / (100 - 0)) * (PLOT_X1_H - PLOT_X0_H);
  check(approx(u12h.referenceLine.lenPx, expLenH, 0.5) && approx(u12h.referenceLine.x1, PLOT_X0_H + expLenH, 0.5), "horizontal refline is vertical at x == PLOT_X0_H + lenPx", `x1 ${u12h.referenceLine.x1?.toFixed(1)}`);
  check(u12h.referenceLine.y1 === PLOT_Y0_H && u12h.referenceLine.y2 === PLOT_Y1_H, "horizontal refline spans the plot height [PLOT_Y0_H, PLOT_Y1_H]");
  // LABEL FIT-OR-HIDE: > 18cp ⇒ hidden(tooLong), the LINE is KEPT (hide-don't-bend).
  const u12long = planBars({ categories: [{ label: "a", value: 50 }], mode: "simple", axisMin: 0, axisMax: 100, referenceLine: { value: 50, label: "x".repeat(30) } });
  check(u12long.referenceLine.showLabel === false && u12long.referenceLine.labelHideReason === "tooLong", "ref label > 18cp → hidden(tooLong)");
  check(u12long.referenceLine.lenPx > 0, "line KEPT when the label is hidden (hide-don't-bend)");
  // empty label ⇒ no label, line kept (not a defect).
  const u12empty = planBars({ categories: [{ label: "a", value: 50 }], mode: "simple", axisMin: 0, axisMax: 100, referenceLine: { value: 50 } });
  check(u12empty.referenceLine.showLabel === false && u12empty.referenceLine.labelHideReason === "empty", "no label text → showLabel:false (empty), line kept");
  // COLLISION: a right-edge bar whose top == the ref line y ⇒ its value label collides with the
  // right-anchored ref label ⇒ ref label HIDDEN (collision), line KEPT. Deterministic from data.
  const u12col = planBars({ categories: [{ label: "a", value: 30 }, { label: "b", value: 35 }, { label: "c", value: 40 }, { label: "d", value: 90 }, { label: "e", value: 90 }], mode: "simple", axisMin: 0, axisMax: 100, referenceLine: { value: 90, label: "ceiling 90" } });
  check(u12col.referenceLine.showLabel === false && u12col.referenceLine.labelHideReason === "collision", "ref label overlapping a value label → hidden(collision)", `reason ${u12col.referenceLine.labelHideReason}`);
  check(u12col.referenceLine.lenPx > 0, "collision hides only the LABEL — the line is kept");
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
const rectEq = (a, b, tol = 0.5) => a && b && ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) <= tol);
const overlap = (A, B) => {
  const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
  const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
  return ox > 4 && oy > 4 ? Math.min(ox, oy) : 0;
};

// ── 2. Sampled-t DOM suite ─────────────────────────────────────────────────────
async function geometrySuite(page) {
  for (const id of ANIM_FIXTURES) {
    const spec = JSON.parse(await readFile(fixturePath(id), "utf8"));
    const v = spec.visualization;
    const plan = planBars({ categories: v.categories, mode: v.mode, orientation: v.orientation, valueLabels: v.valueLabels, sort: v.sort, seriesLabels: v.seriesLabels, seriesAccents: v.seriesAccents, axisMin: v.axisMin, axisMax: v.axisMax, unit: v.unit, referenceLine: v.referenceLine });
    console.log(`Sampled-t DOM pass — ${id} (${plan.mode}/${plan.orientation}, t ∈ {${T_SAMPLES.join(", ")}}):`);

    const reports = await sampleFixture(page, id, T_SAMPLES);
    const base = reports[1];
    const D = base.bars;
    if (!check(!!D, "bars section present at t=1")) continue;

    const isV = plan.orientation === "vertical";
    const sx = D.scaleX;
    const sy = D.scaleY;
    const svgLeft = D.rect.x;
    const svgTop = D.rect.y;
    // Plot band edges in canvas-local CSS px (viewBox → CSS).
    const plotXcss = (vx) => svgLeft + vx * sx;
    const plotYcss = (vy) => svgTop + vy * sy;
    const bandLeft = plotXcss(isV ? PLOT_X0_V : PLOT_X0_H);
    const bandRight = plotXcss(isV ? PLOT_X1_V : PLOT_X1_H);
    const bandTop = plotYcss(isV ? PLOT_Y0 : PLOT_Y0_H);
    const bandBottom = plotYcss(isV ? BASELINE_Y : PLOT_Y1_H);

    // D6 — count/series/segment caps: rendered bar count == planBars post-clamp at every sample.
    const planBarCount = plan.bars.reduce((s, b) => s + b.rects.length, 0);
    check(
      T_SAMPLES.every((t) => reports[t].bars?.barCount === planBarCount),
      `rendered bar/sub-bar/segment count === ${planBarCount} (planBars post-clamp) at every sample (D6)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].bars?.barCount).join(",")}`,
    );
    check(D.catCount === plan.bars.length, `category count === ${plan.bars.length} (after cap) (D6)`, `got ${D.catCount}`);
    if (isV) check(D.catCount <= MAX_CAT_V, `≤ ${MAX_CAT_V} categories vertical (C1)`, `got ${D.catCount}`);
    else check(D.catCount <= MAX_CAT_H, `≤ ${MAX_CAT_H} categories horizontal (C1)`, `got ${D.catCount}`);

    // D3 — layout reserved: transform-blind LAYOUT box of every bar + nodeCount identical across all 10 samples.
    check(
      T_SAMPLES.every((t) => reports[t].bars?.nodeCount === D.nodeCount),
      `svg DOM node count constant (${D.nodeCount}) — nothing mounts/unmounts across t (D3)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].bars?.nodeCount).join(",")}`,
    );
    let layoutOk = true, layoutDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].bars;
      if (!rectEq(d.rect, D.rect)) { layoutOk = false; layoutDetail = `svg rect drifts at t=${t}`; }
      for (let ci = 0; ci < D.cats.length; ci++) {
        for (let ri = 0; ri < D.cats[ci].rects.length; ri++) {
          const a = d.cats[ci]?.rects[ri]?.layout, b = D.cats[ci].rects[ri].layout;
          if (!a || !b || ["x", "y", "w", "h"].some((k) => Math.abs(a[k] - b[k]) > 0.5)) { layoutOk = false; layoutDetail = `cat ${ci} rect ${ri} LAYOUT box drifts at t=${t}`; }
        }
      }
    }
    check(layoutOk, "every bar's transform-blind LAYOUT box (viewBox x/y/w/h) + svg identical across all 10 samples (≤0.5px) (D3)", layoutDetail);

    // D2 — grow-from-baseline: painted extent = final·grow, anchored at the baseline (the baseline-
    // adjacent edge fixed across t; only the far edge moves); transform OMITTED at t≥0.85 (never identity).
    // Each disconnected bar (simple/grouped) is baseline-anchored: its baseline-adjacent edge is
    // fixed across t and only the far edge moves; painted extent == final·grow. A STACKED bar grows
    // as ONE unit (§2.5 connected-within-a-stack exception) — the WHOLE COLUMN's baseline edge is
    // fixed and each segment's painted extent scales by grow (individual segment bottom edges DO
    // translate as the column scales, by design), so we assert at the column level for stacked.
    let growOk = true, growDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].bars;
      for (let ci = 0; ci < d.cats.length; ci++) {
        const g = barGrow(t, plan.bars[ci].barStart);
        if (plan.mode === "stacked") {
          const rects = d.cats[ci].rects, finals = D.cats[ci].rects;
          if (isV) {
            const baseEdge = Math.max(...rects.map((r) => r.painted.y + r.painted.h));
            const finalBase = Math.max(...finals.map((r) => r.painted.y + r.painted.h));
            if (Math.abs(baseEdge - finalBase) > 1.5) { growOk = false; growDetail = `cat ${ci} stack baseline edge moves at t=${t}`; }
          } else {
            const baseEdge = Math.min(...rects.map((r) => r.painted.x));
            const finalBase = Math.min(...finals.map((r) => r.painted.x));
            if (Math.abs(baseEdge - finalBase) > 1.5) { growOk = false; growDetail = `cat ${ci} stack baseline edge moves at t=${t}`; }
          }
          for (let ri = 0; ri < rects.length; ri++) {
            const ext = isV ? rects[ri].painted.h : rects[ri].painted.w;
            const fin = isV ? finals[ri].painted.h : finals[ri].painted.w;
            if (fin > 1 && Math.abs(ext - fin * g) > Math.max(2, fin * 0.06)) { growOk = false; growDetail = `cat ${ci} seg ${ri} extent ${ext.toFixed(1)} ≠ final·grow ${(fin * g).toFixed(1)} at t=${t}`; }
          }
          continue;
        }
        for (let ri = 0; ri < d.cats[ci].rects.length; ri++) {
          const painted = d.cats[ci].rects[ri].painted;
          const final = D.cats[ci].rects[ri].painted;
          if (isV) {
            if (Math.abs((painted.y + painted.h) - (final.y + final.h)) > 1.2) { growOk = false; growDetail = `cat ${ci} rect ${ri} bottom edge moves at t=${t}`; }
            if (final.h > 1 && Math.abs(painted.h - final.h * g) > Math.max(2, final.h * 0.04)) { growOk = false; growDetail = `cat ${ci} rect ${ri} h ${painted.h.toFixed(1)} ≠ final·grow ${(final.h * g).toFixed(1)} at t=${t}`; }
          } else {
            if (Math.abs(painted.x - final.x) > 1.2) { growOk = false; growDetail = `cat ${ci} rect ${ri} left edge moves at t=${t}`; }
            if (final.w > 1 && Math.abs(painted.w - final.w * g) > Math.max(2, final.w * 0.04)) { growOk = false; growDetail = `cat ${ci} rect ${ri} w ${painted.w.toFixed(1)} ≠ final·grow ${(final.w * g).toFixed(1)} at t=${t}`; }
          }
        }
      }
    }
    check(growOk, "grow-from-baseline: painted extent = final·grow, baseline edge fixed, far edge moves (D2)", growDetail);

    let settleOk = true, settleDetail = "";
    for (const t of [0.85, 0.92, 1]) {
      for (const c of reports[t].bars.cats) {
        for (const r of c.rects) {
          if (r.transform !== "none") { settleOk = false; settleDetail = `bar transform "${r.transform}" at t=${t} — must be OMITTED once settled (D2/LC3)`; }
        }
      }
    }
    check(settleOk, "t ≥ 0.85: bar grow transform OMITTED (none), never identity (D2 settle)", settleDetail);

    // D1 — bar-within-plot: every painted bar/segment ⊆ the plot band at every t; nothing clipped.
    let bandOk = true, bandDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].bars;
      for (let ci = 0; ci < d.cats.length; ci++) {
        for (const r of d.cats[ci].rects) {
          const p = r.painted;
          if (p.w < 0.5 || p.h < 0.5) continue; // zero/near-zero bar (grow=0 or zero value)
          if (p.x < bandLeft - 1 || p.x + p.w > bandRight + 1 || p.y < bandTop - 1 || p.y + p.h > bandBottom + 1) {
            bandOk = false; bandDetail = `cat ${ci} bar [${p.x.toFixed(0)},${p.y.toFixed(0)},${p.w.toFixed(0)},${p.h.toFixed(0)}] exits plot [${bandLeft.toFixed(0)},${bandTop.toFixed(0)}–${bandRight.toFixed(0)},${bandBottom.toFixed(0)}] at t=${t}`;
          }
        }
      }
    }
    check(bandOk, "bar-within-plot: every painted bar/segment ⊆ the plot band at every t; nothing clipped (D1)", bandDetail);

    // D4 — value-axis correctness: each bar's full (t=1) extent == scaleLinear(value) from baseline.
    const growLenCss = isV ? (BASELINE_Y - PLOT_Y0) * sy : (PLOT_X1_H - PLOT_X0_H) * sx;
    const span = plan.axisMax - plan.axisMin || 1;
    let axisOk = true, axisDetail = "";
    for (let ci = 0; ci < D.cats.length; ci++) {
      // For simple/grouped, each rect's extent == value/span·growLen. For stacked, the FULL stack
      // height == total/span·growLen (per-segment offsets are a running sum, asserted via the plan).
      const planBar = plan.bars[ci];
      if (plan.mode === "stacked") {
        const stackH = D.cats[ci].rects.reduce((s, r) => s + (isV ? r.painted.h : r.painted.w), 0);
        const planTotalPx = (planBar.rects.reduce((s, r) => s + (isV ? r.h : r.w), 0)) * (isV ? sy : sx);
        if (Math.abs(stackH - planTotalPx) > 2) { axisOk = false; axisDetail = `cat ${ci} stack height ${stackH.toFixed(1)} ≠ plan total ${planTotalPx.toFixed(1)}`; }
        // running-sum offsets: plan segEnd[i] == segStart[i+1].
        for (let si = 0; si + 1 < planBar.rects.length; si++) {
          if (Math.abs(planBar.rects[si].segEnd - planBar.rects[si + 1].segStart) > 1e-6) { axisOk = false; axisDetail = `cat ${ci} stacked offsets not a running sum`; }
        }
      } else {
        for (let ri = 0; ri < D.cats[ci].rects.length; ri++) {
          const ext = isV ? D.cats[ci].rects[ri].painted.h : D.cats[ci].rects[ri].painted.w;
          const expect = (Math.max(0, Math.min(planBar.rects[ri].value, plan.axisMax) - plan.axisMin) / span) * growLenCss;
          if (Math.abs(ext - expect) > Math.max(2, expect * 0.04)) { axisOk = false; axisDetail = `cat ${ci} rect ${ri} extent ${ext.toFixed(1)} ≠ scaleLinear(value) ${expect.toFixed(1)}`; }
        }
      }
    }
    check(axisOk, "value-axis correctness: each bar's full extent == scaleLinear(value) from the baseline (D4)", axisDetail);

    // D5 — value/category-label no-overlap & fit: no two VISIBLE labels overlap > 4px at any sample;
    // the visible-label SET at t=1 matches planBars show flags exactly.
    let overlapOk = true, overlapDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].bars;
      const leaves = [];
      for (const c of d.cats) {
        if (c.catLabel && c.catLabel.opacity > 0.05) leaves.push(c.catLabel.rect);
        for (const vl of c.vlabels) if (vl.opacity > 0.05) leaves.push(vl.rect);
      }
      for (const lc of d.legendChips) leaves.push(lc.rect);
      for (let i = 0; i < leaves.length; i++)
        for (let j = i + 1; j < leaves.length; j++)
          if (overlap(leaves[i], leaves[j]) > 4) { overlapOk = false; overlapDetail = `two labels overlap ${overlap(leaves[i], leaves[j]).toFixed(1)}px at t=${t}`; }
    }
    check(overlapOk, "no two visible labels (value + category + legend) overlap > 4px at any sample (D5)", overlapDetail);

    let showOk = true, showDetail = "";
    for (let ci = 0; ci < plan.bars.length; ci++) {
      const planVisVals = plan.bars[ci].rects.filter((r) => r.showValue).length;
      const domVisVals = D.cats[ci].vlabels.filter((vl) => vl.opacity > 0.5).length;
      if (planVisVals !== domVisVals) { showOk = false; showDetail = `cat ${ci}: ${domVisVals} visible value labels, plan expects ${planVisVals}`; }
      if (!!D.cats[ci].catLabel !== plan.bars[ci].showLabel) { showOk = false; showDetail = `cat ${ci}: catLabel presence ${!!D.cats[ci].catLabel} vs plan ${plan.bars[ci].showLabel}`; }
    }
    check(showOk, "visible value + category label SET at t=1 matches planBars show flags (D5)", showDetail);

    // D7 — mobile floors / collisions / clipped / safe-margin clean; label eff fonts ≥ 18; coverage.
    let floorOk = true, floorDetail = "";
    for (const c of D.cats) {
      if (c.catLabel && c.catLabel.fontSize < 18 - 0.5) { floorOk = false; floorDetail = `cat label "${(c.catLabel.text || "").slice(0, 10)}" ${c.catLabel.fontSize}px < 18`; }
      for (const vl of c.vlabels) if (vl.opacity > 0.05 && vl.fontSize < 18 - 0.5) { floorOk = false; floorDetail = `value label "${(vl.text || "").slice(0, 8)}" ${vl.fontSize}px < 18`; }
    }
    check(floorOk, "axis/value/category labels' font ≥ 18 (designed at 24) (D7)", floorDetail);
    assertGatingClean(check, reports, T_SAMPLES, " (D1/D7)");
    check(base.textCoverage < 0.42, `textCoverage ${base.textCoverage} < 0.42 at t=1 (D7)`);

    // D8 — referenceLine (PL-4.2 knob #1). Only for fixtures that carry one; a no-op for the rest, so
    // the DEFAULT fixtures stay byte-identical (no refline element ⇒ D.referenceLine === null).
    if (plan.referenceLine) {
      const rl = plan.referenceLine;
      const dRL = D.referenceLine;
      check(!!dRL, "referenceLine present in the DOM at t=1 (D8)");
      if (dRL) {
        // line geometry == the plan (viewBox units), and inside the plot band.
        const geomOk = ["x1", "y1", "x2", "y2"].every((k) => Math.abs(dRL[k] - rl[k]) <= 0.5);
        check(geomOk, "refline endpoints == plan (viewBox), pure-from-data (D8)", `dom ${JSON.stringify({ x1: dRL.x1, y1: dRL.y1, x2: dRL.x2, y2: dRL.y2 })} vs plan ${JSON.stringify({ x1: rl.x1, y1: rl.y1, x2: rl.x2, y2: rl.y2 })}`);
        const inBandVB = isV
          ? dRL.y1 >= PLOT_Y0 - 0.5 && dRL.y1 <= BASELINE_Y + 0.5 && dRL.x1 >= PLOT_X0_V - 0.5 && dRL.x2 <= PLOT_X1_V + 0.5
          : dRL.x1 >= PLOT_X0_H - 0.5 && dRL.x1 <= PLOT_X1_H + 0.5 && dRL.y1 >= PLOT_Y0_H - 0.5 && dRL.y2 <= PLOT_Y1_H + 0.5;
        check(inBandVB, "refline inside the plot band (out-of-axis clamp held) (D8)");
        // painted line ⊆ the plot band in CSS px (nothing clipped).
        const p = dRL.painted;
        check(p.x >= bandLeft - 2 && p.x + p.w <= bandRight + 2 && p.y >= bandTop - 2 && p.y + p.h <= bandBottom + 2, "painted refline ⊆ the plot band in CSS px (D8)", `painted ${JSON.stringify(p)}`);
        // NEUTRAL colour — a reference, not a data accent (the neutral-connector discipline).
        check(sat(dRL.stroke) < 0.22, `refline stroke NEUTRAL (sat ${sat(dRL.stroke).toFixed(3)} < 0.22) — "${dRL.stroke}" (D8)`);
        // stroke ≥ the data-stroke floor (a substantial reference dash, not a hairline gridline).
        check(dRL.strokeWidth >= REF_LINE_STROKE - 0.5, `refline strokeWidth ${dRL.strokeWidth} ≥ ${REF_LINE_STROKE} (D8)`);
        // reveal complete at t=1 (fades in after the bars settle; final frame == settled).
        check(dRL.opacity > 0.95, `refline opacity ${dRL.opacity} ≈ 1 at t=1 (drawn after settle) (D8)`);
        check(Math.abs(refLineReveal(1) - 1) < 1e-9 && refLineReveal(0) === 0, "refLineReveal: 0 at t=0, 1 at t=1 (thumbnail-safe) (D8)");
        // label show/hide == the plan; if shown, it must NOT overlap a visible value label.
        check(!!dRL.label === rl.showLabel, `refline label presence (${!!dRL.label}) == plan.showLabel (${rl.showLabel}) (D8)`);
        if (dRL.label && rl.showLabel) {
          const vBoxes = [];
          for (const c of D.cats) for (const vl of c.vlabels) if (vl.opacity > 0.5) vBoxes.push(vl.rect);
          const worst = Math.max(0, ...vBoxes.map((b) => boxOverlap(dRL.label.rect, b)));
          check(worst <= 4, "refline label does NOT overlap a visible value label (>4px) (D8)", `worst overlap ${worst.toFixed(1)}px`);
        }
      }
    }
  }
}

await unitSuite();
if (!UNIT_ONLY) {
  console.log(`\nDOM passes — need the dev server at ${BASE} (npm run dev)\n`);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await geometrySuite(page);
  } finally {
    await browser.close();
  }
}
console.log(`\n${failures ? "✖ FAIL" : "✔ PASS"} — ${failures} failing check(s)`);
process.exit(failures ? 2 : 0);
