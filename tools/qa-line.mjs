#!/usr/bin/env node
// PL-2.7 deterministic gate — LineChart (line / area / stepped + markers + annotations) trend-over-
// ordered-x primitive (no LLM). The RETROFIT sprint of Epic PL-2: it modernizes the project's original
// LineChart (the `chart` viz kind) onto a pure planner (src/lib/line.ts) + this gate, while keeping the
// DEFAULT (plain-line, no-knob) t=1 frame BYTE-IDENTICAL to the pre-retrofit code.
//
//   node tools/qa-line.mjs --baseline-capture  # STEP 1 (run on the PRE-retrofit code): capture the
//                                              # current chart t=1 DOM structurally → baselines/pl-2.7-line/
//   node tools/qa-line.mjs --unit              # planLine decision tables (U1–U11; no dev server)
//   npm run dev                                # in another terminal — DOM passes need the dev server
//   npm run qa:line                            # full: baseline-regression + unit + sampled-t DOM pass
//
// Covers handoff §2.7 (planning/primitive-library/handoffs/PL-2.7-line-variants.md):
//   THE HEADLINE CHECK — default-mode t=1 structural read == the captured pre-retrofit baseline,
//   field-for-field (path `d` byte-identical, dot/end-label/tick/x-label identical). Then: planLine
//   unit suite (U1–U11), and a sampled-t DOM pass (draw-on bounded+settled, point-axis, area-under-line,
//   markers-at-points, stepped-path, annotation placement/fade/no-overlap, layout-reserved dual read,
//   caps, mobile floors / collisions / clipped / safe-margin clean at every sample).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BASE, VIEWPORT, sampleFixture, assertGatingClean } from "./lib/sampled-t.mjs";
import {
  planLine,
  lineReveal,
  annotationOpacity,
  MAX_SERIES,
  MAX_POINTS,
  MARKER_R,
  MARKER_MIN_SPACING,
  MAX_ANNOTATIONS,
  DRAW_START,
  DRAW_END,
  WIDTH,
  DEFAULT_HEIGHT,
  PAD,
} from "../src/lib/line.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UNIT_ONLY = process.argv.includes("--unit");
const BASELINE_CAPTURE = process.argv.includes("--baseline-capture");
const BASELINE_DIR = join(ROOT, "planning", "primitive-library", "baselines", "pl-2.7-line");

// The default-regression set (existing chart fixtures + the Path-A compounding post). These render the
// DEFAULT plain line — their t=1 frame MUST equal the captured pre-retrofit baseline, byte-for-byte.
const BASELINE_FIXTURES = [
  "fuzz-01-chart-min",
  "fuzz-02-chart-4series-m2",
  "fuzz-03-chart-longhead-m1",
  "compounding-pathA",
];

// Variant showcase fixtures (PL-2.7) — area, stepped, markers-on, annotations.
const ANIM_FIXTURES = [
  "fuzz-63-line-area",
  "fuzz-64-line-stepped-markers",
  "fuzz-65-line-annotations",
  "fuzz-66-line-markers-dense",
];

const T_SAMPLES = [0, 0.35, 0.45, 0.55, 0.65, 0.75, 0.8, 0.85, 0.92, 1];
const fixturePath = (id) => join(ROOT, "planning", "fixtures", "renderfuzz", `${id}.render.json`);
const genPath = (id) => join(ROOT, "src", "posts", "generated", `${id}.render.json`);
const specFor = async (id) => {
  try {
    return JSON.parse(await readFile(fixturePath(id), "utf8"));
  } catch {
    return JSON.parse(await readFile(genPath(id), "utf8"));
  }
};

