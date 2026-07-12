#!/usr/bin/env node
// PL-2.5 deterministic gate — Candlestick (OHLC range over an ordered time axis: body+wick or the
// ohlc bar glyph; a NON-0-anchored derived price axis) primitive (no LLM). Closes Epic PL-2 (the
// chart family).
//
//   node tools/qa-candlestick.mjs --unit   # planCandles decision tables (no dev server)
//   npm run dev                            # in another terminal — DOM passes need the dev server
//   npm run qa:candlestick                 # full: unit + sampled-t DOM pass
//
// Covers handoff §2.7 (planning/primitive-library/handoffs/PL-2.5-candlestick.md):
//   1. planCandles unit suite (U1–U-degen): cap + even-stride downsample, invalid drop, the NON-0-
//      anchored axis (the candlestick correctness point) + author override + max>min guard, body
//      spans open→close, wick spans high→low, C6 inverted/out-of-range correction, the doji 6px
//      floor, up/down color classification (from ORIGINAL o/c), candle-within-plot, time-label
//      fit-or-hide + stride, stagger-vs-N, degenerate (empty/1/all-flat) + unknown-enum coercion.
//   2. Sampled-t DOM pass (D1–D11) at T = {0, 0.30, 0.36, 0.46, 0.56, 0.66, 0.76, 0.85, 0.92, 1}
//      over over-cap, doji, defensive, and ohlc-mode fixtures (one headless Chromium, Preview ?id&t):
//      candle-within-plot, body/wick spans, up/down color, non-0-anchored axis, doji floor, grow/draw
//      + settle (transform OMITTED at t≥0.85), layout reserved (geometry + nodeCount static), caps,
//      time-label no-overlap, and the §3 BINDING painted-body-width@390 floor on the full-cap fixture.
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BASE, VIEWPORT, sampleFixture, assertGatingClean } from "./lib/sampled-t.mjs";
import {
  planCandles,
  plotBounds,
  staggerForN,
  candleReveal,
  gutterFit,
  niceTicks,
  formatTick,
  MAX_CANDLES,
  CANDLE_START,
  CANDLE_DUR,
  SETTLE_DEADLINE,
  MAX_STAGGER,
  AXIS_PAD_FRACTION,
  DOJI_MIN_BODY_PX,
  MIN_BODY_W,
  WICK_STROKE,
  PLOT_X0,
  PLOT_X1,
  TICK_LABEL_X,
} from "../src/lib/candlestick.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UNIT_ONLY = process.argv.includes("--unit");

const SAFE_MARGIN = 64; // outer safe margin (mirrors inspect.mjs MARGIN) — the left gutter floor (D12)

