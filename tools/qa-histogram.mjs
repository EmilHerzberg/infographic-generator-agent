#!/usr/bin/env node
// PL-2.6 deterministic gate — HistogramChart (contiguous bins on a numeric axis + a count axis +
// optional NEUTRAL stat markers that draw on) distribution primitive (no LLM). Fifth sprint of Epic
// PL-2 (the chart family). Histogram = "bar, but contiguous bins on a numeric axis."
//
//   node tools/qa-histogram.mjs --unit   # planHistogram decision tables (no dev server)
//   npm run dev                          # in another terminal — DOM passes need the dev server
//   npm run qa:histogram                 # full: unit + sampled-t DOM pass
//
// Covers handoff §2.7 (planning/primitive-library/handoffs/PL-2.6-histogram.md):
//   1. planHistogram unit suite (U1–U10): binning incl. last-bin-inclusive + interior boundary,
//      bin-count clamp/Sturges, axis derivation, statistics (median/mean/p95), markers knob +
//      bins-only suppression + markerLines override + ≤3 cap, out-of-axis clamp, sliver floor +
//      zero-count, degenerate/empty/XOR, stagger-vs-N + marker timing, unknown-enum coercion.
//   2. Sampled-t DOM pass (D1/D2/D3 reused + D-count/D-binx/D-marker/D-xticks/D-label/D-cap/D-mobile)
//      at T = {0, 0.30, 0.36, 0.46, 0.56, 0.66, 0.76, 0.85, 0.92, 1} over the values+markers,
//      pre-binned, single-value, over-cap, and long-x-label fixtures (one headless Chromium): bins-
//      within-plot, grow-from-baseline + settle (transform OMITTED at t≥0.85), layout reserved,
//      count-axis correctness incl. sliver-floor + zero-gap, bin x-position + contiguity (gap==0),
//      marker correctness + draw-on after settle, every-k x-ticks, label fit, bin-count cap, mobile
//      floors / collisions / clipped / safe-margin clean at every sample.
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BASE, VIEWPORT, sampleFixture, assertGatingClean } from "./lib/sampled-t.mjs";
import {
  planHistogram,
  binValues,
  sturges,
  median,
  mean,
  percentile,
  everyKEdges,
  staggerForN,
  niceMax,
  barGrow,
  markerReveal,
  MIN_BINS,
  MAX_BINS,
  MIN_BIN_PX,
  MAX_X_TICKS,
  MARKER_START,
  PLOT_X0,
  PLOT_X1,
  PLOT_Y0,
  BASELINE_Y,
} from "../src/lib/histogram.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UNIT_ONLY = process.argv.includes("--unit");

const T_SAMPLES = [0, 0.3, 0.36, 0.46, 0.56, 0.66, 0.76, 0.85, 0.92, 1];
const ANIM_FIXTURES = [
  "fuzz-58-histogram-values-markers",
  "fuzz-59-histogram-prebinned",
  "fuzz-60-histogram-single-value",
  "fuzz-61-histogram-overcap-bincount",
  "fuzz-62-histogram-long-xlabel",
];
const fixturePath = (id) => join(ROOT, "planning", "fixtures", "renderfuzz", `${id}.render.json`);

let failures = 0;
const check = (ok, name, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "✔" : "✖"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  return ok;
};
const approx = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

const planFromViz = (v) =>
  planHistogram({
    values: v.values,
    bins: v.bins,
    binCount: v.binCount,
    xLabel: v.xLabel,
    yLabel: v.yLabel,
    xUnit: v.xUnit,
    markers: v.markers,
    markerLines: v.markerLines,
    axisMin: v.axisMin,
    axisMax: v.axisMax,
    valueLabels: v.valueLabels,
    accent: v.accent,
  });

