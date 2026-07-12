#!/usr/bin/env node
// PL-3.1 deterministic gate — Divergence (dumbbell + slope) paired-value primitive (no LLM).
//
//   node tools/qa-divergence.mjs --unit   # planDivergence decision tables (no dev server)
//   npm run dev                           # in another terminal — DOM passes need the dev server
//   npm run qa:divergence                 # full: unit + sampled-t DOM pass
//
// Covers handoff §2.7 (planning/primitive-library/handoffs/PL-3.1-divergence.md):
//   1. planDivergence unit suite — axis derivation + guard, the C6 anti-collapse nudge
//      (incl. end===start zero-connector), endpoint-label show/hide decision table, slope
//      y-declutter, the stagger-vs-N formula, out-of-axis clamp, NaN/Infinity coercion, the
//      5-item clamp, and the < 2-item fallback flag.
//   2. Sampled-t DOM pass at T = {0, 0.28, 0.36, 0.44, 0.52, 0.60, 0.68, 0.76, 0.84, 1} over
//      the dumbbell + slope stress fixtures (one headless Chromium, Preview ?id&t):
//      C9 geometry static (svg/axis/dot-center/connector-endpoint/row-label boxes identical
//      across all 10 samples ≤0.5px; node count constant), C10 connector-within-axis (NEW —
//      every dot center in the plot band; drawn connector length ≤ |b−a| and ⊆ band; nothing
//      clipped by the viewBox), C11 no-shared-axis-label-overlap (NEW — no two text leaves
//      overlap > 4px at any sample; hidden labels match plan), C12 settle (dots transform
//      OMITTED at t ≥ 0.84; connectors full; opacities 1 at t=1), C7 mobile floor, the C1 cap
//      (6-item fixture → 5 rows), and collisions/clipped/outOfSafeMargin/belowMobileFloor clean.
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BASE, VIEWPORT, loadReport, sampleFixture, assertGatingClean } from "./lib/sampled-t.mjs";
import {
  planDivergence,
  staggerForN,
  AXIS_X0,
  AXIS_X1,
  DOT_R,
  MIN_GAP,
  SLOPE_DECLUTTER,
  SLOPE_X_LEFT,
  SLOPE_X_RIGHT,
} from "../src/lib/divergence.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UNIT_ONLY = process.argv.includes("--unit");

