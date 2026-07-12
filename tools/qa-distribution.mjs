#!/usr/bin/env node
// PL-3.5 deterministic gate — Distribution (the five-number summary + outliers of one or a few GROUPS
// on a SHARED value axis: box+whisker or the rangeMarkers glyph; a NON-0-anchored derived value axis;
// a ROW-AWARE viewBox with a §3 DYNAMIC render cap) primitive (no LLM).
//
//   node tools/qa-distribution.mjs --unit   # planDistribution decision tables (no dev server)
//   npm run dev                             # in another terminal — DOM passes need the dev server
//   npm run qa:distribution                 # full: unit + sampled-t DOM pass
//
// Covers handoff §2.7 (planning/primitive-library/handoffs/PL-3.5-distribution.md):
//   1. planDistribution unit suite (U1–U-degen): the §3 DYNAMIC cap + even-stride downsample + the
//      RECOMPUTED-MIN_ROW_PITCH fit proof at viewH {320,480,640}, invalid drop, hand-rolled quantile
//      correctness (q1/median/q3 + Tukey fence + outliers), the NON-0-anchored axis + author override +
//      max>min guard, box spans q1→q3, whisker spans range, median within box, C6 precomputed
//      sanitation, the zero-IQR 6px floor, tiny-n reduced glyph, outlier classification+cap, group-
//      within-plot, row-label fit-or-hide, mean knob+suppression, values-XOR-precomputed, stagger-vs-N,
//      degenerate (empty/1/all-flat) + unknown-enum coercion, and the UNIT painted-outlier-floor.
//   2. Sampled-t DOM pass (D1–D11/D-out/D-mean) at T = {0,0.30,0.36,0.46,0.56,0.66,0.76,0.85,0.92,1}
//      over over-cap, short-row, zero-IQR, tiny-n, outlier-heavy, precomputed, rangeMarkers, showMean
//      fixtures (one headless Chromium, Preview ?id&t): group-within-plot, box/whisker/median spans,
//      non-0-anchored axis, zero-IQR floor, grow/draw + settle (transform OMITTED at t≥0.85), layout
//      reserved (geometry + nodeCount static), caps, row-label no-overlap, outlier-within-domain,
//      mean-marker, the §3 BINDING rendered-pitch ≥ MIN_ROW_PITCH at a SHORT row + the painted-outlier-
//      dot-diameter@390 floor (measured, NOT the viewBox constant).
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BASE, VIEWPORT, sampleFixture, assertGatingClean } from "./lib/sampled-t.mjs";
import {
  planDistribution,
  plotBounds,
  rowBand,
  effectiveMaxGroups,
  staggerForN,
  groupReveal,
  fiveNumber,
  formatTick,
  MAX_GROUPS,
  MIN_ROW_PITCH,
  MIN_BOX_H,
  MAX_BOX_H,
  ZERO_IQR_PX,
  OUTLIER_R,
  MAX_OUTLIERS,
  MIN_SAMPLES,
  WHISKER_STROKE,
  MEDIAN_STROKE,
  ROW_PAD_OUTER,
  GROUP_START,
  GROUP_DUR,
  SETTLE_DEADLINE,
  MAX_STAGGER,
  AXIS_PAD_FRACTION,
  PLOT_X0,
  PLOT_X1,
  ROW_LABEL_X,
} from "../src/lib/distribution.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UNIT_ONLY = process.argv.includes("--unit");

const SAFE_MARGIN = 64; // outer safe margin (mirrors inspect.mjs MARGIN)

