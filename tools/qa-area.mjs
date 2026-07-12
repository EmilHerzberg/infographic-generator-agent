#!/usr/bin/env node
// PL-2.4 deterministic gate — AreaChart (simple / stacked) magnitude-under-a-curve primitive
// (no LLM). Fourth chart of Epic PL-2.
//
//   node tools/qa-area.mjs --unit   # planArea decision tables (no dev server)
//   npm run dev                     # in another terminal — DOM passes need the dev server
//   npm run qa:area                 # full: unit + sampled-t DOM pass
//
// Covers handoff §2.7 (planning/primitive-library/handoffs/PL-2.4-area.md):
//   1. planArea unit suite (U1–U11): series cap, point stride-downsample, truncate-to-common-MIN,
//      0-baseline axis derivation (per-x TOTAL for stacked / max for simple) + niceMax + max>min
//      guard + all-zero, stacked running sum (layer[i].upper == layer[i+1].lower), layer-thickness
//      floor, x-label every-k + fit, end-label fit/collision/off, edge timing, degenerate, and
//      unknown-enum → default coercion.
//   2. Sampled-t DOM pass at T = {0, 0.30, 0.36, 0.46, 0.56, 0.64, 0.74, 0.85, 0.92, 1} over a
//      simple-area, a stacked-area, an over-cap stress fixture, a degenerate fixture, and a long-label
//      fixture (one headless Chromium, Preview ?id&t): area-within-plot, fill-rise (clipWidth ==
//      areaEdge(t)·xSpan, bounded ∈[0,1], full at t=1, no CSS transform on the path), value-axis
//      correctness, layout reserved (path `d` byte-identical + nodeCount static — only the clip width
//      moves), label no-overlap/fit, caps, mobile floors / collisions / clipped / safe-margin clean +
//      lowContrast clean at every sample.
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BASE, VIEWPORT, sampleFixture, assertGatingClean } from "./lib/sampled-t.mjs";
import {
  planArea,
  areaEdge,
  annotationOpacity,
  MAX_SERIES,
  MAX_POINTS,
  MAX_ANNOTATIONS,
  SEG_THICKNESS_FLOOR,
  AREA_STROKE,
  ANN_LABEL_MAX_CP,
  EDGE_START,
  EDGE_END,
  SETTLE_DEADLINE,
  PLOT_X0,
  PLOT_X1,
  PLOT_Y0,
  BASELINE_Y,
} from "../src/lib/area.ts";
import { niceMax } from "../src/lib/bars.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UNIT_ONLY = process.argv.includes("--unit");

const T_SAMPLES = [0, 0.3, 0.36, 0.46, 0.56, 0.64, 0.74, 0.85, 0.92, 1];
const ANIM_FIXTURES = [
  "fuzz-53-area-simple",
  "fuzz-54-area-stacked",
  "fuzz-55-area-overcap-stress",
  "fuzz-56-area-degenerate",
  "fuzz-57-area-longlabel",
  "fuzz-125-area-annotations", // PL-4.2 — ≤3 callouts incl. a collision case
];
const fixturePath = (id) => join(ROOT, "planning", "fixtures", "renderfuzz", `${id}.render.json`);

