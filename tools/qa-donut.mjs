#!/usr/bin/env node
// PL-2.3 deterministic gate — Donut / radial proportion primitive (no LLM). Epic PL-2 (chart family).
//
//   node tools/qa-donut.mjs --unit   # planDonut decision tables (no dev server)
//   npm run dev                      # in another terminal — DOM passes need the dev server
//   npm run qa:donut                 # full: unit + sampled-t DOM pass
//
// PL-0.2: migrated onto `definePrimitiveGate` (tools/lib/primitive-gate.mjs) — the gate is now a
// DECLARATION (the unit suite + the per-fixture domChecks), and the registry owns the shared
// machinery (CLI parse, the check/approx scoreboard, the headless-Chromium lifecycle, the fixture
// loop, the banner + pass/fail summary + exit code). Donut is a green-field PL-2.3 gate with no
// legacy render to protect, so it has NO byte-identity baseline (it omits the registry's opt-in
// baselineDir/captureState/compareBaseline); behaviour is byte-identical to the pre-migration gate.
//
// Covers handoff §7 (planning/primitive-library/handoffs/PL-2.3-donut.md):
//   1. planDonut unit suite (U1–U10): normalization sum-to-1, sliver fixpoint, cap/downsample (post
//      sort-desc), angle math (Σ = 360°, cumulative increasing, 12-o'clock start), label fit-or-hide,
//      center derivation, degenerate (empty / single full ring), unknown-enum → default coercion,
//      sweep-timing fns, and the PL-4.2 emphasis (opacity-only focus, geometry byte-identical).
//   2. Sampled-t DOM pass at T = {0, .30, .40, .50, .60, .64, .72, .85, .92, 1} over the clean
//      4-segment / 6-segment-cap / sliver-floor / long-labels-thin-wedges-stress / over-cap / emphasis
//      fixtures (one headless Chromium, Preview ?id&t): arc-angles-correct, sweep bounded + dashoffset
//      settled at t=1 (§3 ruling 2 — NO CSS transform on arcs), ring-within-frame (§3 ruling 1), count +
//      normalization, label no-overlap/fit, layout reserved, center, per-arc emphasis opacity, mobile
//      floors via assertGatingClean.
import { definePrimitiveGate } from "./lib/primitive-gate.mjs";
import {
  planDonut,
  donutSweep,
  segmentSweep,
  labelStampT,
  MAX_SEGMENTS,
  MIN_FRACTION,
  SEG_GAP_DEG,
  RING_C,
  RING_OUTER_R,
  SWEEP_START,
  SWEEP_END,
  SWEEP_DUR,
  DIM_OPACITY,
} from "../src/lib/donut.ts";

const T_SAMPLES = [0, 0.3, 0.4, 0.5, 0.6, 0.64, 0.72, 0.85, 0.92, 1];
const ANIM_FIXTURES = [
  "fuzz-48-donut-4-segment",
  "fuzz-49-donut-6-segment-cap",
  "fuzz-50-donut-sliver-floor",
  "fuzz-51-donut-long-labels-thin-wedges",
  "fuzz-52-donut-overcap-degenerate",
  "fuzz-126-donut-emphasis",
];

const planFor = (v) => planDonut({ segments: v.segments, centerLabel: v.centerLabel, centerValue: v.centerValue, valueLabels: v.valueLabels, centerTotal: v.centerTotal, unit: v.unit, emphasis: v.emphasis });

// SWEEP_END is exported from donut.ts? It's a module-internal const; recompute defensively.
const SWEEP_DONE = SWEEP_END ?? SWEEP_START + SWEEP_DUR;

