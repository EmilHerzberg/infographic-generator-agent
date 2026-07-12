#!/usr/bin/env node
// PL-4.3 deterministic gate — ComparisonMatrix (the `matrix` viz kind) 2×2 decision-matrix
// primitive (no LLM). The FIRST sub-task of the PL-4.3 legacy-retrofit sprint: it modernizes the
// project's original ComparisonMatrix onto a pure planner (src/lib/matrix.ts) + this gate, while
// keeping the painted t=1 frame BYTE-IDENTICAL to the pre-retrofit code (the non-negotiable gate).
//
// ComparisonMatrix is a CSS-GRID primitive (3 cols × 3 rows: row1 = col headers, col1 = row headers,
// 2×2 = data cells), NOT an SVG-viewBox one — so the baseline + checks read the rendered CSS
// boxes/text/fonts (like the comparison/reveal gates), not a viewBox.
//
//   node tools/qa-matrix.mjs --baseline-capture  # STEP 1 (run on the PRE-retrofit code): capture the
//                                                 # current matrix t=1 DOM structurally → baselines/pl-4.3-matrix/
//   node tools/qa-matrix.mjs --unit               # planMatrix decision tables (U1–U8; no dev server)
//   npm run dev                                   # in another terminal — DOM passes need the dev server
//   npm run qa:matrix                             # full: baseline byte-identity + unit + sampled-t DOM pass
//
// Covers handoff §1 (byte-identity contract) + §2A (ComparisonMatrix). THE HEADLINE CHECK: the
// post-refactor t=1 structural read == the captured pre-retrofit baseline, field-for-field
// (every painted cell/header/value/delta box + text + font + fill + grid layout). Then: the planMatrix
// unit suite (U1–U8) and a sampled-t DOM pass (geometry layout-reserved across t, focus reveal ∈[0,1],
// settle at t≥0.85, mobile floors via assertGatingClean, the numbered constraints C1–C8).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BASE, VIEWPORT, sampleFixture, assertGatingClean } from "./lib/sampled-t.mjs";
import {
  planMatrix,
  cellReveal,
  cellDim,
  ACCENTS,
  VALUE_FONT,
  VALUE_MIN_FONT,
  DELTA_FONT,
  HEADER_FONT,
  MAX_DELTA_CODEPOINTS,
} from "../src/lib/matrix.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UNIT_ONLY = process.argv.includes("--unit");
const BASELINE_CAPTURE = process.argv.includes("--baseline-capture");
const BASELINE_DIR = join(ROOT, "planning", "primitive-library", "baselines", "pl-4.3-matrix");

// The matrix fixtures — basic, highlight, over-long (fit-or-hide), sparse (defensive defaults). Each
// renders through PostRenderer's `matrix` branch.
const FIXTURES = [
  "fuzz-103-matrix-basic",
  "fuzz-104-matrix-highlight",
  "fuzz-105-matrix-overlong",
  "fuzz-106-matrix-sparse",
];

// THE BYTE-IDENTITY set — only the fixtures whose painted output the retrofit MUST preserve: the
// in-spec ones (basic / highlight / sparse) where every defensive clamp is a NO-OP. fuzz-105 is the
// over-long STRESS fixture authored to EXERCISE the new fit-or-hide clamp (C6) — its post-retrofit
// render INTENTIONALLY differs from the pre-clamp render (a brand-new fixture, no shipping render to
// protect), so it is covered by the unit + sampled-t passes, NOT the byte-identity regression.
const BASELINE_FIXTURES = [
  "fuzz-103-matrix-basic",
  "fuzz-104-matrix-highlight",
  "fuzz-106-matrix-sparse",
];

const T_SAMPLES = [0, 0.2, 0.32, 0.42, 0.54, 0.66, 0.78, 0.85, 0.92, 1];
const fixturePath = (id) => join(ROOT, "planning", "fixtures", "renderfuzz", `${id}.render.json`);
const specFor = async (id) => JSON.parse(await readFile(fixturePath(id), "utf8"));

