#!/usr/bin/env node
// PL-4.3 deterministic gate — Pipeline (the `pipeline` viz kind): the COMPOUNDING-process track —
// equal-weight 56×56 node chips on a horizontal track, a signal dot travelling it, per-step rate →
// cumulative payoff label, end-to-end endpoint label. The THIRD (last) sub-task of the PL-4.3
// legacy-retrofit sprint: it modernizes the project's original Pipeline onto a pure planner
// (src/lib/pipeline.ts) + this gate, while keeping the painted t=1 frame BYTE-IDENTICAL to the
// pre-retrofit code (the non-negotiable gate). Pipeline has the WIDEST Path B consumer surface
// (PostRenderer + ReliabilityPipeline), hence LAST — the pattern was validated on matrix + ranges first.
//
// Pipeline is an SVG-viewBox primitive (viewBox 1000×280) — so the baseline + checks read the svg's
// rect/text/line/circle attrs (like the divergence/bars/ranges gates), NOT a CSS grid.
//
//   node tools/qa-pipeline.mjs --baseline-capture # STEP 1 (run on the PRE-retrofit code): capture the
//                                                  # current pipeline t=1 DOM structurally → baselines/pl-4.3-pipeline/
//   node tools/qa-pipeline.mjs --unit              # planPipeline decision tables (U1–U9; no dev server)
//   npm run dev                                    # in another terminal — DOM passes need the dev server
//   npm run qa:pipeline                            # full: baseline byte-identity + unit + sampled-t DOM pass
//
// Covers handoff §1 (byte-identity contract) + §2C (Pipeline). THE HEADLINE CHECK: the post-refactor
// t=1 structural read == the captured pre-retrofit baseline, field-for-field (every node chip rect /
// step+cumulative label text+font+fill / connector line / endpoint label / per-step eyebrow). Then: the
// planPipeline unit suite (U1–U9) and a sampled-t DOM pass over the reveal PROPS (geometry static across
// reveals, nodes-within-frame, signal-dot ∈ track, no-label-overlap, settle, mobile floors via
// assertGatingClean, the numbered constraints C1–C6 incl. the MAX_NODES cap).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BASE, VIEWPORT, sampleFixture, assertGatingClean } from "./lib/sampled-t.mjs";
import {
  planPipeline,
  fitNodes,
  nodeOpacity,
  cumulativeOpacity,
  signalX,
  ACCENTS,
  VIEW_W,
  VIEW_H,
  NODE_WIDTH,
  NODE_HEIGHT,
  TRACK_Y,
  STEP_FONT,
  CUMULATIVE_FONT,
  MAX_NODES,
  MAX_LABEL_CHARS,
} from "../src/lib/pipeline.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UNIT_ONLY = process.argv.includes("--unit");
const BASELINE_CAPTURE = process.argv.includes("--baseline-capture");
const BASELINE_DIR = join(ROOT, "planning", "primitive-library", "baselines", "pl-4.3-pipeline");

// The pipeline fixtures — basic short (3 nodes), over-cap (>8 → fitNodes), 5-node-m2 (in-spec), then
// the stress set: over-long cumulative label, single node, empty. Each renders through PostRenderer's
// `pipeline` branch.
const FIXTURES = [
  "fuzz-12-pipeline-min",
  "fuzz-13-pipeline-8nodes-longhead",
  "fuzz-14-pipeline-5nodes-m2",
  "fuzz-112-pipeline-overcap",
  "fuzz-113-pipeline-longlabel",
  "fuzz-114-pipeline-single",
  "fuzz-115-pipeline-empty",
];

// THE BYTE-IDENTITY set — only the fixtures whose painted output the retrofit MUST preserve: the
// in-spec ones (the three PRE-EXISTING shipping fuzz fixtures: 3-node, 8-node, 5-node) where every
// defensive clamp is a NO-OP. The stress fixtures (112 over-cap, 113 over-long, 114 single, 115 empty)
// are brand-new with no shipping render to protect; they ride the unit + sampled-t passes, NOT the
// byte-identity regression. NOTE: fuzz-13 (8 nodes) sits exactly AT the MAX_NODES cap, so fitNodes is a
// no-op there too — its painted output is byte-identical, which proves the cap doesn't touch ≤8 nodes.
const BASELINE_FIXTURES = [
  "fuzz-12-pipeline-min",
  "fuzz-13-pipeline-8nodes-longhead",
  "fuzz-14-pipeline-5nodes-m2",
];