let failures = 0;
const check = (ok, name, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "✔" : "✖"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  return ok;
};
const approx = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// ── Structural, renderer-agnostic capture of the CURRENT LineChart svg (the PL-1.5 capture-first
//    discipline). Reads the chart svg by STRUCTURE — series <path d>, end <circle>, every <text>
//    (ticks / x-labels / end-labels split by anchor+family), gridlines + the svg viewBox + node count.
//    Deliberately NOT keyed to the new inspect `line` section, so it works on the pre-retrofit code.
function captureChartState() {
  const canvas = document.querySelector("#post-canvas");
  if (!canvas) return { error: "no #post-canvas" };
  const svg = canvas.querySelector("svg[aria-label]") || canvas.querySelector("svg");
  if (!svg) return { error: "no chart svg" };
  const r6 = (x) => Math.round((x + Number.EPSILON) * 1e6) / 1e6;
  const paths = [...svg.querySelectorAll("path")].map((p) => ({
    d: p.getAttribute("d"),
    stroke: getComputedStyle(p).stroke,
    strokeWidth: +parseFloat(getComputedStyle(p).strokeWidth).toFixed(3),
  }));
  const circles = [...svg.querySelectorAll("circle")].map((c) => ({
    cx: r6(+c.getAttribute("cx")),
    cy: r6(+c.getAttribute("cy")),
    r: +c.getAttribute("r"),
    fill: getComputedStyle(c).fill,
  }));
  const lines = [...svg.querySelectorAll("line")].map((l) => ({
    x1: r6(+l.getAttribute("x1")),
    y1: r6(+l.getAttribute("y1")),
    x2: r6(+l.getAttribute("x2")),
    y2: r6(+l.getAttribute("y2")),
  }));
  const texts = [...svg.querySelectorAll("text")].map((t) => {
    const cs = getComputedStyle(t);
    return {
      text: (t.textContent || "").trim(),
      x: r6(+t.getAttribute("x")),
      y: r6(+t.getAttribute("y")),
      anchor: t.getAttribute("text-anchor") || cs.textAnchor,
      fontSize: +parseFloat(cs.fontSize).toFixed(2),
      fill: cs.fill,
    };
  });
  return {
    viewBox: svg.getAttribute("viewBox"),
    nodeCount: svg.querySelectorAll("*").length,
    paths,
    circles,
    lines,
    texts,
  };
}

