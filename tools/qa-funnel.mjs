#!/usr/bin/env node
// PL-3.3 deterministic gate — Funnel (centered-trapezoid + bars) non-compounding process primitive
// (no LLM).
//
//   node tools/qa-funnel.mjs --unit   # planFunnel decision tables (no dev server)
//   npm run dev                       # in another terminal — DOM passes need the dev server
//   npm run qa:funnel                 # full: unit + sampled-t DOM pass
//
// Covers handoff §2.7 (planning/primitive-library/handoffs/PL-3.3-funnel.md), PM §3 (cap 5):
//   1. planFunnel unit suite — maxValue derivation + ≤0 guard, the C1 downsample to 5 keeping
//      first+last, the C5 MIN_BAND_W floor, the C6 monotonic painted-width clamp (true value
//      preserved + monotonicClampApplied), drop-off correctness from TRUE values incl. the
//      value=0 guard, stage/value/drop label show/hide, mode/accent/dropLabels coercion, the
//      < 2-stage fallback flag, and the continuous-edge invariant (bandSettle_{N-1} ≤ 0.78 and
//      max drop.revealT + 0.04 ≤ 0.85 for all N ∈ [2,5]).
//   2. Sampled-t DOM pass at T = {0, 0.30, 0.38, 0.46, 0.54, 0.62, 0.70, 0.78, 0.84, 1} over the
//      six funnel stress fixtures (one headless Chromium, Preview ?id&t):
//      C9 geometry static (svg/band-layout-box/wall/label boxes identical across all 10 samples
//      ≤0.5px; node count constant), the FOUR NEW checks — funnel-band-within-frame (C10),
//      no-funnel-label-overlap (C11), monotonic-painted-width (C6 DOM), dropoff-pct-vs-ratios —
//      C12 settle (clip OMITTED + opacities 1 at t=1), C7 mobile floor, the C1 cap (7-stage
//      fixture → 5 bands), and collisions/clipped/outOfSafeMargin/belowMobileFloor clean.
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BASE, VIEWPORT, sampleFixture, assertGatingClean } from "./lib/sampled-t.mjs";
import {
  planFunnel,
  formatDropPct,
  MIN_BAND_W,
  MAX_BAND_W,
  BARS_MAX_BAND_W,
  PLOT_X0,
  PLOT_X1,
  LABEL_COL,
  EDGE_END,
  SETTLE_DEADLINE,
  DROP_FADE_DUR,
  STAGE_LABEL_PX,
  VALUE_LABEL_PX,
  DROP_LABEL_PX,
  BARS_LABEL_ANCHOR_X,
} from "../src/lib/funnel.ts";
import { estW } from "../src/lib/stack.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UNIT_ONLY = process.argv.includes("--unit");