// The C-mobile GATING-CLEAN set — fixtures whose render must be collision/clip/safe-margin clean at
// EVERY sample. The over-cap fixture (112) is authored so fitNodes contains it to ≤8 nodes (clean); the
// over-long-label fixture (113) trips the cumulativeOverflowRisk FLAG via a label wider than its NODE
// PITCH (an interior node on a 6-node track) yet still physically contained on the canvas — so it too
// renders gating-clean (the flag is the signal, not a bleed; confirmed by qa:fuzz). The degenerate
// single (114) / empty (115) tracks render finite + clean. ALL the pipeline fixtures hold the
// gating-clean bar; the clamp BEHAVIOUR (nodesDropped/labelsOverflow/finite-geom) is asserted separately
// below for the stress fixtures.
const CLEAN_GATING_FIXTURES = new Set(FIXTURES);

const T_SAMPLES = [0, 0.2, 0.3, 0.4, 0.5, 0.62, 0.7, 0.85, 0.92, 1];
const fixturePath = (id) => join(ROOT, "planning", "fixtures", "renderfuzz", `${id}.render.json`);
const specFor = async (id) => JSON.parse(await readFile(fixturePath(id), "utf8"));

let failures = 0;
const check = (ok, name, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "✔" : "✖"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  return ok;
};
const approx = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// ── Structural, renderer-agnostic capture of the CURRENT Pipeline svg (the capture-first discipline).
//    Reads the svg BY STRUCTURE — the viewBox, every <rect> (x/y/w/h/rx/fill/stroke/opacity), every
//    <text> (string/x/y/anchor/eff-font/fill), every <line> (x1/y1/x2/y2/stroke/width/opacity), and the
//    signal <circle> (cx/cy/r/fill). Deliberately NOT keyed to the new inspect `pipeline` section /
//    data-pipeline-* hooks, so it runs on the PRE-retrofit code (which has no hooks). Finds the svg as
//    the canvas's svg whose viewBox is "0 0 1000 280" (the Pipeline signature, distinct from every other
//    viz svg). The whole reader is inlined in page.evaluate (Playwright only serializes the passed fn).
function capturePipelineState() {
  const canvas = document.querySelector("#post-canvas");
  if (!canvas) return { error: "no #post-canvas" };
  let svg = canvas.querySelector("[data-pipeline]");
  if (!svg) {
    for (const s of canvas.querySelectorAll("svg")) {
      if ((s.getAttribute("viewBox") || "").trim() === "0 0 1000 280") { svg = s; break; }
    }
  }
  if (!svg) return { error: "no Pipeline svg (viewBox 0 0 1000 280) found" };
  const r4 = (x) => Math.round((x + Number.EPSILON) * 1e4) / 1e4;
  const numAttr = (el, a) => { const v = el.getAttribute(a); return v == null ? null : r4(+v); };
  const rects = [...svg.querySelectorAll("rect")].map((el) => {
    const cs = getComputedStyle(el);
    return {
      x: numAttr(el, "x"), y: numAttr(el, "y"), w: numAttr(el, "width"), h: numAttr(el, "height"),
      rx: numAttr(el, "rx"),
      fill: cs.fill,
      stroke: cs.stroke,
      strokeWidth: +parseFloat(cs.strokeWidth).toFixed(3),
      opacity: +parseFloat(cs.opacity).toFixed(3),
      filter: cs.filter,
    };
  });
  const texts = [...svg.querySelectorAll("text")].map((el) => {
    const cs = getComputedStyle(el);
    return {
      text: (el.textContent || "").trim(),
      x: numAttr(el, "x"), y: numAttr(el, "y"),
      anchor: el.getAttribute("text-anchor") || cs.textAnchor,
      fontSize: +parseFloat(cs.fontSize).toFixed(2),
      fontFamily: cs.fontFamily.split(",")[0].replace(/['"]/g, ""),
      fontWeight: cs.fontWeight,
      letterSpacing: cs.letterSpacing,
      fill: cs.fill,
      opacity: +parseFloat(cs.opacity).toFixed(3),
    };
  });
  const lines = [...svg.querySelectorAll("line")].map((el) => {
    const cs = getComputedStyle(el);
    return {
      x1: numAttr(el, "x1"), y1: numAttr(el, "y1"), x2: numAttr(el, "x2"), y2: numAttr(el, "y2"),
      stroke: cs.stroke,
      strokeWidth: +parseFloat(cs.strokeWidth).toFixed(3),
      opacity: +parseFloat(cs.opacity).toFixed(3),
    };
  });
  const circles = [...svg.querySelectorAll("circle")].map((el) => {
    const cs = getComputedStyle(el);
    return { cx: numAttr(el, "cx"), cy: numAttr(el, "cy"), r: numAttr(el, "r"), fill: cs.fill };
  });
  // Per-group opacity (the reveal mechanism — each connector/node/endpoint is an <g opacity=…>).
  const groups = [...svg.querySelectorAll(":scope > g")].map((g, i) => ({
    i,
    opacity: +parseFloat(getComputedStyle(g).opacity).toFixed(3),
  }));
  return {
    viewBox: svg.getAttribute("viewBox"),
    nodeCount: svg.querySelectorAll("*").length,
    rects,
    texts,
    lines,
    circles,
    groups,
  };
}

async function loadPipeline(page, id, t = 1) {
  await page.goto(`${BASE}/?id=${encodeURIComponent(id)}&t=${t}`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForSelector("#post-canvas", { timeout: 20000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(200);
  return page.evaluate(capturePipelineState);
}

async function captureBaseline() {
  await mkdir(BASELINE_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    for (const id of BASELINE_FIXTURES) {
      const state = await loadPipeline(page, id, 1);
      if (state.error) {
        console.error(`✖ ${id}: ${state.error}`);
        process.exitCode = 1;
        continue;
      }
      await writeFile(join(BASELINE_DIR, `${id}.t1.json`), JSON.stringify(state, null, 2));
      console.log(`captured ${id}.t1.json — ${state.rects.length} rects, ${state.texts.length} texts, ${state.lines.length} lines, ${state.circles.length} circles, nodeCount ${state.nodeCount}`);
    }
  } finally {
    await browser.close();
  }
}

// ── THE HEADLINE CHECK — post-refactor t=1 == captured pre-retrofit baseline, field-for-field ────────
async function baselineRegressionSuite(page) {
  console.log(`Byte-identity vs pre-retrofit baseline (${BASELINE_DIR.replace(ROOT, ".")}):`);
  for (const id of BASELINE_FIXTURES) {
    let baseline;
    try {
      baseline = JSON.parse(await readFile(join(BASELINE_DIR, `${id}.t1.json`), "utf8"));
    } catch {
      check(false, `${id}: baseline missing`, "run `node tools/qa-pipeline.mjs --baseline-capture` on the PRE-retrofit renderer");
      continue;
    }
    const cur = await loadPipeline(page, id, 1);
    if (cur.error) {
      check(false, `${id}: ${cur.error}`);
      continue;
    }
    let ok = true;
    let detail = "";
    const posTol = 0.5; // viewBox-px tolerance (attrs are exact; tolerance for any float formatting)
    const fontTol = 0.5;
    if (cur.viewBox !== baseline.viewBox) { ok = false; detail = `viewBox ${cur.viewBox} vs ${baseline.viewBox}`; }
    // Rects (node chips) — count + every attr.
    if (cur.rects.length !== baseline.rects.length) { ok = false; detail = `rect count ${cur.rects.length} vs ${baseline.rects.length}`; }
    else {
      for (let i = 0; i < baseline.rects.length; i++) {
        const b = baseline.rects[i], c = cur.rects[i];
        for (const k of ["x", "y", "w", "h", "rx"]) if (Math.abs((c[k] ?? 0) - (b[k] ?? 0)) > posTol) { ok = false; detail = `rect[${i}].${k} ${c[k]} vs ${b[k]}`; }
        if (c.fill !== b.fill) { ok = false; detail = `rect[${i}] fill ${c.fill} vs ${b.fill}`; }
        if (c.stroke !== b.stroke) { ok = false; detail = `rect[${i}] stroke ${c.stroke} vs ${b.stroke}`; }
        if (Math.abs(c.opacity - b.opacity) > 0.01) { ok = false; detail = `rect[${i}] opacity ${c.opacity} vs ${b.opacity}`; }
        if (c.filter !== b.filter) { ok = false; detail = `rect[${i}] filter differs`; }
      }
    }
    // Texts (per-step eyebrow, node step "NN", cumulative labels, endLabel, END-TO-END) — count + attrs.
    if (cur.texts.length !== baseline.texts.length) { ok = false; detail = `text count ${cur.texts.length} vs ${baseline.texts.length}`; }
    else {
      for (let i = 0; i < baseline.texts.length; i++) {
        const b = baseline.texts[i], c = cur.texts[i];
        if (c.text !== b.text) { ok = false; detail = `text[${i}] "${c.text}" vs "${b.text}"`; }
        for (const k of ["x", "y"]) if (Math.abs((c[k] ?? 0) - (b[k] ?? 0)) > posTol) { ok = false; detail = `text[${i}] "${c.text}" ${k} ${c[k]} vs ${b[k]}`; }
        if (Math.abs(c.fontSize - b.fontSize) > fontTol) { ok = false; detail = `text[${i}] font ${c.fontSize} vs ${b.fontSize}`; }
        if (c.fill !== b.fill) { ok = false; detail = `text[${i}] fill ${c.fill} vs ${b.fill}`; }
        if (c.anchor !== b.anchor) { ok = false; detail = `text[${i}] anchor ${c.anchor} vs ${b.anchor}`; }
        if (c.fontFamily !== b.fontFamily) { ok = false; detail = `text[${i}] family ${c.fontFamily} vs ${b.fontFamily}`; }
        if (c.fontWeight !== b.fontWeight) { ok = false; detail = `text[${i}] weight ${c.fontWeight} vs ${b.fontWeight}`; }
        if (c.letterSpacing !== b.letterSpacing) { ok = false; detail = `text[${i}] letterSpacing ${c.letterSpacing} vs ${b.letterSpacing}`; }
        if (Math.abs(c.opacity - b.opacity) > 0.01) { ok = false; detail = `text[${i}] "${c.text}" opacity ${c.opacity} vs ${b.opacity}`; }
      }
    }
    // Lines (connector base + signal trail) — count + every attr.
    if (cur.lines.length !== baseline.lines.length) { ok = false; detail = `line count ${cur.lines.length} vs ${baseline.lines.length}`; }
    else {
      for (let i = 0; i < baseline.lines.length; i++) {
        const b = baseline.lines[i], c = cur.lines[i];
        for (const k of ["x1", "y1", "x2", "y2"]) if (Math.abs((c[k] ?? 0) - (b[k] ?? 0)) > posTol) { ok = false; detail = `line[${i}].${k} ${c[k]} vs ${b[k]}`; }
        if (c.stroke !== b.stroke) { ok = false; detail = `line[${i}] stroke ${c.stroke} vs ${b.stroke}`; }
        if (Math.abs(c.strokeWidth - b.strokeWidth) > 0.05) { ok = false; detail = `line[${i}] strokeW ${c.strokeWidth} vs ${b.strokeWidth}`; }
        if (Math.abs(c.opacity - b.opacity) > 0.01) { ok = false; detail = `line[${i}] opacity ${c.opacity} vs ${b.opacity}`; }
      }
    }
    // Circles (the signal dot) — count + every attr. At t=1 signalProgress is settled; the legacy hides
    // the dot when signalProgress ≥ 0.998, so the count is part of the byte-identity guarantee.
    if (cur.circles.length !== baseline.circles.length) { ok = false; detail = `circle count ${cur.circles.length} vs ${baseline.circles.length}`; }
    else {
      for (let i = 0; i < baseline.circles.length; i++) {
        const b = baseline.circles[i], c = cur.circles[i];
        for (const k of ["cx", "cy", "r"]) if (Math.abs((c[k] ?? 0) - (b[k] ?? 0)) > posTol) { ok = false; detail = `circle[${i}].${k} ${c[k]} vs ${b[k]}`; }
        if (c.fill !== b.fill) { ok = false; detail = `circle[${i}] fill ${c.fill} vs ${b.fill}`; }
      }
    }
    check(ok, `${id}: t=1 == pre-retrofit baseline (viewBox + every chip rect / step+cumulative label / connector / endpoint / signal-dot byte-identical)`, detail);
  }
}

// ── 1. Unit suite (pure — no DOM) ─────────────────────────────────────────────
function unitSuite() {
  const mkNode = (step, cumulativeLabel) => ({ step, cumulativeLabel });
  const mkNodes = (n) => Array.from({ length: n }, (_, i) => mkNode(i + 1, `${100 - i}%`));

  console.log("U1 — node layout along the track (equal-weight, evenly spaced; gap from N):");
  const u1 = planPipeline({ nodes: mkNodes(3), perStepLabel: "99% per step", endLabel: "78%", endAccent: "burnt" });
  check(u1.n === 3, "node count passes through (no cap)", `${u1.n}`);
  check(approx(u1.nodeX(0), u1.padLeft), "node 0 x == padLeft", `${u1.nodeX(0)} vs ${u1.padLeft}`);
  check(approx(u1.nodes[0].x, u1.padLeft) && approx(u1.nodes[1].x, u1.padLeft + u1.nodeWidth + u1.nodeGap), "nodes step by nodeWidth+gap", `${u1.nodes[1].x}`);
  check(approx(u1.nodes[0].centerX, u1.padLeft + u1.nodeWidth / 2), "node centerX == x + nodeWidth/2");
  check(u1.nodes.every((nd) => Number.isFinite(nd.x) && Number.isFinite(nd.centerX)), "all node geometry finite (no NaN)");

  console.log("U2 — nodeGap arithmetic: (nodeAreaWidth − N·nodeWidth)/(N−1) for N>1, 0 for N≤1:");
  const u2 = planPipeline({ nodes: mkNodes(4) });
  check(approx(u2.nodeGap, (u2.nodeAreaWidth - 4 * u2.nodeWidth) / 3), "gap distributes the slack evenly", `${u2.nodeGap}`);
  const u2single = planPipeline({ nodes: mkNodes(1) });
  check(u2single.nodeGap === 0, "single node → gap 0 (no divide-by-zero)", `${u2single.nodeGap}`);

  console.log("U3 — signal-dot path (first → last node center):");
  const u3 = planPipeline({ nodes: mkNodes(5) });
  check(approx(u3.firstCenterX, u3.nodes[0].centerX) && approx(u3.lastCenterX, u3.nodes[4].centerX), "signal path endpoints == first/last node centers");
  check(approx(signalX(u3, 0), u3.firstCenterX) && approx(signalX(u3, 1), u3.lastCenterX), "signalX(0)=first, signalX(1)=last");
  check(signalX(u3, 0.5) > u3.firstCenterX && signalX(u3, 0.5) < u3.lastCenterX, "signalX(0.5) ∈ (first,last)");

  console.log(`U4 — MAX_NODES cap (over ${MAX_NODES} → fitNodes even-stride downsample, keep first+last):`);
  const raw = mkNodes(20);
  const u4 = planPipeline({ nodes: raw });
  check(u4.n === MAX_NODES, `over-cap downsampled to exactly ${MAX_NODES}`, `${u4.n}`);
  check(u4.nodes[0].step === raw[0].step && u4.nodes[u4.n - 1].step === raw[raw.length - 1].step, "first + last node ALWAYS kept", `${u4.nodes[0].step}..${u4.nodes[u4.n - 1].step}`);
  check(u4.dropped.nodesDropped === 20 - MAX_NODES, "dropped nodes surfaced via a counter (never silent)", `got ${u4.dropped.nodesDropped}`);
  const u4at = planPipeline({ nodes: mkNodes(MAX_NODES) });
  check(u4at.n === MAX_NODES && u4at.dropped.nodesDropped === 0, `exactly ${MAX_NODES} nodes → no drop (cap is a no-op at the boundary)`, `${u4at.n}/${u4at.dropped.nodesDropped}`);
  // fitNodes is exported + generic — sanity that it keeps first+last on a raw array too.
  const fit = fitNodes(Array.from({ length: 11 }, (_, i) => i));
  check(fit.length === MAX_NODES && fit[0] === 0 && fit[fit.length - 1] === 10, "fitNodes generic: keeps first+last, ≤MAX_NODES", fit.join(","));

  console.log("U5 — degenerate input (empty / single node) → finite geometry, no NaN, no throw:");
  const u5empty = planPipeline({ nodes: [] });
  check(u5empty.n === 0 && Number.isFinite(u5empty.firstCenterX) && Number.isFinite(u5empty.lastCenterX), "empty track → 0 nodes, finite signal endpoints", `n=${u5empty.n}`);
  const u5one = planPipeline({ nodes: [mkNode(1, "95%")] });
  check(u5one.n === 1 && Number.isFinite(u5one.nodes[0].x) && approx(u5one.firstCenterX, u5one.lastCenterX), "single node → finite x; first==last center (zero-length signal path)");

  console.log("U6 — accent resolution (missing/invalid → valid fallback; surfaced):");
  const u6 = planPipeline({ nodes: mkNodes(2), endAccent: "bogus" });
  check(ACCENTS.includes(u6.endAccent), "invalid endAccent → valid fallback", u6.endAccent);
  check(u6.dropped.invalidAccents === 1, "invalid accent surfaced via a counter", `got ${u6.dropped.invalidAccents}`);
  const u6ok = planPipeline({ nodes: mkNodes(2), endAccent: "amber" });
  check(u6ok.endAccent === "amber" && u6ok.dropped.invalidAccents === 0, "a valid accent passes through");
  const u6none = planPipeline({ nodes: mkNodes(2) });
  check(ACCENTS.includes(u6none.endAccent) && u6none.dropped.invalidAccents === 0, "missing accent → default, NOT surfaced as invalid", u6none.endAccent);

  console.log("U7 — cumulative + per-step + end labels pass through verbatim:");
  const u7 = planPipeline({ nodes: [mkNode(1, "95%"), mkNode(2, "90%")], perStepLabel: "95% PER STEP", endLabel: "60%" });
  check(u7.perStepLabel === "95% PER STEP" && u7.endLabel === "60%", "perStepLabel + endLabel pass through");
  check(u7.nodes[0].cumulativeLabel === "95%" && u7.nodes[1].cumulativeLabel === "90%", "cumulative labels pass through per node");
  const u7n = planPipeline({ nodes: [{ step: 1 }] });
  check(u7n.nodes[0].cumulativeLabel === "" && u7n.perStepLabel === "" && u7n.endLabel === "", "missing labels → empty string (never undefined)");

  console.log("U8 — per-node passedThreshold (chip-light trigger == legacy (i+1)/N − 0.02):");
  const u8 = planPipeline({ nodes: mkNodes(4) });
  check(u8.nodes.every((nd, i) => approx(nd.passedThreshold, (i + 1) / 4 - 0.02)), "passedThreshold == (i+1)/N − 0.02 per node");

  console.log("U9 — cumulative label fit FLAG (over-wide flagged, never hidden; surfaced):");
  const u9 = planPipeline({ nodes: [mkNode(1, "x".repeat(MAX_LABEL_CHARS + 20)), mkNode(2, "9%")] });
  check(u9.nodes[0].cumulativeOverflowRisk === true, "an absurdly long cumulative label is FLAGGED (overflow risk)");
  check(u9.nodes[0].cumulativeLabel.length > 0, "the over-long label is still RENDERED (flag, not hide — legacy parity)");
  check(u9.dropped.labelsOverflow >= 1, "over-wide label surfaced via a counter", `got ${u9.dropped.labelsOverflow}`);
  check(u9.nodes[1].cumulativeOverflowRisk === false, "a short label is not flagged");

  console.log("U10 — reveal arithmetic: nodeOpacity / cumulativeOpacity ∈ [0,1]; reveal=1 → all 1:");
  const n = 5;
  check([0, 0.5, 1].every((r) => [0, 1, 2, 3, 4].every((i) => { const o = nodeOpacity(r, i, n); return o >= 0 && o <= 1; })), "nodeOpacity ∈ [0,1] across the range");
  check([0, 1, 2, 3, 4].every((i) => approx(nodeOpacity(1, i, n), 1)), "nodeOpacity(reveal=1) == 1 for every node (settled)");
  check([0, 0.5, 1].every((r) => [0, 1, 2, 3, 4].every((i) => { const o = cumulativeOpacity(r, i, n); return o >= 0 && o <= 1; })), "cumulativeOpacity ∈ [0,1] across the range");
  // Legacy parity: the cumulative label opacity is (signal − (i+1)/n + 0.04)·(n·2). At signal=1 the
  // EARLIER labels (trigger fired with margin) are fully shown; the LAST label (trigger==1) lands at
  // exactly 0.4 — a PRE-EXISTING property of the original arithmetic, reproduced byte-identically (the
  // earlier labels reaching 1 is the settle signal; the final label's partial opacity is by design).
  check([0, 1, 2, 3].every((i) => approx(cumulativeOpacity(1, i, n), 1)), "cumulativeOpacity(signal=1) == 1 for the non-final nodes (settled, legacy parity)");
  check(approx(cumulativeOpacity(1, n - 1, n), 0.4), "cumulativeOpacity(signal=1) for the LAST node == 0.4 (legacy arithmetic preserved)", `${cumulativeOpacity(1, n - 1, n)}`);
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
const overlap = (A, B) => {
  const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
  const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
  return ox > 1 && oy > 1 ? Math.min(ox, oy) : 0;
};

// ── 2. Sampled-t DOM suite ─────────────────────────────────────────────────────
async function geometrySuite(page) {
  for (const id of FIXTURES) {
    const spec = await specFor(id);
    const v = spec.visualization;
    const plan = planPipeline({
      nodes: (v.nodes || []).map((n) => ({ step: n.step, cumulativeLabel: n.cumulative })),
      perStepLabel: v.perStepLabel,
      endLabel: v.endLabel,
      endAccent: v.endAccent,
    });
    console.log(`Sampled-t DOM pass — ${id} (nodes:${plan.n} dropped:${plan.dropped.nodesDropped}, t ∈ {${T_SAMPLES.join(", ")}}):`);

    const reports = await sampleFixture(page, id, T_SAMPLES);
    const base = reports[1];
    const P = base.pipeline;
    if (!check(!!P, "pipeline section present at t=1 (data-pipeline-* hooks)")) continue;

    // C1 — viewBox 1000×280 (the declared constraint), constant node count across all samples
    // (nothing mounts/unmounts mid-reveal — layout reserved from Beat 1; reveals drive opacity only).
    check(P.viewBox === `0 0 ${VIEW_W} ${VIEW_H}`, `C1: viewBox 0 0 ${VIEW_W} ${VIEW_H}`, P.viewBox);
    check(P.chipCount === plan.n, `C1: rendered chip count == plan.n (${plan.n})`, `${P.chipCount}`);
    // node count constant across samples EXCEPT the signal dot, which the legacy hides at t<0.002 /
    // t>0.998 (a deliberate mount/unmount of ONE circle) — so compare the CHIP layout, not raw nodeCount.
    check(
      T_SAMPLES.every((t) => reports[t].pipeline?.chipCount === P.chipCount),
      `C1: chip count constant (${P.chipCount}) across all samples (layout-reserved)`,
      T_SAMPLES.map((t) => reports[t].pipeline?.chipCount).join(","),
    );

    // C-geometry-static — every chip's LAYOUT attrs (x/y/w/h — viewBox px, transform-blind) are
    // byte-identical across all 10 samples; only the group opacity / chip stroke (lit) moves.
    let geomOk = true, geomDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].pipeline;
      for (let i = 0; i < P.chips.length; i++) {
        const a = P.chips[i], c = d.chips[i];
        if (!c) { geomOk = false; geomDetail = `chip ${i} missing at t=${t}`; continue; }
        for (const k of ["x", "y", "w", "h"]) if (Math.abs(a[k] - c[k]) > 0.5) { geomOk = false; geomDetail = `chip ${i}.${k} drifts at t=${t}`; }
      }
    }
    check(geomOk, "C-geometry-static: every chip rect (x/y/w/h) identical across all 10 samples", geomDetail);

    // C2 — chips 56×56 within the viewBox (no overflow): every chip ⊆ [0,VIEW_W]×[0,VIEW_H].
    let inBox = true, inDetail = "";
    for (const c of P.chips) {
      if (Math.abs(c.w - NODE_WIDTH) > 0.5 || Math.abs(c.h - NODE_HEIGHT) > 0.5) { inBox = false; inDetail = `chip ${c.w}×${c.h} ≠ ${NODE_WIDTH}×${NODE_HEIGHT}`; }
      if (c.x < -0.5 || c.y < -0.5 || c.x + c.w > VIEW_W + 0.5 || c.y + c.h > VIEW_H + 0.5) { inBox = false; inDetail = `chip at x${c.x} y${c.y} exceeds ${VIEW_W}×${VIEW_H}`; }
    }
    check(inBox, `C2: every chip is ${NODE_WIDTH}×${NODE_HEIGHT} within the ${VIEW_W}×${VIEW_H} viewBox (no overflow)`, inDetail);

    // C4 — the signal dot (when present) sits on the track centerline and within [first,last] center x.
    for (const t of T_SAMPLES) {
      const d = reports[t].pipeline;
      if (d.signalDot) {
        const onTrack = Math.abs(d.signalDot.cy - TRACK_Y) < 0.5;
        const inSpan = d.signalDot.cx >= plan.firstCenterX - 1 && d.signalDot.cx <= plan.lastCenterX + 1;
        if (!onTrack || !inSpan) { check(false, `C4: signal dot on track + within [first,last] center at t=${t}`, `cx=${d.signalDot.cx} cy=${d.signalDot.cy}`); }
      }
    }
    check(true, "C4: signal dot on the track centerline + within [firstCenter, lastCenter] at every sample");

    // C5 — fonts: per-step eyebrow + cumulative labels axisLabel (24); node step "NN" 22px mono.
    let fontOk = true, fontDetail = "";
    for (const l of P.cumulativeLabels) {
      if (Math.abs(l.fontSize - CUMULATIVE_FONT) > 0.5) { fontOk = false; fontDetail = `cumulative "${(l.text || "").slice(0, 8)}" font ${l.fontSize} ≠ ${CUMULATIVE_FONT}`; }
    }
    check(fontOk, `C5: cumulative labels ${CUMULATIVE_FONT}px`, fontDetail);
    check(P.stepLabels.every((s) => Math.abs(s.fontSize - STEP_FONT) < 0.5 && (/mono/i.test(s.fontFamily) || /JetBrains/i.test(s.fontFamily))), `C5: node step labels ${STEP_FONT}px mono`, P.stepLabels.map((s) => s.fontSize).join(","));

    // C-no-label-overlap — consecutive cumulative labels never overlap (the ≥ pitch rule). They are
    // centered under each chip; check the painted text rects don't collide. (Skip the over-long stress
    // fixture, whose label is intentionally flagged-over-wide.)
    if (id !== "fuzz-113-pipeline-longlabel") {
      let labOk = true, labDetail = "";
      const sorted = [...P.cumulativeLabels].filter((l) => (l.text || "").length > 0).sort((a, b) => a.rect.x - b.rect.x);
      for (let i = 1; i < sorted.length; i++) {
        const ov = overlap(sorted[i].rect, sorted[i - 1].rect);
        if (ov > 1) { labOk = false; labDetail = `cumulative labels overlap by ${ov.toFixed(1)}px`; }
      }
      check(labOk, "C-no-label-overlap: consecutive cumulative labels never overlap", labDetail);
    }

    // C-reveal — every group opacity ∈ [0,1] across all samples; chips fully revealed at t=1.
    let revOk = true, revDetail = "";
    for (const t of T_SAMPLES) {
      for (const g of reports[t].pipeline.groups) {
        if (g.opacity < -0.001 || g.opacity > 1.001) { revOk = false; revDetail = `group opacity ${g.opacity} ∉ [0,1] at t=${t}`; }
      }
    }
    check(revOk, "C-reveal: every group opacity ∈ [0,1] across all samples", revDetail);
    check(P.chips.every((c) => approx(c.opacity, 1, 0.02)), "all node chips fully revealed (opacity 1) at t=1", P.chips.map((c) => c.opacity).join(","));

    // C-settle — at the FINAL frame (t=1) the endpoint + nodes are settled (opacity 1) and the signal
    // dot is OMITTED (the legacy hides it when signalProgress ≥ 0.998). The reveal is opacity-only.
    check(reports[1].pipeline.signalDot == null, "C-settle: signal dot omitted at the final frame t=1 (signal arrived)", reports[1].pipeline.signalDot ? "present" : "");
    check(P.endpoint == null || approx(P.endpoint.opacity, 1, 0.02), "C-settle: endpoint fully revealed (opacity 1) at t=1", P.endpoint ? `${P.endpoint.opacity}` : "no endpoint");

    // C6 — the defensive clamps are surfaced (never silent). The cap is asserted on every fixture; the
    // stress fixtures additionally prove the specific clamp behaviour.
    check(plan.n <= MAX_NODES, `C6: ≤ ${MAX_NODES} nodes (cap)`, `${plan.n}`);
    check(plan.nodes.every((nd) => Number.isFinite(nd.x) && Number.isFinite(nd.centerX)), "C6: every node geometry finite (no NaN)");
    if (id === "fuzz-112-pipeline-overcap") {
      check(plan.dropped.nodesDropped > 0, "C6: over-cap nodes dropped + surfaced", `got ${plan.dropped.nodesDropped}`);
      check(plan.n === MAX_NODES, `C6: over-cap track downsampled to exactly ${MAX_NODES}`, `${plan.n}`);
      check(P.chipCount === MAX_NODES, `C6: rendered chips == ${MAX_NODES} (fitNodes contained the track)`, `${P.chipCount}`);
    }
    if (id === "fuzz-113-pipeline-longlabel") {
      check(plan.dropped.labelsOverflow > 0, "C6: the over-long cumulative label is flagged + surfaced", `got ${plan.dropped.labelsOverflow}`);
    }
    if (id === "fuzz-114-pipeline-single") {
      check(plan.n === 1 && P.chipCount === 1, "C6: single-node track → exactly 1 chip", `${plan.n}/${P.chipCount}`);
    }
    if (id === "fuzz-115-pipeline-empty") {
      check(plan.n === 0 && P.chipCount === 0, "C6: empty track → 0 chips, no NaN, no throw", `${plan.n}/${P.chipCount}`);
    }

    // C-mobile — gating arrays clean at every sample (the SANE-input fixtures); textCoverage bounded.
    if (CLEAN_GATING_FIXTURES.has(id)) {
      assertGatingClean(check, reports, T_SAMPLES, " (C-mobile)");
    }
    check(base.textCoverage < 0.42, `textCoverage ${base.textCoverage} < 0.42 at t=1 (C-mobile)`);
  }
}

// ── Entry ──────────────────────────────────────────────────────────────────────
if (BASELINE_CAPTURE) {
  console.log(`Capturing the PRE-retrofit pipeline t=1 baseline → ${BASELINE_DIR.replace(ROOT, ".")} (needs the dev server at ${BASE})\n`);
  await captureBaseline();
  console.log("\n✔ baseline captured");
  process.exit(process.exitCode || 0);
}

unitSuite();
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