// ── 1. Unit suite (pure — no DOM) ─────────────────────────────────────────────
function unitSuite(check, approx) {
  console.log("U1 — normalization → fractions sum to 1; negative→0; all-zero→empty:");
  const u1 = planDonut({ segments: [{ label: "a", value: 1 }, { label: "b", value: 1 }, { label: "c", value: 2 }] });
  const fr = u1.segments.map((s) => s.fraction).sort((a, b) => a - b);
  check(approx(fr[0], 0.25) && approx(fr[1], 0.25) && approx(fr[2], 0.5), "[1,1,2] → fractions [0.25,0.25,0.5]", fr.join(","));
  check(approx(u1.segments.reduce((s, x) => s + x.fraction, 0), 1), "fractions sum to 1 ± 1e-6");
  const u1n = planDonut({ segments: [{ label: "a", value: -5 }, { label: "b", value: 10 }] });
  // negative → clamped 0 (kept as a zero-fraction segment); the 10 takes the full ring.
  const u1nFr = u1n.segments.map((s) => s.fraction);
  check(approx(Math.max(...u1nFr), 1) && approx(Math.min(...u1nFr), 0) && approx(u1nFr.reduce((s, x) => s + x, 0), 1), "negative→0; the positive takes the full ring (fractions [1,0])", JSON.stringify(u1nFr));
  check(planDonut({ segments: [{ label: "a", value: 0 }, { label: "b", value: 0 }] }).empty === true, "all-zero → empty:true");
  check(planDonut({ segments: [] }).empty === true, "0 segments → empty:true");

  console.log("U2 — sliver fixpoint (0.02 floor; surplus from the largest; no-sliver no-op):");
  const u2 = planDonut({ segments: [{ label: "a", value: 100 }, { label: "b", value: 100 }, { label: "c", value: 1 }] });
  const c = u2.segments.find((s) => s.label === "c");
  check(c.fraction >= MIN_FRACTION - 1e-9, `tiny segment floored to ≥ ${MIN_FRACTION}`, `got ${c.fraction}`);
  check(approx(u2.segments.reduce((s, x) => s + x.fraction, 0), 1), "sum stays 1 ± 1e-6 after floor");
  check(u2.segments.every((s) => s.fraction === 0 || s.fraction >= MIN_FRACTION - 1e-9), "every fraction ∈ {0} ∪ [0.02, 1]");
  const u2b = planDonut({ segments: [{ label: "a", value: 50 }, { label: "b", value: 50 }] });
  check(approx(u2b.segments[0].fraction, 0.5) && approx(u2b.segments[1].fraction, 0.5), "no-sliver input is a no-op (== legacy normalization)");

  console.log("U3 — cap/downsample (post sort-desc; keeps the largest; surfaced):");
  const u3 = planDonut({ segments: Array.from({ length: 9 }, (_, i) => ({ label: `s${i}`, value: 9 - i })) });
  check(u3.segments.length === MAX_SEGMENTS, `9 segments → ${MAX_SEGMENTS} kept`, `got ${u3.segments.length}`);
  check(u3.dropped.segmentsDropped === 3, "segmentsDropped === 3 (surfaced)", `got ${u3.dropped.segmentsDropped}`);
  // sort-desc keeps the LARGEST 6 (values 9..4); the smallest 3 (3,2,1) dropped.
  const u3b = planDonut({ segments: [{ label: "big", value: 100 }, { label: "x", value: 1 }, { label: "y", value: 1 }, { label: "z", value: 1 }, { label: "w", value: 1 }, { label: "v", value: 1 }, { label: "drop", value: 0.5 }] });
  check(!u3b.segments.some((s) => s.label === "drop"), "cap keeps the larger shares, drops the smallest", u3b.segments.map((s) => s.label).join(","));

  console.log("U4 — angle math (Σ = 360°; cumulative start increasing; 12-o'clock start):");
  const u4 = planDonut({ segments: [{ label: "a", value: 25 }, { label: "b", value: 25 }, { label: "c", value: 50 }] });
  check(approx(u4.segments.reduce((s, x) => s + x.sweepAngleDeg, 0), 360, 1e-4), "Σ sweepAngleDeg == 360°");
  check(u4.segments.every((s, i) => approx(s.sweepAngleDeg, s.fraction * 360, 1e-6)), "sweepAngleDeg == fraction × 360");
  check(u4.segments[0].startAngleDeg === 0, "first segment starts at 0° (12 o'clock)");
  const starts = u4.segments.map((s) => s.startAngleDeg);
  check(starts.every((v, i) => i === 0 || v > starts[i - 1]), "cumulative start angles strictly increasing", starts.join(","));
  check(u4.segments.every((s) => approx(s.labelAngleDeg, s.startAngleDeg + s.sweepAngleDeg / 2, 1e-6)), "label anchor == mid-angle");

  console.log("U5 — label fit-or-hide (>14cp tooLong; thin-wedge name hidden but value shown; off):");
  const u5l = planDonut({ segments: [{ label: "this name is way too long", value: 50 }, { label: "ok", value: 50 }] });
  const longSeg = u5l.segments.find((s) => (s.label || "").startsWith("this"));
  check(longSeg.showName === false && longSeg.nameHideReason === "tooLong", ">14cp name → hidden(tooLong)", `got ${longSeg.nameHideReason}`);
  const u5t = planDonut({ segments: [{ label: "Dominant", value: 90 }, { label: "Orchestrate", value: 5 }, { label: "Provisioned", value: 5 }] });
  const thin = u5t.segments.find((s) => s.label === "Orchestrate");
  check(thin.showName === false && thin.nameHideReason === "tooThin", "long name on a thin wedge → hidden(tooThin)", `got name=${thin.showName}/${thin.nameHideReason}`);
  check(thin.showValue === true, "thin-wedge value still shows (load-bearing number)", `got showValue=${thin.showValue}`);
  const u5off = planDonut({ segments: [{ label: "a", value: 50 }, { label: "b", value: 50 }], valueLabels: "off" });
  const u5on = planDonut({ segments: [{ label: "a", value: 50 }, { label: "b", value: 50 }], valueLabels: "auto" });
  check(u5off.segments.every((s) => s.showValue === false && s.valueHideReason === "off"), "valueLabels:off → all values hidden(off)");
  // off-VALUES must not add to the defect counter: the hiddenLabels count is identical to the
  // valueLabels:auto run (any name hidden for frame/fit is the SAME in both; values add nothing).
  check(u5off.dropped.hiddenLabels === u5on.dropped.hiddenLabels, "off-values NOT counted as a defect (counter == valueLabels:auto run)", `off ${u5off.dropped.hiddenLabels} vs auto ${u5on.dropped.hiddenLabels}`);

  console.log("U6 — center derivation (on/%/no centerValue → '100%'; off → none; override wins):");
  const u6 = planDonut({ segments: [{ label: "a", value: 50 }, { label: "b", value: 50 }], centerTotal: "on", unit: "%" });
  check(u6.center.show === true && u6.center.value === "100%", "centerTotal:on + %, no centerValue → '100%'", JSON.stringify(u6.center));
  const u6off = planDonut({ segments: [{ label: "a", value: 50 }], centerTotal: "off" });
  check(u6off.center.show === false, "centerTotal:off → no center headline");
  const u6v = planDonut({ segments: [{ label: "a", value: 50 }], centerValue: "$5M", centerLabel: "ARR" });
  check(u6v.center.value === "$5M" && u6v.center.caption === "ARR", "explicit centerValue + centerLabel win", JSON.stringify(u6v.center));
  const u6t = planDonut({ segments: [{ label: "a", value: 30 }, { label: "b", value: 70 }], unit: "k" });
  check(u6t.center.value === "100k", "non-% unit → summed raw total formatted ('100k')", u6t.center.value);

  console.log("U7 — degenerate (0 → empty; 1 positive → full ring, no gap):");
  check(planDonut({ segments: [] }).empty === true, "0 segments → empty:true");
  const u7 = planDonut({ segments: [{ label: "all", value: 42 }] });
  check(u7.empty === false && u7.singleFull === true, "1 positive segment → singleFull (full ring)");
  check(approx(u7.segments[0].fraction, 1) && approx(u7.segments[0].sweepAngleDeg, 360), "single segment fraction 1.0 / sweep 360°");

  console.log("U8 — unknown-enum → default:");
  const u8 = planDonut({ segments: [{ label: "a", value: 1 }], valueLabels: "weird", centerTotal: "maybe" });
  check(u8.valueLabels === "auto", "unknown valueLabels → auto", u8.valueLabels);
  check(u8.center.show === true, "unknown centerTotal → on (show)", String(u8.center.show));

  console.log("U9 — sweep timing fns (edge ∈ [0,1] monotone; segmentSweep; labelStampT):");
  check(donutSweep(0) === 0 && donutSweep(1) === 1, "donutSweep pinned 0→0, 1→1");
  check(donutSweep(SWEEP_START) === 0 && approx(donutSweep(SWEEP_DONE), 1, 1e-9), "edge 0 at SWEEP_START, 1 at SWEEP_END");
  let mono = true, prev = -1;
  for (let t = 0; t <= 1.0001; t += 0.02) { const e = donutSweep(t); if (e < prev - 1e-9) mono = false; prev = e; }
  check(mono, "donutSweep monotone non-decreasing");
  check(segmentSweep(0, 0.5, 0.25) === 0 && segmentSweep(1, 0.5, 0.25) === 1, "segmentSweep 0 pre-edge, 1 settled");
  check(approx(donutSweep(labelStampT(0.5)), 0.5, 1e-3), "labelStampT inverts the edge (E(labelStampT(0.5)) ≈ 0.5)");
  check(labelStampT(1) === SWEEP_DONE, "labelStampT(1) == SWEEP_END (last label)");

  console.log("U10 — emphasis (OPACITY-ONLY focus; index resolution/clamp; geometry byte-identical):");
  const eData = [{ label: "Compute", value: 46 }, { label: "Storage", value: 24 }, { label: "Egress", value: 18 }, { label: "Tooling", value: 12 }];
  const eBase = planDonut({ segments: eData });
  check(eBase.emphasisIndex === null && eBase.segments.every((s) => s.dim === false), "default (no emphasis) → emphasisIndex null; every wedge dim:false (full opacity)");
  // Note: post sort-desc, eData is already largest-first, so plan index i == author index i.
  const e1 = planDonut({ segments: eData, emphasis: 1 });
  check(e1.emphasisIndex === 1, "valid index 1 resolves (post-sort)", String(e1.emphasisIndex));
  check(e1.segments[1].dim === false, "focused wedge (index 1) stays dim:false (full opacity)");
  check(e1.segments.every((s, i) => (i === 1 ? s.dim === false : s.dim === true)), "every OTHER wedge dim:true (de-emphasized)", e1.segments.map((s) => s.dim).join(","));
  // Out-of-range / non-integer ⇒ defended to "no emphasis" = today.
  check(planDonut({ segments: eData, emphasis: -1 }).emphasisIndex === null, "negative index → no emphasis (null)");
  check(planDonut({ segments: eData, emphasis: 4 }).emphasisIndex === null, "index ≥ length → no emphasis (null)");
  check(planDonut({ segments: eData, emphasis: 1.5 }).emphasisIndex === null, "non-integer index → no emphasis (null)");
  const eOob = planDonut({ segments: eData, emphasis: 99 });
  check(eOob.emphasisIndex === null && eOob.segments.every((s) => s.dim === false), "huge index → no emphasis; all wedges full opacity (defended)");
  // GEOMETRY BYTE-IDENTICAL: emphasis changes ONLY `dim`; every arc/label geometry == the no-emphasis
  // plan for the same data (the only field that may differ across the two plans is `dim`).
  let geomOk = true, geomDetail = "";
  for (let i = 0; i < eBase.segments.length; i++) {
    const a = eBase.segments[i], b = e1.segments[i];
    const fields = ["fraction", "startFrac", "startAngleDeg", "sweepAngleDeg", "labelAngleDeg", "accentKey", "showName", "showValue", "valueText"];
    for (const f of fields) if (a[f] !== b[f]) { geomOk = false; geomDetail = `seg ${i}.${f}: ${a[f]} ≠ ${b[f]}`; }
  }
  check(geomOk, "emphasis is OPACITY-ONLY: all arc/label geometry byte-identical to the no-emphasis plan (only `dim` differs)", geomDetail);
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
const overlap = (A, B) => {
  const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
  const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
  return ox > 4 && oy > 4 ? Math.min(ox, oy) : 0;
};

// ── 2. Sampled-t DOM checks (per fixture; the registry owns the loop + sampling) ───────────────
async function donutDomChecks(ctx) {
  const { id, spec, plan, reports, base, T: T_SAMPLES, check, approx, assertGatingClean } = ctx;
  console.log(`Sampled-t DOM pass — ${id} (${plan.segments.length} seg, t ∈ {${T_SAMPLES.join(", ")}}):`);

  const D = base.donut;
  if (!check(!!D, "donut section present at t=1")) return;

  const sx = D.scaleX;

  // C-COUNT — rendered arc count == planDonut post-clamp at every sample; normalization applied.
  check(
    T_SAMPLES.every((t) => reports[t].donut?.segCount === plan.segments.length),
    `rendered arc count === ${plan.segments.length} (planDonut post-clamp) at every sample (C-COUNT)`,
    `counts: ${T_SAMPLES.map((t) => reports[t].donut?.segCount).join(",")}`,
  );
  check(D.segCount <= MAX_SEGMENTS, `≤ ${MAX_SEGMENTS} arcs (cap)`, `got ${D.segCount}`);
  check(plan.segments.every((s) => s.fraction === 0 || s.fraction >= MIN_FRACTION - 1e-9), "every fraction ∈ {0} ∪ [0.02, 1] (sliver floor applied)");

  // C-ARC — each arc's settled drawn length == (sweepAngle − gap)/360 × C × scale; Σ angles == 360.
  let arcOk = true, arcDetail = "";
  const sumSweep = D.segments.reduce((s, a) => s + a.sweepAngleDeg, 0);
  if (!approx(sumSweep, 360, 0.01)) { arcOk = false; arcDetail = `Σ sweepAngle ${sumSweep.toFixed(2)} ≠ 360`; }
  for (let i = 0; i < D.segments.length; i++) {
    const a = D.segments[i];
    const planned = plan.segments[i];
    if (Math.abs(a.sweepAngleDeg - planned.fraction * 360) > 0.75) { arcOk = false; arcDetail = `arc ${i} sweepAngle ${a.sweepAngleDeg.toFixed(2)} ≠ fraction×360 ${(planned.fraction * 360).toFixed(2)}`; }
    // strokeDasharray's computed value is reported in SVG USER UNITS (unscaled), so compare to
    // the raw RING_C (no layout scale).
    const gap = plan.singleFull ? 0 : SEG_GAP_DEG;
    const expectDrawn = ((Math.max(0, a.sweepAngleDeg - gap)) / 360) * RING_C;
    if (Math.abs(a.dashDrawn - expectDrawn) > Math.max(2, expectDrawn * 0.04)) { arcOk = false; arcDetail = `arc ${i} settled drawn ${a.dashDrawn.toFixed(1)} ≠ (sweep−gap)/360·C ${expectDrawn.toFixed(1)}`; }
  }
  check(arcOk, "arc-angles-correct: settled drawn arc == (fraction×360 − gap)/360·C; Σ angles == 360° ±tol (C-ARC)", arcDetail);

  // C-SWEEP — donutSweep bounded/monotone; at t=1 every arc fully drawn; dashoffset OMITTED at
  // t ≥ 0.64; NO CSS transform on any arc ever (§3 ruling 2).
  let sweepOk = true, sweepDetail = "";
  for (const t of T_SAMPLES) {
    const e = donutSweep(t);
    if (e < -1e-9 || e > 1 + 1e-9) { sweepOk = false; sweepDetail = `donutSweep(${t}) ${e} ∉ [0,1]`; }
  }
  // grow: each arc's drawn length == settled·segmentSweep (the painted arc grows with the edge).
  for (const t of T_SAMPLES) {
    const d = reports[t].donut;
    for (let i = 0; i < d.segments.length; i++) {
      const planned = plan.segments[i];
      const g = segmentSweep(t, planned.startFrac, planned.fraction);
      const settledDrawn = D.segments[i].dashDrawn;
      const expect = settledDrawn * g;
      if (settledDrawn > 1 && Math.abs(d.segments[i].dashDrawn - expect) > Math.max(3, settledDrawn * 0.06)) {
        sweepOk = false; sweepDetail = `arc ${i} drawn ${d.segments[i].dashDrawn.toFixed(1)} ≠ settled·segmentSweep ${expect.toFixed(1)} at t=${t}`;
      }
    }
  }
  check(sweepOk, "sweep bounded + per-arc fill == settled·segmentSweep (continuous edge) (C-SWEEP)", sweepDetail);

  // settle (§3 ruling 2): the SWEEP is dasharray/dashoffset, NOT a t-driven transform. Assert (a)
  // each arc's transform is CONSTANT across every t (the rotate is reserved geometry, not the
  // animation — so there is no identity-transform-at-settle concern); (b) dashoffset stays 0
  // (static — the dash origin is the rotate, never the sweep); (c) the dash is fully swept (drawn
  // == the segment's full span) at t=1, mirroring qa-stathero's ring read.
  let settleOk = true, settleDetail = "";
  for (const t of T_SAMPLES) {
    for (let i = 0; i < D.segments.length; i++) {
      const a = reports[t].donut.segments[i];
      if (a.cssTransform !== D.segments[i].cssTransform) { settleOk = false; settleDetail = `arc ${i} transform changes across t (sweep must not be transform-driven) at t=${t}`; }
      if (Number.isFinite(a.dashoffset) && Math.abs(a.dashoffset) > 0.5) { settleOk = false; settleDetail = `arc ${i} dashoffset ${a.dashoffset} ≠ 0 (static origin) at t=${t}`; }
    }
  }
  for (const a of base.donut.segments) {
    const planned = plan.segments[+a.index];
    const gap = plan.singleFull ? 0 : SEG_GAP_DEG;
    const full = ((Math.max(0, planned.fraction * 360 - gap)) / 360) * RING_C; // user units (unscaled)
    if (full > 1 && Math.abs(a.dashDrawn - full) > Math.max(2, full * 0.04)) { settleOk = false; settleDetail = `arc ${a.index} not fully drawn at t=1 (${a.dashDrawn.toFixed(1)} vs ${full.toFixed(1)})`; }
  }
  check(settleOk, "t=1 dash fully swept (drawn); arc transform constant across t (sweep is dash, not transform); dashoffset static 0 (C-SWEEP settle, §3 ruling 2)", settleDetail);

  // C-RESERVED — transform-blind geometry (angles + cx/cy/r) + nodeCount constant across all samples.
  check(
    T_SAMPLES.every((t) => reports[t].donut?.nodeCount === D.nodeCount),
    `svg DOM node count constant (${D.nodeCount}) across t (C-RESERVED)`,
    `counts: ${T_SAMPLES.map((t) => reports[t].donut?.nodeCount).join(",")}`,
  );
  let reservedOk = true, reservedDetail = "";
  for (const t of T_SAMPLES) {
    const d = reports[t].donut;
    for (let i = 0; i < D.segments.length; i++) {
      const a = d.segments[i], b = D.segments[i];
      if (Math.abs(a.startAngleDeg - b.startAngleDeg) > 1e-6 || Math.abs(a.sweepAngleDeg - b.sweepAngleDeg) > 1e-6 ||
          a.layout.cx !== b.layout.cx || a.layout.cy !== b.layout.cy || a.layout.r !== b.layout.r) {
        reservedOk = false; reservedDetail = `arc ${i} angular/layout geometry drifts at t=${t}`;
      }
    }
  }
  check(reservedOk, "every arc's transform-blind angular geometry (start/sweep + cx/cy/r) constant across all samples (C-RESERVED)", reservedDetail);

  // C-FRAME — the whole ring (R230) painted bbox ⊆ the svg rect at every t; nothing clipped.
  // (assertGatingClean below covers clipped/outOfSafeMargin for labels; here the RING bound.)
  let frameOk = true, frameDetail = "";
  for (const t of T_SAMPLES) {
    const d = reports[t].donut;
    const svg = d.rect;
    for (const a of d.segments) {
      const p = a.painted;
      if (p.w < 0.5 || p.h < 0.5) continue;
      if (p.x < svg.x - 1 || p.y < svg.y - 1 || p.x + p.w > svg.x + svg.w + 1 || p.y + p.h > svg.y + svg.h + 1) {
        frameOk = false; frameDetail = `arc ${a.index} painted bbox exits the svg frame at t=${t}`;
      }
    }
  }
  check(frameOk, "ring-within-frame: every painted arc ⊆ the svg viewBox frame at every t (C-FRAME, §3 ruling 1)", frameDetail);

  // C-LABEL — no two VISIBLE labels overlap > 4px at any sample; visible SET at t=1 matches plan.
  let overlapOk = true, overlapDetail = "";
  for (const t of T_SAMPLES) {
    const d = reports[t].donut;
    const leaves = [];
    for (const n of d.names) if (n && n.opacity > 0.05) leaves.push(n.rect);
    for (const v of d.values) if (v && v.opacity > 0.05) leaves.push(v.rect);
    if (d.center) leaves.push(d.center.rect);
    if (d.centerCap) leaves.push(d.centerCap.rect);
    for (let i = 0; i < leaves.length; i++)
      for (let j = i + 1; j < leaves.length; j++)
        if (overlap(leaves[i], leaves[j]) > 4) { overlapOk = false; overlapDetail = `two labels overlap ${overlap(leaves[i], leaves[j]).toFixed(1)}px at t=${t}`; }
  }
  check(overlapOk, "no two visible labels overlap > 4px at any sample (C-LABEL)", overlapDetail);

  const planVisNames = plan.segments.filter((s) => s.showName).length;
  const planVisValues = plan.segments.filter((s) => s.showValue).length;
  const domNames = D.names.filter((n) => n.opacity > 0.5).length;
  const domValues = D.values.filter((v) => v.opacity > 0.5).length;
  check(domNames === planVisNames, `visible name SET at t=1 == plan (${planVisNames})`, `dom ${domNames}`);
  check(domValues === planVisValues, `visible value SET at t=1 == plan (${planVisValues})`, `dom ${domValues}`);
  if (plan.valueLabels === "off") check(domValues === 0, "valueLabels:off → 0 value labels rendered", `dom ${domValues}`);

  // C-CENTER — present iff centerTotal:on; text matches plan; caption iff centerLabel; font ≥ floor.
  check(!!D.center === plan.center.show, `center headline present iff centerTotal:on (plan ${plan.center.show})`, `dom ${!!D.center}`);
  if (plan.center.show && D.center) {
    check(D.center.text === plan.center.value, `center value "${plan.center.value}" matches`, `dom "${D.center.text}"`);
    check(D.center.fontSize >= 18 - 0.5, `center eff font ${D.center.fontSize.toFixed(1)}px ≥ 18 floor`);
    const wantCap = !!spec.visualization.centerLabel;
    check(!!D.centerCap === wantCap, `center caption present iff centerLabel set (plan ${wantCap})`, `dom ${!!D.centerCap}`);
  }

  // C-EMPHASIS (PL-4.2) — per-arc paint opacity == plan at EVERY sample (paint is static across t):
  // the focused wedge + every wedge in a no-emphasis donut paint at opacity 1; the de-emphasized
  // wedges paint at DIM_OPACITY. For the 5 DEFAULT fixtures (emphasisIndex === null) this asserts
  // EVERY arc is full opacity = byte-identical to today; for the emphasis fixture it asserts exactly
  // ONE arc full + the rest dimmed. Geometry-byte-identical-to-no-emphasis is covered by U10.
  let emphOk = true, emphDetail = "";
  for (const t of T_SAMPLES) {
    const d = reports[t].donut;
    for (let i = 0; i < d.segments.length; i++) {
      const expected = plan.emphasisIndex !== null && i !== plan.emphasisIndex ? DIM_OPACITY : 1;
      const got = d.segments[i].opacity;
      if (Math.abs(got - expected) > 0.02) { emphOk = false; emphDetail = `arc ${i} opacity ${got} ≠ ${expected} at t=${t}`; }
    }
  }
  const dimCount = plan.segments.filter((s) => s.dim).length;
  const wantDim = plan.emphasisIndex === null ? 0 : plan.segments.length - 1;
  check(dimCount === wantDim, `plan dims ${wantDim} wedge(s) (emphasisIndex ${plan.emphasisIndex})`, `got ${dimCount}`);
  check(emphOk, "per-arc opacity == plan at every t: focus/normal == 1, dimmed == DIM_OPACITY; static across t (C-EMPHASIS)", emphDetail);

  // C-MOBILE — label fonts ≥ 18; gating clean at every sample (collisions/clipped/safe-margin/floor).
  let floorOk = true, floorDetail = "";
  for (const n of D.names) if (n.opacity > 0.05 && n.fontSize < 18 - 0.5) { floorOk = false; floorDetail = `name "${(n.text || "").slice(0, 10)}" ${n.fontSize}px < 18`; }
  for (const v of D.values) if (v.opacity > 0.05 && v.fontSize < 18 - 0.5) { floorOk = false; floorDetail = `value "${(v.text || "").slice(0, 8)}" ${v.fontSize}px < 18`; }
  check(floorOk, "outside name/value label fonts ≥ 18 (C-MOBILE)", floorDetail);
  assertGatingClean(check, reports, T_SAMPLES, " (C-FRAME/C-MOBILE)");
}

// No baseline: donut is a green-field PL-2.3 gate (no legacy render to protect), so it omits the
// registry's opt-in baselineDir/captureState/compareBaseline — `--baseline-capture` is a no-op
// pass-through (runs the full suite) exactly as the pre-migration gate did.
await definePrimitiveGate({
  name: "donut",
  fixtures: ANIM_FIXTURES,
  sampledT: T_SAMPLES,
  planFor,
  unit: (check, { approx }) => unitSuite(check, approx),
  domChecks: donutDomChecks,
}).run();