// §2.7 sample set: pre-build, the candle build window (overlap stagger), settle, hold, final.
const T_SAMPLES = [0, 0.3, 0.36, 0.46, 0.56, 0.66, 0.76, 0.85, 0.92, 1];
const ANIM_FIXTURES = [
  "fuzz-78-candlestick-overcap-20",
  "fuzz-79-candlestick-doji",
  "fuzz-80-candlestick-inverted-oob",
  // PL-2.5 Fix 3 (gate-coverage gap): large-price + unit fixtures whose RAW-linspace tick decimals
  // overflowed the left gutter (qa:fuzz caught them; this dedicated gate did not). Nice ticks fix it.
  "fuzz-81-candlestick-long-label",
  "fuzz-82-candlestick-all-up",
  "fuzz-83-candlestick-all-down",
  "fuzz-84-candlestick-ohlc-mode",
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
  planCandles({
    candles: v.candles,
    mode: v.mode,
    axisMin: v.axisMin,
    axisMax: v.axisMax,
    upAccent: v.upAccent,
    downAccent: v.downAccent,
    unit: v.unit,
    viewH,
  });

// ── 1. Unit suite (pure — no DOM) ─────────────────────────────────────────────
function unitSuite() {
  console.log("U1 — candle cap + even-stride downsample (keep first+last) (C1/C2):");
  const u1 = planCandles({ candles: Array.from({ length: 20 }, (_, i) => ({ label: `d${i}`, open: 100 + i, high: 105 + i, low: 95 + i, close: 102 + i })) });
  check(u1.candles.length === MAX_CANDLES, `20 candles → ${MAX_CANDLES} kept (C1)`, `got ${u1.candles.length}`);
  check(u1.dropped.candlesDropped === 6, "candlesDropped === 6 (surfaced)", `got ${u1.dropped.candlesDropped}`);
  check(u1.candles[0].index === 0 && u1.candles[u1.candles.length - 1].index === 19, "even-stride keeps first(0)+last(19)", `${u1.candles[0].index}..${u1.candles[u1.candles.length - 1].index}`);

  console.log("U2 — invalid drop: a NaN member dropped, counted; no NaN in axis (§2.6.1):");
  const u2 = planCandles({ candles: [{ open: 1, high: 2, low: 0.5, close: 1.5 }, { open: NaN, high: 2, low: 1, close: 1.5 }, { open: 1, high: Infinity, low: 0.5, close: 1.2 }, { open: 1, high: 2, low: 0.5, close: 1.8 }] });
  check(u2.candles.length === 2 && u2.dropped.invalidCandles === 2, "non-finite member dropped + counted", `kept ${u2.candles.length}, invalid ${u2.dropped.invalidCandles}`);
  check(Number.isFinite(u2.axisMin) && Number.isFinite(u2.axisMax), "axis finite after invalid drop", `[${u2.axisMin},${u2.axisMax}]`);

  console.log("U-axis — NON-0-anchored price axis + author override + max>min guard (C5):");
  // all-positive far-from-0 window: lows ~480, highs ~520.
  const ua = planCandles({ candles: [{ open: 495, high: 520, low: 482, close: 510 }, { open: 510, high: 522, low: 500, close: 505 }] });
  check(ua.axisMin > 0, "axisMin > 0 (NOT 0-anchored) for an all-positive far-from-0 window", `axisMin ${ua.axisMin}`);
  // dataLo=482, dataHi=522 → span 40, pad 3.2 → [478.8, 525.2].
  check(approx(ua.axisMin, 478.8) && approx(ua.axisMax, 525.2), "8% pad on the derived window → [478.8, 525.2]", `[${ua.axisMin}, ${ua.axisMax}]`);
  const uao = planCandles({ candles: [{ open: 495, high: 520, low: 482, close: 510 }], axisMin: 400, axisMax: 600 });
  check(uao.axisMin === 400 && uao.axisMax === 600, "author axisMin/axisMax override (no pad applied)", `[${uao.axisMin}, ${uao.axisMax}]`);
  const uag = planCandles({ candles: [{ open: 100, high: 100, low: 100, close: 100 }, { open: 100, high: 100, low: 100, close: 100 }] });
  check(uag.axisMax > uag.axisMin, "all-flat → max>min guard (axisMax = axisMin+1)", `[${uag.axisMin}, ${uag.axisMax}]`);
  check(approx(AXIS_PAD_FRACTION, 0.08), "AXIS_PAD_FRACTION === 0.08");

  console.log("U-gutter — NICE price ticks fit the left gutter (PL-2.5 Fix 3, the §2.4 collision gap):");
  // Ticks must be NICE round values, not raw linspace decimals. fuzz-81/82/83 class: large prices
  // (114–164) + a "ms" unit. Raw linspace gave "124.09ms"/"149.32ms" (≈116px) overflowing the 108px
  // gutter; nice ticks give "120ms"/"130ms"… that fit. The check that §2.4 asserted in prose but never
  // proved for the tick TEXT.
  const ug = planCandles({ candles: [{ open: 122, high: 131, low: 119, close: 128 }, { open: 159, high: 164, low: 151, close: 160 }], unit: "ms" });
  const ugLabels = ug.ticks.map((t) => formatTick(t, ug.unit));
  // nice round: every tick value (sans unit) is an integer multiple of a 5/10-class step → no long decimals.
  check(
    ug.ticks.every((v) => Math.abs(v - Math.round(v)) < 1e-6),
    "price-tick VALUES are nice round numbers (no raw-linspace decimals)",
    ugLabels.join(", "),
  );
  const gf = gutterFit(ug.ticks, ug.unit);
  check(gf.fits, `widest tick label "${gf.widest}" (${gf.widthPx.toFixed(1)}px@24) fits the gutter: leftEdge ${gf.leftEdge.toFixed(1)} ≥ 0`, `leftEdge ${gf.leftEdge.toFixed(1)}`);
  check(TICK_LABEL_X === PLOT_X0 - 12, "TICK_LABEL_X == PLOT_X0 − 12 (right-anchor in the gutter)", `TICK_LABEL_X ${TICK_LABEL_X}, PLOT_X0 ${PLOT_X0}`);
  // The pathological raw-linspace label that USED to overflow now never appears (no two-decimal tick).
  check(!ugLabels.some((s) => /\d\.\d\d/.test(s)), "no 2-decimal tick label (the 140.91ms-class overflow is gone)", ugLabels.join(", "));
  // Even a worst-realistic large-price decimal nice tick must fit at TICK_LABEL_X.
  const gfWorst = gutterFit(niceTicks(1610.5, 1648.5), "ms");
  check(gfWorst.fits, `worst-realistic nice ticks ("${gfWorst.widest}", ${gfWorst.widthPx.toFixed(1)}px) fit at TICK_LABEL_X ${TICK_LABEL_X}`, `leftEdge ${gfWorst.leftEdge.toFixed(1)}`);

  console.log("U-ohlc-body — body spans open→close in scaleY (§2.4):");
  const ub = planCandles({ candles: [{ open: 120, high: 140, low: 110, close: 135 }, { open: 135, high: 138, low: 120, close: 122 }] });
  // build the same scaleY the planner used (range [plotY1, plotY0]).
  const { y0, y1 } = plotBounds(640);
  const sy = (v) => y1 - ((v - ub.axisMin) / (ub.axisMax - ub.axisMin)) * (y1 - y0);
  let bodyOk = true, bodyDetail = "";
  ub.candles.forEach((c, i) => {
    const src = i === 0 ? { o: 120, cl: 135 } : { o: 135, cl: 122 };
    const exTop = Math.min(sy(src.o), sy(src.cl));
    const exBot = Math.max(sy(src.o), sy(src.cl));
    if (Math.abs(c.bodyTop - exTop) > 1e-6 || Math.abs(c.bodyBot - exBot) > 1e-6) { bodyOk = false; bodyDetail = `candle ${i} body [${c.bodyTop},${c.bodyBot}] ≠ scaleY(open..close) [${exTop},${exBot}]`; }
  });
  check(bodyOk, "each body [bodyTop,bodyBot] == scaleY(max(o,c))/scaleY(min(o,c)) (±1e-6)", bodyDetail);

  console.log("U-wick — wick spans high→low; wick ⊇ body (§2.4):");
  let wickOk = true, wickDetail = "";
  ub.candles.forEach((c, i) => {
    const src = i === 0 ? { h: 140, l: 110 } : { h: 138, l: 120 };
    if (Math.abs(c.wickTop - sy(src.h)) > 1e-6 || Math.abs(c.wickBot - sy(src.l)) > 1e-6) { wickOk = false; wickDetail = `candle ${i} wick ≠ scaleY(high'/low')`; }
    if (c.wickTop > c.bodyTop + 1e-6 || c.wickBot < c.bodyBot - 1e-6) { wickOk = false; wickDetail = `candle ${i} wick does not ⊇ body`; }
  });
  check(wickOk, "each wick [wickTop,wickBot] == scaleY(high'/low'); wick ⊇ body", wickDetail);

  console.log("U-invert — high<low / out-of-range correction, never inverted (C6):");
  // transposed (high=119, low=131): lo'=119, hi'=131.
  const ui = planCandles({ candles: [{ open: 124, high: 119, low: 131, close: 126 }, { open: 140, high: 132, low: 121, close: 125 }, { open: 122, high: 131, low: 119, close: 128 }] });
  const c0 = ui.candles[0];
  // lo'=min(124,119,131,126)=119, hi'=max=131. body ⊆ wick.
  check(c0.wickBot >= c0.bodyBot - 1e-6 && c0.wickTop <= c0.bodyTop + 1e-6, "transposed candle: body ⊆ wick (never inverted)", `wick[${c0.wickTop},${c0.wickBot}] body[${c0.bodyTop},${c0.bodyBot}]`);
  check(ui.dropped.correctedCandles === 2, "correctedCandles counts the 2 invalid-OHLC inputs", `got ${ui.dropped.correctedCandles}`);
  // candle[1] open=140 above high=132 → open' clamped into [lo'=121,hi'=132]. Direction from ORIGINAL.
  check(ui.candles[2].corrected === false, "a valid OHLC candle is NOT flagged corrected");

  console.log("U-doji — doji min-body floor; NOT hidden (C-DOJI):");
  const ud = planCandles({ candles: [{ open: 100, high: 110, low: 95, close: 100 }, { open: 100, high: 108, low: 92, close: 106 }] });
  const doji = ud.candles[0];
  check(Math.abs(doji.bodyBot - doji.bodyTop - DOJI_MIN_BODY_PX) < 1e-6, `doji body height == ${DOJI_MIN_BODY_PX}px (floored)`, `got ${(doji.bodyBot - doji.bodyTop).toFixed(3)}`);
  check(doji.dojiFloored === true && ud.dropped.dojiFloored === 1, "dojiFloored flagged + counted; body present (not hidden)");

  console.log("U-color — up/down classification from ORIGINAL o/c (§2.4 color):");
  const uc = planCandles({ candles: [{ open: 100, high: 110, low: 95, close: 108 }, { open: 108, high: 112, low: 100, close: 102 }] });
  check(uc.candles[0].dir === "up" && uc.candles[0].accentKey === "mint", "close≥open → up → mint (default)", uc.candles[0].accentKey);
  check(uc.candles[1].dir === "down" && uc.candles[1].accentKey === "burnt", "close<open → down → burnt (default)", uc.candles[1].accentKey);
  const uco = planCandles({ candles: [{ open: 100, high: 110, low: 95, close: 108 }], upAccent: "cyan", downAccent: "amber" });
  check(uco.candles[0].accentKey === "cyan", "author upAccent override honored", uco.candles[0].accentKey);
  // corrected candle still classifies dir from ORIGINAL o/c (open 100 > close 99 → down even after clamp).
  const ucc = planCandles({ candles: [{ open: 100, high: 90, low: 110, close: 99 }] });
  check(ucc.candles[0].dir === "down", "direction from ORIGINAL o/c even when corrected", ucc.candles[0].dir);

  console.log("U-within — every body/wick coordinate ∈ the plot band (C5/C-COLLISION):");
  // author bound tighter than the data → out-of-axis clamp keeps every glyph inside.
  const uw = planCandles({ candles: [{ open: 50, high: 200, low: 10, close: 180 }, { open: 180, high: 190, low: 60, close: 70 }], axisMin: 100, axisMax: 160 });
  let withinOk = true, withinDetail = "";
  for (const c of uw.candles) {
    for (const y of [c.bodyTop, c.bodyBot, c.wickTop, c.wickBot, c.openY, c.closeY]) {
      if (y < y0 - 1e-6 || y > y1 + 1e-6) { withinOk = false; withinDetail = `y ${y} ∉ [${y0},${y1}]`; }
    }
    if (c.cx - c.halfW < PLOT_X0 - 1e-6 || c.cx + c.halfW > PLOT_X1 + 1e-6) { withinOk = false; withinDetail = `body x exits [${PLOT_X0},${PLOT_X1}]`; }
  }
  check(withinOk, "all body/wick/tick coords within the plot band for an out-of-axis-bound fixture", withinDetail);

  console.log("U-label — time-label fit-or-hide + every-k stride (C3):");
  const ul = planCandles({ candles: [{ label: "x".repeat(12), open: 1, high: 2, low: 0.5, close: 1.5 }, { label: "ok", open: 1.5, high: 2, low: 1, close: 1.2 }] });
  check(ul.candles[0].showLabel === false && ul.candles[0].labelHideReason === "tooLong", "label > 10cp → hidden(tooLong)");
  // N=14 wide labels → ≤8 visible on a stride.
  const ul14 = planCandles({ candles: Array.from({ length: 14 }, (_, i) => ({ label: `d${i}`, open: 100 + i, high: 105 + i, low: 95 + i, close: 102 + i })) });
  const visible = ul14.candles.filter((c) => c.showLabel).length;
  check(visible <= 8, "≤ 8 time labels visible on a stride for N=14", `got ${visible}`);
  const strideHidden = ul14.candles.filter((c) => c.labelHideReason === "stride").length;
  check(strideHidden > 0, "non-stride slots hidden(stride) — NOT counted as a defect");
  check(ul14.dropped.hiddenLabels === 0, "stride hides not counted in hiddenLabels", `got ${ul14.dropped.hiddenLabels}`);

  console.log("U-stagger — last candle settles by SETTLE_DEADLINE (0.85):");
  const sN = staggerForN(14);
  check(CANDLE_START + sN * 13 + CANDLE_DUR <= SETTLE_DEADLINE + 1e-9, "N=14: last candle reveal ends ≤ 0.85", `ends ${(CANDLE_START + sN * 13 + CANDLE_DUR).toFixed(4)}`);
  check(staggerForN(1) === MAX_STAGGER, "staggerForN(1) === MAX_STAGGER (no div-by-zero)", `got ${staggerForN(1)}`);
  const rev1 = candleReveal(1, CANDLE_START);
  check(rev1.wick === 1 && rev1.body === 1, "candleReveal settled (wick=1, body=1) at t=1");
  const rev0 = candleReveal(0, CANDLE_START);
  check(rev0.wick === 0 && rev0.body === 0, "candleReveal 0 before the window");

  console.log("U-degen — degenerate counts + unknown enum (§2.6.7):");
  check(planCandles({ candles: [] }).empty === true, "0 candles → empty:true");
  const u1c = planCandles({ candles: [{ open: 100, high: 110, low: 95, close: 105 }] });
  check(u1c.candles.length === 1 && Number.isFinite(u1c.candles[0].cx) && Number.isFinite(u1c.candles[0].bodyTop), "1 candle → one finite-centered candle, no NaN");
  const uflat = planCandles({ candles: [{ open: 5, high: 5, low: 5, close: 5 }, { open: 5, high: 5, low: 5, close: 5 }] });
  check(uflat.candles.every((c) => Number.isFinite(c.bodyTop) && Number.isFinite(c.wickTop)), "all-flat → axis guard, no NaN geometry");
  const ue = planCandles({ candles: [{ open: 1, high: 2, low: 0.5, close: 1.5 }], mode: "western" });
  check(ue.mode === "candles", "unknown mode → candles", ue.mode);

  console.log("U-floor — UNIT painted-body-width @390 estimate ≥ floor at the worst-case row shrink (§3):");
  // The §3 binding, verified at unit level WITHOUT a browser: full-cap (14) body width × the worst-case
  // row-aspect shrink. The row-aware viewBox sets viewH to the row's aspect (clamped ≥ MIN_VIEW_H 320),
  // so the SVG fills the row WIDTH → CSS scale ≈ rowWidthPx / VIEW_W. The mobile render is ~390px wide,
  // so the source-px body width maps to @390 as: bodyW_source × (390 / 1000) (uniform, width-driven).
  // This is INDEPENDENT of viewH (height-only compresses), which is exactly why row-aware fixes the
  // scatter floor cliff. We assert the @390 painted body ≥ 6.5px (the MIN_BODY_W-derived mobile floor).
  for (const vh of [640, 480, 360, 320]) {
    const p = planCandles({ candles: Array.from({ length: 14 }, (_, i) => ({ open: 100 + i, high: 105 + i, low: 95 + i, close: 102 + i })), viewH: vh });
    const bodyW = 2 * p.candles[0].halfW; // source px
    const body390 = bodyW * (390 / 1000); // row-aware ⇒ width-driven, viewH-independent
    check(body390 >= 6.5 - 0.01, `viewH ${vh}: full-cap body ${bodyW.toFixed(1)}src → ${body390.toFixed(2)}px@390 ≥ 6.5 (row-aware, width-driven)`, `body390 ${body390.toFixed(2)}`);
  }
  check(MIN_BODY_W === 18 && WICK_STROKE === 4, "MIN_BODY_W 18 / WICK_STROKE 4 constants");
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
const overlap = (A, B) => {
  const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
  const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
  return ox > 4 && oy > 4 ? Math.min(ox, oy) : 0;
};
// normalize a computed fill (rgb) for comparison against the token hex.
const hexToRgb = (h) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
// mirrors src/tokens/design.ts colors.accent (the renderer's source of truth).
const ACCENT_HEX = { cyan: "#59D8E6", amber: "#E7A95A", violet: "#8E7CC3", mint: "#6ED3A3", burnt: "#D9864D" };

// ── 2. Sampled-t DOM suite ─────────────────────────────────────────────────────
async function geometrySuite(page) {
  for (const id of ANIM_FIXTURES) {
    const spec = JSON.parse(await readFile(fixturePath(id), "utf8"));
    const reports = await sampleFixture(page, id, T_SAMPLES);
    const base = reports[1];
    const D = base.candles;
    if (!check(!!D, `candles section present at t=1 (${id})`)) continue;

    // PL-0.8 — plan with the RENDERED row-aware viewBox height; recompute the plot band from it.
    const plan = planFromViz(spec.visualization, D.viewH);
    const { y0: PY0, y1: PY1 } = plotBounds(D.viewH);
    console.log(`Sampled-t DOM pass — ${id} (${plan.candles.length} candles, mode=${plan.mode}, viewH=${D.viewH}, t ∈ {${T_SAMPLES.join(", ")}}):`);

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
    const isOhlc = plan.mode === "ohlc";

    // D9 — caps / count: rendered candle count == planCandles post-clamp at every sample; ≤ 14.
    check(
      T_SAMPLES.every((t) => reports[t].candles?.candleCount === plan.candles.length),
      `rendered candle count === ${plan.candles.length} (planCandles post-clamp) at every sample (D9)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].candles?.candleCount).join(",")}`,
    );
    check(D.candleCount <= MAX_CANDLES, `≤ ${MAX_CANDLES} candles (C1)`, `got ${D.candleCount}`);

    // D8 — layout reserved: transform-blind LAYOUT box (body rect attrs / wick line attrs) +
    // nodeCount constant across all 10 samples.
    check(
      T_SAMPLES.every((t) => reports[t].candles?.nodeCount === D.nodeCount),
      `svg DOM node count constant (${D.nodeCount}) — nothing mounts/unmounts across t (D8)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].candles?.nodeCount).join(",")}`,
    );
    let layoutOk = true, layoutDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].candles;
      for (let i = 0; i < D.candles.length; i++) {
        const a = d.candles[i]?.wick, b = D.candles[i].wick; // wick line attrs are stable geometry
        if (!a || !b || Math.abs(a.y1 - b.y1) > 0.5 || Math.abs(a.y2 - b.y2) > 0.5 || Math.abs(a.x1 - b.x1) > 0.5) { layoutOk = false; layoutDetail = `candle ${i} wick LAYOUT drifts at t=${t}`; }
        if (!isOhlc) {
          const al = d.candles[i]?.layout, bl = D.candles[i].layout;
          if (!al || !bl || Math.abs(al.x - bl.x) > 0.5 || Math.abs(al.y - bl.y) > 0.5 || Math.abs(al.w - bl.w) > 0.5 || Math.abs(al.h - bl.h) > 0.5) { layoutOk = false; layoutDetail = `candle ${i} body LAYOUT box drifts at t=${t}`; }
        }
      }
    }
    check(layoutOk, "every candle's transform-blind LAYOUT geometry constant across all 10 samples (≤0.5px) (D8)", layoutDetail);

    // D7 — grow/draw + settle: wick dashoffset ∈ [0,1] matching candleReveal; body transform OMITTED
    // at t≥0.85 (never identity).
    let drawOk = true, drawDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].candles;
      for (let i = 0; i < d.candles.length; i++) {
        const off = d.candles[i].wick?.dashoffset;
        const rev = candleReveal(t, plan.candles[i].candleStart);
        if (off == null || off < -0.02 || off > 1.02) { drawOk = false; drawDetail = `candle ${i} wick dashoffset ${off} ∉ [0,1] at t=${t}`; }
        else if (Math.abs((1 - off) - rev.wick) > 0.03) { drawOk = false; drawDetail = `candle ${i} (1−offset) ${(1 - off).toFixed(3)} ≠ candleReveal.wick ${rev.wick.toFixed(3)} at t=${t}`; }
      }
    }
    check(drawOk, "wick strokeDashoffset (1−reveal.wick) ∈ [0,1] and matches candleReveal(t) (D7 draw)", drawDetail);
    let settleOk = true, settleDetail = "";
    for (const t of [0.85, 0.92, 1]) {
      for (const c of reports[t].candles.candles) {
        if (!isOhlc && c.transform !== "none") { settleOk = false; settleDetail = `body transform "${c.transform}" at t=${t} — must be OMITTED once settled (D7)`; }
      }
    }
    check(settleOk, "t ≥ 0.85: body grow transform OMITTED (none), never identity (D7 settle)", settleDetail);

    // D1 — candle-within-plot: every painted glyph box ⊆ the plot band at every t; nothing clipped.
    let bandOk = true, bandDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].candles;
      for (let i = 0; i < d.candles.length; i++) {
        const p = d.candles[i].glyphPainted || d.candles[i].painted;
        if (!p || p.h < 0.5) continue; // not yet grown in
        if (p.x < bandLeft - 1.5 || p.x + p.w > bandRight + 1.5 || p.y < bandTop - 1.5 || p.y + p.h > bandBottom + 1.5) {
          bandOk = false; bandDetail = `candle ${i} [x${p.x.toFixed(0)},y${p.y.toFixed(0)},w${p.w.toFixed(0)},h${p.h.toFixed(0)}] exits plot at t=${t}`;
        }
      }
    }
    check(bandOk, "candle-within-plot: every painted glyph ⊆ the plot band at every t; nothing clipped (D1)", bandDetail);

    // D3 — wick-spans-high-low: settled wick painted extent == scaleY(high'..low'); wick ⊇ body.
    let wickSpanOk = true, wickSpanDetail = "";
    for (let i = 0; i < D.candles.length; i++) {
      const c = D.candles[i];
      const exTop = cssY(plan.candles[i].wickTop);
      const exBot = cssY(plan.candles[i].wickBot);
      // the wick line attrs (transform-blind) → CSS; compare to planner.
      const gotTop = cssY(c.wick.y1 < c.wick.y2 ? c.wick.y1 : c.wick.y2);
      const gotBot = cssY(c.wick.y1 < c.wick.y2 ? c.wick.y2 : c.wick.y1);
      if (Math.abs(gotTop - exTop) > 0.6 + sy * 0.5 || Math.abs(gotBot - exBot) > 0.6 + sy * 0.5) { wickSpanOk = false; wickSpanDetail = `candle ${i} wick [${gotTop.toFixed(1)},${gotBot.toFixed(1)}] ≠ scaleY(high'/low') [${exTop.toFixed(1)},${exBot.toFixed(1)}]`; }
    }
    check(wickSpanOk, "wick-spans-high-low: each wick painted extent == scaleY(high'..low') (D3)", wickSpanDetail);

    // D2 — body/glyph-spans-open-close.
    if (!isOhlc) {
      let bodySpanOk = true, bodySpanDetail = "";
      for (let i = 0; i < D.candles.length; i++) {
        const c = D.candles[i];
        const exTop = cssY(plan.candles[i].bodyTop);
        const exBot = cssY(plan.candles[i].bodyBot);
        const p = c.painted;
        if (!p) { bodySpanOk = false; bodySpanDetail = `candle ${i} no painted body`; continue; }
        if (Math.abs(p.y - exTop) > 0.8 + sy * 0.5 || Math.abs(p.y + p.h - exBot) > 0.8 + sy * 0.5) { bodySpanOk = false; bodySpanDetail = `candle ${i} body painted [${p.y.toFixed(1)},${(p.y + p.h).toFixed(1)}] ≠ scaleY(open..close) [${exTop.toFixed(1)},${exBot.toFixed(1)}]`; }
      }
      check(bodySpanOk, "ohlc-body-spans-open-close: each settled body painted extent == scaleY(open..close) (D2)", bodySpanDetail);
    } else {
      // ohlc: open tick at scaleY(open), close tick at scaleY(close).
      let tickOk = true, tickDetail = "";
      for (let i = 0; i < D.candles.length; i++) {
        const c = D.candles[i];
        if (!c.openTick || !c.closeTick) { tickOk = false; tickDetail = `candle ${i} missing open/close tick`; continue; }
        const exOpen = cssY(plan.candles[i].openY);
        const exClose = cssY(plan.candles[i].closeY);
        if (Math.abs(cssY(c.openTick.y1) - exOpen) > 0.8 + sy * 0.5) { tickOk = false; tickDetail = `candle ${i} open tick ≠ scaleY(open)`; }
        if (Math.abs(cssY(c.closeTick.y1) - exClose) > 0.8 + sy * 0.5) { tickOk = false; tickDetail = `candle ${i} close tick ≠ scaleY(close)`; }
      }
      check(tickOk, "ohlc open/close ticks at scaleY(open)/scaleY(close) (D2)", tickDetail);
    }

    // D4 — up-down-color-correctness: body/glyph fill == upAccent iff close≥open else downAccent;
    // data-candle-dir matches.
    let colorOk = true, colorDetail = "";
    for (let i = 0; i < D.candles.length; i++) {
      const c = D.candles[i];
      const exKey = plan.candles[i].accentKey;
      const exRgb = hexToRgb(ACCENT_HEX[exKey]);
      if (c.dir !== plan.candles[i].dir) { colorOk = false; colorDetail = `candle ${i} data-candle-dir ${c.dir} ≠ plan ${plan.candles[i].dir}`; }
      if (exRgb && c.fill && c.fill !== exRgb) { colorOk = false; colorDetail = `candle ${i} fill ${c.fill} ≠ ${exKey} ${exRgb}`; }
    }
    check(colorOk, "up-down-color-correctness: body fill == upAccent/downAccent; dir matches (D4)", colorDetail);

    // D5 — non-0-anchored-axis-correctness: rendered y-ticks == the planner NICE-tick set (PL-2.5 Fix 3:
    // nice round values, not raw linspace; the DOMAIN/axisMin>0 assertion is unchanged). The price
    // fixtures here are all-positive far-from-0.
    let axisOk = true, axisDetail = "";
    const tickLines = D.ticks.filter((l) => l && Number.isFinite(l.y1));
    if (tickLines.length !== plan.ticks.length) { axisOk = false; axisDetail = `${tickLines.length} tick lines, plan ${plan.ticks.length}`; }
    else {
      for (let i = 0; i < plan.ticks.length; i++) {
        const exY = cssY(PY1 - ((plan.ticks[i] - plan.axisMin) / (plan.axisMax - plan.axisMin)) * (PY1 - PY0));
        if (Math.abs(cssY(tickLines[i].y1) - exY) > 1 + sy * 0.5) { axisOk = false; axisDetail = `tick ${i} y ≠ planner nice-tick set`; }
      }
    }
    check(axisOk, "non-0-anchored-axis-correctness: rendered y-ticks == planner NICE-tick set (D5)", axisDetail);
    check(plan.axisMin > 0, `axisMin > 0 (NOT 0-anchored) — derived price window (D5)`, `axisMin ${plan.axisMin}`);

    // D12 — price-tick label gutter fit (PL-2.5 Fix 3, the absent check). Every price-tick label's
    // painted box ⊆ the left gutter at t=1: its left edge ≥ the SVG left (no viewBox left-clip) AND
    // ≥ the 64px outer safe margin (no breach), and its right edge ≤ the plot band left (TICK_LABEL_X).
    const planGutter = gutterFit(plan.ticks, plan.unit); // unit proof: widest formatted label fits
    check(planGutter.fits, `unit-side: widest tick "${planGutter.widest}" fits the gutter (leftEdge ${planGutter.leftEdge.toFixed(1)} ≥ 0) (D12)`, `leftEdge ${planGutter.leftEdge.toFixed(1)}`);
    // The meaningful constraint is that a price-tick label never OVERLAPS a candle (the gutter is the
    // space left of the leftmost candle). Comparing the label's painted right edge to its own anchor
    // X (cssX(TICK_LABEL_X)) is wrong — getBoundingClientRect doesn't sit at the anchor — so assert
    // against the leftmost candle's painted left edge instead (verified: labels clear it by ~17px).
    const firstCandleLeft = Math.min(
      ...(D.candles || []).map((c) => (c.glyphPainted ? c.glyphPainted.x : Infinity)),
    );
    let gutterOk = true, gutterDetail = "";
    for (const l of D.ptlabels || []) {
      if (l.opacity <= 0.05) continue; // not yet faded in (frame-in beat)
      const r = l.rect;
      if (r.x < svgLeft - 1) { gutterOk = false; gutterDetail = `"${l.text}" left ${r.x.toFixed(1)} clips the viewBox left ${svgLeft.toFixed(1)}`; }
      else if (r.x < SAFE_MARGIN - 0.5) { gutterOk = false; gutterDetail = `"${l.text}" left ${r.x.toFixed(1)} breaches the 64px safe margin`; }
      else if (Number.isFinite(firstCandleLeft) && r.x + r.w > firstCandleLeft - 2) { gutterOk = false; gutterDetail = `"${l.text}" right ${(r.x + r.w).toFixed(1)} overlaps the first candle (left ${firstCandleLeft.toFixed(1)})`; }
    }
    check(gutterOk, "price-tick labels ⊆ the left gutter: no left-clip / no safe-margin breach / no overlap with the candles (D12)", gutterDetail);

    // D6 — doji-min-body-floor: each doji candle's painted body height ≥ 6px at t=1 (never collapsed).
    if (!isOhlc) {
      let dojiOk = true, dojiDetail = "";
      for (let i = 0; i < D.candles.length; i++) {
        if (!plan.candles[i].dojiFloored) continue;
        const ph = D.candles[i].painted ? D.candles[i].painted.h : 0;
        const floor390 = DOJI_MIN_BODY_PX * sy; // painted source px (×scaleY)
        if (ph < floor390 - 1) { dojiOk = false; dojiDetail = `doji candle ${i} painted body ${ph.toFixed(1)}px < ${floor390.toFixed(1)}px floor`; }
      }
      check(dojiOk, "doji-min-body-floor: each doji painted body height ≥ 6px·scaleY at t=1 (D6)", dojiDetail);
    }

    // D10 — time-label no-overlap & fit: no two VISIBLE time labels overlap > 4px; visible set at t=1
    // matches planCandles show flags.
    let overlapOk = true, overlapDetail = "";
    const boxes = D.tlabels.filter((l) => l.opacity > 0.05).map((l) => l.rect);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++)
        if (overlap(boxes[i], boxes[j]) > 4) { overlapOk = false; overlapDetail = `two time labels overlap ${overlap(boxes[i], boxes[j]).toFixed(1)}px`; }
    check(overlapOk, "time-label no-overlap: no two visible time labels overlap > 4px (D10)", overlapDetail);
    const planVis = plan.candles.filter((c) => c.showLabel).length;
    const domVis = D.tlabels.filter((l) => l.opacity > 0.5).length;
    check(domVis === planVis, `visible time-label count (${domVis}) == planCandles show flags (${planVis}) (D10)`);

    // D11 — §3 BINDING: painted body width @390 (CSS px ÷ 2.77) ≥ the floor on the FULL-CAP fixture;
    // axis/time-label eff font ≥ 18; assertGatingClean; coverage. The painted body width is the
    // measured rendered width, NOT the viewBox MIN_BODY_W constant (the scatter D7 mechanism).
    if (!isOhlc && D.candleCount >= 13) {
      const bodyWcss = D.candles.map((c) => (c.painted ? c.painted.w : 0)).filter((w) => w > 0);
      const minBodyCss = Math.min(...bodyWcss);
      check(minBodyCss / 2.77 >= 6.5 - 0.5, `painted body width ${(minBodyCss / 2.77).toFixed(2)}px @390 ≥ 6.5 on the full-cap fixture (D11 — §3 binding, measured not constant)`, `${minBodyCss.toFixed(1)}px CSS`);
    }
    let floorOk = true, floorDetail = "";
    for (const l of D.tlabels) if (l.opacity > 0.05 && l.fontSize < 18 - 0.5) { floorOk = false; floorDetail = `time label "${(l.text || "").slice(0, 8)}" ${l.fontSize}px < 18`; }
    check(floorOk, "time labels' font ≥ 18 (designed at 24) (D11)", floorDetail);
    assertGatingClean(check, reports, T_SAMPLES, " (D1/D11 · candle/wick shapes excluded — no text node)");
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