let failures = 0;
const check = (ok, name, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "✔" : "✖"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  return ok;
};
const approx = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// ── 1. Unit suite (pure — no DOM) ─────────────────────────────────────────────
function unitSuite() {
  console.log("U1 — series cap (C1): simple keeps series[0]; stacked keeps ≤3 tail-first:");
  const u1s = planArea({ mode: "simple", series: [{ label: "a", values: [1, 2, 3] }, { label: "b", values: [4, 5, 6] }, { label: "c", values: [7, 8, 9] }, { label: "d", values: [1, 1, 1] }] });
  check(u1s.series.length === 1, "4 series simple → 1 kept", `got ${u1s.series.length}`);
  check(u1s.dropped.seriesDropped === 3, "seriesDropped === 3", `got ${u1s.dropped.seriesDropped}`);
  const u1k = planArea({ mode: "stacked", series: [{ label: "a", values: [1, 2, 3] }, { label: "b", values: [4, 5, 6] }, { label: "c", values: [7, 8, 9] }, { label: "d", values: [1, 1, 1] }] });
  check(u1k.series.length === MAX_SERIES, `4 series stacked → ${MAX_SERIES} kept`, `got ${u1k.series.length}`);
  check(u1k.dropped.seriesDropped === 1, "seriesDropped === 1", `got ${u1k.dropped.seriesDropped}`);

  console.log("U2 — point stride-downsample (C2): 30 pts → 24, first/last kept, deterministic:");
  const N = 30;
  const vals = Array.from({ length: N }, (_, i) => i + 1);
  const u2 = planArea({ mode: "simple", series: [{ label: "a", values: vals }] });
  check(u2.series[0].values.length === MAX_POINTS, `30 pts → ${MAX_POINTS}`, `got ${u2.series[0].values.length}`);
  check(u2.dropped.pointsDropped === N - MAX_POINTS, `pointsDropped === ${N - MAX_POINTS}`, `got ${u2.dropped.pointsDropped}`);
  check(u2.series[0].values[0] === 1 && u2.series[0].values[MAX_POINTS - 1] === N, "first & last value kept", `got ${u2.series[0].values[0]}…${u2.series[0].values[MAX_POINTS - 1]}`);
  // deterministic stride: index round(i·(N-1)/(MAX_POINTS-1)).
  const expIdx2 = Math.round((2 * (N - 1)) / (MAX_POINTS - 1));
  check(u2.series[0].values[2] === vals[expIdx2], "stride decimation deterministic (idx 2)", `got ${u2.series[0].values[2]} vs ${vals[expIdx2]}`);

  console.log("U3 — length mismatch → truncate to common MIN (C-clamp 3):");
  const u3 = planArea({ mode: "stacked", series: [{ label: "a", values: [1, 2, 3, 4] }, { label: "b", values: [1, 2, 3, 4, 5, 6] }, { label: "c", values: [1, 2, 3, 4, 5] }] });
  check(u3.series.every((s) => s.values.length === 4), "lengths [4,6,5] → all truncated to 4", `got ${u3.series.map((s) => s.values.length).join(",")}`);
  check(u3.dropped.pointsDropped === 3, "truncated tail counted (2 + 1 = 3)", `got ${u3.dropped.pointsDropped}`);

  console.log("U4 — axis: 0-baseline, niceMax(max) simple / niceMax(max per-x total) stacked, guards:");
  const u4s = planArea({ mode: "simple", series: [{ label: "a", values: [12, 19, 73, 41] }] });
  check(u4s.axisMin === 0, "baseline forced to 0 (magnitudes)", `got ${u4s.axisMin}`);
  check(u4s.axisMax === niceMax(73) && u4s.axisMax === 100, "simple → niceMax(maxValue) = 100", `got ${u4s.axisMax}`);
  const u4k = planArea({ mode: "stacked", series: [{ label: "a", values: [10, 20, 30] }, { label: "b", values: [10, 20, 30] }, { label: "c", values: [10, 20, 30] }] });
  check(u4k.axisMax === niceMax(90) && u4k.axisMax === 100, "stacked → niceMax(max per-x TOTAL=90) = 100", `got ${u4k.axisMax}`);
  const u4g = planArea({ mode: "simple", series: [{ label: "a", values: [5, 5] }], axisMax: 0 });
  check(u4g.axisMax > u4g.axisMin && Number.isFinite(u4g.axisMax), "axisMax ≤ 0 guard → finite > min", `got [${u4g.axisMin}, ${u4g.axisMax}]`);
  const u4z = planArea({ mode: "simple", series: [{ label: "a", values: [0, 0, 0] }] });
  check(u4z.axisMax === 1 && u4z.axisMin === 0, "all-zero → axisMax 1, no NaN", `got [${u4z.axisMin}, ${u4z.axisMax}]`);
  check(u4z.series[0].upper.every((p) => Number.isFinite(p.y)), "all-zero → finite edge points (no division by zero)");

  console.log("U5 — stacked running sum (C-value-axis): layer[i].upper == layer[i+1].lower; top == total:");
  const u5 = planArea({ mode: "stacked", series: [{ label: "a", values: [18, 24, 30, 38] }, { label: "b", values: [10, 12, 15, 17] }, { label: "c", values: [8, 9, 11, 14] }] });
  let sumOk = true;
  for (let i = 0; i + 1 < u5.series.length; i++) {
    const up = u5.series[i].upper, lo = u5.series[i + 1].lower;
    if (!up.every((pt, xi) => approx(pt.y, lo[xi].y))) sumOk = false;
  }
  check(sumOk, "every layer's upper edge == the next layer's lower edge (running sum)");
  check(u5.series[u5.series.length - 1].runningUpper.join(",") === "36,45,56,69", "top of stack == per-x column TOTAL", u5.series[u5.series.length - 1].runningUpper.join(","));

  console.log("U6 — layer-thickness floor (C7): a <14px-max-thickness stacked layer dropped + surfaced:");
  // axisMax 1000 → a value of ~5 maps to ~5/1000·490 ≈ 2.45px thickness < 14 → dropped.
  const u6 = planArea({ mode: "stacked", axisMax: 1000, series: [{ label: "big", values: [400, 500, 600] }, { label: "tiny", values: [3, 4, 5] }, { label: "big2", values: [300, 350, 380] }] });
  check(u6.dropped.layersDropped === 1, "the thin layer dropped (layersDropped === 1)", `got ${u6.dropped.layersDropped}`);
  check(u6.series.length === 2, "2 layers survive", `got ${u6.series.length}`);
  // survivors still form a valid running sum.
  let sumOk6 = true;
  for (let i = 0; i + 1 < u6.series.length; i++) {
    const up = u6.series[i].upper, lo = u6.series[i + 1].lower;
    if (!up.every((pt, xi) => approx(pt.y, lo[xi].y))) sumOk6 = false;
  }
  check(sumOk6, "survivors rebuilt into a valid running sum");

  console.log("U7 — x-label every-k (C8): n=20 → k=3, ≤8 shown, first/last present, fit-or-hide:");
  const xl = Array.from({ length: 20 }, (_, i) => `L${i}`);
  const u7 = planArea({ mode: "simple", xLabels: xl, series: [{ label: "a", values: Array.from({ length: 20 }, (_, i) => i + 1) }] });
  const shown = u7.xTicks.filter((x) => x.show);
  check(shown.length <= 8, "≤ 8 x-labels shown", `got ${shown.length}`);
  check(shown[0].index === 0 && shown[shown.length - 1].index === 19, "first & last shown", `got ${shown.map((s) => s.index).join(",")}`);
  // a too-wide label is hidden (never bent). Many close points → a narrow slot a wide label can't fit.
  const wideLabels = Array.from({ length: 9 }, () => "WWWWWWWWWW");
  const u7w = planArea({ mode: "simple", xLabels: wideLabels, series: [{ label: "a", values: Array.from({ length: 9 }, (_, i) => i + 1) }] });
  check(u7w.xTicks.some((x) => !x.show && x.label.trim().length > 0), "an over-wide x-label hides (not bent)");

  console.log("U8 — end-label fit / collision / off / >8cp (C9):");
  const u8 = planArea({ mode: "simple", series: [{ label: "a", values: [10, 50], endValueLabel: "50" }] });
  check(u8.series[0].endLabel.show === true, "short end label shows");
  const u8l = planArea({ mode: "simple", series: [{ label: "a", values: [10, 50], endValueLabel: "way-too-long-label" }] });
  check(u8l.series[0].endLabel.show === false && u8l.series[0].endLabel.hideReason === "tooLong", "end label > 8cp → hidden(tooLong)");
  const u8off = planArea({ mode: "simple", valueLabels: "off", series: [{ label: "a", values: [10, 50] }] });
  check(u8off.series[0].endLabel.show === false && u8off.series[0].endLabel.hideReason === "off", "valueLabels:off → hidden(off)");
  check(u8off.dropped.hiddenLabels === 0, "off-labels NOT counted as a defect", `got ${u8off.dropped.hiddenLabels}`);
  // collision: two stacked layers ending at near-identical y (a thin top layer over a thick base) →
  // their end-label anchors fall within END_LABEL_PX+6 px → the smaller end value (the thin layer) hides.
  const u8c = planArea({ mode: "stacked", axisMax: 1000, series: [{ label: "a", values: [500, 500], endValueLabel: "500" }, { label: "b", values: [60, 60], endValueLabel: "560" }] });
  // a-upper at y(500); b-upper at y(560) — ~29px apart < END_LABEL_PX(28)+6 → the smaller END VALUE
  // (b's own last value 60 < a's 500) hides as the lower-priority collider; the base layer stays.
  check(u8c.series[1].endLabel.show === false && u8c.series[1].endLabel.hideReason === "collide" && u8c.series[0].endLabel.show === true, "colliding end labels → smaller end value hides(collide)", `b show=${u8c.series[1].endLabel.show} reason=${u8c.series[1].endLabel.hideReason}; a show=${u8c.series[0].endLabel.show}`);

  console.log("U9 — edge timing (§2.5): areaEdge(0.34)=0, areaEdge(0.64)=1, monotone, one shared edge:");
  check(approx(areaEdge(EDGE_START), 0), "areaEdge(EDGE_START) === 0", `got ${areaEdge(EDGE_START)}`);
  check(approx(areaEdge(EDGE_END), 1), "areaEdge(EDGE_END) === 1", `got ${areaEdge(EDGE_END)}`);
  check(areaEdge(0.64 + 0.1) === 1 && areaEdge(1) === 1, "edge stays 1 past EDGE_END (settled ≤ 0.85)");
  let mono = true;
  let prev = -1;
  for (let t = 0; t <= 1.0001; t += 0.05) { const e = areaEdge(t); if (e < prev - 1e-9) mono = false; prev = e; }
  check(mono, "areaEdge monotone non-decreasing");
  check(EDGE_END <= SETTLE_DEADLINE, "edge completes by the 0.85 settle deadline", `EDGE_END ${EDGE_END}`);

  console.log("U10 — degenerate (§2.6.7): 0 → empty; 1-point → singlePoint guard no NaN; all-zero → flat:");
  check(planArea({ mode: "simple", series: [] }).empty === true, "0 series → empty:true");
  const u10p = planArea({ mode: "simple", series: [{ label: "a", values: [42] }] });
  check(u10p.singlePoint === true, "1-point series → singlePoint:true");
  check(u10p.series[0].fillPath === "" && u10p.series[0].edgePath === "", "1-point → empty path (no degenerate one-vertex M…L…Z)");
  const u10z = planArea({ mode: "stacked", series: [{ label: "a", values: [0, 0, 0] }, { label: "b", values: [0, 0, 0] }] });
  check(Number.isFinite(u10z.axisMax) && u10z.series.every((s) => s.upper.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))), "all-zero → finite flat baseline (no NaN)");

  console.log("U11 — unknown enum → default (§2.3):");
  const u11 = planArea({ mode: "overlay", valueLabels: "maybe", series: [{ label: "a", values: [1, 2, 3] }] });
  check(u11.mode === "simple", "unknown mode → simple", u11.mode);
  check(u11.valueLabels === "auto", "unknown valueLabels → auto", u11.valueLabels);
  const u11b = planArea({ mode: "bogus", series: [{ label: "a", values: [1, 2] }] });
  check(u11b.mode === "simple", "bogus mode → simple", u11b.mode);

  console.log("U12 — annotations (PL-4.2, PORTED from line.ts): default no-op / resolution / clamp / placement / fit / collision:");
  // default (no annotations) → [] (byte-identical no-op); no defect counts.
  const a12d = planArea({ mode: "simple", series: [{ label: "a", values: [10, 20, 30] }] });
  check(a12d.annotations.length === 0 && a12d.dropped.annotationsHidden === 0 && a12d.dropped.annotationsDropped === 0, "default (no annotations) → [] (no-op, byte-identical)");
  // index x=2 → vertex 2; label x='Apr' → index 3; anchor sits on the series UPPER edge at that x.
  const a12 = planArea({ mode: "simple", xLabels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], series: [{ label: "a", values: [10, 20, 35, 30, 42, 50] }], annotations: [{ x: 2, label: "peak" }, { x: "Apr", label: "dip" }] });
  check(a12.annotations.length === 2 && a12.annotations[0].vertexIndex === 2, "index x=2 → vertex 2", `len ${a12.annotations.length}`);
  check(a12.annotations[1].vertexIndex === 3, "label x='Apr' → index 3", `got ${a12.annotations[1].vertexIndex}`);
  const up2 = a12.series[0].upper[2];
  check(approx(a12.annotations[0].anchor.x, up2.x) && approx(a12.annotations[0].anchor.y, up2.y), "anchor == series upper-edge vertex at x");
  // unresolved: out-of-range index + non-matching label → both unresolved, none kept.
  const a12u = planArea({ mode: "simple", series: [{ label: "a", values: [10, 20, 30] }], annotations: [{ x: 99, label: "bad" }, { x: "Nope", label: "bad2" }] });
  check(a12u.dropped.annotationsUnresolved === 2 && a12u.annotations.length === 0, "out-of-range index + non-matching label → unresolved=2", `got ${a12u.dropped.annotationsUnresolved}`);
  // over-cap: 5 callouts → keep MAX_ANNOTATIONS, drop the tail.
  const a12c = planArea({ mode: "simple", series: [{ label: "a", values: [10, 20, 30, 40] }], annotations: Array.from({ length: 5 }, (_, k) => ({ x: 0, label: `a${k}` })) });
  check(a12c.dropped.annotationsDropped === 5 - MAX_ANNOTATIONS, `over ${MAX_ANNOTATIONS} → dropped tail`, `got ${a12c.dropped.annotationsDropped}`);
  // seriesIndex clamp (stacked 2 layers): out-of-range → series[0].
  const a12s = planArea({ mode: "stacked", series: [{ label: "a", values: [10, 20] }, { label: "b", values: [10, 20] }], annotations: [{ x: 1, seriesIndex: 9, label: "x" }] });
  check(a12s.annotations[0].seriesIndex === 0, "out-of-range seriesIndex → clamp to 0", `got ${a12s.annotations[0].seriesIndex}`);
  // placement: a low-value anchor (near baseline, NOT top-zone) → label ABOVE; a near-max anchor (top
  // zone) → label BELOW.
  const a12p = planArea({ mode: "simple", axisMax: 100, series: [{ label: "a", values: [5, 98] }], annotations: [{ x: 0, label: "low" }, { x: 1, label: "high" }] });
  check(a12p.annotations[0].label.y < a12p.annotations[0].anchor.y, "low anchor → label ABOVE (labelY < anchorY)", `${a12p.annotations[0].label.y} vs ${a12p.annotations[0].anchor.y}`);
  check(a12p.annotations[1].label.y > a12p.annotations[1].anchor.y, "top-zone anchor → label BELOW (labelY > anchorY)", `${a12p.annotations[1].label.y} vs ${a12p.annotations[1].anchor.y}`);
  // fit-or-hide: a > ANN_LABEL_MAX_CP label hides(tooLong) (hide, don't bend).
  const longLbl = "x".repeat(ANN_LABEL_MAX_CP + 4);
  const a12l = planArea({ mode: "simple", series: [{ label: "a", values: [10, 20, 30] }], annotations: [{ x: 1, label: longLbl }] });
  check(a12l.annotations[0].show === false && a12l.annotations[0].hideReason === "tooLong", `label > ${ANN_LABEL_MAX_CP}cp → hidden(tooLong)`, `show=${a12l.annotations[0].show} reason=${a12l.annotations[0].hideReason}`);
  // collision: two callouts on the SAME x → identical box → the LATER one hides(collide), first kept.
  const a12col = planArea({ mode: "simple", series: [{ label: "a", values: [10, 20, 30, 40, 50] }], annotations: [{ x: 2, label: "first" }, { x: 2, label: "second" }] });
  check(a12col.annotations[0].show === true && a12col.annotations[1].show === false && a12col.annotations[1].hideReason === "collide" && a12col.dropped.annotationsHidden === 1, "two callouts on the same x → later hidden(collide), line/first kept", `0=${a12col.annotations[0].show} 1=${a12col.annotations[1].show}/${a12col.annotations[1].hideReason}`);
  // timing: annotationOpacity is 0 at/below EDGE_END, 1 by t=1 (fade AFTER the fill edge settles).
  check(annotationOpacity(EDGE_END) === 0 && approx(annotationOpacity(1), 1), "annotationOpacity: 0 at EDGE_END, 1 at t=1 (after the edge settles)", `${annotationOpacity(EDGE_END)} … ${annotationOpacity(1)}`);
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
    const v = spec.visualization;
    const plan = planArea({ series: v.series, xLabels: v.xLabels, mode: v.mode, valueLabels: v.valueLabels, axisMin: v.axisMin, axisMax: v.axisMax, unit: v.unit, annotations: v.annotations });
    console.log(`Sampled-t DOM pass — ${id} (${plan.mode}, t ∈ {${T_SAMPLES.join(", ")}}):`);

    const reports = await sampleFixture(page, id, T_SAMPLES);
    const base = reports[1];
    const A = base.area;
    if (!check(!!A, "area section present at t=1")) continue;

    // Degenerate (all-zero / single-point) fixtures may render no paths; the planner-level degenerate
    // handling is covered in the unit suite. Still assert gating cleanliness + node-count stability.
    const sx = A.scaleX;
    const svgLeft = A.rect.x;
    const svgTop = A.rect.y;
    const plotXcss = (vx) => svgLeft + vx * sx;
    const plotYcss = (vy) => svgTop + vy * A.scaleY;
    const bandLeft = plotXcss(PLOT_X0);
    const bandRight = plotXcss(PLOT_X1);
    const bandTop = plotYcss(PLOT_Y0);
    const bandBottom = plotYcss(BASELINE_Y);
    const xSpan = PLOT_X1 - PLOT_X0;

    // C-caps — rendered series count == planArea post-clamp at every sample.
    check(
      T_SAMPLES.every((t) => reports[t].area?.seriesCount === plan.series.length),
      `rendered series count === ${plan.series.length} (planArea post-clamp) at every sample (C-caps)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].area?.seriesCount).join(",")}`,
    );
    check(plan.series.length <= MAX_SERIES, `≤ ${MAX_SERIES} series (C1)`, `got ${plan.series.length}`);

    // A degenerate plan (single-point / all-zero-after-clamp → empty) renders no fill paths and no clip
    // rect. The planner-level degenerate handling is covered by the unit suite; for the DOM pass we only
    // assert node-count stability + gating cleanliness (the clip/fill-rise/value-axis checks need paths).
    const degenerate = plan.empty || plan.singlePoint || plan.series.length === 0;

    // C-layout-reserved (§3 ruling 3): the FINAL path `d` (fill + edge) is byte-identical across all 10
    // samples; svg rect + nodeCount constant; the ONLY thing that changes is the clip-rect width.
    check(
      T_SAMPLES.every((t) => reports[t].area?.nodeCount === A.nodeCount),
      `svg DOM node count constant (${A.nodeCount}) — nothing mounts/unmounts across t (C-layout-reserved)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].area?.nodeCount).join(",")}`,
    );
    let dOk = true, dDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].area;
      if (Math.abs(d.rect.x - A.rect.x) > 0.5 || Math.abs(d.rect.y - A.rect.y) > 0.5 || Math.abs(d.rect.w - A.rect.w) > 0.5) { dOk = false; dDetail = `svg rect drifts at t=${t}`; }
      for (let si = 0; si < A.series.length; si++) {
        if (d.series[si]?.fillD !== A.series[si].fillD) { dOk = false; dDetail = `series ${si} fill d changes at t=${t}`; }
        if (d.series[si]?.edgeD !== A.series[si].edgeD) { dOk = false; dDetail = `series ${si} edge d changes at t=${t}`; }
      }
    }
    check(dOk, "every series' FINAL path `d` (fill+edge) BYTE-IDENTICAL across all 10 samples; svg rect constant (C-layout-reserved §3 ruling 3)", dDetail);

    // No CSS transform on the fill/edge paths (§3 ruling 3 — the reveal is the clip, never a transform).
    let txOk = true, txDetail = "";
    for (const t of T_SAMPLES) {
      for (const s of reports[t].area.series) {
        if (s.fillTransform !== "none" || s.edgeTransform !== "none") { txOk = false; txDetail = `series transform "${s.fillTransform}"/"${s.edgeTransform}" at t=${t} — paths must have NO CSS transform`; }
      }
    }
    check(txOk, "NO CSS transform on any area fill/edge path at any sample (§3 ruling 3)", txDetail);

    // C-fill-rise (§3 ruling 3): clipWidth == areaEdge(t)·xSpan (in viewBox px, ±tol), bounded ∈[0,1],
    // full at t=1. ONE shared edge — there is a single clip rect (all series clipped by it).
    if (!degenerate) {
      let edgeOk = true, edgeDetail = "";
      for (const t of T_SAMPLES) {
        const clip = reports[t].area.clip;
        if (!clip) { edgeOk = false; edgeDetail = `no clip rect at t=${t}`; continue; }
        const expectW = areaEdge(t) * xSpan;
        if (Math.abs(clip.width - expectW) > 1.5) { edgeOk = false; edgeDetail = `clip width ${clip.width.toFixed(1)} ≠ areaEdge(${t})·xSpan ${expectW.toFixed(1)}`; }
        if (clip.width < -0.5 || clip.width > xSpan + 0.5) { edgeOk = false; edgeDetail = `clip width ${clip.width.toFixed(1)} out of [0, xSpan ${xSpan}] at t=${t}`; }
        if (clip.widthAttr != null && Math.abs(clip.widthAttr - expectW) > 1.5) { edgeOk = false; edgeDetail = `clip-w attr ${clip.widthAttr} ≠ expected ${expectW.toFixed(1)} at t=${t}`; }
      }
      check(edgeOk, "fill-rise: clip-rect width == areaEdge(t)·xSpan (±1.5px), bounded ∈[0, xSpan] (C-fill-rise §3 ruling 3)", edgeDetail);
      const fullClip = reports[1].area.clip;
      check(fullClip && Math.abs(fullClip.width - xSpan) <= 1.5, "clip fully open (width == xSpan) at t=1 (C-fill-rise settle)", fullClip ? `width ${fullClip.width.toFixed(1)} vs xSpan ${xSpan}` : "no clip");
      check(reports[0.64].area.clip && Math.abs(reports[0.64].area.clip.width - xSpan) <= 1.5, "clip full by EDGE_END (t=0.64)", reports[0.64].area.clip ? `${reports[0.64].area.clip.width.toFixed(1)}` : "no clip");
    }

    // C-within-plot — every series' painted fill+edge ⊆ the plot band at every t; nothing clipped by
    // the viewBox. (The clip narrows the painted box left→right, so it can only ever be a SUBSET.)
    let bandOk = true, bandDetail = "";
    for (const t of T_SAMPLES) {
      for (const s of reports[t].area.series) {
        for (const box of [s.paintedFill, s.paintedEdge]) {
          if (!box || box.w < 0.5 || box.h < 0.5) continue;
          // allow the rim stroke (AREA_STROKE) to bleed half its width past the band edges.
          const pad = AREA_STROKE * sx;
          if (box.x < bandLeft - pad - 1 || box.x + box.w > bandRight + pad + 1 || box.y < bandTop - pad - 1 || box.y + box.h > bandBottom + pad + 1) {
            bandOk = false; bandDetail = `series box [${box.x.toFixed(0)},${box.y.toFixed(0)},${box.w.toFixed(0)},${box.h.toFixed(0)}] exits plot at t=${t}`;
          }
        }
      }
    }
    check(bandOk, "area-within-plot: every painted fill+edge ⊆ the plot band at every t; nothing clipped (C-within-plot)", bandDetail);

    // C-value-axis — the top-edge vertex y at each x == BASELINE_Y − scaleLinear(value/runningSum).
    // Asserted against the PLAN (the renderer paints the plan's path verbatim, byte-checked above).
    const span = plan.axisMax - plan.axisMin || 1;
    const growLen = BASELINE_Y - PLOT_Y0;
    let axisOk = true, axisDetail = "";
    for (let si = 0; si < plan.series.length; si++) {
      const ps = plan.series[si];
      const tops = plan.mode === "stacked" ? ps.runningUpper : ps.values;
      for (let xi = 0; xi < ps.upper.length; xi++) {
        const expectY = BASELINE_Y - (Math.max(0, Math.min(tops[xi], plan.axisMax)) / span) * growLen;
        if (Math.abs(ps.upper[xi].y - expectY) > 0.6) { axisOk = false; axisDetail = `series ${si} x${xi} upper.y ${ps.upper[xi].y.toFixed(1)} ≠ scaleLinear ${expectY.toFixed(1)}`; }
      }
      // baseline: simple lower edge sits at BASELINE_Y; stacked layer[0] lower at baseline.
      if (si === 0 && ps.lower.length) {
        if (Math.abs(ps.lower[0].y - BASELINE_Y) > 0.6) { axisOk = false; axisDetail = `series 0 lower edge not at baseline (${ps.lower[0].y})`; }
      }
    }
    check(axisOk, "value-axis correctness: top edge y == BASELINE_Y − scaleLinear(value/runningSum); baseline at y(0) (C-value-axis)", axisDetail);

    // C-labels — no two VISIBLE labels (x + end + legend) overlap > 4px at any sample; the visible
    // end-label SET at t=1 matches the plan show flags.
    let overlapOk = true, overlapDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].area;
      const leaves = [];
      for (const xl of d.xLabels) if (xl.opacity > 0.05) leaves.push(xl.rect);
      for (const el of d.endLabels) if (el.opacity > 0.05) leaves.push(el.rect);
      for (const lc of d.legendChips) leaves.push(lc.rect);
      for (let i = 0; i < leaves.length; i++)
        for (let j = i + 1; j < leaves.length; j++)
          if (overlap(leaves[i], leaves[j]) > 4) { overlapOk = false; overlapDetail = `two labels overlap ${overlap(leaves[i], leaves[j]).toFixed(1)}px at t=${t}`; }
    }
    check(overlapOk, "no two visible labels (x + end + legend) overlap > 4px at any sample (C-labels)", overlapDetail);

    const planEndShown = plan.series.filter((s) => s.endLabel.show).length;
    const domEndShown = A.endLabels.filter((e) => e.opacity > 0.5).length;
    check(domEndShown === planEndShown, "visible end-label SET at t=1 matches planArea show flags (C-labels)", `dom ${domEndShown} vs plan ${planEndShown}`);

    // C-annotations (PL-4.2) — only fires for fixtures carrying annotations (a no-op for the defaults).
    // Mirrors the qa:line annotation DOM assertions: shown-count == plan, fade AFTER the edge settles,
    // inside the plot frame, NEUTRAL thin leader, no overlap of the value/end-label gutter.
    if ((plan.annotations || []).length > 0) {
      const shownPlan = plan.annotations.filter((a) => a.show);
      const domAnn = base.area.annotations || [];
      check(domAnn.length === shownPlan.length, "shown annotation node count == planArea show count (hidden ones not rendered) (C-annotations)", `dom ${domAnn.length} vs plan-shown ${shownPlan.length}`);
      // fade AFTER the fill edge settles: opacity ≈ 0 before EDGE_END (t=0.56), ≈ 1 at t=1.
      const preEnd = reports[0.56].area.annotations || [];
      check(preEnd.every((a) => a.opacity <= 0.05), "annotations opacity ≈ 0 before EDGE_END (fade AFTER the fill edge settles) (C-annotations)", preEnd.map((a) => a.opacity).join(","));
      check(domAnn.length > 0 && domAnn.every((a) => a.opacity > 0.9), "shown annotations fully visible at t=1 (thumbnail-safe) (C-annotations)", domAnn.map((a) => a.opacity).join(","));
      const sat = (c) => { const m = (c || "").match(/[\d.]+/g); if (!m) return 1; const a = m.slice(0, 3).map(Number); const mx = Math.max(...a); return mx === 0 ? 0 : (mx - Math.min(...a)) / mx; };
      // every shown callout label ⊆ the plot frame (the safe frame).
      let inFrame = true, frameDetail = "";
      for (const a of domAnn) {
        const r = a.labelRect;
        if (!r) continue;
        if (r.x < bandLeft - 1 || r.x + r.w > bandRight + 1 || r.y < bandTop - 1 || r.y + r.h > bandBottom + 1) { inFrame = false; frameDetail = `annotation "${(a.text || "").slice(0, 8)}" [${r.x.toFixed(0)},${r.y.toFixed(0)}] exits the plot frame`; }
      }
      check(inFrame, "every shown annotation label ⊆ the plot frame (inside the safe frame) (C-annotations)", frameDetail);
      // NEUTRAL leader (the neutral-connector discipline) + thin (< the 2.5px occlusion-gate floor).
      check(domAnn.every((a) => sat(a.leaderStroke) < 0.22 && a.leaderWidth < 3), "annotation leader is NEUTRAL (sat < 0.22) + thin (< occlusion floor) (C-annotations)", domAnn.map((a) => `${a.leaderStroke}@${a.leaderWidth}`).join(","));
      // no shown annotation overlaps a visible end-label (the right value gutter) > 4px.
      let annClear = true, annDetail = "";
      const endRects = (base.area.endLabels || []).filter((e) => e.opacity > 0.5).map((e) => e.rect);
      for (const a of domAnn) for (const er of endRects) if (a.labelRect && overlap(a.labelRect, er) > 4) { annClear = false; annDetail = `annotation overlaps end-label ${overlap(a.labelRect, er).toFixed(1)}px`; }
      check(annClear, "no shown annotation overlaps the value/end-label gutter (>4px) (C-annotations)", annDetail);
      check(domAnn.every((a) => a.fontSize >= 18 - 0.5), "annotation label font ≥ 18 (designed at 24) (C-annotations)", domAnn.map((a) => a.fontSize).join(","));
    }

    // C-mobile — top-edge stroke ≥ AREA_STROKE; label eff-font ≥ 18; min stacked layer painted
    // thickness ≥ 14px viewBox; gating clean + lowContrast clean + textCoverage < 0.42.
    let strokeOk = true, strokeDetail = "";
    for (const s of A.series) {
      if (s.edgeD && s.strokeW < AREA_STROKE - 0.5) { strokeOk = false; strokeDetail = `series ${s.index} stroke ${s.strokeW} < ${AREA_STROKE}`; }
    }
    check(strokeOk, `top-edge stroke ≥ ${AREA_STROKE} (decorative rim, §3 ruling 1) (C-mobile)`, strokeDetail);

    let fontOk = true, fontDetail = "";
    for (const xl of A.xLabels) if (xl.fontSize < 18 - 0.5) { fontOk = false; fontDetail = `x-label "${(xl.text || "").slice(0, 8)}" ${xl.fontSize}px < 18`; }
    for (const el of A.endLabels) if (el.opacity > 0.05 && el.fontSize < 18 - 0.5) { fontOk = false; fontDetail = `end-label "${(el.text || "").slice(0, 8)}" ${el.fontSize}px < 18`; }
    check(fontOk, "axis / x / end labels' font ≥ 18 (designed at 24/28) (C-mobile)", fontDetail);

    // Min stacked layer thickness ≥ 14px viewBox (the binding legibility gate, §3 ruling 1) — from the
    // plan (a layer below the floor was already dropped, so every surviving layer must clear it).
    // All-zero stacks (§2.6.7) legitimately render a flat 0-thickness baseline strip — the floor is
    // skipped there by design, so the thickness gate only applies when the stack has positive volume.
    if (plan.mode === "stacked" && plan.series.some((s) => s.maxThicknessPx > 0)) {
      const thinnest = Math.min(...plan.series.map((s) => s.maxThicknessPx));
      check(thinnest >= SEG_THICKNESS_FLOOR - 1e-6, `every surviving stacked layer's max thickness ≥ ${SEG_THICKNESS_FLOOR}px viewBox (§3 ruling 1) (C-mobile)`, `thinnest ${thinnest.toFixed(1)}`);
    }

    assertGatingClean(check, reports, T_SAMPLES, " (C-mobile)");
    // lowContrast clean at t=1 (§3 ruling 1 — distinct-hue opaque fills stay legible).
    check((base.lowContrast || []).length === 0, "lowContrast clean at t=1 (§3 ruling 1)", JSON.stringify((base.lowContrast || [])[0] || ""));
    check(base.textCoverage < 0.42, `textCoverage ${base.textCoverage} < 0.42 at t=1 (C-mobile)`);
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
