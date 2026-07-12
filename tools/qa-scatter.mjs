#!/usr/bin/env node
// PL-2.2 deterministic gate — ScatterPlot (points + two linear axes + optional OLS trend line +
// optional quadrants) relationship primitive (no LLM). Second sprint of Epic PL-2 (the chart family).
//
//   node tools/qa-scatter.mjs --unit   # planScatter decision tables (no dev server)
//   npm run dev                        # in another terminal — DOM passes need the dev server
//   npm run qa:scatter                 # full: unit + sampled-t DOM pass
//
// Covers handoff §2.7 (planning/primitive-library/handoffs/PL-2.2-scatter.md):
//   1. planScatter unit suite (U1–U6): OLS fit incl. INVERSE slope (+ flat / all-same-x suppress),
//      per-dim axis derivation + 8% pad + max>min guard, caps/even-stride downsample + invalid drop,
//      point/quad label fit-or-hide, trend Liang–Barsky clip, degenerate (empty/1-point) + unknown
//      enum coercion.
//   2. Sampled-t DOM pass (D1–D7 + D-trend + D-quad) at T = {0, 0.30, 0.34, 0.46, 0.58, 0.70, 0.78,
//      0.85, 0.92, 1} over positive-trend, inverse-trend, quadrants-on, dense-overlap stress, and a
//      no-trend plain fixture (one headless Chromium, Preview ?id&t): point-within-plot, pop+settle
//      (transform OMITTED at t≥0.92), layout reserved (circle cx/cy + nodeCount static), axis
//      correctness both dims, trend correctness + draw-on, quadrant dividers + region labels, label
//      no-overlap/fit, cap, mobile floors / collisions / clipped / safe-margin clean at every sample.
//      §3 ruling 1: the dense-overlap fixture's coincident dots must keep assertGatingClean clean.
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BASE, VIEWPORT, sampleFixture, assertGatingClean } from "./lib/sampled-t.mjs";
import {
  planScatter,
  plotBounds,
  staggerForN,
  pointPop,
  trendReveal,
  fitLeastSquares,
  clipToBand,
  MAX_POINTS,
  POP_START,
  POP_DUR,
  POINTS_SETTLE,
  TREND_START,
  AXIS_PAD_FRACTION,
  PLOT_X0,
  PLOT_X1,
  PLOT_Y0,
  PLOT_Y1,
  DOT_R,
} from "../src/lib/scatter.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UNIT_ONLY = process.argv.includes("--unit");

// §2.7 sample set: pre-build, pop midpoints across the stagger, points-settle, trend draw window,
// settle, hold, final.
const T_SAMPLES = [0, 0.3, 0.34, 0.46, 0.58, 0.7, 0.78, 0.85, 0.92, 1];
const ANIM_FIXTURES = [
  "fuzz-43-scatter-positive-trend",
  "fuzz-44-scatter-inverse-trend",
  "fuzz-45-scatter-quadrants",
  "fuzz-46-scatter-dense-overlap-stress",
  "fuzz-47-scatter-no-trend-plain",
];
const fixturePath = (id) => join(ROOT, "planning", "fixtures", "renderfuzz", `${id}.render.json`);

let failures = 0;
const check = (ok, name, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "✔" : "✖"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  return ok;
};
const approx = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// Plan from a fixture's visualization block (the renderer's exact mapping). `viewH` is the RENDERED
// (row-aware, PL-0.8) viewBox height read back from the DOM — so the planner's geometry matches what
// the renderer actually painted. Omitted → default 640.
const planFromViz = (v, viewH) =>
  planScatter({
    points: v.points,
    xLabel: v.xLabel,
    yLabel: v.yLabel,
    xMin: v.xMin,
    xMax: v.xMax,
    yMin: v.yMin,
    yMax: v.yMax,
    xUnit: v.xUnit,
    yUnit: v.yUnit,
    trendLine: v.trendLine,
    quadrants: v.quadrants,
    xDivider: v.xDivider,
    yDivider: v.yDivider,
    quadrantLabels: v.quadrantLabels,
    pointLabels: v.pointLabels,
    viewH,
  });