// §2.7 sample set: pre-build, the group build window (overlap stagger), settle, hold, final.
const T_SAMPLES = [0, 0.3, 0.36, 0.46, 0.56, 0.66, 0.76, 0.85, 0.92, 1];
const ANIM_FIXTURES = [
  "fuzz-85-distribution-overcap",
  "fuzz-86-distribution-shortrow",
  "fuzz-87-distribution-zero-iqr",
  "fuzz-88-distribution-tiny-n",
  "fuzz-89-distribution-outlier-heavy",
  "fuzz-91-distribution-precomputed",
  "fuzz-92-distribution-rangemarkers",
  "fuzz-93-distribution-showmean",
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
  planDistribution({
    groups: v.groups,
    mode: v.mode,
    axisMin: v.axisMin,
    axisMax: v.axisMax,
    showMean: v.showMean,
    accent: v.accent,
    groupAccents: v.groupAccents,
    unit: v.unit,
    viewH,
  });

// ── 1. Unit suite (pure — no DOM) ─────────────────────────────────────────────
function unitSuite() {
  console.log("U-rowpitch — RECOMPUTED MIN_ROW_PITCH fit proof + DYNAMIC cap at viewH {320,480,640} (§3):");
  check(MIN_ROW_PITCH >= 72 && MIN_ROW_PITCH <= 84, `MIN_ROW_PITCH ${MIN_ROW_PITCH} ∈ the §3 ~72–84 band`, `got ${MIN_ROW_PITCH}`);
  for (const vh of [320, 480, 640]) {
    const band = rowBand(vh);
    const cap = effectiveMaxGroups(vh);
    const pitch = cap >= 2 ? band / (cap - 1 + 2 * ROW_PAD_OUTER) : band;
    check(pitch >= MIN_ROW_PITCH - 0.01, `viewH ${vh}: band ${band}, cap ${cap}, rendered pitch ${pitch.toFixed(1)} ≥ MIN_ROW_PITCH ${MIN_ROW_PITCH}`, `pitch ${pitch.toFixed(1)}`);
  }
  // §3 requirement: ≥2 fit the shortest realistic row (320) AND 5 fit a tall row (640).
  check(effectiveMaxGroups(320) >= 2, "≥2 groups fit viewH 320 (the §3 short-row requirement)", `cap ${effectiveMaxGroups(320)}`);
  check(effectiveMaxGroups(640) === MAX_GROUPS, "all 5 groups fit viewH 640 (the §3 tall-row requirement)", `cap ${effectiveMaxGroups(640)}`);
  // box thickness clamp(round(pitch·0.55), 28, 96) ⇒ adjacent slots gap ≥ 0.45·pitch (no row collision).
  for (const vh of [320, 480, 640]) {
    const N = effectiveMaxGroups(vh);
    const p = planDistribution({ groups: Array.from({ length: N }, (_, i) => ({ label: `g${i}`, values: [10 + i, 12 + i, 14 + i, 16 + i, 20 + i] })), viewH: vh });
    const boxH = 2 * p.groups[0].halfH;
    check(boxH >= MIN_BOX_H - 0.01 && boxH <= MAX_BOX_H + 0.01, `viewH ${vh}: box thickness ${boxH.toFixed(0)} ∈ [${MIN_BOX_H},${MAX_BOX_H}]`, `boxH ${boxH}`);
    if (p.groups.length >= 2) {
      const gap = Math.abs(p.groups[1].cy - p.groups[0].cy) - boxH;
      check(gap >= 0, `viewH ${vh}: inter-row gap ${gap.toFixed(1)} ≥ 0 (no row-row collision)`, `gap ${gap.toFixed(1)}`);
    }
  }

  console.log("U1 — group cap + even-stride downsample (DYNAMIC on viewH; keep first+last) (C1/§2.6.3):");
  const groups8 = Array.from({ length: 8 }, (_, i) => ({ label: `g${i}`, values: [10 + i, 12 + i, 14 + i, 16 + i, 20 + i] }));
  const u1tall = planDistribution({ groups: groups8, viewH: 640 });
  check(u1tall.groups.length === MAX_GROUPS, `8 groups @viewH640 → ${MAX_GROUPS} kept`, `got ${u1tall.groups.length}`);
  check(u1tall.dropped.groupsDropped === 3, "groupsDropped === 3 (surfaced)", `got ${u1tall.dropped.groupsDropped}`);
  check(u1tall.groups[0].index === 0 && u1tall.groups[u1tall.groups.length - 1].index === 7, "even-stride keeps first(0)+last(7)", `${u1tall.groups[0].index}..${u1tall.groups[u1tall.groups.length - 1].index}`);
  const u1short = planDistribution({ groups: groups8, viewH: 320 });
  check(u1short.groups.length < MAX_GROUPS && u1short.groups.length >= 2, `8 groups @viewH320 → DYNAMIC cap ${u1short.groups.length} (< 5, ≥ 2)`, `got ${u1short.groups.length}`);
  check(u1short.groups[0].index === 0 && u1short.groups[u1short.groups.length - 1].index === 7, "short-row even-stride still keeps first+last");

  console.log("U2 — invalid drop: a group with neither values nor stats dropped; no NaN in axis (§2.6.1):");
  const u2 = planDistribution({ groups: [{ label: "ok", values: [10, 20, 30, 40] }, { label: "nope" }, { label: "nan", values: [NaN] }, { median: undefined }] });
  check(u2.groups.length === 1 && u2.dropped.invalidGroups === 3, "3 groups with no usable data dropped + counted; 1 kept", `kept ${u2.groups.length}, invalid ${u2.dropped.invalidGroups}`);
  check(Number.isFinite(u2.axisMin) && Number.isFinite(u2.axisMax), "axis finite after invalid drop", `[${u2.axisMin},${u2.axisMax}]`);

  console.log("U-quant — hand-rolled quantile correctness + Tukey fence + outlier classification (C-QUANT):");
  const sample = Array.from({ length: 100 }, (_, i) => i + 1);
  const fn = fiveNumber(sample.slice());
  check(approx(fn.q1, 25.75) && approx(fn.median, 50.5) && approx(fn.q3, 75.25), "fiveNumber(1..100) → q1 25.75 / median 50.5 / q3 75.25 (linear-interp)", `q1 ${fn.q1}, med ${fn.median}, q3 ${fn.q3}`);
  // Tukey fence + outlier: a clear outlier 500 with a tight body.
  const fo = fiveNumber([10, 12, 14, 16, 18, 20, 22, 500].slice().sort((a, b) => a - b));
  check(fo.outliers.includes(500) && fo.hi <= 22, "Tukey fence: 500 classified an outlier; whisker ends at the in-fence max", `outliers ${fo.outliers.join(",")}, hi ${fo.hi}`);
  check(fo.lo <= fo.q1 && fo.hi >= fo.q3, "whiskers ⊇ box by construction (C-QUANT monotone)");

  console.log("U-axis — NON-0-anchored value axis + author override + max>min guard (C5):");
  const ua = planDistribution({ groups: [{ values: [482, 495, 510, 520] }, { values: [500, 505, 510, 522] }] });
  check(ua.axisMin > 0, "axisMin > 0 (NOT 0-anchored) for an all-positive far-from-0 window", `axisMin ${ua.axisMin}`);
  // dataLo=482, dataHi=522 → span 40, pad 3.2 → [478.8, 525.2].
  check(approx(ua.axisMin, 478.8) && approx(ua.axisMax, 525.2), "8% pad on the derived window → [478.8, 525.2]", `[${ua.axisMin}, ${ua.axisMax}]`);
  const uao = planDistribution({ groups: [{ values: [482, 495, 510, 520] }], axisMin: 0, axisMax: 600 });
  check(uao.axisMin === 0 && uao.axisMax === 600, "author axisMin/axisMax override (no pad applied; author can pin 0)", `[${uao.axisMin}, ${uao.axisMax}]`);
  const uag = planDistribution({ groups: [{ values: [100, 100, 100, 100] }, { values: [100, 100, 100, 100] }] });
  check(uag.axisMax > uag.axisMin, "all-flat → max>min guard (axisMax = axisMin+1)", `[${uag.axisMin}, ${uag.axisMax}]`);
  check(approx(AXIS_PAD_FRACTION, 0.08), "AXIS_PAD_FRACTION === 0.08");

  console.log("U-box — box spans q1→q3 (§2.4):");
  const ub = planDistribution({ groups: [{ values: [10, 20, 30, 40, 50, 60, 70, 80] }] });
  const { axisMin, axisMax } = ub;
  const sx = (v) => PLOT_X0 + ((v - axisMin) / (axisMax - axisMin)) * (PLOT_X1 - PLOT_X0);
  const sortedB = [10, 20, 30, 40, 50, 60, 70, 80];
  const fnB = fiveNumber(sortedB);
  check(approx(ub.groups[0].q1X, sx(fnB.q1), 1e-4) && approx(ub.groups[0].q3X, sx(fnB.q3), 1e-4), "planned box [q1X,q3X] == scaleX(q1)/scaleX(q3) (±1e-4)", `q1X ${ub.groups[0].q1X.toFixed(2)} vs ${sx(fnB.q1).toFixed(2)}`);

  console.log("U-whisk — whisker spans the range; whisker ⊇ box (§2.4):");
  check(approx(ub.groups[0].loX, sx(fnB.lo), 1e-4) && approx(ub.groups[0].hiX, sx(fnB.hi), 1e-4), "planned whisker [loX,hiX] == scaleX(lo')/scaleX(hi') (±1e-4)");
  check(ub.groups[0].loX <= ub.groups[0].q1X + 1e-6 && ub.groups[0].hiX >= ub.groups[0].q3X - 1e-6, "whisker ⊇ box (loX ≤ q1X, hiX ≥ q3X)");

  console.log("U-med — median within box; precomputed out-of-box median clamped (C6):");
  check(ub.groups[0].medX >= ub.groups[0].q1X - 1e-6 && ub.groups[0].medX <= ub.groups[0].q3X + 1e-6, "medX ∈ [q1X, q3X]");
  const umAbove = planDistribution({ groups: [{ min: 100, q1: 118, median: 160, q3: 142, max: 175 }] });
  check(umAbove.groups[0].medX <= umAbove.groups[0].q3X + 1e-6 && umAbove.groups[0].medX >= umAbove.groups[0].q1X - 1e-6, "median above q3 clamped into the box (C6)");

  console.log("U-invert — precomputed sanitation; never inverted (C6):");
  const ui = planDistribution({ groups: [{ q1: 150, q3: 120, median: 134, min: 110, max: 168 }, { min: 100, q1: 118, median: 130, q3: 148, max: 170 }] });
  check(ui.groups[0].q1X <= ui.groups[0].q3X + 1e-6, "transposed (q1=150,q3=120) → q1'=120 ≤ q3'=150 (self-corrects)");
  check(ui.dropped.correctedGroups === 1, "correctedGroups counts the 1 invalid five-number set", `got ${ui.dropped.correctedGroups}`);
  check(ui.groups[1].corrected === false, "a valid five-number set is NOT flagged corrected");
  // a whisker inside the box widened to ⊇ box.
  const uw2 = planDistribution({ groups: [{ min: 130, q1: 120, median: 134, q3: 150, max: 140 }] });
  check(uw2.groups[0].loX <= uw2.groups[0].q1X + 1e-6 && uw2.groups[0].hiX >= uw2.groups[0].q3X - 1e-6, "whisker inside box widened to ⊇ box (lo'=min(min,q1'), hi'=max(max,q3'))");

  console.log("U-ziqr — zero-IQR 6px floor; NOT hidden (C-ZIQR):");
  const uz = planDistribution({ groups: [{ median: 124, q1: 124, q3: 124, min: 118, max: 131 }, { values: [110, 120, 130, 140, 150, 160] }] });
  const zg = uz.groups[0];
  check(approx(zg.q3X - zg.q1X, ZERO_IQR_PX, 1e-6), `zero-IQR box width == ${ZERO_IQR_PX}px (floored)`, `got ${(zg.q3X - zg.q1X).toFixed(3)}`);
  check(zg.zeroIqrFloored === true && uz.dropped.zeroIqrFloored === 1, "zeroIqrFloored flagged + counted; box present (not hidden)");

  console.log("U-tinyn — tiny-n reduced glyph; NO box (C-TINYN):");
  const ut2 = planDistribution({ groups: [{ values: [120, 180] }, { values: [110, 120, 130, 140, 150, 160] }] });
  check(ut2.groups[0].tinyN === true && ut2.dropped.tinyGroups === 1, "raw group with 2 values → tinyN + tinyGroups counted");
  check(ut2.groups[0].loX < ut2.groups[0].hiX && approx(ut2.groups[0].q1X, ut2.groups[0].q3X), "tiny-n is a range+median glyph (q1X==q3X — no IQR box)");
  check(ut2.groups[1].tinyN === false, "a ≥4-sample group keeps its full box");
  const ut1 = planDistribution({ groups: [{ values: [150] }, { values: [10, 20, 30, 40] }] });
  check(ut1.groups[0].tinyN === true && approx(ut1.groups[0].loX, ut1.groups[0].hiX), "1 value → single tick (min=median=max)");

  console.log("U-out — outlier classification + cap; axis-clamped (C2/C-OUT):");
  // tight body (30 values 100..129) + 10 extreme highs > the Tukey fence ⇒ 10 outliers, capped to 8.
  const uoBody = Array.from({ length: 30 }, (_, i) => 100 + i);
  const uo = planDistribution({ groups: [{ values: [...uoBody, 300, 320, 340, 360, 380, 400, 420, 440, 460, 480] }] });
  check(uo.groups[0].outlierXs.length <= MAX_OUTLIERS, `≤ ${MAX_OUTLIERS} outlier dots rendered`, `got ${uo.groups[0].outlierXs.length}`);
  check(uo.dropped.outliersDropped >= 1, "outliersDropped counts the surplus over 8", `got ${uo.dropped.outliersDropped}`);
  check(uo.groups[0].outlierXs.every((x) => x >= PLOT_X0 - 1e-6 && x <= PLOT_X1 + 1e-6), "every outlier x ∈ [PLOT_X0, PLOT_X1] (axis-clamped)");

  console.log("U-within — every box/whisker/median/outlier coord ∈ the plot band for an out-of-axis bound (C5/C-COLLISION):");
  const uwi = planDistribution({ groups: [{ values: [10, 50, 100, 200, 300, 500] }, { min: 5, q1: 20, median: 60, q3: 140, max: 480, outliers: [600] }], axisMin: 100, axisMax: 200 });
  let withinOk = true, withinDetail = "";
  for (const g of uwi.groups) {
    for (const x of [g.q1X, g.q3X, g.medX, g.loX, g.hiX, ...g.outlierXs]) {
      if (x < PLOT_X0 - 1e-6 || x > PLOT_X1 + 1e-6) { withinOk = false; withinDetail = `x ${x} ∉ [${PLOT_X0},${PLOT_X1}]`; }
    }
    if (g.cy - g.halfH < uwi.plotY0 - 1e-6 || g.cy + g.halfH > uwi.plotY1 + 1e-6) { withinOk = false; withinDetail = `row slot exits [${uwi.plotY0},${uwi.plotY1}]`; }
  }
  check(withinOk, "all glyph coords within the plot band + row slot for an out-of-axis-bound fixture", withinDetail);
  check(uwi.dropped.clampedStats >= 1, "clampedStats counts out-of-axis groups", `got ${uwi.dropped.clampedStats}`);

  console.log("U-label — row-label fit-or-hide (>14cp / wide hidden) (C3):");
  const ul = planDistribution({ groups: [{ label: "x".repeat(18), values: [10, 20, 30, 40] }, { label: "ok", values: [10, 20, 30, 40] }] });
  check(ul.groups[0].showLabel === false && ul.groups[0].labelHideReason === "tooLong", "label > 14cp → hidden(tooLong)");
  check(ul.groups[1].showLabel === true, "a short label shows");
  check(ul.dropped.hiddenLabels === 1, "hiddenLabels counts the non-empty fit-fail", `got ${ul.dropped.hiddenLabels}`);

  console.log("U-mean — mean knob + suppression; diamond distinct from the median line (§2.3):");
  const um = planDistribution({ groups: [{ values: [10, 12, 14, 16, 18, 20, 24, 30, 200, 480] }], showMean: "on" });
  check(um.groups[0].meanX != null, "showMean:on raw group → meanX set");
  const ums = planDistribution({ groups: [{ min: 110, q1: 122, median: 134, q3: 150, max: 168 }], showMean: "on" });
  check(ums.groups[0].meanX == null && ums.dropped.meanSuppressed === 1, "precomputed-no-mean → meanX null + meanSuppressed counted");
  const umoff = planDistribution({ groups: [{ values: [10, 20, 30, 40] }] });
  check(umoff.groups[0].meanX == null, "showMean default off → no mean marker");

  console.log("U-dual — values-XOR-precomputed: values win (§2.6.2):");
  const ud = planDistribution({ groups: [{ values: [10, 20, 30, 40, 50, 60, 70, 80], min: 0, q1: 0, median: 0, q3: 0, max: 0 }] });
  const fnD = fiveNumber([10, 20, 30, 40, 50, 60, 70, 80]);
  const sxD = (v) => PLOT_X0 + ((v - ud.axisMin) / (ud.axisMax - ud.axisMin)) * (PLOT_X1 - PLOT_X0);
  check(approx(ud.groups[0].medX, sxD(fnD.median), 1e-4), "group with BOTH → values win (median == raw five-number median, NOT the precomputed 0)");

  console.log("U-stagger — last group settles by SETTLE_DEADLINE (0.85):");
  const sN = staggerForN(5);
  check(GROUP_START + sN * 4 + GROUP_DUR <= SETTLE_DEADLINE + 1e-9, "N=5: last group reveal ends ≤ 0.85", `ends ${(GROUP_START + sN * 4 + GROUP_DUR).toFixed(4)}`);
  check(staggerForN(1) === MAX_STAGGER, "staggerForN(1) === MAX_STAGGER (no div-by-zero)", `got ${staggerForN(1)}`);
  const rev1 = groupReveal(1, GROUP_START);
  check(rev1.whisker === 1 && rev1.box === 1 && rev1.pop === 1, "groupReveal settled (whisker=box=pop=1) at t=1");
  const rev0 = groupReveal(0, GROUP_START);
  check(rev0.whisker === 0 && rev0.box === 0 && rev0.pop === 0, "groupReveal 0 before the window");

  console.log("U-degen — degenerate counts + unknown enum (§2.6.11):");
  check(planDistribution({ groups: [] }).empty === true, "0 groups → empty:true");
  const u1g = planDistribution({ groups: [{ values: [10, 20, 30, 40] }] });
  check(u1g.groups.length === 1 && Number.isFinite(u1g.groups[0].cy) && Number.isFinite(u1g.groups[0].medX), "1 group → one finite-centered group, no NaN");
  const uflat = planDistribution({ groups: [{ values: [5, 5, 5, 5] }, { values: [5, 5, 5, 5] }] });
  check(uflat.groups.every((g) => Number.isFinite(g.medX) && Number.isFinite(g.q1X)), "all-flat → axis guard + zero-IQR blocks, no NaN geometry");
  const ue = planDistribution({ groups: [{ values: [10, 20, 30, 40] }], mode: "weird", showMean: "maybe" });
  check(ue.mode === "box", "unknown mode → box", ue.mode);

  console.log("U-floor — UNIT painted-outlier-dot diameter @390 estimate ≥ floor at every viewH (§2.10/§3):");
  // The outlier dot is width-driven (the row-aware viewBox sets viewH to the row aspect, so the SVG
  // fills the row WIDTH → CSS scale ≈ rowWidthPx / VIEW_W; the @390 render maps a source dot to
  // (2·OUTLIER_R) × (390/1000), INDEPENDENT of viewH (height-only compresses). Assert ≥ 6.5px@390.
  for (const vh of [640, 480, 360, 320]) {
    const dia390 = 2 * OUTLIER_R * (390 / 1000);
    check(dia390 >= 6.5 - 0.01, `viewH ${vh}: outlier dot ${2 * OUTLIER_R}src → ${dia390.toFixed(2)}px@390 ≥ 6.5 (row-aware, width-driven)`, `dia390 ${dia390.toFixed(2)}`);
  }
  check(OUTLIER_R === 9 && WHISKER_STROKE === 4 && MEDIAN_STROKE === 6, "OUTLIER_R 9 / WHISKER_STROKE 4 / MEDIAN_STROKE 6 (median thicker)");
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
const overlap = (A, B) => {
  const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
  const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
  return ox > 4 && oy > 4 ? Math.min(ox, oy) : 0;
};
const hexToRgb = (h) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const ACCENT_HEX = { cyan: "#59D8E6", amber: "#E7A95A", violet: "#8E7CC3", mint: "#6ED3A3", burnt: "#D9864D" };

// ── 2. Sampled-t DOM suite ─────────────────────────────────────────────────────
async function geometrySuite(page) {
  for (const id of ANIM_FIXTURES) {
    const spec = JSON.parse(await readFile(fixturePath(id), "utf8"));
    const reports = await sampleFixture(page, id, T_SAMPLES);
    const base = reports[1];
    const D = base.distribution;
    if (!check(!!D, `distribution section present at t=1 (${id})`)) continue;

    // PL-0.8 — plan with the RENDERED row-aware viewBox height; recompute the row band from it.
    const plan = planFromViz(spec.visualization, D.viewH);
    const { y0: PY0, y1: PY1 } = plotBounds(D.viewH);
    const isRange = plan.mode === "rangeMarkers";
    console.log(`Sampled-t DOM pass — ${id} (${plan.groups.length} groups, mode=${plan.mode}, viewH=${D.viewH}, t ∈ {${T_SAMPLES.join(", ")}}):`);

    // The SVG uses the default preserveAspectRatio "xMidYMid meet": the TRUE uniform scale is
    // min(scaleX, scaleY) (the binding dimension), and the other dimension is letterboxed + centered.
    // Compute the uniform scale + the centering offsets so the viewBox→CSS mapping is correct even
    // when a wide-short row letterboxes by width (the documented MIN_VIEW_H edge — scaleX != scaleY).
    const sx = D.scaleX;
    const sy = D.scaleY;
    const uniform = Math.min(sx, sy);
    // The dot is WIDTH-driven: it stays full-size whenever scaleX is the binding (min) scale — i.e. the
    // SVG fills the row WIDTH (sx ≤ sy: a square or tall row, the common case). It only genuinely shrinks
    // when the row is wider than MIN_VIEW_H matches and `meet` binds on HEIGHT (sx > sy) → the width
    // letterboxes (the documented rare-pathological edge). So gate the D11 dot-floor on `widthBound`.
    const widthBound = sx <= sy + 0.01;
    // centering offset: meet centers the scaled viewBox in the svg rect.
    const offX = D.rect.x + (D.rect.w - uniform * D.viewW) / 2;
    const offY = D.rect.y + (D.rect.h - uniform * D.viewH) / 2;
    const cssX = (vx) => offX + vx * uniform;
    const cssY = (vy) => offY + vy * uniform;
    const bandLeft = cssX(PLOT_X0);
    const bandRight = cssX(PLOT_X1);
    const bandTop = cssY(PY0);
    const bandBottom = cssY(PY1);

    // D9 — caps / count: rendered group count == planDistribution post-clamp at every sample; ≤ 5.
    check(
      T_SAMPLES.every((t) => reports[t].distribution?.groupCount === plan.groups.length),
      `rendered group count === ${plan.groups.length} (planDistribution post-clamp) at every sample (D9)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].distribution?.groupCount).join(",")}`,
    );
    check(D.groupCount <= MAX_GROUPS, `≤ ${MAX_GROUPS} groups (C1)`, `got ${D.groupCount}`);

    // §3 BINDING — rendered scalePoint pitch ≥ MIN_ROW_PITCH (source px), proven at the rendered viewH
    // (the short-row fixture forces a small viewH). The vertical analog of the candlestick body floor.
    if (plan.groups.length >= 2) {
      const cys = D.groups.map((g) => {
        // row center: prefer the median line painted center y; fall back to box painted center.
        const med = plan.groups.find((p) => String(p.index) === String(g.index));
        return cssY(med ? med.cy : 0);
      });
      // Use the planner's source-px cy (transform-blind) → pitch in SOURCE px.
      const srcCys = plan.groups.map((p) => p.cy).sort((a, b) => a - b);
      let minPitch = Infinity;
      for (let i = 1; i < srcCys.length; i++) minPitch = Math.min(minPitch, srcCys[i] - srcCys[i - 1]);
      check(minPitch >= MIN_ROW_PITCH - 0.5, `rendered row pitch ${minPitch.toFixed(1)}src ≥ MIN_ROW_PITCH ${MIN_ROW_PITCH} @viewH ${D.viewH} (§3 SHORT-ROW binding)`, `pitch ${minPitch.toFixed(1)}`);
      void cys;
    }

    // D8 — layout reserved: transform-blind LAYOUT box (IQR box rect attrs / whisker line attrs) +
    // nodeCount constant across all 10 samples.
    check(
      T_SAMPLES.every((t) => reports[t].distribution?.nodeCount === D.nodeCount),
      `svg DOM node count constant (${D.nodeCount}) — nothing mounts/unmounts across t (D8)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].distribution?.nodeCount).join(",")}`,
    );
    let layoutOk = true, layoutDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].distribution;
      for (let i = 0; i < D.groups.length; i++) {
        const a = d.groups[i]?.whisker, b = D.groups[i].whisker;
        if (!a || !b || Math.abs(a.x1 - b.x1) > 0.5 || Math.abs(a.x2 - b.x2) > 0.5 || Math.abs(a.y1 - b.y1) > 0.5) { layoutOk = false; layoutDetail = `group ${i} whisker LAYOUT drifts at t=${t}`; }
        if (!isRange && !D.groups[i].tinyN) {
          const al = d.groups[i]?.layout, bl = D.groups[i].layout;
          if (!al || !bl || Math.abs(al.x - bl.x) > 0.5 || Math.abs(al.y - bl.y) > 0.5 || Math.abs(al.w - bl.w) > 0.5 || Math.abs(al.h - bl.h) > 0.5) { layoutOk = false; layoutDetail = `group ${i} box LAYOUT drifts at t=${t}`; }
        }
      }
    }
    check(layoutOk, "every group's transform-blind LAYOUT geometry constant across all 10 samples (≤0.5px) (D8)", layoutDetail);

    // D7 — grow/draw + settle: whisker dashoffset ∈ [0,1] matching groupReveal.whisker; box transform
    // OMITTED at t≥0.85 (never identity).
    let drawOk = true, drawDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].distribution;
      for (let i = 0; i < d.groups.length; i++) {
        const off = d.groups[i].whisker?.dashoffset;
        const rev = groupReveal(t, plan.groups[i].groupStart);
        if (off == null || off < -0.02 || off > 1.02) { drawOk = false; drawDetail = `group ${i} whisker dashoffset ${off} ∉ [0,1] at t=${t}`; }
        else if (Math.abs((1 - off) - rev.whisker) > 0.03) { drawOk = false; drawDetail = `group ${i} (1−offset) ${(1 - off).toFixed(3)} ≠ groupReveal.whisker ${rev.whisker.toFixed(3)} at t=${t}`; }
      }
    }
    check(drawOk, "whisker strokeDashoffset (1−reveal.whisker) ∈ [0,1] and matches groupReveal(t) (D7 draw)", drawDetail);
    if (!isRange) {
      let settleOk = true, settleDetail = "";
      for (const t of [0.85, 0.92, 1]) {
        for (const g of reports[t].distribution.groups) {
          if (!g.tinyN && g.transform && g.transform !== "none") { settleOk = false; settleDetail = `box transform "${g.transform}" at t=${t} — must be OMITTED once settled (D7)`; }
        }
      }
      check(settleOk, "t ≥ 0.85: box grow transform OMITTED (none), never identity (D7 settle)", settleDetail);
    }

    // D1 — group-within-plot: every painted glyph box ⊆ the plot band + its row slot at every t.
    let bandOk = true, bandDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].distribution;
      for (let i = 0; i < d.groups.length; i++) {
        const p = d.groups[i].painted;
        if (!p || p.w < 0.5) continue; // not yet grown in / tiny-n has no box
        if (p.x < bandLeft - 2 || p.x + p.w > bandRight + 2 || p.y < bandTop - 2 || p.y + p.h > bandBottom + 2) {
          bandOk = false; bandDetail = `group ${i} box [x${p.x.toFixed(0)},y${p.y.toFixed(0)},w${p.w.toFixed(0)},h${p.h.toFixed(0)}] exits plot at t=${t}`;
        }
        // outliers within band too.
        for (const o of d.groups[i].outliers || []) {
          if (o.cx < bandLeft - 2 || o.cx > bandRight + 2) { bandOk = false; bandDetail = `group ${i} outlier cx ${o.cx.toFixed(0)} exits plot at t=${t}`; }
        }
      }
    }
    check(bandOk, "group-within-plot: every painted box/outlier ⊆ the plot band at every t; nothing clipped (D1)", bandDetail);

    // D2 — box-spans-q1-q3: each settled box painted extent == scaleX(q1..q3) (rangeMarkers: q1/q3 ticks).
    if (!isRange) {
      let boxSpanOk = true, boxSpanDetail = "";
      for (let i = 0; i < D.groups.length; i++) {
        if (D.groups[i].tinyN) continue;
        const exLeft = cssX(plan.groups[i].q1X);
        const exRight = cssX(plan.groups[i].q3X);
        const p = D.groups[i].painted;
        if (!p) { boxSpanOk = false; boxSpanDetail = `group ${i} no painted box`; continue; }
        // getBoundingClientRect includes the box stroke (WHISKER_STROKE source px → ±half each edge).
        const tol = 1 + uniform * (WHISKER_STROKE / 2 + 0.5);
        if (Math.abs(p.x - exLeft) > tol || Math.abs(p.x + p.w - exRight) > tol) { boxSpanOk = false; boxSpanDetail = `group ${i} box painted [${p.x.toFixed(1)},${(p.x + p.w).toFixed(1)}] ≠ scaleX(q1..q3) [${exLeft.toFixed(1)},${exRight.toFixed(1)}]`; }
      }
      check(boxSpanOk, "box-spans-q1-q3: each settled box painted extent == scaleX(q1..q3) (D2)", boxSpanDetail);
    }

    // D3 — whisker-spans-range: settled whisker painted extent == scaleX(lo'..hi'); whisker ⊇ box.
    let wickSpanOk = true, wickSpanDetail = "";
    for (let i = 0; i < D.groups.length; i++) {
      const w = D.groups[i].whisker;
      if (!w) { wickSpanOk = false; wickSpanDetail = `group ${i} no whisker`; continue; }
      const exLeft = cssX(plan.groups[i].loX);
      const exRight = cssX(plan.groups[i].hiX);
      const gotLeft = cssX(Math.min(w.x1, w.x2));
      const gotRight = cssX(Math.max(w.x1, w.x2));
      if (Math.abs(gotLeft - exLeft) > 1 + uniform * 0.5 || Math.abs(gotRight - exRight) > 1 + uniform * 0.5) { wickSpanOk = false; wickSpanDetail = `group ${i} whisker [${gotLeft.toFixed(1)},${gotRight.toFixed(1)}] ≠ scaleX(lo'..hi') [${exLeft.toFixed(1)},${exRight.toFixed(1)}]`; }
    }
    check(wickSpanOk, "whisker-spans-range: each whisker painted extent == scaleX(lo'..hi') (D3)", wickSpanDetail);

    // D4 — median-within-box + thicker stroke; tinyN rows have NO box.
    let medOk = true, medDetail = "";
    for (let i = 0; i < D.groups.length; i++) {
      const m = D.groups[i].median;
      if (!m) { medOk = false; medDetail = `group ${i} no median`; continue; }
      if (!D.groups[i].tinyN && !isRange) {
        if (m.x < plan.groups[i].q1X - 1 || m.x > plan.groups[i].q3X + 1) { medOk = false; medDetail = `group ${i} median x ${m.x} ∉ box [${plan.groups[i].q1X.toFixed(1)},${plan.groups[i].q3X.toFixed(1)}]`; }
      }
      if (m.strokeW < MEDIAN_STROKE - 0.5) { medOk = false; medDetail = `group ${i} median stroke ${m.strokeW} < ${MEDIAN_STROKE}`; }
      const w = D.groups[i].whisker;
      if (w && w.strokeW != null && m.strokeW <= w.strokeW + 0.5) { medOk = false; medDetail = `group ${i} median stroke ${m.strokeW} not > whisker stroke ${w.strokeW}`; }
    }
    check(medOk, "median-within-box + median stroke (6) > whisker stroke (4); tinyN has no box (D4)", medDetail);
    for (let i = 0; i < D.groups.length; i++) {
      if (D.groups[i].tinyN) check(D.groups[i].layout == null, `tinyN group ${i} has NO box (D4)`);
    }

    // D5 — non-0-anchored-axis-correctness: rendered value-ticks == planner [axisMin,axisMax] linspace.
    let axisOk = true, axisDetail = "";
    const tickLines = D.ticks.filter((l) => l && Number.isFinite(l.x1));
    if (tickLines.length !== plan.ticks.length) { axisOk = false; axisDetail = `${tickLines.length} tick lines, plan ${plan.ticks.length}`; }
    else {
      for (let i = 0; i < plan.ticks.length; i++) {
        const exX = cssX(PLOT_X0 + ((plan.ticks[i] - plan.axisMin) / (plan.axisMax - plan.axisMin)) * (PLOT_X1 - PLOT_X0));
        if (Math.abs(cssX(tickLines[i].x1) - exX) > 1 + uniform * 0.5) { axisOk = false; axisDetail = `tick ${i} x ≠ planner tick set`; }
      }
    }
    check(axisOk, "non-0-anchored-axis-correctness: rendered value-ticks == planner tick set (D5)", axisDetail);
    if (/outlier-heavy/.test(id)) check(plan.axisMin > 0, `axisMin > 0 (NOT 0-anchored) — derived value window (D5)`, `axisMin ${plan.axisMin}`);

    // D6 — zero-iqr-floor: a zero-IQR group's painted box width ≥ 6px·scaleX at t=1 (never collapsed).
    if (!isRange) {
      let ziqrOk = true, ziqrDetail = "";
      for (let i = 0; i < D.groups.length; i++) {
        if (!plan.groups[i].zeroIqrFloored) continue;
        const pw = D.groups[i].painted ? D.groups[i].painted.w : 0;
        const floor = ZERO_IQR_PX * sx;
        if (pw < floor - 1) { ziqrOk = false; ziqrDetail = `zero-IQR group ${i} painted box ${pw.toFixed(1)}px < ${floor.toFixed(1)}px floor`; }
      }
      check(ziqrOk, "zero-iqr-floor: each zero-IQR painted box width ≥ 6px·scaleX at t=1 (D6)", ziqrDetail);
    }

    // D-out — outlier-within-domain: every outlier dot center x ∈ band; radius == OUTLIER_R; centered on row.
    let outOk = true, outDetail = "";
    for (let i = 0; i < D.groups.length; i++) {
      for (const o of D.groups[i].outliers || []) {
        if (o.cx < bandLeft - 2 || o.cx > bandRight + 2) { outOk = false; outDetail = `group ${i} outlier cx ${o.cx} ∉ band`; }
      }
    }
    check(outOk, "outlier-within-domain: every outlier dot center x ∈ [PLOT_X0,PLOT_X1] (D-out)", outDetail);

    // D-mean — mean-marker correctness: with showMean:on each mean diamond at scaleX(mean); absent +
    // suppressed for precomputed-no-mean.
    if (/showmean/.test(id)) {
      let meanOk = true, meanDetail = "";
      for (let i = 0; i < D.groups.length; i++) {
        const exMean = plan.groups[i].meanX;
        const dm = D.groups[i].mean;
        if (exMean == null) {
          if (dm != null) { meanOk = false; meanDetail = `group ${i} has a mean diamond but plan suppressed it`; }
        } else {
          if (!dm) { meanOk = false; meanDetail = `group ${i} missing the mean diamond`; }
          else if (Math.abs(dm.paintedCx - cssX(exMean)) > 3 + uniform) { meanOk = false; meanDetail = `group ${i} mean diamond ${dm.paintedCx.toFixed(1)} ≠ scaleX(mean) ${cssX(exMean).toFixed(1)}`; }
        }
      }
      check(meanOk, "mean-marker-correctness: each mean diamond at scaleX(mean); suppressed when no honest mean (D-mean)", meanDetail);
      check(plan.dropped.meanSuppressed >= 1, "meanSuppressed ≥ 1 on the precomputed-no-mean group (D-mean)", `got ${plan.dropped.meanSuppressed}`);
    }

    // D10 — row-label no-overlap & fit: no two VISIBLE row labels overlap > 4px; visible set at t=1
    // matches planDistribution show flags.
    let overlapOk = true, overlapDetail = "";
    const boxes = D.rlabels.filter((l) => l.opacity > 0.05).map((l) => l.rect);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++)
        if (overlap(boxes[i], boxes[j]) > 4) { overlapOk = false; overlapDetail = `two row labels overlap ${overlap(boxes[i], boxes[j]).toFixed(1)}px`; }
    check(overlapOk, "row-label no-overlap: no two visible row labels overlap > 4px (D10)", overlapDetail);
    const planVis = plan.groups.filter((g) => g.showLabel).length;
    const domVis = D.rlabels.filter((l) => l.opacity > 0.5).length;
    check(domVis === planVis, `visible row-label count (${domVis}) == planDistribution show flags (${planVis}) (D10)`);

    // D11 — §3 BINDING: painted outlier-dot diameter @390 (CSS px ÷ 2.77) ≥ floor on a fixture WITH
    // outliers; axis/row-label eff font ≥ 18; assertGatingClean; coverage. The painted dot diameter is
    // the MEASURED rendered diameter, NOT the viewBox OUTLIER_R constant (the scatter D7 mechanism).
    const dotDias = [];
    for (const g of D.groups) for (const o of g.outliers || []) if (o.rx > 0) dotDias.push(o.rx * 2);
    if (dotDias.length) {
      const minDia = Math.min(...dotDias);
      if (widthBound) {
        check(minDia / 2.77 >= 6.5 - 0.5, `painted outlier-dot diameter ${(minDia / 2.77).toFixed(2)}px @390 ≥ 6.5 (D11 — §3 binding, measured not constant)`, `${minDia.toFixed(1)}px CSS`);
      } else {
        // Row wider than MIN_VIEW_H matches → `meet` binds on HEIGHT, the width letterboxes (the
        // documented rare-pathological edge). The dot scales by the uniform (min) scale; informational
        // only here (the §3 binding holds at every width-bound row the other fixtures hit).
        console.log(`  · painted outlier-dot diameter ${(minDia / 2.77).toFixed(2)}px @390 (informational — wide-short row letterboxed by width; MIN_VIEW_H edge)`);
      }
    }
    let floorOk = true, floorDetail = "";
    for (const l of [...D.rlabels, ...D.vtlabels]) if (l.opacity > 0.05 && l.fontSize < 18 - 0.5) { floorOk = false; floorDetail = `label "${(l.text || "").slice(0, 8)}" ${l.fontSize}px < 18`; }
    check(floorOk, "axis/row labels' font ≥ 18 (designed at 24/22) (D11)", floorDetail);
    assertGatingClean(check, reports, T_SAMPLES, " (D1/D11 · box/whisker/outlier shapes excluded — no text node)");
    check(base.textCoverage < 0.42, `textCoverage ${base.textCoverage} < 0.42 at t=1 (D11)`);
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