// §2.7 sample set: pre-build, the edge descending past each band, the late drop-off stamps, settle, final.
const T_SAMPLES = [0, 0.3, 0.38, 0.46, 0.54, 0.62, 0.7, 0.78, 0.84, 1];
const ANIM_FIXTURES = [
  "fuzz-72-funnel-overcap-7",
  "fuzz-73-funnel-near-zero-final",
  "fuzz-74-funnel-non-monotonic",
  "fuzz-75-funnel-long-label",
  "fuzz-76-funnel-nonnumeric-valuetext",
  "fuzz-77-funnel-bars-mode",
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
async function unitSuite() {
  const S = (label, value, extra = {}) => ({ label, value, ...extra });

  console.log("maxValue derivation + ≤0 guard (§2.5.1):");
  const basic = planFunnel([S("a", 100), S("b", 40)], "funnel", undefined, "cyan", "auto");
  check(basic.maxValue === 100, "maxValue = max(values)", `got ${basic.maxValue}`);
  const allZero = planFunnel([S("a", 0), S("b", 0)], "funnel", undefined, "cyan", "auto");
  check(allZero.maxValue === 1, "all-zero values → maxValue guarded to 1 (no divide-by-zero)", `got ${allZero.maxValue}`);
  const nanVal = planFunnel([S("a", NaN), S("b", 50)], "funnel", undefined, "cyan", "auto");
  check(nanVal.bands[0].value === 0, "NaN value → coerced to 0 for layout", `got ${nanVal.bands[0].value}`);
  check(nanVal.bands[0].valueCountText === undefined, "NaN value → not count-eligible (forced fade path)");
  const negVal = planFunnel([S("a", -10), S("b", 50)], "funnel", undefined, "cyan", "auto");
  check(negVal.bands[0].value === 0, "negative value → coerced to 0 (magnitudes only)", `got ${negVal.bands[0].value}`);

  console.log("C1 downsample to 5 keeping first+last (PM §3 — cap 5):");
  const seven = planFunnel(
    Array.from({ length: 7 }, (_, i) => S(`s${i}`, 100 - i * 12)),
    "funnel",
    undefined,
    "cyan",
    "auto",
  );
  check(seven.bands.length === 5, "7 declared stages → exactly 5 bands (C1)", `got ${seven.bands.length}`);
  check(seven.bands[0].value === 100, "first stage kept (entry total)", `got ${seven.bands[0].value}`);
  check(seven.bands[4].value === 100 - 6 * 12, "last stage kept (final converted)", `got ${seven.bands[4].value}`);
  check(seven.dropped.stagesDropped === 2, "stagesDropped counter = 2", `got ${seven.dropped.stagesDropped}`);

  console.log("C5 min band width floor (§2.4 C5):");
  const tiny = planFunnel([S("a", 50000), S("b", 8000), S("c", 12)], "funnel", undefined, "cyan", "auto");
  check(approx(tiny.bands[2].paintedW, MIN_BAND_W, 0.5), `near-zero stage paints at exactly MIN_BAND_W ${MIN_BAND_W}px`, `got ${tiny.bands[2].paintedW.toFixed(2)}`);
  check(tiny.bands[2].paintedW > 1, "the narrowest band is never a hairline/line");
  const zeroStage = planFunnel([S("a", 100), S("b", 0)], "funnel", undefined, "cyan", "auto");
  check(approx(zeroStage.bands[1].paintedW, MIN_BAND_W, 0.5), `value=0 stage paints at the min floor (not a line)`, `got ${zeroStage.bands[1].paintedW.toFixed(2)}`);
  // Top band maps to MAX_BAND_W.
  check(approx(basic.bands[0].paintedW, MAX_BAND_W, 0.5), `widest (entry) band maps to MAX_BAND_W ${MAX_BAND_W}px`, `got ${basic.bands[0].paintedW.toFixed(2)}`);
  const barsTop = planFunnel([S("a", 100), S("b", 40)], "bars", undefined, "cyan", "auto");
  check(approx(barsTop.bands[0].paintedW, BARS_MAX_BAND_W, 0.5), `bars-mode widest band maps to BARS_MAX_BAND_W ${BARS_MAX_BAND_W}px`, `got ${barsTop.bands[0].paintedW.toFixed(2)}`);

  console.log("C6 monotonic painted-width clamp (§2.4 C6):");
  const nonMono = planFunnel([S("a", 8000), S("b", 5000), S("c", 5750), S("d", 2100)], "funnel", undefined, "cyan", "auto");
  check(nonMono.bands[2].paintedW <= nonMono.bands[1].paintedW + 0.5, "a growing stage's painted width is clamped ≤ the prior band", `band2 ${nonMono.bands[2].paintedW.toFixed(1)} vs band1 ${nonMono.bands[1].paintedW.toFixed(1)}`);
  check(nonMono.bands[2].monotonicClampApplied === true, "monotonicClampApplied set on the clamped band");
  check(nonMono.bands[2].value === 5750, "the TRUE value is preserved (drives count-up)", `got ${nonMono.bands[2].value}`);
  check(nonMono.bands[2].dataW > nonMono.bands[1].paintedW, "dataW (un-clamped) is preserved for the check (> prior painted)");
  // Painted widths are non-increasing across the whole funnel.
  let nonIncreasing = true;
  for (let i = 1; i < nonMono.bands.length; i++) if (nonMono.bands[i].paintedW > nonMono.bands[i - 1].paintedW + 0.5) nonIncreasing = false;
  check(nonIncreasing, "all painted widths non-increasing top→down");

  console.log("Drop-off correctness from TRUE values incl. value=0 guard (§2.5.2):");
  const drops = planFunnel([S("a", 100), S("b", 40), S("c", 10)], "funnel", undefined, "cyan", "auto");
  check(drops.drops.length === 2, "drops length = N−1", `got ${drops.drops.length}`);
  check(approx(drops.drops[0].pct, (40 - 100) / 100), "drop[0].pct = (v1−v0)/v0 from TRUE values", `got ${drops.drops[0].pct}`);
  check(drops.drops[0].text === formatDropPct(-0.6), `drop[0].text = "${formatDropPct(-0.6)}"`, `got "${drops.drops[0].text}"`);
  // C6 case: the +15% drop still shows even when the band is width-clamped.
  check(approx(nonMono.drops[1].pct, (5750 - 5000) / 5000), "non-monotonic drop computed from TRUE values (+15%)", `got ${nonMono.drops[1].pct}`);
  check(nonMono.drops[1].pct > 0, "a genuine rise yields a POSITIVE drop pct (surfaces 'not really a funnel')");
  // value[i]===0 → empty drop text (no −100% / divide artifact).
  const zeroDrop = planFunnel([S("a", 100), S("b", 0), S("c", 0)], "funnel", undefined, "cyan", "auto");
  check(zeroDrop.drops[1].text === "", "value[i]===0 → empty drop text (divide guard, no artifact)", `got "${zeroDrop.drops[1].text}"`);
  check(zeroDrop.drops[1].show === false, "an empty-text drop is hidden");

  console.log("Label show/hide (C3/C4/C4b):");
  const longLbl = planFunnel([S("x".repeat(30), 100), S("ok", 40)], "funnel", undefined, "cyan", "auto");
  check(longLbl.bands[0].showLabel === false && longLbl.bands[0].labelHideReason === "tooLong", "stage label > 22cp → hidden (hide-not-shrink, C3)");
  check(longLbl.bands[1].showLabel === true, "short stage label shows");
  const longVal = planFunnel([S("a", 100, { valueText: "1234567890123" }), S("b", 40)], "funnel", undefined, "cyan", "auto");
  check(longVal.bands[0].showValue === false && longVal.bands[0].valueHideReason === "tooLong", "value string > 10cp → value label hidden (C4)");
  const dropsOff = planFunnel([S("a", 100), S("b", 40)], "funnel", undefined, "cyan", "off");
  check(dropsOff.drops[0].show === false && dropsOff.drops[0].hideReason === "off", "dropLabels='off' → drop labels suppressed (C4b)");

  console.log("Knob coercion (§2.6.6):");
  check(planFunnel([S("a", 1), S("b", 1)], "wibble", undefined, "frobnicate", "maybe").mode === "funnel", "unknown mode → 'funnel'");
  check(planFunnel([S("a", 1), S("b", 1)], "bars", undefined, undefined, undefined).mode === "bars", "mode='bars' honored");
  check(planFunnel([S("a", 1), S("b", 1)], undefined, undefined, "frobnicate", undefined).accentKey === "cyan", "unknown accent → 'cyan'");
  check(planFunnel([S("a", 1), S("b", 1)], undefined, undefined, undefined, "maybe").dropLabels === "auto", "unknown dropLabels → 'auto'");

  console.log("< 2-stage fallback (C2):");
  const solo = planFunnel([S("solo", 100)], "funnel", undefined, "cyan", "auto");
  check(solo.fallback === true, "1 stage → fallback flag set (caption-only Panel, C2)");
  const none = planFunnel([], "funnel", undefined, "cyan", "auto");
  check(none.fallback === true, "0 stages → fallback flag set");
  const two = planFunnel([S("a", 100), S("b", 40)], "funnel", undefined, "cyan", "auto");
  check(two.fallback === false, "2 stages → not fallback (renders)");

  console.log("Continuous-edge settle invariant for N ∈ [2,5] (§2.5.3):");
  for (let n = 2; n <= 5; n++) {
    const p = planFunnel(
      Array.from({ length: n }, (_, i) => S(`s${i}`, 100 - i * 10)),
      "funnel",
      undefined,
      "cyan",
      "auto",
    );
    const lastSettle = p.bands[p.bands.length - 1].bandSettle;
    check(lastSettle <= EDGE_END + 1e-6, `N=${n}: last band settles by EDGE_END ${EDGE_END} (≤0.78)`, `got ${lastSettle.toFixed(4)}`);
    const maxReveal = Math.max(...p.drops.map((d) => d.revealT), 0);
    check(maxReveal + DROP_FADE_DUR <= SETTLE_DEADLINE + 1e-6, `N=${n}: max drop.revealT + ${DROP_FADE_DUR} ≤ ${SETTLE_DEADLINE} settle deadline`, `got ${(maxReveal + DROP_FADE_DUR).toFixed(4)}`);
  }

  await labelBoxOverlapSuite();
}

// ── Unit-level label-box overlap (§2.7 NEW; catches the Fix-1 funnel-mode regression w/o a browser) ──
// The label boxes are PURE DATA: planFunnel gives each band's cx + the drop's cx/anchor/cy; estW
// (scaled to each label's font px) gives its advance width; the renderer's exact placement (Funnel.tsx)
// gives the anchor + baseline y. We reconstruct every VISIBLE stage/value/drop label's viewBox bounding
// box and assert no two overlap > 4px — exactly the C11 invariant the Chromium no-funnel-label-overlap
// check measures, but at the unit level (no DOM). This is the regression net for the §2.5.1 collision
// proof's point-5 hole (stage label of band i+1 stacking on drop-off(i→i+1) at CX in funnel mode).
const EST_SCALE_AT_26 = 26; // estW() is calibrated at 26px (stack.ts) → scale to a label's font px.
// A text box from an anchor x, baseline y, advance width w, and font size: ascent ≈ 0.8·fs above the
// baseline, descent ≈ 0.2·fs below (the house em-box approximation used for SVG <text> leaves).
function textBox(x, y, w, fs, anchor) {
  const left = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  return { x: left, y: y - fs * 0.8, w, h: fs };
}
function planLabelBoxes(plan) {
  const boxes = [];
  for (const b of plan.bands) {
    if (b.showLabel) {
      const w = estW(b.label) * (STAGE_LABEL_PX / EST_SCALE_AT_26);
      // Funnel: centered above the band at cx (y = yTop − 8). Bars: right-anchored in the left column.
      const box =
        plan.mode === "bars"
          ? textBox(BARS_LABEL_ANCHOR_X, b.yTop + b.bandH / 2 + 8, w, STAGE_LABEL_PX, "end")
          : textBox(b.cx, b.yTop - 8, w, STAGE_LABEL_PX, "middle");
      boxes.push({ kind: `stage[${b.index}]`, ...box });
    }
    if (b.showValue) {
      const w = estW(b.valueText) * (VALUE_LABEL_PX / EST_SCALE_AT_26);
      const y = b.yTop + b.bandH / 2 + VALUE_LABEL_PX / 3;
      const box =
        plan.mode === "bars"
          ? textBox(b.xLeft + 16, y, w, VALUE_LABEL_PX, "start")
          : textBox(b.cx, y, w, VALUE_LABEL_PX, "middle");
      boxes.push({ kind: `value[${b.index}]`, ...box });
    }
  }
  for (const d of plan.drops) {
    if (!d.show) continue;
    const w = estW(d.text) * (DROP_LABEL_PX / EST_SCALE_AT_26);
    boxes.push({ kind: `drop[${d.fromIndex}→${d.toIndex}]`, ...textBox(d.cx, d.cy + DROP_LABEL_PX / 3, w, DROP_LABEL_PX, d.anchor) });
  }
  return boxes;
}
async function labelBoxOverlapSuite() {
  console.log("Label-box overlap from plan geometry (C11 unit, NEW — catches Fix-1 funnel regression):");
  for (const id of ANIM_FIXTURES) {
    const spec = JSON.parse(await readFile(fixturePath(id), "utf8"));
    const v = spec.visualization;
    const plan = planFunnel(v.stages, v.mode, v.unit, v.accent, v.dropLabels);
    const boxes = planLabelBoxes(plan);
    let worst = 0;
    let detail = "";
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const ov = overlap(boxes[i], boxes[j]);
        if (ov > worst) {
          worst = ov;
          detail = `${boxes[i].kind} ∩ ${boxes[j].kind} = ${ov.toFixed(1)}px`;
        }
      }
    }
    check(worst <= 4, `${id} (${plan.mode}): no two label boxes overlap > 4px (${boxes.length} visible labels)`, detail);
  }
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
const rectEq = (a, b, tol = 0.5) => a && b && ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) <= tol);
const layoutEq = (a, b, tol = 0.5) => a && b && ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) <= tol);
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
    const plan = planFunnel(v.stages, v.mode, v.unit, v.accent, v.dropLabels);
    console.log(`\nSampled-t DOM pass — ${id} (${plan.mode}, t ∈ {${T_SAMPLES.join(", ")}}):`);

    const reports = await sampleFixture(page, id, T_SAMPLES);
    const base = reports[1];
    const F = base.funnel;
    if (!check(!!F, "funnel section present at t=1")) continue;

    // C1 band count + C9 node-count constancy.
    check(
      T_SAMPLES.every((t) => reports[t].funnel?.bands.length === plan.bands.length),
      `band count === ${plan.bands.length} (planFunnel) at every sample (C1)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].funnel?.bands.length).join(",")}`,
    );
    check(
      T_SAMPLES.every((t) => reports[t].funnel?.nodeCount === F.nodeCount),
      `svg DOM node count constant (${F.nodeCount}) — nothing mounts/unmounts across t (C9)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].funnel?.nodeCount).join(",")}`,
    );

    // C9 geometry static: svg rect + every band's transform-blind LAYOUT box + wall vertices +
    // label boxes identical across all 10 samples (≤0.5px). The reveal is a clip whose height
    // grows, so the rect ATTRS (layout box) are the stable geometry to compare (NOT the painted box).
    let geomOk = true, geomDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].funnel;
      if (!rectEq(d.rect, F.rect)) { geomOk = false; geomDetail = `svg rect drifts at t=${t}`; }
      for (let b = 0; b < F.bands.length; b++) {
        if (!layoutEq(d.bands[b].layout, F.bands[b].layout)) {
          geomOk = false; geomDetail = `band ${b} LAYOUT box drifts at t=${t} (${JSON.stringify(d.bands[b].layout)} vs ${JSON.stringify(F.bands[b].layout)})`;
        }
      }
      for (let w = 0; w < F.walls.length; w++) {
        const pa = d.walls[w]?.points ?? [], pb = F.walls[w]?.points ?? [];
        if (pa.length !== pb.length || pa.some((p, k) => Math.abs(p[0] - pb[k][0]) > 0.5 || Math.abs(p[1] - pb[k][1]) > 0.5)) {
          geomOk = false; geomDetail = `wall ${w} vertices drift at t=${t}`;
        }
      }
    }
    check(geomOk, "svg + every band LAYOUT box + taper-wall vertices identical across all 10 samples (≤0.5px) (C9)", geomDetail);

    // NEW — funnel-band-within-frame (C10): every band's layout box ⊆ the plot region; every wall
    // polygon ⊆ the plot region; all measured in viewBox units (the rect/polygon attrs).
    let frameOk = true, frameDetail = "";
    const xLo = plan.mode === "bars" ? LABEL_COL - 0.5 : PLOT_X0 - 0.5;
    const xHi = PLOT_X1 + 0.5;
    for (const t of T_SAMPLES) {
      const d = reports[t].funnel;
      for (let b = 0; b < d.bands.length; b++) {
        const L = d.bands[b].layout;
        if (!L) continue;
        if (L.x < xLo || L.x + L.w > xHi) { frameOk = false; frameDetail = `band ${b} [${L.x}, ${(L.x + L.w).toFixed(1)}] outside plot [${xLo}, ${xHi}] at t=${t}`; }
      }
      for (let w = 0; w < d.walls.length; w++) {
        for (const [px] of d.walls[w].points) if (px < xLo || px > xHi) { frameOk = false; frameDetail = `wall ${w} vertex x ${px} outside plot at t=${t}`; }
      }
    }
    check(frameOk, "funnel-band-within-frame: every band + taper wall ⊆ the plot region at every sample (C10, NEW)", frameDetail);

    // NEW — monotonic-painted-width (C6 DOM): measured band layout widths non-increasing top→down at
    // every sample; and each equals the planned painted width.
    let monoOk = true, monoDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].funnel;
      for (let b = 1; b < d.bands.length; b++) {
        if ((d.bands[b].layout?.w ?? 0) > (d.bands[b - 1].layout?.w ?? 0) + 0.5) {
          monoOk = false; monoDetail = `band ${b} width ${d.bands[b].layout?.w} > band ${b - 1} width ${d.bands[b - 1].layout?.w} at t=${t}`;
        }
      }
    }
    for (let b = 0; b < plan.bands.length; b++) {
      if (Math.abs((F.bands[b].layout?.w ?? 0) - plan.bands[b].paintedW) > 0.5) {
        monoOk = false; monoDetail = `band ${b} DOM width ${F.bands[b].layout?.w} ≠ plan paintedW ${plan.bands[b].paintedW.toFixed(1)}`;
      }
    }
    check(monoOk, "monotonic-painted-width: measured widths non-increasing top→down + match plan paintedW (C6, NEW)", monoDetail);
    // Surface the monotonic-clamp flag fidelity (the gallery 'not really a funnel' signal).
    let clampOk = true;
    for (let b = 0; b < plan.bands.length; b++) if (F.bands[b].monotonicClamp !== plan.bands[b].monotonicClampApplied) clampOk = false;
    check(clampOk, "monotonicClampApplied flag matches plan per band (C6 surfaced)");

    // NEW — dropoff-pct-vs-ratios: each rendered drop text === plan text (from TRUE value ratios)
    // byte-for-byte at t=1; visible drop set matches the plan's show flags.
    const visibleDrops = F.drops.filter((d) => d.opacity > 0.5).map((d) => d.text);
    const planDropTexts = plan.drops.filter((d) => d.show).map((d) => d.text);
    check(
      JSON.stringify(visibleDrops) === JSON.stringify(planDropTexts),
      "dropoff-pct-vs-ratios: rendered drop texts === plan (from TRUE values) at t=1 (NEW)",
      `dom [${visibleDrops.join(",")}] vs plan [${planDropTexts.join(",")}]`,
    );

    // NEW — no-funnel-label-overlap (C11): no two VISIBLE text leaves (stage + value + drop labels)
    // overlap > 4px at any sample.
    let overlapOk = true, overlapDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].funnel;
      const leaves = [];
      for (const b of d.bands) {
        if (b.label && b.label.opacity > 0.05) leaves.push(b.label.rect);
        if (b.value && b.value.opacity > 0.05) leaves.push(b.value.rect);
      }
      for (const dr of d.drops) if (dr.opacity > 0.05) leaves.push(dr.rect);
      for (let i = 0; i < leaves.length; i++)
        for (let j = i + 1; j < leaves.length; j++)
          if (overlap(leaves[i], leaves[j]) > 4) { overlapOk = false; overlapDetail = `two labels overlap ${overlap(leaves[i], leaves[j]).toFixed(1)}px at t=${t}`; }
    }
    check(overlapOk, "no-funnel-label-overlap: no two visible text leaves overlap > 4px at any sample (C11, NEW)", overlapDetail);

    // Visible label set at t=1 matches the plan show flags.
    let showOk = true, showDetail = "";
    for (let b = 0; b < plan.bands.length; b++) {
      const pl = plan.bands[b], dm = F.bands[b];
      if (!!(dm.label && dm.label.opacity > 0.5) !== pl.showLabel) { showOk = false; showDetail = `band ${b}: label vis ${!!(dm.label && dm.label.opacity > 0.5)} vs plan ${pl.showLabel}`; }
      if (!!(dm.value && dm.value.opacity > 0.5) !== pl.showValue) { showOk = false; showDetail = `band ${b}: value vis ${!!(dm.value && dm.value.opacity > 0.5)} vs plan ${pl.showValue}`; }
    }
    check(showOk, "stage + value label visibility at t=1 matches planFunnel show flags (C3/C4)", showDetail);

    // C12 settle: clip OMITTED ("none") at t ≥ 0.84; all label opacities 1 at t=1.
    let settleOk = true, settleDetail = "";
    for (const t of [0.84, 1]) {
      for (const b of reports[t].funnel.bands) {
        if (b.clip && b.clip !== "none") { settleOk = false; settleDetail = `band ${b.index} clipPath "${b.clip}" at t=${t} — must be OMITTED once settled (C12)`; }
      }
    }
    for (const b of reports[1].funnel.bands) {
      if (b.label && b.label.opacity !== 1) { settleOk = false; settleDetail = `band ${b.index} label opacity ${b.label.opacity} at t=1`; }
      if (b.value && b.value.opacity !== 1) { settleOk = false; settleDetail = `band ${b.index} value opacity ${b.value.opacity} at t=1`; }
    }
    for (const dr of reports[1].funnel.drops) if (dr.opacity !== 1) { settleOk = false; settleDetail = `drop "${dr.text}" opacity ${dr.opacity} at t=1`; }
    check(settleOk, "t ≥ 0.84: clip OMITTED (none); t=1: all label opacities exactly 1 (C12)", settleDetail);

    // Bars mode omits taper walls; funnel mode draws N−1 of them.
    if (plan.mode === "bars") check(F.walls.length === 0, "bars mode: no taper walls");
    else check(F.walls.length === plan.bands.length - 1, `funnel mode: ${plan.bands.length - 1} taper walls`, `got ${F.walls.length}`);

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