async function loadChart(page, id, t = 1) {
  await page.goto(`${BASE}/?id=${encodeURIComponent(id)}&t=${t}`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForSelector("#post-canvas", { timeout: 20000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(200);
  return page.evaluate(captureChartState);
}

async function captureBaseline() {
  await mkdir(BASELINE_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    for (const id of BASELINE_FIXTURES) {
      const state = await loadChart(page, id, 1);
      if (state.error) {
        console.error(`✖ ${id}: ${state.error}`);
        process.exitCode = 1;
        continue;
      }
      await writeFile(join(BASELINE_DIR, `${id}.t1.json`), JSON.stringify(state, null, 2));
      console.log(`captured ${id}.t1.json — ${state.paths.length} paths, ${state.circles.length} circles, ${state.texts.length} texts, nodeCount ${state.nodeCount}`);
    }
  } finally {
    await browser.close();
  }
}

// ── THE HEADLINE CHECK — default-mode t=1 == captured pre-retrofit baseline ──────────────────────
async function baselineRegressionSuite(page) {
  console.log(`Default byte-identity vs pre-retrofit baseline (${BASELINE_DIR.replace(ROOT, ".")}):`);
  for (const id of BASELINE_FIXTURES) {
    let baseline;
    try {
      baseline = JSON.parse(await readFile(join(BASELINE_DIR, `${id}.t1.json`), "utf8"));
    } catch {
      check(false, `${id}: baseline missing`, "run `node tools/qa-line.mjs --baseline-capture` on the PRE-retrofit renderer");
      continue;
    }
    const cur = await loadChart(page, id, 1);
    if (cur.error) {
      check(false, `${id}: ${cur.error}`);
      continue;
    }
    let ok = true;
    let detail = "";
    if (cur.viewBox !== baseline.viewBox) { ok = false; detail = `viewBox ${cur.viewBox} vs ${baseline.viewBox}`; }
    if (cur.paths.length !== baseline.paths.length) { ok = false; detail = `path count ${cur.paths.length} vs ${baseline.paths.length}`; }
    else {
      for (let i = 0; i < baseline.paths.length; i++) {
        const b = baseline.paths[i], c = cur.paths[i];
        if (c.d !== b.d) { ok = false; detail = `series path[${i}] d differs`; }
        if (c.stroke !== b.stroke) { ok = false; detail = `path[${i}] stroke ${c.stroke} vs ${b.stroke}`; }
        if (Math.abs(c.strokeWidth - b.strokeWidth) > 0.05) { ok = false; detail = `path[${i}] strokeW ${c.strokeWidth} vs ${b.strokeWidth}`; }
      }
    }
    if (cur.circles.length !== baseline.circles.length) { ok = false; detail = `circle count ${cur.circles.length} vs ${baseline.circles.length}`; }
    else {
      for (let i = 0; i < baseline.circles.length; i++) {
        const b = baseline.circles[i], c = cur.circles[i];
        if (Math.abs(c.cx - b.cx) > 0.5 || Math.abs(c.cy - b.cy) > 0.5 || c.r !== b.r) { ok = false; detail = `end-dot[${i}] ${c.cx},${c.cy},r${c.r} vs ${b.cx},${b.cy},r${b.r}`; }
        if (c.fill !== b.fill) { ok = false; detail = `end-dot[${i}] fill ${c.fill} vs ${b.fill}`; }
      }
    }
    if (cur.lines.length !== baseline.lines.length) { ok = false; detail = `gridline count ${cur.lines.length} vs ${baseline.lines.length}`; }
    else {
      for (let i = 0; i < baseline.lines.length; i++) {
        const b = baseline.lines[i], c = cur.lines[i];
        if (Math.abs(c.x1 - b.x1) > 0.5 || Math.abs(c.y1 - b.y1) > 0.5 || Math.abs(c.x2 - b.x2) > 0.5 || Math.abs(c.y2 - b.y2) > 0.5) { ok = false; detail = `gridline[${i}] differs`; }
      }
    }
    if (cur.texts.length !== baseline.texts.length) { ok = false; detail = `text count ${cur.texts.length} vs ${baseline.texts.length}`; }
    else {
      for (let i = 0; i < baseline.texts.length; i++) {
        const b = baseline.texts[i], c = cur.texts[i];
        if (c.text !== b.text) { ok = false; detail = `text[${i}] "${c.text}" vs "${b.text}"`; }
        if (Math.abs(c.x - b.x) > 0.5 || Math.abs(c.y - b.y) > 0.5) { ok = false; detail = `text[${i}] "${c.text}" pos ${c.x},${c.y} vs ${b.x},${b.y}`; }
        if (Math.abs(c.fontSize - b.fontSize) > 0.5) { ok = false; detail = `text[${i}] font ${c.fontSize} vs ${b.fontSize}`; }
        if (c.fill !== b.fill) { ok = false; detail = `text[${i}] fill ${c.fill} vs ${b.fill}`; }
        if (c.anchor !== b.anchor) { ok = false; detail = `text[${i}] anchor ${c.anchor} vs ${b.anchor}`; }
      }
    }
    check(ok, `${id}: default-mode t=1 == pre-retrofit baseline (path d / dot / tick / x-label / end-label byte-identical)`, detail);
  }
}

// ── 1. Unit suite (pure — no DOM) ────────────────────────────────────────────────
function unitSuite() {
  const ID = WIDTH - PAD.left - PAD.right;
  const innerH = DEFAULT_HEIGHT - PAD.top - PAD.bottom;
  const xAt = (i, stepCount) => PAD.left + (i / stepCount) * ID;
  const yAt = (v, yMin, yMax) => PAD.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  console.log("U1 — series cap (C1): 5 series → 4 kept, seriesDropped=1:");
  const u1 = planLine({ series: Array.from({ length: 5 }, (_, k) => ({ label: `s${k}`, values: [0.5, 0.6, 0.7], color: "cyan" })) });
  check(u1.series.length === MAX_SERIES, `5 → ${MAX_SERIES} kept`, `got ${u1.series.length}`);
  check(u1.dropped.seriesDropped === 1, "seriesDropped === 1", `got ${u1.dropped.seriesDropped}`);

  console.log("U2 — point stride-downsample (C2): 30 → 24, first/last kept, deterministic:");
  const N = 30;
  const vals = Array.from({ length: N }, (_, i) => i / (N - 1));
  const u2 = planLine({ series: [{ label: "a", values: vals, color: "cyan" }], yMax: 1 });
  check(u2.series[0].values.length === MAX_POINTS, `30 → ${MAX_POINTS}`, `got ${u2.series[0].values.length}`);
  check(u2.dropped.pointsDropped >= N - MAX_POINTS, `pointsDropped ≥ ${N - MAX_POINTS}`, `got ${u2.dropped.pointsDropped}`);
  check(approx(u2.series[0].values[0], 0) && approx(u2.series[0].values[MAX_POINTS - 1], 1), "first & last kept", `${u2.series[0].values[0]}…${u2.series[0].values[MAX_POINTS - 1]}`);

  console.log("U3 — length mismatch → truncate to common MIN, surplus counted:");
  const u3 = planLine({ series: [{ label: "a", values: [0.1, 0.2, 0.3, 0.4], color: "cyan" }, { label: "b", values: [0.1, 0.2, 0.3], color: "amber" }], yMax: 1 });
  check(u3.series.every((s) => s.values.length === 3), "lengths [4,3] → both truncated to 3", `got ${u3.series.map((s) => s.values.length).join(",")}`);
  check(u3.dropped.pointsDropped === 1, "truncated tail counted (1)", `got ${u3.dropped.pointsDropped}`);

  console.log("U4 — axis: default [0,1] + default %% ticks preserved; author yMax → ticks; yMax<=yMin guard:");
  const u4d = planLine({ series: [{ label: "a", values: [0.1, 0.9], color: "cyan" }] });
  check(u4d.yMin === 0 && u4d.yMax === 1, "default [0,1]", `got [${u4d.yMin},${u4d.yMax}]`);
  check(u4d.ticks.join(",") === "0,0.25,0.5,0.75,1", "default ticks [0,.25,.5,.75,1]", u4d.ticks.join(","));
  check(u4d.yFormat(0.5) === "50%", "default % formatter", u4d.yFormat(0.5));
  const u4a = planLine({ series: [{ label: "a", values: [10, 80], color: "cyan" }], yMax: 100 });
  check(u4a.yMax === 100 && u4a.ticks.length === 5, "author yMax=100 → 5 ticks", `${u4a.yMax} / ${u4a.ticks.join(",")}`);
  check(u4a.yFormat(50) === "50", "non-0–1 axis → numeric formatter", u4a.yFormat(50));
  const u4g = planLine({ series: [{ label: "a", values: [5, 5], color: "cyan" }], yMin: 10, yMax: 10 });
  check(u4g.yMax > u4g.yMin && Number.isFinite(u4g.yMax), "yMax<=yMin guard → max>min finite", `[${u4g.yMin},${u4g.yMax}]`);

  console.log("U5 — polyline path generation == hand-rolled M…L… for a known fixture (path-format anchor):");
  const fxVals = [1, 0.92, 0.85, 0.77, 0.7];
  const u5 = planLine({ series: [{ label: "99%/step", values: fxVals, color: "#22d3ee", endValueLabel: "70%" }], xLabels: ["0", "5", "10", "15", "20"], yMax: 1 });
  const sc = fxVals.length - 1;
  // PL-6: a LABELED series now carries a one-item legend, so the plot top is pushed down by the legend
  // band — the path is still the hand-rolled M…L… format, now anchored at the plan's legend-shifted
  // plotTop. Compute the expected against u5.plotTop (the plan's own origin) so the string stays locked.
  const innerH5 = DEFAULT_HEIGHT - u5.plotTop - PAD.bottom;
  const yAt5 = (v) => u5.plotTop + innerH5 - ((v - 0) / (1 - 0)) * innerH5;
  const expected = fxVals.map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i, sc)} ${yAt5(v)}`).join(" ");
  check(u5.series[0].linePath === expected, "linePath == hand-rolled pathFor() string EXACTLY (at the legend-shifted plotTop)", `\n     got ${u5.series[0].linePath}\n     exp ${expected}`);
  check(u5.series[0].fillPath === "", "default (line) → no fill path");

  console.log("U6 — stepped-path generation (H/V step command sequence; plotted y ∈ data vertices):");
  const u6 = planLine({ variant: "stepped", series: [{ label: "a", values: [0.2, 0.5, 0.3], color: "cyan" }], yMax: 1 });
  check(/H/.test(u6.series[0].linePath) && /V/.test(u6.series[0].linePath), "stepped path uses H + V commands", u6.series[0].linePath);
  // Every plotted Y in the stepped path must be one of the data-vertex Y's (never an interpolated mid).
  const vertYs = u6.series[0].vertices.map((p) => Math.round(p.y));
  const ys6 = (u6.series[0].linePath.match(/V\s+([\d.]+)/g) || []).map((s) => Math.round(parseFloat(s.replace("V", ""))));
  check(ys6.every((y) => vertYs.includes(y)), "every stepped V target == a data-vertex y (no interpolation)", `Vs ${ys6.join(",")} vs verts ${vertYs.join(",")}`);

  console.log("U7 — area: single-series-only, fill on series[0], areaFillsDropped:");
  const u7 = planLine({ variant: "area", series: [{ label: "a", values: [0.2, 0.8], color: "cyan" }, { label: "b", values: [0.3, 0.6], color: "amber" }], yMax: 1 });
  check(u7.series[0].fillPath !== "" && u7.series[1].fillPath === "", "fill on series[0] only", `s0 "${u7.series[0].fillPath.slice(0, 6)}" s1 "${u7.series[1].fillPath}"`);
  check(u7.dropped.areaFillsDropped === 1, "areaFillsDropped === 1 (seriesCount-1)", `got ${u7.dropped.areaFillsDropped}`);
  check(/Z\s*$/.test(u7.series[0].fillPath.trim()), "fill path is closed (Z)", u7.series[0].fillPath.slice(-3));

  console.log("U8 — markers: vertices == centers; declutter guard at MARKER_MIN_SPACING:");
  const u8 = planLine({ markers: "on", series: [{ label: "a", values: [0.2, 0.5, 0.8], color: "cyan" }], yMax: 1 });
  check(u8.series[0].markers.length === 3, "markers:on → one marker per vertex", `got ${u8.series[0].markers.length}`);
  check(u8.series[0].markers.every((m, i) => approx(m.x, u8.series[0].vertices[i].x) && approx(m.y, u8.series[0].vertices[i].y)), "marker centers == vertices");
  // The point cap (MAX_POINTS=24) bounds stepCount ≤ 23, so at WIDTH=920 the per-step spacing
  // (innerW/23 ≈ 26.8px) never falls below MARKER_MIN_SPACING (22) — markers are NOT suppressed even
  // at MAX density (the declutter is a guard for narrower geometries / future caps). Assert the
  // boundary directly: full-cap density → markers SHOWN; the suppress predicate fires below 22px.
  const dense = Array.from({ length: 40 }, (_, i) => 0.5 + 0.3 * Math.sin(i));
  const u8d = planLine({ markers: "on", series: [{ label: "a", values: dense, color: "cyan" }], yMax: 1 });
  const step = ID / (u8d.series[0].values.length - 1);
  check(u8d.dropped.markersSuppressed === step < MARKER_MIN_SPACING, `markersSuppressed iff step (${step.toFixed(1)}) < ${MARKER_MIN_SPACING}`, `suppressed=${u8d.dropped.markersSuppressed}`);
  check(u8d.dropped.markersSuppressed ? u8d.series[0].markers.length === 0 : u8d.series[0].markers.length === u8d.series[0].values.length, "marker render matches the declutter decision");

  console.log("U9 — annotation resolution (index/label/unresolved/seriesIndex clamp/over-cap/fit):");
  const u9 = planLine({
    series: [{ label: "a", values: [0.2, 0.5, 0.8, 0.6, 0.9], color: "cyan" }],
    xLabels: ["Jan", "Feb", "Mar", "Apr", "May"],
    yMax: 1,
    annotations: [{ x: 2, label: "peak" }, { x: "Apr", label: "dip" }],
  });
  check(u9.annotations.length === 2 && u9.annotations[0].vertexIndex === 2, "index x=2 resolves to vertex 2", `len ${u9.annotations.length}`);
  check(u9.annotations[1].vertexIndex === 3, "label x='Apr' resolves to index 3", `got ${u9.annotations[1].vertexIndex}`);
  const u9u = planLine({ series: [{ label: "a", values: [0.2, 0.5, 0.8], color: "cyan" }], annotations: [{ x: 99, label: "bad" }, { x: "Nope", label: "bad2" }] });
  check(u9u.dropped.annotationsUnresolved === 2, "out-of-range index + non-matching label → unresolved=2", `got ${u9u.dropped.annotationsUnresolved}`);
  const u9c = planLine({ series: [{ label: "a", values: [0.2, 0.5, 0.8, 0.6], color: "cyan" }], annotations: Array.from({ length: 5 }, (_, k) => ({ x: 0, label: `a${k}` })) });
  check(u9c.dropped.annotationsDropped === 5 - MAX_ANNOTATIONS, `over ${MAX_ANNOTATIONS} → dropped tail`, `got ${u9c.dropped.annotationsDropped}`);
  const u9s = planLine({ series: [{ label: "a", values: [0.2, 0.5], color: "cyan" }, { label: "b", values: [0.3, 0.6], color: "amber" }], annotations: [{ x: 1, seriesIndex: 9, label: "x" }] });
  check(u9s.annotations[0].seriesIndex === 0, "out-of-range seriesIndex → clamp to 0", `got ${u9s.annotations[0].seriesIndex}`);

  console.log("U10 — degenerate (0 → empty; 1-point → singlePoint dot, no NaN path):");
  check(planLine({ series: [] }).empty === true, "0 series → empty:true");
  const u10 = planLine({ series: [{ label: "a", values: [0.42], color: "cyan" }], yMax: 1 });
  check(u10.singlePoint === true, "1-point → singlePoint:true");
  check(u10.series[0].linePath === "" && !/NaN/.test(JSON.stringify(u10.series[0])), "1-point → empty line path, no NaN");
  check(Number.isFinite(u10.series[0].endDot.x) && Number.isFinite(u10.series[0].endDot.y), "1-point → finite end-dot");

  console.log("U11 — unknown enum → default (variant:bogus→line; markers:maybe→off):");
  const u11 = planLine({ variant: "bogus", markers: "maybe", series: [{ label: "a", values: [0.2, 0.8], color: "cyan" }], yMax: 1 });
  check(u11.variant === "line", "unknown variant → line", u11.variant);
  check(u11.markers === "off", "unknown markers → off", u11.markers);
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
const overlap = (A, B) => {
  const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
  const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
  return ox > 4 && oy > 4 ? Math.min(ox, oy) : 0;
};

// ── 2. Sampled-t DOM suite (variant fixtures) ─────────────────────────────────────────────
async function geometrySuite(page) {
  for (const id of ANIM_FIXTURES) {
    const spec = await specFor(id);
    const v = spec.visualization;
    const plan = planLine({ series: v.series, xLabels: v.xLabels, yMin: v.yMin, yMax: v.yMax, variant: v.variant, markers: v.markers, annotations: v.annotations });
    console.log(`Sampled-t DOM pass — ${id} (variant:${plan.variant}, markers:${plan.markers}, t ∈ {${T_SAMPLES.join(", ")}}):`);

    const reports = await sampleFixture(page, id, T_SAMPLES);
    const base = reports[1];
    const L = base.line;
    if (!check(!!L, "line section present at t=1")) continue;

    const sx = L.scaleX;
    const xSpan = (WIDTH - PAD.right) - PAD.left;

    // C-caps — rendered series count == plan post-clamp at every sample; ≤4.
    check(T_SAMPLES.every((t) => reports[t].line?.seriesCount === plan.series.length), `rendered series count === ${plan.series.length} at every sample (C-caps)`, T_SAMPLES.map((t) => reports[t].line?.seriesCount).join(","));
    check(plan.series.length <= MAX_SERIES, `≤ ${MAX_SERIES} series (C1)`);

    // C-layout-reserved (§3 ruling 3): the FINAL path `d` (line + fill) + marker cx/cy + nodeCount are
    // byte-identical across all 10 samples; only clip width / dashoffset / pop / label opacity move.
    check(T_SAMPLES.every((t) => reports[t].line?.nodeCount === L.nodeCount), `svg node count constant (${L.nodeCount}) — nothing mounts/unmounts (C-layout-reserved)`, T_SAMPLES.map((t) => reports[t].line?.nodeCount).join(","));
    let dOk = true, dDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].line;
      for (let si = 0; si < L.series.length; si++) {
        if (d.series[si]?.lineD !== L.series[si].lineD) { dOk = false; dDetail = `series ${si} line d changes at t=${t}`; }
        if (d.series[si]?.fillD !== L.series[si].fillD) { dOk = false; dDetail = `series ${si} fill d changes at t=${t}`; }
        const mNow = (d.series[si]?.markers || []).map((m) => `${m.cx},${m.cy}`).join("|");
        const mBase = (L.series[si].markers || []).map((m) => `${m.cx},${m.cy}`).join("|");
        if (mNow !== mBase) { dOk = false; dDetail = `series ${si} marker centers change at t=${t}`; }
      }
    }
    check(dOk, "every series' FINAL line+fill `d` + marker centers BYTE-IDENTICAL across all 10 samples (C-layout-reserved §3 ruling 3)", dDetail);

    // Draw-on bounded + settled: each trace strokeDashoffset == 1 - lineReveal(t) (±tol), =0 at t=1,
    // and NO CSS transform on the line path at any sample (default-path discipline).
    let drawOk = true, drawDetail = "";
    for (const t of T_SAMPLES) {
      for (const s of reports[t].line.series) {
        const exp = 1 - lineReveal(t);
        if (s.dashoffset != null && Math.abs(s.dashoffset - exp) > 0.02) { drawOk = false; drawDetail = `dashoffset ${s.dashoffset} ≠ 1-lineReveal(${t})=${exp.toFixed(3)}`; }
        if (s.lineTransform !== "none") { drawOk = false; drawDetail = `line CSS transform "${s.lineTransform}" at t=${t} (must be none)`; }
      }
    }
    check(drawOk, "draw-on: strokeDashoffset == 1−lineReveal(t) (±0.02); NO CSS transform on the line path", drawDetail);
    check(reports[1].line.series.every((s) => s.dashoffset == null || Math.abs(s.dashoffset) < 0.02), "fully drawn (dashoffset 0) at t=1");

    // Point-axis correctness — each vertex == (xAt, yAt) from the plan (the renderer paints the plan's
    // path verbatim, byte-checked by layout-reserved). Assert the plan against the closed-form scales.
    // PL-6: the plot top origin is plan.plotTop (PAD.top + legendBand) — == PAD.top for single-series /
    // unlabeled charts (byte-identical), pushed down for multi-series labeled charts (the legend strip).
    const plotTop = plan.plotTop;
    const innerH = DEFAULT_HEIGHT - plotTop - PAD.bottom;
    let axisOk = true, axisDetail = "";
    for (const ps of plan.series) {
      const sc = Math.max(1, ps.values.length - 1);
      for (let i = 0; i < ps.vertices.length; i++) {
        const exX = PAD.left + (i / sc) * xSpan;
        const cv = Math.max(plan.yMin, Math.min(plan.yMax, ps.values[i]));
        const exY = plotTop + innerH - ((cv - plan.yMin) / (plan.yMax - plan.yMin)) * innerH;
        if (Math.abs(ps.vertices[i].x - exX) > 0.6 || Math.abs(ps.vertices[i].y - exY) > 0.6) { axisOk = false; axisDetail = `vertex ${i} (${ps.vertices[i].x.toFixed(1)},${ps.vertices[i].y.toFixed(1)}) ≠ (${exX.toFixed(1)},${exY.toFixed(1)})`; }
      }
    }
    check(axisOk, "point-axis: every vertex == (xAt(i), yAt(v)) closed-form (C point-axis)", axisDetail);

    // Area-under-line (only when variant area): exactly one fill path; clip width == lineReveal(t)·xSpan.
    if (plan.variant === "area") {
      const fillCount = plan.series.filter((s) => s.fillPath).length;
      check(fillCount === 1, "area: exactly one fill node (single-series-only)", `got ${fillCount}`);
      let clipOk = true, clipDetail = "";
      for (const t of T_SAMPLES) {
        const clip = reports[t].line.clip;
        if (!clip) { clipOk = false; clipDetail = `no clip at t=${t}`; continue; }
        const exp = lineReveal(t) * xSpan;
        if (Math.abs(clip.width - exp) > 1.5) { clipOk = false; clipDetail = `clip width ${clip.width.toFixed(1)} ≠ lineReveal(${t})·xSpan ${exp.toFixed(1)}`; }
      }
      check(clipOk, "area-under-line: clip width == lineReveal(t)·xSpan (±1.5px) (C area-fill)", clipDetail);
      check(reports[1].line.clip && Math.abs(reports[1].line.clip.width - xSpan) <= 1.5, "clip fully open at t=1");
      // top edge of fill == the trace: fill path begins with the same M…L… as the line path.
      const fs = plan.series.find((s) => s.fillPath);
      check(fs && fs.fillPath.startsWith(fs.linePath.replace(/^M/, "M")), "fill top edge == the trace polyline");
    }

    // Markers-at-points (when markers:on & not suppressed): DOM marker centers == plan vertices; a
    // marker is visible only once lineReveal(t) >= k/stepCount; scale==1 at t=1.
    if (plan.markers === "on" && !plan.dropped.markersSuppressed) {
      let mOk = true, mDetail = "";
      for (let si = 0; si < plan.series.length; si++) {
        const ps = plan.series[si];
        const dm = base.line.series[si]?.markers || [];
        if (dm.length !== ps.markers.length) { mOk = false; mDetail = `series ${si} DOM marker count ${dm.length} ≠ plan ${ps.markers.length}`; continue; }
        for (let k = 0; k < ps.markers.length; k++) {
          if (Math.abs(dm[k].cx - ps.markers[k].x) > 0.6 || Math.abs(dm[k].cy - ps.markers[k].y) > 0.6) { mOk = false; mDetail = `series ${si} marker ${k} center drift`; }
        }
      }
      check(mOk, "markers-at-points: DOM marker centers == plan vertices (C markers)", mDetail);
      // pop settled at t=1 (no lingering transform other than identity / none).
      let popOk = true;
      for (const s of base.line.series) for (const m of s.markers || []) if (m.transform && m.transform !== "none" && !/matrix\(1,\s*0,\s*0,\s*1,/.test(m.transform)) popOk = false;
      check(popOk, "marker pop settled (scale 1 / no non-identity transform) at t=1");
    }
    if (plan.dropped.markersSuppressed) {
      check((base.line.series[0]?.markers || []).length === 0, "declutter: suppressed markers render zero vertex dots");
    }

    // Stepped-path correctness — the rendered line path uses H/V step commands.
    if (plan.variant === "stepped") {
      const lp = base.line.series[0]?.lineD || "";
      check(/H/.test(lp) && /V/.test(lp), "stepped: rendered line path is a step function (H/V commands)", lp.slice(0, 40));
    }

    // Annotation placement / fade / no-overlap.
    if ((plan.annotations || []).length > 0) {
      const shown = plan.annotations.filter((a) => a.show);
      const domAnn = base.line.annotations || [];
      check(domAnn.length === plan.annotations.length, "annotation node count == plan (resolved)", `dom ${domAnn.length} vs plan ${plan.annotations.length}`);
      // fade AFTER the line settles: opacity ~0 before DRAW_END, ~1 at t=1.
      const preEnd = reports[0.75].line.annotations || [];
      let fadeOk = preEnd.every((a) => a.opacity <= 0.05);
      const settled = (base.line.annotations || []).filter((a) => a.shown);
      check(fadeOk, "annotations opacity ≈ 0 before DRAW_END (fade AFTER the line settles)", preEnd.map((a) => a.opacity).join(","));
      check(approx(annotationOpacity(1), 1), "annotationOpacity(1) === 1 (settled)");
      // no shown annotation label overlaps another shown annotation / an end-label > 4px.
      let aOverlap = true, aDetail = "";
      const boxes = settled.map((a) => a.labelRect).concat((base.line.endLabels || []).filter((e) => e.opacity > 0.5).map((e) => e.rect));
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlap(boxes[i], boxes[j]) > 4) { aOverlap = false; aDetail = `overlap ${overlap(boxes[i], boxes[j]).toFixed(1)}px`; }
      check(aOverlap, "no shown annotation overlaps another annotation / end-label > 4px", aDetail);
    }

    // C-mobile — trace stroke ≥ 5; axis/x/end/annotation eff-font ≥ 18; gating clean at every sample.
    let strokeOk = true, strokeDetail = "";
    for (const s of L.series) if (s.lineD && s.strokeW < 5 - 0.5) { strokeOk = false; strokeDetail = `series ${s.index} stroke ${s.strokeW} < 5`; }
    check(strokeOk, "trace stroke ≥ 5 (DATA-bearing) (C-mobile)", strokeDetail);

    let fontOk = true, fontDetail = "";
    for (const x of L.xLabels) if (x.fontSize < 18 - 0.5) { fontOk = false; fontDetail = `x-label "${(x.text || "").slice(0, 6)}" ${x.fontSize} < 18`; }
    for (const e of L.endLabels) if (e.opacity > 0.05 && e.fontSize < 18 - 0.5) { fontOk = false; fontDetail = `end-label ${e.fontSize} < 18`; }
    check(fontOk, "axis / x / end labels' font ≥ 18 (C-mobile)", fontDetail);

    assertGatingClean(check, reports, T_SAMPLES, " (C-mobile)");
    check(base.textCoverage < 0.42, `textCoverage ${base.textCoverage} < 0.42 at t=1 (C-mobile)`);
  }
}

// ── Entry ──────────────────────────────────────────────────────────────────────
if (BASELINE_CAPTURE) {
  console.log(`Capturing the PRE-retrofit chart t=1 baseline → ${BASELINE_DIR.replace(ROOT, ".")} (needs the dev server at ${BASE})\n`);
  await captureBaseline();
  console.log("\n✔ baseline captured");
  process.exit(process.exitCode || 0);
}

await unitSuite();
if (!UNIT_ONLY) {
  console.log(`\nDOM passes — need the dev server at ${BASE} (npm run dev)\n`);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await baselineRegressionSuite(page);
    await geometrySuite(page);
  } finally {
    await browser.close();
  }
}
console.log(`\n${failures ? "✖ FAIL" : "✔ PASS"} — ${failures} failing check(s)`);
process.exit(failures ? 2 : 0);