let failures = 0;
const check = (ok, name, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "✔" : "✖"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  return ok;
};
const approx = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// ── Structural, renderer-agnostic capture of the CURRENT ComparisonMatrix grid (the capture-first
//    discipline). Reads the matrix BY STRUCTURE — the grid container's 3×3 children, each child's
//    canvas-local box + every text leaf inside it (text + effective font-size + fill/color + family +
//    transform). Deliberately NOT keyed to the new inspect `matrix` section / data-matrix-* hooks, so it
//    runs on the PRE-retrofit code (which has no hooks). Finds the grid as the canvas's display:grid
//    element with three column tracks (col1 = row-header gutter, col2/3 = data) — the ComparisonMatrix
//    root div. The whole reader is inlined in page.evaluate (Playwright only serializes the passed fn).
async function loadMatrix(page, id, t = 1) {
  await page.goto(`${BASE}/?id=${encodeURIComponent(id)}&t=${t}`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForSelector("#post-canvas", { timeout: 20000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(200); // let FitLine's layout-effect (value zoom) settle
  return page.evaluate(() => {
    const canvas = document.querySelector("#post-canvas");
    if (!canvas) return { error: "no #post-canvas" };
    const cb = canvas.getBoundingClientRect();
    const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
    const toLocal = (r) => ({ x: r2(r.left - cb.left), y: r2(r.top - cb.top), w: r2(r.width), h: r2(r.height) });
    const cumZoom = (el) => {
      let z = 1;
      for (let n = el; n && n !== canvas.parentElement; n = n.parentElement) {
        const zv = parseFloat(getComputedStyle(n).zoom);
        if (Number.isFinite(zv) && zv > 0) z *= zv;
      }
      return z;
    };
    // Prefer the explicit hook (post-refactor); fall back to the structural search (pre-retrofit code
    // has no hook) — both identify the SAME ComparisonMatrix root: the display:grid div whose template
    // resolves to exactly THREE column tracks (col1 = row-header gutter + the 2 data columns). The
    // #post-canvas grid has no column template (≠3 tracks) and the metrics grid has ≤2 here, so neither
    // is matched.
    let grid = canvas.querySelector("[data-matrix]");
    if (!grid) {
      for (const el of canvas.querySelectorAll("div")) {
        const cs = getComputedStyle(el);
        if (cs.display !== "grid") continue;
        const cols = (cs.gridTemplateColumns || "").trim().split(/\s+/).filter(Boolean);
        if (cols.length !== 3) continue;
        grid = el;
        break;
      }
    }
    if (!grid) return { error: "no matrix grid (3-col display:grid) found" };
    const children = [...grid.children];
    const cells = children.map((child) => {
      const all = [...child.querySelectorAll("*"), child];
      const textEls = all.filter((el) =>
        [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim().length > 0)
      );
      const leaves = textEls.filter((el) => !textEls.some((o) => o !== el && el.contains(o)));
      const texts = leaves.map((el) => {
        const cs = getComputedStyle(el);
        return {
          text: (el.textContent || "").trim().replace(/\s+/g, " "),
          fontSize: +(parseFloat(cs.fontSize) * cumZoom(el)).toFixed(2),
          color: cs.color,
          fontFamily: cs.fontFamily.split(",")[0].replace(/['"]/g, ""),
          textTransform: cs.textTransform,
          rect: toLocal(el.getBoundingClientRect()),
        };
      });
      const cs = getComputedStyle(child);
      return {
        rect: toLocal(child.getBoundingClientRect()),
        boxShadow: cs.boxShadow,
        background: cs.backgroundColor,
        opacity: +parseFloat(cs.opacity).toFixed(3),
        texts,
      };
    });
    return {
      grid: {
        cols: getComputedStyle(grid).gridTemplateColumns,
        rows: getComputedStyle(grid).gridTemplateRows,
        gap: getComputedStyle(grid).gap,
        rect: toLocal(grid.getBoundingClientRect()),
      },
      childCount: children.length,
      cells,
    };
  });
}

async function captureBaseline() {
  await mkdir(BASELINE_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    for (const id of BASELINE_FIXTURES) {
      const state = await loadMatrix(page, id, 1);
      if (state.error) {
        console.error(`✖ ${id}: ${state.error}`);
        process.exitCode = 1;
        continue;
      }
      await writeFile(join(BASELINE_DIR, `${id}.t1.json`), JSON.stringify(state, null, 2));
      const nTexts = state.cells.reduce((s, c) => s + c.texts.length, 0);
      console.log(`captured ${id}.t1.json — ${state.childCount} grid cells, ${nTexts} text leaves`);
    }
  } finally {
    await browser.close();
  }
}

// ── THE HEADLINE CHECK — post-refactor t=1 == captured pre-retrofit baseline, field-for-field ──────
async function baselineRegressionSuite(page) {
  console.log(`Byte-identity vs pre-retrofit baseline (${BASELINE_DIR.replace(ROOT, ".")}):`);
  for (const id of BASELINE_FIXTURES) {
    let baseline;
    try {
      baseline = JSON.parse(await readFile(join(BASELINE_DIR, `${id}.t1.json`), "utf8"));
    } catch {
      check(false, `${id}: baseline missing`, "run `node tools/qa-matrix.mjs --baseline-capture` on the PRE-retrofit renderer");
      continue;
    }
    const cur = await loadMatrix(page, id, 1);
    if (cur.error) {
      check(false, `${id}: ${cur.error}`);
      continue;
    }
    let ok = true;
    let detail = "";
    const posTol = 0.6; // CSS-px tolerance for sub-pixel layout rounding
    const fontTol = 0.5;
    // Grid template + gap + container box.
    if (cur.grid.cols !== baseline.grid.cols) { ok = false; detail = `grid cols "${cur.grid.cols}" vs "${baseline.grid.cols}"`; }
    if (cur.grid.rows !== baseline.grid.rows) { ok = false; detail = `grid rows differ`; }
    if (cur.grid.gap !== baseline.grid.gap) { ok = false; detail = `grid gap "${cur.grid.gap}" vs "${baseline.grid.gap}"`; }
    for (const k of ["x", "y", "w", "h"]) if (Math.abs(cur.grid.rect[k] - baseline.grid.rect[k]) > posTol) { ok = false; detail = `grid rect.${k} ${cur.grid.rect[k]} vs ${baseline.grid.rect[k]}`; }
    if (cur.childCount !== baseline.childCount) { ok = false; detail = `child count ${cur.childCount} vs ${baseline.childCount}`; }
    else {
      for (let i = 0; i < baseline.cells.length; i++) {
        const b = baseline.cells[i], c = cur.cells[i];
        for (const k of ["x", "y", "w", "h"]) if (Math.abs(c.rect[k] - b.rect[k]) > posTol) { ok = false; detail = `cell[${i}] rect.${k} ${c.rect[k]} vs ${b.rect[k]}`; }
        if (c.boxShadow !== b.boxShadow) { ok = false; detail = `cell[${i}] boxShadow differs`; }
        if (c.background !== b.background) { ok = false; detail = `cell[${i}] background ${c.background} vs ${b.background}`; }
        if (Math.abs(c.opacity - b.opacity) > 0.01) { ok = false; detail = `cell[${i}] opacity ${c.opacity} vs ${b.opacity}`; }
        if (c.texts.length !== b.texts.length) { ok = false; detail = `cell[${i}] text count ${c.texts.length} vs ${b.texts.length}`; }
        else {
          for (let j = 0; j < b.texts.length; j++) {
            const bt = b.texts[j], ct = c.texts[j];
            if (ct.text !== bt.text) { ok = false; detail = `cell[${i}] text[${j}] "${ct.text}" vs "${bt.text}"`; }
            if (Math.abs(ct.fontSize - bt.fontSize) > fontTol) { ok = false; detail = `cell[${i}] text[${j}] font ${ct.fontSize} vs ${bt.fontSize}`; }
            if (ct.color !== bt.color) { ok = false; detail = `cell[${i}] text[${j}] color ${ct.color} vs ${bt.color}`; }
            if (ct.fontFamily !== bt.fontFamily) { ok = false; detail = `cell[${i}] text[${j}] family ${ct.fontFamily} vs ${bt.fontFamily}`; }
            if (ct.textTransform !== bt.textTransform) { ok = false; detail = `cell[${i}] text[${j}] transform ${ct.textTransform} vs ${bt.textTransform}`; }
            for (const k of ["x", "y", "w", "h"]) if (Math.abs(ct.rect[k] - bt.rect[k]) > posTol) { ok = false; detail = `cell[${i}] text[${j}] "${ct.text}" rect.${k} ${ct.rect[k]} vs ${bt.rect[k]}`; }
          }
        }
      }
    }
    check(ok, `${id}: t=1 == pre-retrofit baseline (grid + every cell box / shadow / value / delta / header text+font+fill byte-identical)`, detail);
  }
}

// ── 1. Unit suite (pure — no DOM) ─────────────────────────────────────────────
function unitSuite() {
  const mk = (value, delta, accent) => ({ value, delta, accent });

  console.log("U1 — cell content resolution + accent passthrough (the 4 cells, in tl/tr/bl/br order):");
  const u1 = planMatrix({
    rowHeaders: ["R0", "R1"],
    colHeaders: ["C0", "C1"],
    rowAccents: ["cyan", "burnt"],
    tl: mk("a", "da", "cyan"),
    tr: mk("b", "db", "cyan"),
    bl: mk("c", "dc", "burnt"),
    br: mk("d", "dd", "burnt"),
  });
  check(["tl", "tr", "bl", "br"].every((k) => u1.cells[k].value && u1.cells[k].accent), "all 4 cells resolved with value + accent");
  check(u1.cells.tl.accent === "cyan" && u1.cells.bl.accent === "burnt", "cell accents pass through", `${u1.cells.tl.accent}/${u1.cells.bl.accent}`);
  check(u1.colHeaders.length === 2 && u1.rowHeaders.length === 2, "2 col + 2 row headers");

  console.log("U2 — defensive defaults (missing cells/headers/accents → empty value, cyan, no NaN):");
  const u2 = planMatrix({});
  check(u2.cells.tl.value === "" && u2.cells.br.value === "", "missing cells → empty value (never undefined)");
  check(ACCENTS.includes(u2.cells.tl.accent), "missing accent → a valid accent key", u2.cells.tl.accent);
  check(u2.rowHeaders.length === 2 && u2.colHeaders.length === 2, "missing headers → two empty-string headers each");
  check(u2.dropped.missingCells >= 1, "missing cells surfaced via a counter (never silent)", `got ${u2.dropped.missingCells}`);

  console.log("U3 — unknown accent → fallback (never undefined / never an invalid key):");
  const u3 = planMatrix({ tl: mk("x", undefined, "bogus"), rowAccents: ["nope", "cyan"] });
  check(ACCENTS.includes(u3.cells.tl.accent), "unknown cell accent → valid fallback", u3.cells.tl.accent);
  check(u3.rowAccents.every((a) => ACCENTS.includes(a)), "unknown row accent → valid fallback", u3.rowAccents.join(","));
  check(u3.dropped.invalidAccents >= 1, "invalid accents surfaced via a counter", `got ${u3.dropped.invalidAccents}`);

  console.log("U4 — delta fit-or-hide (empty / over-long delta → hidden, never bleeds):");
  const u4e = planMatrix({ tl: mk("v", "", "cyan") });
  check(u4e.cells.tl.showDelta === false && u4e.cells.tl.deltaHideReason === "empty", "empty delta → hidden(empty)");
  const u4o = planMatrix({ tl: mk("v", "x".repeat(MAX_DELTA_CODEPOINTS + 20), "cyan") });
  check(u4o.cells.tl.showDelta === false && u4o.cells.tl.deltaHideReason === "tooLong", `over-${MAX_DELTA_CODEPOINTS}-cp delta → hidden(tooLong)`);
  const u4ok = planMatrix({ tl: mk("v", "per 1k", "cyan") });
  check(u4ok.cells.tl.showDelta === true, "a short delta shows");
  // No delta key at all → not shown, reason "empty" (matches the legacy `data.delta && (...)` guard).
  const u4n = planMatrix({ tl: { value: "v", accent: "cyan" } });
  check(u4n.cells.tl.showDelta === false, "missing delta key → no delta line (legacy guard parity)");

  console.log("U5 — value fit (value never hidden; the renderer FitLine-shrinks; planner flags over-long):");
  const u5 = planMatrix({ tl: mk("+1,234,567,890.45%", "d", "cyan") });
  check(u5.cells.tl.value === "+1,234,567,890.45%", "value passed through verbatim (FitLine shrinks at render)");
  check(u5.cells.tl.valueOverflowRisk === true, "an over-wide value is FLAGGED (valueOverflowRisk) for the gate's floor check");
  const u5s = planMatrix({ tl: mk("9ms", "d", "cyan") });
  check(u5s.cells.tl.valueOverflowRisk === false, "a short value is not flagged");

  console.log("U6 — focus logic: cellDim dims non-focused cells, focused/none → 1:");
  check(cellDim(null, "tl", 0.7) === 1, "focusOn=null → every cell at 1 (no dim)");
  check(cellDim("tl", "tl", 0.7) === 1, "the focused cell → 1");
  check(cellDim("tl", "br", 0.7) === 0.7, "a non-focused cell → focusLockOpacity");
  check(cellDim("bogus", "tl", 0.7) === 1, "an invalid focus key → no dim (treated as null)");

  console.log("U7 — highlight resolution (valid key | null | invalid → null):");
  check(planMatrix({ highlightCell: "tl" }).highlightCell === "tl", "valid highlight key passes through");
  check(planMatrix({ highlightCell: null }).highlightCell === null, "null highlight → null");
  check(planMatrix({ highlightCell: "zzz" }).highlightCell === null, "invalid highlight key → null (no false ring)");
  check(planMatrix({}).highlightCell === null, "absent highlight → null (PostRenderer default parity)");

  console.log("U8 — reveal arithmetic: cellReveal monotone in its own arg, ∈[0,1], pinned at 0/1:");
  check(cellReveal(0) === 0 && cellReveal(1) === 1, "cellReveal(0)=0, cellReveal(1)=1 (pinned)");
  check(cellReveal(0.5) > 0 && cellReveal(0.5) < 1, "cellReveal(0.5) ∈ (0,1)");
  check([0, 0.3, 0.6, 1].every((r) => cellReveal(r) >= 0 && cellReveal(r) <= 1), "cellReveal ∈ [0,1] across the range");
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
const rectEq = (a, b, tol = 0.6) => a && b && ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) <= tol);

// ── 2. Sampled-t DOM suite ─────────────────────────────────────────────────────
async function geometrySuite(page) {
  for (const id of FIXTURES) {
    const spec = await specFor(id);
    const v = spec.visualization;
    const plan = planMatrix(v);
    console.log(`Sampled-t DOM pass — ${id} (highlight:${plan.highlightCell}, t ∈ {${T_SAMPLES.join(", ")}}):`);

    const reports = await sampleFixture(page, id, T_SAMPLES);
    const base = reports[1];
    const M = base.matrix;
    if (!check(!!M, "matrix section present at t=1 (data-matrix-* hooks)")) continue;

    // C1 — FIXED 3×3 grid: 9 children, three column tracks, two row data-cell tracks. Constant node
    // count across all samples (nothing mounts/unmounts mid-reveal — layout reserved from Beat 1).
    check(M.childCount === 9, "C1: grid has exactly 9 cells (3×3, fixed 2×2 + headers)", `got ${M.childCount}`);
    check(M.cols.length === 3 && M.rows.length === 3, "C1: 3 column tracks × 3 row tracks", `${M.cols.length}×${M.rows.length}`);
    check(
      T_SAMPLES.every((t) => reports[t].matrix?.nodeCount === M.nodeCount),
      `C1: matrix node count constant (${M.nodeCount}) — nothing mounts/unmounts (layout-reserved)`,
      T_SAMPLES.map((t) => reports[t].matrix?.nodeCount).join(","),
    );

    // C-layout-reserved — every grid-child LAYOUT box (transform-blind offset*) is byte-identical across
    // all 10 samples; only opacity + the per-cell scale/translate transform move (a reveal, not a relayout).
    let geomOk = true, geomDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].matrix;
      for (let i = 0; i < M.cells.length; i++) {
        if (!rectEq(d.cells[i]?.layout, M.cells[i].layout)) { geomOk = false; geomDetail = `cell ${i} layout drifts at t=${t}`; }
      }
    }
    check(geomOk, "C-layout-reserved: every cell LAYOUT box identical across all 10 samples (≤0.6px)", geomDetail);

    // C2/C3 — header font 26 (eyebrow), uppercase, mono; value font (declared) 64; delta 22 mono.
    let fontOk = true, fontDetail = "";
    for (const h of M.headers) {
      if (Math.abs(h.fontSize - HEADER_FONT) > 0.5) { fontOk = false; fontDetail = `header "${(h.text || "").slice(0, 8)}" font ${h.fontSize} ≠ ${HEADER_FONT}`; }
      if (h.textTransform !== "uppercase") { fontOk = false; fontDetail = `header not uppercase`; }
      if (!/mono/i.test(h.fontFamily) && !/JetBrains/i.test(h.fontFamily)) { fontOk = false; fontDetail = `header family "${h.fontFamily}" not mono`; }
    }
    check(fontOk, `C2: headers ${HEADER_FONT}px mono uppercase`, fontDetail);

    let deltaOk = true, deltaDetail = "";
    for (const c of M.dataCells) {
      if (c.delta && Math.abs(c.delta.fontSize - DELTA_FONT) > 0.5) { deltaOk = false; deltaDetail = `delta font ${c.delta.fontSize} ≠ ${DELTA_FONT}`; }
    }
    check(deltaOk, `C3: delta ${DELTA_FONT}px (mobile floor) when shown`, deltaDetail);

    // C4 — value effective font ≥ VALUE_MIN_FONT (40) at t=1 (the mobile floor; FitLine may shrink it
    // but never below the floor for a sane value; an over-long value is FLAGGED by the planner).
    let valOk = true, valDetail = "";
    for (const c of M.dataCells) {
      if (c.value && c.value.fontSize < VALUE_MIN_FONT - 0.5) { valOk = false; valDetail = `value "${c.value.text}" eff ${c.value.fontSize} < ${VALUE_MIN_FONT}`; }
    }
    // An intentionally over-long value MAY shrink below the floor (the stress fixture) — only assert the
    // floor when the planner did NOT flag an overflow risk.
    const planVals = ["tl", "tr", "bl", "br"].map((k) => plan.cells[k]);
    const anyFlagged = planVals.some((c) => c.valueOverflowRisk);
    check(anyFlagged || valOk, `C4: value effective ≥ ${VALUE_MIN_FONT}px at t=1 (unless flagged over-long)`, valDetail);

    // C-delta-fit — the planner's showDelta decision is reproduced in the DOM (a hidden delta has no node).
    let fitOk = true, fitDetail = "";
    for (const key of ["tl", "tr", "bl", "br"]) {
      const pc = plan.cells[key];
      const dc = M.dataCells.find((c) => c.key === key);
      if (!dc) continue;
      const domHasDelta = !!dc.delta;
      if (domHasDelta !== pc.showDelta) { fitOk = false; fitDetail = `cell ${key}: DOM delta ${domHasDelta} ≠ plan.showDelta ${pc.showDelta}`; }
    }
    check(fitOk, "C-delta-fit: rendered delta presence === planMatrix.showDelta (fit-or-hide reproduced)", fitDetail);

    // C-focus — the matrix exposes no `focusOn` via PostRenderer, so every data cell's dim is 1 at t=1;
    // assert the reveal opacity ∈ [0,1] at every sample and settles to 1 at t=1.
    let revOk = true, revDetail = "";
    for (const t of T_SAMPLES) {
      for (const c of reports[t].matrix.cells) {
        if (c.opacity < -0.001 || c.opacity > 1.001) { revOk = false; revDetail = `cell opacity ${c.opacity} ∉ [0,1] at t=${t}`; }
      }
    }
    check(revOk, "C-focus/reveal: every cell opacity ∈ [0,1] across all samples", revDetail);
    check(M.cells.every((c) => approx(c.opacity, 1, 0.02)), "all cells fully revealed (opacity 1) at t=1");

    // C-highlight — exactly the planned highlight cell carries the accent ring shadow at t=1 (or none).
    if (plan.highlightCell) {
      const hi = M.dataCells.find((c) => c.key === plan.highlightCell);
      check(hi && hi.highlighted === true, `C-highlight: cell ${plan.highlightCell} carries the accent ring at t=1`, hi ? `highlighted=${hi.highlighted}` : "cell missing");
      const others = M.dataCells.filter((c) => c.key !== plan.highlightCell);
      check(others.every((c) => c.highlighted === false), "non-highlighted cells carry the neutral ring");
    } else {
      check(M.dataCells.every((c) => c.highlighted === false), "no highlight → every cell on the neutral ring");
    }

    // C-settle — at t ≥ 0.85 the per-cell reveal transform is the identity (or omitted): scale 1, no
    // translate. (The reveal is opacity + scale/translate; once settled the box is final.)
    let settleOk = true, settleDetail = "";
    for (const t of [0.85, 1]) {
      for (const c of reports[t].matrix.cells) {
        const tr = c.transform;
        if (tr && tr !== "none" && !/matrix\(1,\s*0,\s*0,\s*1,\s*0,\s*0\)/.test(tr.replace(/\s/g, " "))) {
          // allow a near-identity matrix (scale ~1, translate ~0)
          const nums = (tr.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
          if (nums.length >= 6) {
            const [a, b2, c2, d2, e, f] = nums;
            if (Math.abs(a - 1) > 0.005 || Math.abs(d2 - 1) > 0.005 || Math.abs(e) > 0.5 || Math.abs(f) > 0.5 || Math.abs(b2) > 0.005 || Math.abs(c2) > 0.005) {
              settleOk = false; settleDetail = `cell transform "${tr}" not settled at t=${t}`;
            }
          }
        }
      }
    }
    check(settleOk, "C-settle: cell reveal transform is the identity (scale 1, no translate) at t ≥ 0.85", settleDetail);

    // C-mobile — gating arrays clean at every sample; textCoverage bounded at t=1.
    assertGatingClean(check, reports, T_SAMPLES, " (C-mobile)");
    check(base.textCoverage < 0.42, `textCoverage ${base.textCoverage} < 0.42 at t=1 (C-mobile)`);
  }
}

// ── Entry ──────────────────────────────────────────────────────────────────────
if (BASELINE_CAPTURE) {
  console.log(`Capturing the PRE-retrofit matrix t=1 baseline → ${BASELINE_DIR.replace(ROOT, ".")} (needs the dev server at ${BASE})\n`);
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