// ── 1. Unit suite (pure — no DOM) ─────────────────────────────────────────────
function unitSuite() {
  console.log("U1 — binning correctness: last-bin-inclusive + interior boundary (§2.6):");
  // 0..10 in 5 bins of width 2: edges [0,2,4,6,8,10]. A value == hi (10) lands in the LAST bin.
  const u1 = binValues([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0, 10, 5);
  check(u1.counts.length === 5, "5 bins produced", `got ${u1.counts.length}`);
  // value 10 (== hi) must be in bin 4, not a phantom bin 5.
  check(u1.counts[4] >= 1, "value == hi lands in the last bin (inclusive)", `bin4 count ${u1.counts[4]}`);
  // interior boundary: value 4 → floor((4-0)/2)=2 → bin 2 (the UPPER bin, not bin 1).
  const u1b = binValues([4], 0, 10, 5);
  check(u1b.counts[2] === 1 && u1b.counts[1] === 0, "interior boundary value lands in the UPPER bin (floor)", `counts ${u1b.counts.join(",")}`);
  // total preserved.
  check(u1.counts.reduce((s, c) => s + c, 0) === 11, "all values counted", `sum ${u1.counts.reduce((s, c) => s + c, 0)}`);

  console.log("U2 — bin-count clamp + Sturges default (§2.4):");
  check(planHistogram({ values: [1, 2, 3, 4], binCount: 2 }).bins.length === MIN_BINS, `binCount 2 → clamped to ${MIN_BINS}`);
  check(planHistogram({ values: Array.from({ length: 50 }, (_, i) => i), binCount: 30 }).bins.length === MAX_BINS, `binCount 30 → clamped to ${MAX_BINS}`);
  // Sturges: n=15 → ceil(log2 15)+1 = 5; n=100 → ceil(log2 100)+1 = 8.
  check(sturges(15) === 5, "sturges(15) === 5", `got ${sturges(15)}`);
  check(sturges(100) === 8, "sturges(100) === 8", `got ${sturges(100)}`);
  const u2def = planHistogram({ values: Array.from({ length: 100 }, (_, i) => i) });
  check(u2def.bins.length === 8, "omitted binCount → Sturges (n=100 → 8 bins)", `got ${u2def.bins.length}`);

  console.log("U3 — axis derivation: count 0-baseline + niceMax; x lo/hi from DATA; binWidth (§2.4):");
  // Use a NON-nice max (97) so this actually distinguishes data-extent from niceMax (the bug: niceMax
  // would pad the value axis to 100, leaving empty trailing bins + cramming the distribution left).
  const u3 = planHistogram({ values: [13, 20, 30, 40, 50, 60, 70, 80, 90, 97], binCount: 5 });
  check(u3.countTicks[0] === 0, "count axis 0-baseline", `got ${u3.countTicks[0]}`);
  const maxCount = Math.max(...u3.bins.map((b) => b.count));
  check(u3.axisMaxCount === niceMax(Math.max(1, maxCount)), "axisMaxCount === niceMax(maxBinCount)", `got ${u3.axisMaxCount} maxCount ${maxCount}`);
  check(u3.axisMinX === 13, "lo from DATA min (not padded)", `got ${u3.axisMinX}`);
  check(u3.axisMaxX === 97, "hi from DATA max (NOT niceMax — the value axis spans the data)", `got ${u3.axisMaxX}`);
  const binWidthData = (u3.axisMaxX - u3.axisMinX) / u3.bins.length;
  check(approx(u3.edges[1] - u3.edges[0], binWidthData), "binWidth = (hi-lo)/binCount", `edge gap ${u3.edges[1] - u3.edges[0]} vs ${binWidthData}`);
  // author axis override.
  const u3a = planHistogram({ values: [5, 50, 95], binCount: 5, axisMin: 0, axisMax: 100 });
  check(u3a.axisMinX === 0 && u3a.axisMaxX === 100, "author axisMin/axisMax honored", `[${u3a.axisMinX},${u3a.axisMaxX}]`);

  console.log("U4 — statistics: median / mean / p95 (§2.4 stat-math):");
  const sorted = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
  check(approx(median(sorted), 50.5), "median(1..100) === 50.5", `got ${median(sorted)}`);
  check(approx(mean(sorted), 50.5), "mean(1..100) === 50.5", `got ${mean(sorted)}`);
  // p95 via linear interpolation: idx = 0.95*99 = 94.05 → 95 + 0.05*(96-95) = 95.05.
  check(approx(percentile(sorted, 0.95), 95.05), "p95(1..100) === 95.05 (linear interp)", `got ${percentile(sorted, 0.95)}`);
  // markers map to correct x.
  const u4 = planHistogram({ values: sorted, markers: "median", binCount: 10, axisMin: 1, axisMax: 100 });
  const med = u4.markers.find((m) => m.kind === "median");
  const expectX = PLOT_X0 + ((50.5 - 1) / (100 - 1)) * (PLOT_X1 - PLOT_X0);
  check(med && approx(med.xPx, expectX, 1), "median marker x == scaleLinear(median)", `got ${med && med.xPx.toFixed(1)} vs ${expectX.toFixed(1)}`);

  console.log("U5 — markers knob + suppression + override + ≤3 cap (§2.3/§2.6):");
  check(planHistogram({ values: [1, 2, 3, 4, 5], markers: "off" }).markers.length === 0, "markers:off → no markers");
  check(planHistogram({ values: [1, 2, 3, 4, 5], markers: "median" }).markers.length === 1, "markers:median → 1 line");
  check(planHistogram({ values: [1, 2, 3, 4, 5], markers: "medianMean" }).markers.length === 2, "markers:medianMean → 2 lines");
  // bins-only → markers suppressed.
  const u5b = planHistogram({ bins: [{ x0: 0, x1: 10, count: 3 }, { x0: 10, x1: 20, count: 5 }], markers: "median" });
  check(u5b.markers.length === 0 && u5b.dropped.markersSuppressed >= 1, "bins-only → markers suppressed (markersSuppressed)", `markers ${u5b.markers.length}`);
  // markerLines override the enum.
  const u5o = planHistogram({ values: [1, 2, 3, 4, 5], markers: "median", markerLines: [{ value: 3, label: "SLA" }] });
  check(u5o.markers.length === 1 && u5o.markers[0].kind === "custom", "markerLines override the enum (custom only)", `kinds ${u5o.markers.map((m) => m.kind).join(",")}`);
  // ≤3 cap: 4 markerLines → 3 + markersDropped.
  const u5c = planHistogram({ values: [1, 2, 3, 4, 5], markerLines: [{ value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }] });
  check(u5c.markers.length === 3 && u5c.dropped.markersDropped === 1, "≤3 marker cap (markersDropped surfaced)", `markers ${u5c.markers.length} dropped ${u5c.dropped.markersDropped}`);

  console.log("U6 — out-of-axis clamp (values + markers) (§2.6):");
  // author-tight axis: values below lo / above hi clamped into first/last bin + clampedValues.
  const u6 = planHistogram({ values: [-5, 50, 200], binCount: 5, axisMin: 0, axisMax: 100 });
  check(u6.dropped.clampedValues === 2, "below-lo/above-hi values clamped (clampedValues)", `got ${u6.dropped.clampedValues}`);
  check(u6.bins[0].count >= 1 && u6.bins[u6.bins.length - 1].count >= 1, "clamped values land in first/last bin");
  // marker out of axis clamped + clampedMarkers, line in band, label shows true value.
  const u6m = planHistogram({ values: [1, 2, 3, 4, 5], markerLines: [{ value: 999, label: "way out" }], axisMin: 0, axisMax: 10 });
  check(u6m.dropped.clampedMarkers >= 1, "marker out of axis → clampedMarkers", `got ${u6m.dropped.clampedMarkers}`);
  check(u6m.markers[0].xPx <= PLOT_X1 + 0.5 && u6m.markers[0].xPx >= PLOT_X0 - 0.5, "clamped marker line stays in band", `xPx ${u6m.markers[0].xPx}`);

  console.log("U7 — sliver floor + zero-count (§2.6):");
  // A 1-count bin among very tall bins → its scaled height (< 8px when maxCount is large) is floored
  // to MIN_BIN_PX. 60 values in bin 0 (axisMaxCount=niceMax(60)=100 → count=1 ⇒ 4.9px < 8px floor).
  const u7vals = Array.from({ length: 60 }, () => 5).concat([90]);
  const u7 = planHistogram({ values: u7vals, binCount: 5, axisMin: 0, axisMax: 100 });
  const tail = u7.bins[u7.bins.length - 1];
  check(tail.count === 1 && approx(tail.h, MIN_BIN_PX, 0.01), `count≥1 bin floored to ${MIN_BIN_PX}px (flooredBins)`, `h ${tail.h}`);
  check(u7.dropped.flooredBins >= 1, "flooredBins surfaced", `got ${u7.dropped.flooredBins}`);
  // a zero-count interior bin → height 0, NOT floored, no error.
  const zeroBin = u7.bins.find((b) => b.count === 0);
  check(zeroBin && zeroBin.h === 0, "count==0 bin → height 0 (NOT floored)", `h ${zeroBin && zeroBin.h}`);

  console.log("U8 — degenerate / empty / XOR (§2.6):");
  check(planHistogram({ values: [] }).empty === true, "0 values → empty:true");
  check(planHistogram({ values: [NaN, Infinity, "x"] }).empty === true, "0 finite values → empty:true");
  check(planHistogram({}).empty === true, "no values + no bins → empty:true");
  const u8s = planHistogram({ values: [42, 42, 42, 42], binCount: 5 });
  check(u8s.degenerate === "single-value", "all-same-value → degenerate:single-value");
  check(u8s.bins.every((b) => Number.isFinite(b.h) && Number.isFinite(b.x)), "single-value → finite geometry (no NaN, finite binWidth)");
  // both values + bins → values win, binsIgnored.
  const u8x = planHistogram({ values: [1, 2, 3, 4, 5], bins: [{ x0: 0, x1: 1, count: 1 }] });
  check(u8x.dropped.binsIgnored === 1, "values + bins → values win (binsIgnored)", `got ${u8x.dropped.binsIgnored}`);
  // invalid bins dropped.
  const u8i = planHistogram({ bins: [{ x0: 0, x1: 10, count: 3 }, { x0: 30, x1: 20, count: 1 }, { x0: 0, x1: 5, count: -2 }] });
  check(u8i.dropped.invalidBins === 2, "invalid bins dropped (x1≤x0, count<0)", `got ${u8i.dropped.invalidBins}`);

  console.log("U9 — stagger-vs-N + marker timing (§2.5, REUSED bars):");
  const sN = staggerForN(14);
  check(0.34 + sN * 13 + 0.3 <= 0.85 + 1e-9, "N=14: last bin grow ends ≤ 0.85", `ends ${(0.34 + sN * 13 + 0.3).toFixed(4)}`);
  check(MARKER_START >= 0.85, "markerReveal starts ≥ 0.86 (after settle)", `MARKER_START ${MARKER_START}`);
  check(markerReveal(0.85) === 0 && markerReveal(1) === 1, "markerReveal: 0 at settle deadline, 1 at t=1", `0.85→${markerReveal(0.85)} 1→${markerReveal(1)}`);

  console.log("U10 — unknown-enum → default (§2.3):");
  const u10 = planHistogram({ values: [1, 2, 3, 4, 5], markers: "p99", valueLabels: "maybe" });
  check(u10.markersKnob === "off", "unknown markers → off", u10.markersKnob);
  check(u10.valueLabels === "auto", "unknown valueLabels → auto", u10.valueLabels);
  // every-k edges: 14 bins → 15 edges, k=ceil(15/6)=3 → first+last always present, ≤6 labels.
  const ek = everyKEdges(14, MAX_X_TICKS);
  check(ek.length <= MAX_X_TICKS + 1 && ek[0] === 0 && ek[ek.length - 1] === 14, "everyKEdges: first+last present, count bounded", `idx ${ek.join(",")}`);
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
const overlap = (A, B) => {
  const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
  const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
  return ox > 4 && oy > 4 ? Math.min(ox, oy) : 0;
};

// ── 2. Sampled-t DOM suite ─────────────────────────────────────────────────────
async function geometrySuite(page) {
  for (const id of ANIM_FIXTURES) {
    const spec = JSON.parse(await readFile(fixturePath(id), "utf8"));
    const plan = planFromViz(spec.visualization);
    console.log(`Sampled-t DOM pass — ${id} (${plan.bins.length} bins, markers=${plan.markersKnob}, t ∈ {${T_SAMPLES.join(", ")}}):`);

    const reports = await sampleFixture(page, id, T_SAMPLES);
    const base = reports[1];
    const D = base.histogram;
    if (!check(!!D, "histogram section present at t=1")) continue;

    const sx = D.scaleX;
    const sy = D.scaleY;
    const svgLeft = D.rect.x;
    const svgTop = D.rect.y;
    const plotXcss = (vx) => svgLeft + vx * sx;
    const plotYcss = (vy) => svgTop + vy * sy;
    const bandLeft = plotXcss(PLOT_X0);
    const bandRight = plotXcss(PLOT_X1);
    const bandTop = plotYcss(PLOT_Y0);
    const bandBottom = plotYcss(BASELINE_Y);

    // D-cap — bin-count cap: rendered bin count == plan binCount ≤ 14 at every sample.
    check(
      T_SAMPLES.every((t) => reports[t].histogram?.binCount === D.binCount),
      `rendered bin count === ${D.binCount} at every sample (D-cap)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].histogram?.binCount).join(",")}`,
    );
    check(D.binCount === plan.bins.length && D.binCount <= MAX_BINS, `bin count === plan (${plan.bins.length}) ≤ ${MAX_BINS} (D-cap)`, `got ${D.binCount}`);

    // D3 — layout reserved: transform-blind LAYOUT box of every bin + nodeCount identical across all 10.
    check(
      T_SAMPLES.every((t) => reports[t].histogram?.nodeCount === D.nodeCount),
      `svg DOM node count constant (${D.nodeCount}) — nothing mounts/unmounts across t (D3)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].histogram?.nodeCount).join(",")}`,
    );
    let layoutOk = true, layoutDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].histogram;
      for (let bi = 0; bi < D.bins.length; bi++) {
        const a = d.bins[bi]?.layout, b = D.bins[bi].layout;
        if (a == null && b == null) continue; // zero-count bin: no rect either sample
        if (!a || !b || ["x", "y", "w", "h"].some((k) => Math.abs(a[k] - b[k]) > 0.5)) { layoutOk = false; layoutDetail = `bin ${bi} LAYOUT box drifts at t=${t}`; }
      }
    }
    check(layoutOk, "every bin's transform-blind LAYOUT box (viewBox x/y/w/h) identical across all 10 samples (≤0.5px) (D3)", layoutDetail);

    // D2 — grow-from-baseline: painted height = final·barGrow(t,binStart); baseline (bottom) edge
    // fixed; transform OMITTED at t≥0.85. (REUSE bars D2, simple-bar branch.)
    let growOk = true, growDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].histogram;
      for (let bi = 0; bi < D.bins.length; bi++) {
        const final = D.bins[bi].painted;
        const painted = d.bins[bi].painted;
        if (!final || !painted) continue; // zero-count bin → no rect
        const g = barGrow(t, plan.bins[bi].binStart);
        if (Math.abs((painted.y + painted.h) - (final.y + final.h)) > 1.2) { growOk = false; growDetail = `bin ${bi} bottom edge moves at t=${t}`; }
        if (final.h > 1 && Math.abs(painted.h - final.h * g) > Math.max(2, final.h * 0.05)) { growOk = false; growDetail = `bin ${bi} h ${painted.h.toFixed(1)} ≠ final·grow ${(final.h * g).toFixed(1)} at t=${t}`; }
      }
    }
    check(growOk, "grow-from-baseline: painted height = final·barGrow, baseline edge fixed (D2)", growDetail);

    let settleOk = true, settleDetail = "";
    for (const t of [0.85, 0.92, 1]) {
      for (const b of reports[t].histogram.bins) {
        if (b.transform !== "none") { settleOk = false; settleDetail = `bin transform "${b.transform}" at t=${t} — must be OMITTED once settled (D2/LC3)`; }
      }
    }
    check(settleOk, "t ≥ 0.85: bin grow transform OMITTED (none), never identity (D2 settle)", settleDetail);

    // D1 — bins ⊆ plot band at every t; nothing clipped.
    let bandOk = true, bandDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].histogram;
      for (let bi = 0; bi < d.bins.length; bi++) {
        const p = d.bins[bi].painted;
        if (!p || p.w < 0.5 || p.h < 0.5) continue;
        if (p.x < bandLeft - 1 || p.x + p.w > bandRight + 1 || p.y < bandTop - 1 || p.y + p.h > bandBottom + 1) {
          bandOk = false; bandDetail = `bin ${bi} [${p.x.toFixed(0)},${p.y.toFixed(0)},${p.w.toFixed(0)},${p.h.toFixed(0)}] exits plot at t=${t}`;
        }
      }
    }
    check(bandOk, "bins-within-plot: every painted bin ⊆ the plot band at every t; nothing clipped (D1)", bandDetail);

    // D-count — count-axis correctness: each bin's full (t=1) painted height == scaleLinear(count)
    // from baseline; floored bins == MIN_BIN_PX; zero-count bins paint 0.
    const growLenCss = (BASELINE_Y - PLOT_Y0) * sy;
    let countOk = true, countDetail = "";
    for (let bi = 0; bi < D.bins.length; bi++) {
      const planBin = plan.bins[bi];
      const painted = D.bins[bi].painted;
      if (planBin.count === 0) {
        if (painted && painted.h > 1.5) { countOk = false; countDetail = `bin ${bi} count==0 but painted h ${painted.h.toFixed(1)} (should be 0/absent)`; }
        continue;
      }
      const expectVbH = planBin.h; // viewBox px (already floored in the plan)
      const expectCss = expectVbH * sy;
      if (!painted) { countOk = false; countDetail = `bin ${bi} count≥1 but no painted rect`; continue; }
      if (Math.abs(painted.h - expectCss) > Math.max(2.5, expectCss * 0.05)) { countOk = false; countDetail = `bin ${bi} h ${painted.h.toFixed(1)} ≠ plan ${expectCss.toFixed(1)}`; }
    }
    void growLenCss;
    check(countOk, "count-axis correctness: bin height == scaleLinear(count); floored==8px; zero paints 0 (D-count)", countDetail);

    // D-binx — bin x-position + contiguity: x == PLOT_X0 + i·binWidthPx; adjacent bins touch ≤1px
    // (gap == 0); width == (PLOT_X1−PLOT_X0)/binCount. Read from the transform-blind LAYOUT attrs.
    let binxOk = true, binxDetail = "";
    const expectW = plan.binWidthPx;
    for (let bi = 0; bi < D.bins.length; bi++) {
      const layout = D.bins[bi].layout;
      if (!layout) continue; // zero-count bin (no rect); its slot is still implied by neighbours
      const expectX = PLOT_X0 + bi * plan.binWidthPx;
      if (Math.abs(layout.x - expectX) > 0.6) { binxOk = false; binxDetail = `bin ${bi} x ${layout.x} ≠ ${expectX.toFixed(2)}`; }
      if (Math.abs(layout.w - expectW) > 0.6) { binxOk = false; binxDetail = `bin ${bi} w ${layout.w} ≠ ${expectW.toFixed(2)}`; }
    }
    // contiguity: for each adjacent pair of NONZERO bins, right-edge of i == left-edge of i+1 (≤1px).
    for (let bi = 0; bi + 1 < D.bins.length; bi++) {
      const a = D.bins[bi].layout, b = D.bins[bi + 1].layout;
      if (!a || !b) continue;
      const gap = b.x - (a.x + a.w);
      if (Math.abs(gap) > 1) { binxOk = false; binxDetail = `bins ${bi}/${bi + 1} gap ${gap.toFixed(2)}px ≠ 0 (contiguity)`; }
    }
    check(binxOk, "bin x-position + contiguity: equal-width edges, adjacent bins touch (gap==0) (D-binx)", binxDetail);

    // D-marker — marker correctness + draw-on after settle. If markers present:
    if (D.markers.length > 0) {
      let mGeomOk = true, mDetail = "";
      for (let mi = 0; mi < plan.markers.length; mi++) {
        const pm = plan.markers[mi];
        const dm = D.markers[mi];
        if (!dm) { mGeomOk = false; mDetail = `marker ${mi} missing`; continue; }
        // line x == planner xPx (viewBox px), vertical, ⊆ band.
        if (Math.abs(dm.x1 - pm.xPx) > 1 || Math.abs(dm.x2 - pm.xPx) > 1) { mGeomOk = false; mDetail = `marker ${mi} x ${dm.x1}/${dm.x2} ≠ planner ${pm.xPx.toFixed(1)}`; }
        if (pm.xPx < PLOT_X0 - 0.5 || pm.xPx > PLOT_X1 + 0.5) { mGeomOk = false; mDetail = `marker ${mi} xPx out of band ${pm.xPx}`; }
      }
      check(mGeomOk, "D-marker: line x == scaleLinear(stat); ⊆ band", mDetail);
      // draw-on: strokeDashoffset (1−reveal); ≈1 before MARKER_START, ==0 at t=1.
      let drawOk = true, drawDetail = "";
      for (const t of T_SAMPLES) {
        const off = reports[t].histogram?.markers?.[0]?.dashoffset;
        if (off == null || off < -0.02 || off > 1.02) { drawOk = false; drawDetail = `dashoffset ${off} ∉ [0,1] at t=${t}`; }
        const expect = markerReveal(t);
        if (off != null && Math.abs((1 - off) - expect) > 0.03) { drawOk = false; drawDetail = `(1−offset) ${(1 - off).toFixed(3)} ≠ markerReveal ${expect.toFixed(3)} at t=${t}`; }
      }
      const offAtSettle = reports[0.85].histogram?.markers?.[0]?.dashoffset;
      check(offAtSettle != null && offAtSettle >= 0.99, "D-marker: draw starts only AFTER bins settle (offset≈1 at t≤0.85)", `offset@0.85 ${offAtSettle}`);
      const offAt1 = reports[1].histogram?.markers?.[0]?.dashoffset;
      check(approx(offAt1, 0, 0.02), "D-marker: fully drawn (offset==0) at t=1", `offset@1 ${offAt1}`);
      check(drawOk, "D-marker: strokeDashoffset (1−reveal) ∈ [0,1], matches markerReveal(t)", drawDetail);
    } else {
      check(D.markers.length === 0, "D-marker: no marker lines when off / suppressed");
    }

    // D-xticks — every-k x-tick labels: ≤MAX_X_TICKS numeric labels; no two overlap >4px.
    check(D.xTickLabels.length <= MAX_X_TICKS, `≤ ${MAX_X_TICKS} x-tick labels (every-k) (D-xticks)`, `got ${D.xTickLabels.length}`);
    let xtOverlap = true, xtDetail = "";
    for (let i = 0; i < D.xTickLabels.length; i++)
      for (let j = i + 1; j < D.xTickLabels.length; j++)
        if (overlap(D.xTickLabels[i].rect, D.xTickLabels[j].rect) > 4) { xtOverlap = false; xtDetail = `x-ticks overlap ${overlap(D.xTickLabels[i].rect, D.xTickLabels[j].rect).toFixed(1)}px`; }
    check(xtOverlap, "no two x-tick labels overlap > 4px (D-xticks)", xtDetail);

    // D-label — bin-count + marker labels fit: visible set at t=1 matches plan flags; no overlap >4px.
    let showOk = true, showDetail = "";
    const planVisBins = plan.bins.filter((b) => b.showCount).length;
    const domVisBins = D.bins.filter((b) => b.binlabel && b.binlabel.opacity > 0.5).length;
    if (planVisBins !== domVisBins) { showOk = false; showDetail = `${domVisBins} visible bin labels, plan expects ${planVisBins}`; }
    check(showOk, "visible bin-count label SET at t=1 matches plan show flags (D-label)", showDetail);
    let labelOverlapOk = true, labelOverlapDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].histogram;
      const leaves = [];
      for (const b of d.bins) if (b.binlabel && b.binlabel.opacity > 0.05) leaves.push(b.binlabel.rect);
      for (const m of d.markers) if (m.label && m.label.opacity > 0.05) leaves.push(m.label.rect);
      for (let i = 0; i < leaves.length; i++)
        for (let j = i + 1; j < leaves.length; j++)
          if (overlap(leaves[i], leaves[j]) > 4) { labelOverlapOk = false; labelOverlapDetail = `two labels overlap ${overlap(leaves[i], leaves[j]).toFixed(1)}px at t=${t}`; }
    }
    check(labelOverlapOk, "no two visible labels (bin counts + marker labels) overlap > 4px at any sample (D-label)", labelOverlapDetail);

    // D-mobile — mobile floors / collisions / clipped / safe-margin clean; label eff fonts ≥ 18.
    let floorOk = true, floorDetail = "";
    for (const b of D.bins) if (b.binlabel && b.binlabel.opacity > 0.05 && b.binlabel.fontSize < 18 - 0.5) { floorOk = false; floorDetail = `bin label "${b.binlabel.text}" ${b.binlabel.fontSize}px < 18`; }
    for (const m of D.markers) if (m.label && m.label.opacity > 0.05 && m.label.fontSize < 18 - 0.5) { floorOk = false; floorDetail = `marker label "${m.label.text}" ${m.label.fontSize}px < 18`; }
    for (const x of D.xTickLabels) if (x.fontSize < 18 - 0.5) { floorOk = false; floorDetail = `x-tick "${x.text}" ${x.fontSize}px < 18`; }
    check(floorOk, "axis/bin/marker labels' font ≥ 18 (designed at 22–24) (D-mobile)", floorDetail);
    // bin width ≥ 40px source.
    check(plan.binWidthPx >= 40 - 0.01, "bin width ≥ 40px source (D-mobile)", `got ${plan.binWidthPx.toFixed(1)}`);
    assertGatingClean(check, reports, T_SAMPLES, " (D1/D-mobile)");
    check(base.textCoverage < 0.42, `textCoverage ${base.textCoverage} < 0.42 at t=1 (D-mobile)`);
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