// ── 1. Unit suite (pure — no DOM) ─────────────────────────────────────────────
function unitSuite() {
  console.log("U1 — OLS fit incl. INVERSE slope, flat, all-same-x suppress (§2.6):");
  // inverse: x rising, y falling → slope < 0, closed-form to 1e-6. y = 12 - 2x.
  const inv = fitLeastSquares([{ x: 1, y: 10 }, { x: 2, y: 8 }, { x: 3, y: 6 }, { x: 4, y: 4 }]);
  check(inv && inv.slope < 0, "inverse set → slope < 0 (the Peter case)", `slope ${inv && inv.slope}`);
  check(inv && approx(inv.slope, -2) && approx(inv.intercept, 12), "inverse slope/intercept match closed form (−2, 12)", JSON.stringify(inv));
  // positive
  const pos = fitLeastSquares([{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 }]);
  check(pos && approx(pos.slope, 2), "positive set → slope 2", JSON.stringify(pos));
  // flat (all-same-y) → slope 0, line still valid (drawn)
  const flat = fitLeastSquares([{ x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }]);
  check(flat && approx(flat.slope, 0), "all-same-y → slope 0 (valid flat line)", JSON.stringify(flat));
  // all-same-x → null (suppressed; never a NaN/vertical line)
  check(fitLeastSquares([{ x: 5, y: 1 }, { x: 5, y: 2 }, { x: 5, y: 3 }]) === null, "all-same-x → fitted null (suppressed)");
  // 1 point → null
  check(fitLeastSquares([{ x: 1, y: 1 }]) === null, "< 2 points → null");
  // through the plan: trendLine:"fit" on an inverse set produces a fitted segment with x2 > x1.
  const invPlan = planScatter({ points: [{ x: 1, y: 10 }, { x: 2, y: 8 }, { x: 3, y: 6 }, { x: 4, y: 4 }], trendLine: "fit" });
  check(invPlan.fitted && invPlan.fitted.slope < 0, "plan inverse fit → fitted.slope < 0", `${invPlan.fitted && invPlan.fitted.slope}`);

  console.log("U2 — axis derivation: 8% pad per dim, author override, max>min guard (§2.4):");
  const u2 = planScatter({ points: [{ x: 0, y: 100 }, { x: 10, y: 200 }] });
  // span 10 (x), pad 0.8 each end → [−0.8, 10.8]; span 100 (y) → [92, 208].
  check(approx(u2.xMin, -0.8) && approx(u2.xMax, 10.8), "x derived with 8% pad → [−0.8, 10.8]", `[${u2.xMin}, ${u2.xMax}]`);
  check(approx(u2.yMin, 92) && approx(u2.yMax, 208), "y derived with 8% pad → [92, 208]", `[${u2.yMin}, ${u2.yMax}]`);
  check(approx(AXIS_PAD_FRACTION, 0.08), "AXIS_PAD_FRACTION === 0.08");
  const u2o = planScatter({ points: [{ x: 5, y: 5 }, { x: 9, y: 9 }], xMin: 0, xMax: 30 });
  check(u2o.xMin === 0 && u2o.xMax === 30, "author xMin/xMax override (no pad applied)", `[${u2o.xMin}, ${u2o.xMax}]`);
  // all-same-x → max>min guard (axisMax = axisMin + 1, no NaN center)
  const u2g = planScatter({ points: [{ x: 5, y: 1 }, { x: 5, y: 9 }] });
  check(u2g.xMax > u2g.xMin && Number.isFinite(u2g.points[0].cx), "all-same-x → max>min guard, finite center", `[${u2g.xMin}, ${u2g.xMax}] cx=${u2g.points[0].cx}`);

  console.log("U3 — caps / even-stride downsample + invalid drop (§2.6):");
  const u3 = planScatter({ points: Array.from({ length: 24 }, (_, i) => ({ x: i, y: i * 2 })) });
  check(u3.points.length === MAX_POINTS, `24 points → ${MAX_POINTS} kept (C1)`, `got ${u3.points.length}`);
  check(u3.dropped.pointsDropped === 4, "pointsDropped === 4 (surfaced)", `got ${u3.dropped.pointsDropped}`);
  // even-stride keeps first + last (x-range preserved)
  check(u3.points[0].xData === 0 && u3.points[u3.points.length - 1].xData === 23, "even-stride keeps first(0)+last(23) — x-range preserved", `${u3.points[0].xData}..${u3.points[u3.points.length - 1].xData}`);
  const u3i = planScatter({ points: [{ x: 1, y: 1 }, { x: NaN, y: 2 }, { x: 3, y: Infinity }, { x: 4, y: 4 }] });
  check(u3i.points.length === 2 && u3i.dropped.invalidPoints === 2, "non-finite x OR y dropped + counted", `kept ${u3i.points.length}, invalid ${u3i.dropped.invalidPoints}`);

  console.log("U4 — point + quad label fit-or-hide (§2.6):");
  const u4 = planScatter({ points: [{ x: 1, y: 1, label: "ok" }, { x: 9, y: 9, label: "x".repeat(25) }] });
  check(u4.points[0].showLabel === true, "short point label shown");
  check(u4.points[1].showLabel === false && u4.points[1].labelHideReason === "tooLong", "point label > 20cp → hidden(tooLong)");
  check(u4.dropped.hiddenPointLabels >= 1, "hidden point label surfaced", `got ${u4.dropped.hiddenPointLabels}`);
  // two near-coincident labelled dots → later hidden on collision
  const u4c = planScatter({ points: [{ x: 5, y: 5, label: "alpha" }, { x: 5.01, y: 5, label: "beta" }] });
  const shown = u4c.points.filter((p) => p.showLabel).length;
  check(shown < 2, "colliding labels → at least one hidden (greedy author-order)", `shown ${shown}`);
  check(u4c.points[0].showLabel === true, "earlier label kept on collision");
  // pointLabels:off → all hidden with reason off, NOT counted as a defect
  const u4off = planScatter({ points: [{ x: 1, y: 1, label: "a" }], pointLabels: "off" });
  check(u4off.points[0].showLabel === false && u4off.points[0].labelHideReason === "off", "pointLabels:off → hidden(off)");
  check(u4off.dropped.hiddenPointLabels === 0, "off-labels not counted as a defect", `got ${u4off.dropped.hiddenPointLabels}`);
  // quad label > 16cp hidden
  const u4q = planScatter({ points: [{ x: 1, y: 1 }, { x: 9, y: 9 }], quadrants: "on", quadrantLabels: ["x".repeat(20), "ok", "", ""] });
  const tlLabel = u4q.quadrant.labels[0];
  check(tlLabel.show === false, "quad label > 16cp → hidden");
  check(u4q.dropped.hiddenQuadLabels >= 1, "hidden quad label surfaced", `got ${u4q.dropped.hiddenQuadLabels}`);

  console.log("U5 — trend clip to plot band; drawn only when ≥2 distinct x (§2.4 C7):");
  // a steep line — endpoints clipped to the band rectangle (both ⊆ band).
  const scaleX = (v) => PLOT_X0 + ((v - 0) / (10 - 0)) * (PLOT_X1 - PLOT_X0);
  const scaleY = (v) => PLOT_Y1 - ((v - 0) / (10 - 0)) * (PLOT_Y1 - PLOT_Y0);
  const steep = clipToBand(100, -500, 0, 10, scaleX, scaleY); // very steep → exits top/bottom before x-edges
  const inBand = (x, y) => x >= PLOT_X0 - 0.5 && x <= PLOT_X1 + 0.5 && y >= PLOT_Y0 - 0.5 && y <= PLOT_Y1 + 0.5;
  check(steep && inBand(steep.x1, steep.y1) && inBand(steep.x2, steep.y2), "steep line clipped → both endpoints ⊆ band", JSON.stringify(steep));
  const u5 = planScatter({ points: [{ x: 5, y: 1 }, { x: 5, y: 9 }], trendLine: "fit" });
  check(u5.fitted === null, "trendLine:fit with <2 distinct x → no line (fitted null)");

  console.log("U6 — degenerate + unknown-enum coercion (§2.6 / §2.3):");
  check(planScatter({ points: [] }).empty === true, "0 points → empty:true");
  const u6one = planScatter({ points: [{ x: 5, y: 5 }], trendLine: "fit" });
  check(u6one.points.length === 1 && Number.isFinite(u6one.points[0].cx) && Number.isFinite(u6one.points[0].cy), "1 point → one finite-centered dot");
  check(u6one.fitted === null, "1 point → trend suppressed");
  const u6e = planScatter({ points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], trendLine: "regression", quadrants: "yes", pointLabels: "maybe" });
  check(u6e.trendLine === "off", "unknown trendLine → off", u6e.trendLine);
  check(u6e.quadrants === "off", "unknown quadrants → off", u6e.quadrants);
  check(u6e.pointLabels === "auto", "unknown pointLabels → auto", u6e.pointLabels);

  console.log("U-stagger — last point settles by POINTS_SETTLE (0.78):");
  const sN = staggerForN(20);
  check(POP_START + sN * 19 + POP_DUR <= POINTS_SETTLE + 1e-9, "N=20: last point pop ends ≤ 0.78", `ends ${(POP_START + sN * 19 + POP_DUR).toFixed(4)}`);
  check(pointPop(1, 0.34) === 1, "pointPop settled at t=1");
  check(trendReveal(1) === 1 && trendReveal(0.5) === 0, "trendReveal: 0 before TREND_START, 1 at t=1");
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

    const reports = await sampleFixture(page, id, T_SAMPLES);
    const base = reports[1];
    const D = base.scatter;
    if (!check(!!D, "scatter section present at t=1")) continue;

    // PL-0.8 — plan with the RENDERED row-aware viewBox height; recompute the plot band from it so all
    // geometry checks compare against the bounds the renderer actually used (not the fixed-640 default).
    const plan = planFromViz(spec.visualization, D.viewH);
    const { y0: PY0, y1: PY1 } = plotBounds(D.viewH);
    console.log(`Sampled-t DOM pass — ${id} (${plan.points.length} pts, trend=${plan.trendLine}, quad=${plan.quadrants}, viewH=${D.viewH}, t ∈ {${T_SAMPLES.join(", ")}}):`);

    const sx = D.scaleX;
    const sy = D.scaleY;
    const svgLeft = D.rect.x;
    const svgTop = D.rect.y;
    const cssX = (vx) => svgLeft + vx * sx;
    const cssY = (vy) => svgTop + vy * sy;
    const bandLeft = cssX(PLOT_X0);
    const bandRight = cssX(PLOT_X1);
    const bandTop = cssY(PY0);
    const bandBottom = cssY(PY1);

    // D6 — cap: rendered point count == planScatter post-downsample at every sample; ≤ 20.
    check(
      T_SAMPLES.every((t) => reports[t].scatter?.pointCount === plan.points.length),
      `rendered point count === ${plan.points.length} (planScatter post-downsample) at every sample (D6)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].scatter?.pointCount).join(",")}`,
    );
    check(D.pointCount <= MAX_POINTS, `≤ ${MAX_POINTS} points (C1)`, `got ${D.pointCount}`);

    // D3 — layout reserved: transform-blind LAYOUT center (circle cx/cy attrs) + nodeCount constant.
    check(
      T_SAMPLES.every((t) => reports[t].scatter?.nodeCount === D.nodeCount),
      `svg DOM node count constant (${D.nodeCount}) — nothing mounts/unmounts across t (D3)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].scatter?.nodeCount).join(",")}`,
    );
    let layoutOk = true, layoutDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].scatter;
      for (let i = 0; i < D.points.length; i++) {
        const a = d.points[i]?.layout, b = D.points[i].layout;
        if (!a || !b || Math.abs(a.cx - b.cx) > 0.5 || Math.abs(a.cy - b.cy) > 0.5) {
          layoutOk = false; layoutDetail = `point ${i} LAYOUT center drifts at t=${t}`;
        }
      }
    }
    check(layoutOk, "every point's transform-blind LAYOUT center (circle cx/cy) constant across all 10 samples (≤0.5px) (D3)", layoutDetail);

    // D2 — pop+settle: dot pop scale ∈ [0,1] at every t (painted diameter ≤ final); transform literal
    // `none` (OMITTED) at t≥0.92. We read the computed transform on the dot <g>.
    let popOk = true, popDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].scatter;
      for (let i = 0; i < d.points.length; i++) {
        const painted = d.points[i].painted, final = D.points[i].painted;
        if (!painted || !final) continue;
        // painted radius ≤ final radius + tol (pop never exceeds the settled size — clamped ∈ [0,1]).
        if (painted.rx > final.rx + 1.5) { popOk = false; popDetail = `point ${i} painted r ${painted.rx} > final ${final.rx} at t=${t} (pop > 1)`; }
      }
    }
    check(popOk, "dot pop scale ∈ [0,1] at every t — painted radius never exceeds settled (D2)", popDetail);
    let settleOk = true, settleDetail = "";
    for (const t of [0.92, 1]) {
      for (const p of reports[t].scatter.points) {
        if (p.transform !== "none") { settleOk = false; settleDetail = `dot transform "${p.transform}" at t=${t} — must be OMITTED once settled (D2)`; }
      }
    }
    check(settleOk, "t ≥ 0.92: dot pop transform OMITTED (none), never identity (D2 settle)", settleDetail);

    // D1 — point-within-plot: every dot's painted box ⊆ the plot band at every t; nothing clipped.
    let bandOk = true, bandDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].scatter;
      for (let i = 0; i < d.points.length; i++) {
        const p = d.points[i].painted;
        if (!p || p.rx < 0.5) continue; // not yet popped in (scale ~0)
        if (p.cx - p.rx < bandLeft - 1 || p.cx + p.rx > bandRight + 1 || p.cy - p.rx < bandTop - 1 || p.cy + p.rx > bandBottom + 1) {
          bandOk = false; bandDetail = `point ${i} [cx${p.cx.toFixed(0)},cy${p.cy.toFixed(0)},r${p.rx.toFixed(0)}] exits plot at t=${t}`;
        }
      }
    }
    check(bandOk, "point-within-plot: every painted dot ⊆ the plot band at every t; nothing clipped (D1)", bandDetail);

    // D4 — axis correctness both dims: each point's settled painted center == scaleLinear(x)/(y).
    let axisOk = true, axisDetail = "";
    const xSpan = plan.xMax - plan.xMin || 1;
    const ySpan = plan.yMax - plan.yMin || 1;
    const cxLoV = PLOT_X0 + DOT_R, cxHiV = PLOT_X1 - DOT_R, cyLoV = PY0 + DOT_R, cyHiV = PY1 - DOT_R;
    const clampV = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
    for (let i = 0; i < D.points.length; i++) {
      const pt = D.points[i];
      // expected viewBox center (clamped to band, exactly the planner), then → CSS.
      const exCxV = clampV(PLOT_X0 + ((pt.layout && plan.points[i].xData - plan.xMin) / xSpan) * (PLOT_X1 - PLOT_X0), cxLoV, cxHiV);
      const exCyV = clampV(PY1 - ((plan.points[i].yData - plan.yMin) / ySpan) * (PY1 - PY0), cyLoV, cyHiV);
      const exCx = cssX(exCxV), exCy = cssY(exCyV);
      const p = pt.painted;
      if (!p) { axisOk = false; axisDetail = `point ${i} no painted center`; continue; }
      if (Math.abs(p.cx - exCx) > 0.6 + sx * 0.5 || Math.abs(p.cy - exCy) > 0.6 + sy * 0.5) {
        axisOk = false; axisDetail = `point ${i} center [${p.cx.toFixed(1)},${p.cy.toFixed(1)}] ≠ scaleLinear [${exCx.toFixed(1)},${exCy.toFixed(1)}]`;
      }
    }
    check(axisOk, "axis correctness: each point's settled center == scaleLinear(x)/scaleLinear(y), both dims (D4)", axisDetail);

    // D-trend — trend correctness + draw-on, OR absence when off/null (§3 ruling 4).
    if (plan.trendLine === "fit" && plan.fitted) {
      // endpoints == planner fitted (x1/y1/x2/y2) mapped to CSS (±1px in viewBox → scaled).
      let trendGeomOk = true, trendDetail = "";
      const tr = D.trend;
      if (!tr) { trendGeomOk = false; trendDetail = "trend <line> missing while fitted present"; }
      else {
        const ex = [plan.fitted.x1, plan.fitted.y1, plan.fitted.x2, plan.fitted.y2];
        const got = [tr.x1, tr.y1, tr.x2, tr.y2];
        for (let k = 0; k < 4; k++) if (Math.abs(ex[k] - got[k]) > 1) { trendGeomOk = false; trendDetail = `endpoint[${k}] ${got[k]} ≠ planner ${ex[k]}`; }
        // both endpoints ⊆ band (viewBox px; row-aware y bounds).
        const inB = (x, y) => x >= PLOT_X0 - 0.5 && x <= PLOT_X1 + 0.5 && y >= PY0 - 0.5 && y <= PY1 + 0.5;
        if (!inB(tr.x1, tr.y1) || !inB(tr.x2, tr.y2)) { trendGeomOk = false; trendDetail = `endpoint out of band`; }
      }
      check(trendGeomOk, "D-trend: drawn endpoints == planner fitted slope/intercept through the scales; both ⊆ band", trendDetail);
      // draw-on: strokeDashoffset (1−reveal) ∈ [0,1], ≈1 before t=0.78, ==0 at t=1.
      let drawOk = true, drawDetail = "";
      for (const t of T_SAMPLES) {
        const off = reports[t].scatter?.trend?.dashoffset;
        if (off == null || off < -0.01 || off > 1.01) { drawOk = false; drawDetail = `dashoffset ${off} ∉ [0,1] at t=${t}`; }
        const expectReveal = trendReveal(t);
        if (Math.abs((1 - off) - expectReveal) > 0.02) { drawOk = false; drawDetail = `(1−offset) ${(1 - off).toFixed(3)} ≠ trendReveal ${expectReveal.toFixed(3)} at t=${t}`; }
      }
      const offAt078 = reports[0.78].scatter?.trend?.dashoffset;
      check(offAt078 >= 0.99, "D-trend: draw starts only after t≥0.78 (offset≈1 at t≤0.78)", `offset@0.78 ${offAt078}`);
      const offAt1 = reports[1].scatter?.trend?.dashoffset;
      check(approx(offAt1, 0, 0.01), "D-trend: fully drawn (offset==0) at t=1", `offset@1 ${offAt1}`);
      check(drawOk, "D-trend: strokeDashoffset (1−reveal) ∈ [0,1] and bounded, matches trendReveal(t)", drawDetail);
    } else {
      check(
        T_SAMPLES.every((t) => reports[t].scatter?.trend == null),
        "D-trend: trend <path> ABSENT at every t when trendLine:off / fitted:null (§3 ruling 4)",
        `present at: ${T_SAMPLES.filter((t) => reports[t].scatter?.trend != null).join(",")}`,
      );
    }

    // D-quad — quadrants: divider lines ⊆ band; visible quad-label set == planner flags; no quad
    // label overlaps a dot or another label > 4px.
    if (plan.quadrants === "on") {
      const dv = D.dividers;
      let divOk = dv.length >= 1, divDetail = "";
      for (const ln of dv) {
        const xs = [ln.x1, ln.x2], ys = [ln.y1, ln.y2];
        if (xs.some((x) => x < PLOT_X0 - 0.5 || x > PLOT_X1 + 0.5) || ys.some((y) => y < PY0 - 0.5 || y > PY1 + 0.5)) {
          divOk = false; divDetail = `divider ${ln.axis} out of band`;
        }
      }
      check(divOk, "D-quad: divider lines ⊆ band (or clamped to edge)", divDetail);
      const planVisQuad = plan.quadrant.labels.filter((l) => l.show).length;
      check(D.quadLabels.length === planVisQuad, `D-quad: visible quad-label count (${D.quadLabels.length}) == planner flags (${planVisQuad})`);
      // no quad label overlaps a dot or another quad label > 4px.
      let qOverlapOk = true, qDetail = "";
      const dotBoxes = D.points.map((p) => ({ x: p.painted.cx - p.painted.rx, y: p.painted.cy - p.painted.rx, w: 2 * p.painted.rx, h: 2 * p.painted.rx }));
      const qBoxes = D.quadLabels.map((q) => q.rect);
      for (let i = 0; i < qBoxes.length; i++) {
        for (const db of dotBoxes) if (overlap(qBoxes[i], db) > 4) { qOverlapOk = false; qDetail = `quad label ${i} overlaps a dot`; }
        for (let j = i + 1; j < qBoxes.length; j++) if (overlap(qBoxes[i], qBoxes[j]) > 4) { qOverlapOk = false; qDetail = `quad labels ${i}/${j} overlap`; }
      }
      check(qOverlapOk, "D-quad: no quad label overlaps a dot or another quad label > 4px", qDetail);
    } else {
      check(D.dividers.length === 0 && D.quadLabels.length === 0, "D-quad: no dividers/quad labels when quadrants:off");
    }

    // D5 — point labels: no two VISIBLE point labels overlap > 4px at any sample; visible set ==
    // planner showLabel flags.
    let overlapOk = true, overlapDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].scatter;
      const boxes = d.points.filter((p) => p.plabel && p.plabel.opacity > 0.05).map((p) => p.plabel.rect);
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++)
          if (overlap(boxes[i], boxes[j]) > 4) { overlapOk = false; overlapDetail = `two point labels overlap ${overlap(boxes[i], boxes[j]).toFixed(1)}px at t=${t}`; }
    }
    check(overlapOk, "D5: no two visible point labels overlap > 4px at any sample", overlapDetail);
    let showOk = true, showDetail = "";
    const planVis = plan.points.filter((p) => p.showLabel).length;
    const domVis = D.points.filter((p) => p.plabel && p.plabel.opacity > 0.5).length;
    if (planVis !== domVis) { showOk = false; showDetail = `${domVis} visible point labels, plan expects ${planVis}`; }
    check(showOk, "D5: visible point-label SET at t=1 matches planScatter showLabel flags", showDetail);

    // D7 — mobile floors / gating: dot diameter ≥ ~6px@390 (DOT_R const); label eff fonts ≥ 18;
    // assertGatingClean (collisions/clipped/outOfSafeMargin/belowMobileFloor) clean; coverage.
    const dotDiamCss = 2 * DOT_R * sx; // painted source px; @390 = /2.77
    check(dotDiamCss / 2.77 >= 6 - 0.5, `dot diameter ${(dotDiamCss / 2.77).toFixed(1)}px @390 ≥ 6 (DOT_R const) (D7)`, `${dotDiamCss.toFixed(1)}px source`);
    let floorOk = true, floorDetail = "";
    for (const p of D.points) if (p.plabel && p.plabel.opacity > 0.05 && p.plabel.fontSize < 18 - 0.5) { floorOk = false; floorDetail = `point label "${(p.plabel.text || "").slice(0, 8)}" ${p.plabel.fontSize}px < 18`; }
    for (const q of D.quadLabels) if (q.fontSize < 18 - 0.5) { floorOk = false; floorDetail = `quad label ${q.fontSize}px < 18`; }
    check(floorOk, "point/quad labels' font ≥ 18 (designed at 22) (D7)", floorDetail);
    assertGatingClean(check, reports, T_SAMPLES, " (D1/D7 · ruling-1 dots excluded)");
    check(base.textCoverage < 0.42, `textCoverage ${base.textCoverage} < 0.42 at t=1 (D7)`);
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