// §2.7 sample set: pre-build, each row's dot-pop + connector mid-draw, the late marker pops, settle, final.
const T_SAMPLES = [0, 0.28, 0.36, 0.44, 0.52, 0.6, 0.68, 0.76, 0.84, 1];
const ANIM_FIXTURES = ["fuzz-23-divergence-dumbbell-stress", "fuzz-24-divergence-slope-inversion"];
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
  console.log("Axis derivation + guard (§2.5.1):");
  // Omitted axis → [dataMin − 8% span, dataMax + 8% span].
  const derived = planDivergence([{ label: "x", start: 10, end: 30 }, { label: "y", start: 20, end: 50 }], undefined, undefined, "dumbbell");
  check(approx(derived.axisMin, 10 - 0.08 * 40) && approx(derived.axisMax, 50 + 0.08 * 40),
    "omitted axis → [dataMin − 8%·span, dataMax + 8%·span]", `got [${derived.axisMin}, ${derived.axisMax}]`);
  // axisMax ≤ axisMin guard (all equal, explicit axis) → +1.
  const guard = planDivergence([{ label: "a", start: 5, end: 5 }, { label: "b", start: 5, end: 5 }], 5, 5, "dumbbell");
  check(guard.axisMax === guard.axisMin + 1, "axisMax ≤ axisMin guard → axisMax = axisMin + 1", `got [${guard.axisMin}, ${guard.axisMax}]`);

  console.log("Out-of-axis clamp + NaN/Infinity coercion (§2.6.2/.3):");
  const oob = planDivergence([{ label: "p", start: 80, end: 140 }, { label: "q", start: 10, end: 50 }], 0, 100, "dumbbell");
  const pRow = oob.rows.find((r) => r.label === "p");
  check(pRow.bCenter <= AXIS_X1 + 0.5 && pRow.aCenter >= AXIS_X0 - 0.5,
    "explicit-axis value beyond axisMax → dot center clamped into the band (C10)", `bCenter ${pRow.bCenter} (AXIS_X1 ${AXIS_X1})`);
  const nan = planDivergence([{ label: "n", start: NaN, end: 40 }, { label: "m", start: 20, end: 30 }], 0, 100, "dumbbell");
  const nRow = nan.rows.find((r) => r.label === "n");
  check(nRow && nRow.aCountText === undefined, "NaN endpoint → not count-eligible (forced fade path, never counts a NaN)");
  const bothNan = planDivergence([{ label: "drop", start: NaN, end: Infinity }, { label: "k", start: 1, end: 2 }, { label: "j", start: 3, end: 4 }], 0, 100, "dumbbell");
  check(!bothNan.rows.some((r) => r.label === "drop"), "item with BOTH endpoints non-numeric is dropped (can't place it)");

  console.log("C6 anti-collapse nudge (§2.4 C6):");
  // Two nearly-equal values map within < 2R+6 px — centers floored to exactly MIN_GAP, sign preserved.
  const tight = planDivergence([{ label: "t", start: 50, end: 50.4 }, { label: "u", start: 0, end: 100 }], 0, 100, "dumbbell");
  const tRow = tight.rows.find((r) => r.label === "t");
  check(approx(Math.abs(tRow.bCenter - tRow.aCenter), MIN_GAP, 0.5),
    `near-zero gap → painted centers floored to exactly ${MIN_GAP}px`, `got ${Math.abs(tRow.bCenter - tRow.aCenter).toFixed(2)}`);
  check(tRow.bCenter > tRow.aCenter, "nudge preserves direction (end > start ⇒ b right of a)");
  // end === start exactly → coincident centers (zero connector, legitimate "no divergence").
  const equal = planDivergence([{ label: "e", start: 50, end: 50 }, { label: "f", start: 0, end: 100 }], 0, 100, "dumbbell");
  const eRow = equal.rows.find((r) => r.label === "e");
  check(approx(eRow.aCenter, eRow.bCenter), "end === start → coincident dots, zero-length connector (two stacked dots)");

  console.log("Endpoint-label show/hide decision (§2.5.2 / C4):");
  // Wide gap → both labels show.
  const wide = planDivergence([{ label: "w", start: 5, end: 95 }, { label: "x", start: 10, end: 20 }], 0, 100, "dumbbell");
  const wRow = wide.rows.find((r) => r.label === "w");
  check(wRow.showALabel && wRow.showBLabel, "wide gap → both endpoint labels show");
  // Over-long endpoint string (> 12 cp) → hidden.
  const longEp = planDivergence([{ label: "l", start: 5, end: 95, endText: "this is way too long" }, { label: "x", start: 1, end: 2 }], 0, 100, "dumbbell");
  const lRow = longEp.rows.find((r) => r.label === "l");
  check(!lRow.showBLabel, "endpoint string > 12 code points → label hidden (C4)");
  // Narrow gap with two labels → smaller-magnitude endpoint's label hidden.
  const narrow = planDivergence([{ label: "c", start: 49, end: 51, startText: "49", endText: "51" }, { label: "x", start: 0, end: 100 }], 0, 100, "dumbbell");
  const cRow = narrow.rows.find((r) => r.label === "c");
  check(cRow.showALabel !== cRow.showBLabel, "narrow gap, both labels collide → exactly one (smaller-magnitude) hidden");
  check(cRow.showBLabel && !cRow.showALabel, "the LARGER-magnitude endpoint keeps its label (carries the number)");

  console.log("Row-label fit (C3):");
  const longLabel = planDivergence([{ label: "x".repeat(40), start: 1, end: 2 }, { label: "ok", start: 3, end: 4 }], 0, 100, "dumbbell");
  check(!longLabel.rows[0].showLabel, "row label > 24 code points → hidden (hide-not-shrink, C3)");
  check(longLabel.rows[1].showLabel, "short row label shows");

  console.log("Slope y-declutter (PM §3 — moves ONLY the label y, never the dot):");
  // Two left values within the 28px threshold (span 100 over 480px → 4 value-units ≈ 19.2px).
  const slope = planDivergence([{ label: "C", start: 62, end: 55 }, { label: "D", start: 58, end: 50 }, { label: "A", start: 90, end: 20 }], 0, 100, "slope");
  const cS = slope.rows.find((r) => r.label === "C");
  const dS = slope.rows.find((r) => r.label === "D");
  check(Math.abs(cS.aLabelY - dS.aLabelY) >= SLOPE_DECLUTTER - 0.5,
    `colliding left labels nudged ≥ ${SLOPE_DECLUTTER}px apart`, `got ${Math.abs(cS.aLabelY - dS.aLabelY).toFixed(2)}`);
  check(cS.aCenter !== cS.aLabelY || dS.aCenter !== dS.aLabelY, "declutter moved a LABEL y while the dot center (aCenter) is untouched");
  // Dot centers must still be the true data y (crossings undistorted): C start 62 > D start 58 ⇒ C above D.
  check(cS.aCenter < dS.aCenter, "dot centers stay at true data y (higher value = higher on axis) — inversions undistorted");

  console.log("Stagger-vs-N formula (§2.5.3):");
  check(approx(staggerForN(2), 0.08), "N=2 → stagger 0.08");
  check(approx(staggerForN(4), 0.08), "N=4 → stagger 0.08");
  check(approx(staggerForN(5), (0.85 - 0.2 - 0.34) / 4), "N=5 → min(0.08, 0.31/4) = 0.0775", `got ${staggerForN(5)}`);
  // Last B-dot must land by the 0.85 settle deadline for N=5.
  const s = staggerForN(5);
  check(0.34 + s * 4 + 0.2 <= 0.85 + 1e-9, "N=5: last B-dot pop ends ≤ 0.85 settle deadline", `ends ${(0.34 + s * 4 + 0.2).toFixed(4)}`);

  console.log("Item cap + fallback (C1/C2):");
  const six = planDivergence(Array.from({ length: 6 }, (_, i) => ({ label: `i${i}`, start: i * 10, end: i * 10 + 5 })), 0, 100, "dumbbell");
  check(six.rows.length === 5, "6 declared items → exactly 5 rows (C1)", `got ${six.rows.length}`);
  check(six.fallback === false, "5 rows → not the fallback path");
  const one = planDivergence([{ label: "solo", start: 10, end: 40 }], 0, 100, "dumbbell");
  check(one.fallback === true && one.rows.length === 1, "< 2 renderable items → fallback flag set, single pair rendered (C2)");
  check(one.rows[0].rowY > 0, "fallback single pair is placed (centered), never a broken half-axis");
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
// Driver is the shared sampled-`t` harness (tools/lib/sampled-t.mjs, CHECKS.md gap #2).
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
    const plan = planDivergence(v.items, v.axisMin, v.axisMax, v.mode);
    console.log(`Sampled-t DOM pass — ${id} (${plan.mode}, t ∈ {${T_SAMPLES.join(", ")}}):`);

    const reports = await sampleFixture(page, id, T_SAMPLES);
    const base = reports[1];
    const D = base.divergence;
    if (!check(!!D, "divergence section present at t=1")) continue;

    // C1 row count + C9 node-count constancy.
    check(
      T_SAMPLES.every((t) => reports[t].divergence?.rows.length === plan.rows.length),
      `row count === ${plan.rows.length} (planDivergence) at every sample (C1)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].divergence?.rows.length).join(",")}`,
    );
    check(
      T_SAMPLES.every((t) => reports[t].divergence?.nodeCount === D.nodeCount),
      `svg DOM node count constant (${D.nodeCount}) — nothing mounts/unmounts across t (C9)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].divergence?.nodeCount).join(",")}`,
    );

    // C9 geometry static: svg rect, axis, every dot CENTER, connector endpoints, row-label box
    // identical across all samples (≤0.5px). Dots animate via scale transform — compare CENTERS.
    let geomOk = true, geomDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].divergence;
      if (!rectEq(d.rect, D.rect)) { geomOk = false; geomDetail = `svg rect drifts at t=${t}`; }
      if (D.axis && d.axis && (Math.abs(d.axis.x1 - D.axis.x1) > 0.5 || Math.abs(d.axis.y - D.axis.y) > 0.5)) {
        geomOk = false; geomDetail = `axis drifts at t=${t}`;
      }
      for (let r = 0; r < D.rows.length; r++) {
        const dr = d.rows[r], Dr = D.rows[r];
        for (let k = 0; k < Dr.dots.length; k++) {
          if (Math.abs(dr.dots[k].cx - Dr.dots[k].cx) > 0.6 || Math.abs(dr.dots[k].cy - Dr.dots[k].cy) > 0.6) {
            geomOk = false; geomDetail = `row ${r} dot ${k} center drifts at t=${t} (${dr.dots[k].cx},${dr.dots[k].cy} vs ${Dr.dots[k].cx},${Dr.dots[k].cy})`;
          }
        }
        // Connector full geometry endpoints (x1/y1 fixed; x2/y2 at t=1 is the full segment).
        if (Dr.connector && dr.connector) {
          if (Math.abs(dr.connector.x1 - Dr.connector.x1) > 0.5 || Math.abs(dr.connector.y1 - Dr.connector.y1) > 0.5) {
            geomOk = false; geomDetail = `row ${r} connector origin drifts at t=${t}`;
          }
        }
      }
    }
    check(geomOk, "svg + axis + every dot CENTER + connector origin + row-label identical across all 10 samples (≤0.5px) (C9)", geomDetail);

    // C10 connector-within-axis (NEW): dot centers in the plot band; drawn connector ⊆ the
    // dot-to-dot segment (length ≤ |b−a|); nothing clipped by the viewBox.
    let bandOk = true, bandDetail = "";
    const sx = D.scaleX; // viewBox→CSS x factor; band edges in CSS px relative to svg left
    const svgLeft = D.rect.x;
    const bandLo = svgLeft + (AXIS_X0 - DOT_R) * sx; // painted dot may reach AXIS_X0 − R
    const bandHi = svgLeft + (AXIS_X1 + DOT_R) * sx;
    for (const t of T_SAMPLES) {
      const d = reports[t].divergence;
      for (let r = 0; r < d.rows.length; r++) {
        for (const dot of d.rows[r].dots) {
          if (plan.mode === "dumbbell" && (dot.cx < bandLo - 0.6 || dot.cx > bandHi + 0.6)) {
            bandOk = false; bandDetail = `row ${r} dot cx ${dot.cx.toFixed(1)} outside band [${bandLo.toFixed(1)}, ${bandHi.toFixed(1)}] at t=${t}`;
          }
        }
        const c = d.rows[r].connector;
        if (c) {
          const drawn = Math.hypot(c.x2 - c.x1, c.y2 - c.y1);
          const dotCenters = d.rows[r].dots;
          // full length = distance between the two painted dot centers, in viewBox units (the
          // connector attrs are viewBox units). Compare drawn ≤ full + tolerance.
          const fullVB = plan.mode === "dumbbell"
            ? Math.abs((dotCenters[1].cx - dotCenters[0].cx) / sx)
            : Math.hypot((dotCenters[1].cx - dotCenters[0].cx) / sx, (dotCenters[1].cy - dotCenters[0].cy) / (D.scaleY));
          if (drawn > fullVB + 2) { bandOk = false; bandDetail = `row ${r} drawn connector ${drawn.toFixed(1)} > full ${fullVB.toFixed(1)} at t=${t}`; }
        }
      }
    }
    check(bandOk, "connector-within-axis: dot centers in plot band; drawn connector length ≤ |b−a| at every sample (C10, NEW)", bandDetail);

    // C11 no-shared-axis-label-overlap (NEW): no two VISIBLE text leaves (row labels + endpoint
    // labels) overlap > 4px at any sample; visible-label set matches the plan's show flags.
    let overlapOk = true, overlapDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].divergence;
      const leaves = [];
      for (const r of d.rows) {
        if (r.rowLabel) leaves.push(r.rowLabel.rect);
        for (const el of r.endLabels) if (el.opacity > 0.05) leaves.push(el.rect);
      }
      for (let i = 0; i < leaves.length; i++)
        for (let j = i + 1; j < leaves.length; j++)
          if (overlap(leaves[i], leaves[j]) > 4) { overlapOk = false; overlapDetail = `two labels overlap ${overlap(leaves[i], leaves[j]).toFixed(1)}px at t=${t}`; }
    }
    check(overlapOk, "no-shared-axis-label-overlap: no two visible text leaves overlap > 4px at any sample (C11, NEW)", overlapDetail);

    // Endpoint-label within the viewBox (PL-0.7 class-C clip invariant — the bug this fix closes):
    // every VISIBLE endpoint label's rendered box stays inside the svg's horizontal bounds (the
    // viewBox edges [0, VIEW_W]) at every sample. metr's "+39% faster" clipped ~28px past the right
    // edge pre-fix because the anchor flip used a fixed pad, not the label width. placeEndpointLabel
    // now flips/clamps width-aware so a label can never cross the edge.
    let edgeOk = true, edgeDetail = "";
    const svgL = D.rect.x, svgR = D.rect.right;
    for (const t of T_SAMPLES) {
      const d = reports[t].divergence;
      for (let r = 0; r < d.rows.length; r++) {
        for (const el of d.rows[r].endLabels) {
          if (el.opacity <= 0.05 || el.rect.w < 1) continue; // hidden / not yet faded in
          if (el.rect.x < svgL - 1) { edgeOk = false; edgeDetail = `row ${r} label "${el.text}" left edge ${el.rect.x.toFixed(1)} < svg left ${svgL.toFixed(1)} at t=${t}`; }
          else if (el.rect.right > svgR + 1) { edgeOk = false; edgeDetail = `row ${r} label "${el.text}" right edge ${el.rect.right.toFixed(1)} > svg right ${svgR.toFixed(1)} (+${(el.rect.right - svgR).toFixed(1)}px) at t=${t}`; }
        }
      }
    }
    check(edgeOk, "endpoint labels stay within the viewBox [0, VIEW_W] at every sample (PL-0.7 class-C clip invariant)", edgeDetail);

    // Visible endpoint-label set at t=1 matches the plan.
    let showOk = true, showDetail = "";
    for (let r = 0; r < plan.rows.length; r++) {
      const pr = plan.rows[r];
      const dr = D.rows[r];
      const visibleEnd = dr.endLabels.filter((e) => e.opacity > 0.5).length;
      const expected = (pr.showALabel ? 1 : 0) + (pr.showBLabel ? 1 : 0);
      if (visibleEnd !== expected) { showOk = false; showDetail = `row ${r}: ${visibleEnd} visible endpoint labels, plan expects ${expected}`; }
      const expectRowLabel = pr.showLabel;
      if (!!dr.rowLabel !== expectRowLabel) { showOk = false; showDetail = `row ${r}: rowLabel presence ${!!dr.rowLabel} vs plan ${expectRowLabel}`; }
    }
    check(showOk, "endpoint + row label visibility at t=1 matches planDivergence show flags (C4/C3)", showDetail);

    // C12 settle: dots transform OMITTED (none) at t ≥ 0.84; endpoint label opacities 1 at t=1.
    let settleOk = true, settleDetail = "";
    for (const t of [0.84, 1]) {
      for (const r of reports[t].divergence.rows) {
        for (const dot of r.dots) {
          if (dot.transform !== "none") { settleOk = false; settleDetail = `dot transform "${dot.transform}" at t=${t} — must be OMITTED once settled (C12)`; }
        }
      }
    }
    for (const r of reports[1].divergence.rows) {
      for (const el of r.endLabels) if (el.opacity !== 1) { settleOk = false; settleDetail = `endpoint label opacity ${el.opacity} at t=1`; }
    }
    check(settleOk, "t ≥ 0.84: dot transforms OMITTED (none); t=1: endpoint label opacities exactly 1 (C12)", settleDetail);

    // C7 mobile floor + gating arrays clean at EVERY sample.
    assertGatingClean(check, reports, T_SAMPLES, " (C7/C10/C11)");
    check(base.textCoverage < 0.42, `textCoverage ${base.textCoverage} < 0.42 at t=1`);
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
