#!/usr/bin/env node
// PL-4.3 deterministic gate — RangeBars (the `ranges` viz kind): a TWO-LANE horizontal range
// visualization on a shared YEAR axis (top + bottom lanes, each N labeled bars spanning [start,end],
// optional violet dashed marketLine). The SECOND sub-task of the PL-4.3 legacy-retrofit sprint: it
// modernizes the project's original RangeBars onto a pure planner (src/lib/ranges.ts) + this gate,
// while keeping the painted t=1 frame BYTE-IDENTICAL to the pre-retrofit code (the non-negotiable gate).
//
// PL-0.2: migrated onto `definePrimitiveGate` (tools/lib/primitive-gate.mjs) — the gate is now a
// DECLARATION (the unit suite + per-fixture domChecks + the opt-in byte-identity baseline), and the
// registry owns the shared machinery (CLI parse, the check/approx scoreboard, the headless-Chromium
// lifecycle, the baseline capture/regression + fixture loop, the banner + pass/fail summary + exit
// code). Ranges is the REFERENCE baseline gate (donut, the other migrated gate, has no baseline), so it
// proves the registry's byte-identity BASELINE path: `--baseline-capture` writes byte-identical files
// via the registry's `captureState`/`captureSummary`, and the default run asserts t=1 == baseline
// field-for-field via `compareBaseline`. Behaviour is byte-identical to the pre-migration gate.
//
// RangeBars is an SVG-viewBox primitive (viewBox 1000×560) — so the baseline + checks read the svg's
// rect/text/line attrs (like the divergence/bars/scatter gates), NOT a CSS grid.
//
//   node tools/qa-ranges.mjs --baseline-capture  # STEP 1 (run on the PRE-retrofit code): capture the
//                                                 # current ranges t=1 DOM structurally → baselines/pl-4.3-ranges/
//   node tools/qa-ranges.mjs --unit               # planRanges decision tables (U1–U10; no dev server)
//   npm run dev                                   # in another terminal — DOM passes need the dev server
//   npm run qa:ranges                             # full: baseline byte-identity + unit + sampled-t DOM pass
//
// Covers handoff §1 (byte-identity contract) + §2B (RangeBars). THE HEADLINE CHECK: the post-refactor
// t=1 structural read == the captured pre-retrofit baseline, field-for-field (every painted bar rect /
// label text+font+fill / group label / axis tick / marketLine). Then: the planRanges unit suite (U1–U10)
// and a sampled-t DOM pass over the reveal PROPS (geometry static across reveals, bars-within-viewBox,
// no label overlap [the ≥24px rule], settle at t≥0.85, mobile floors via assertGatingClean, the numbered
// constraints C1–C9).
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { definePrimitiveGate } from "./lib/primitive-gate.mjs";
import {
  planRanges,
  laneItemOpacity,
  ACCENTS,
  VIEW_W,
  VIEW_H,
  GROUP_LABEL_FONT,
  ROW_LABEL_FONT,
  AXIS_LABEL_FONT,
  MAX_ENTRIES_PER_LANE,
  MAX_LABEL_CHARS,
  ROW_HEIGHT,
  BAR_HEIGHT,
  LABEL_COL_W,
} from "../src/lib/ranges.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_DIR = join(ROOT, "planning", "primitive-library", "baselines", "pl-4.3-ranges");

// The ranges fixtures — basic 2-lane, marketLine, openEnd (in-spec), then the stress set: over-cap +
// long-label, degenerate axis + single entry. Each renders through PostRenderer's `ranges` branch.
const FIXTURES = [
  "fuzz-107-ranges-basic",
  "fuzz-108-ranges-marketline",
  "fuzz-109-ranges-openend",
  "fuzz-110-ranges-overcap",
  "fuzz-111-ranges-degenerate",
];

// THE BYTE-IDENTITY set — only the fixtures whose painted output the retrofit MUST preserve: the
// in-spec ones (basic / marketLine / openEnd) where every defensive clamp is a NO-OP. The stress
// fixtures (110 over-cap + over-long label, 111 degenerate axis) INTENTIONALLY exercise the new
// clamps (they are brand-new fixtures with no shipping render to protect), so they ride the unit +
// sampled-t passes, NOT the byte-identity regression.
const BASELINE_FIXTURES = [
  "fuzz-107-ranges-basic",
  "fuzz-108-ranges-marketline",
  "fuzz-109-ranges-openend",
];

// The C-mobile GATING-CLEAN set — fixtures whose render must be collision/clip/safe-margin clean at
// EVERY sample. The stress fixtures are authored so the clamps actually CONTAIN their pathology (the
// over-long ROW label is hidden by fit-or-hide rather than bleeding; over-cap rows are dropped; the
// open-end `+` and ticks stay inside the viewBox; the degenerate single entry has a zero-span — not
// negative — bar), so they too render gating-clean (confirmed by qa:fuzz 111/111). All five therefore
// hold to the gating-clean bar; the clamp BEHAVIOUR (entriesDropped/labelsHidden/finite-width) is
// asserted separately below for the stress fixtures.
const CLEAN_GATING_FIXTURES = new Set(FIXTURES);

const T_SAMPLES = [0, 0.2, 0.3, 0.45, 0.55, 0.66, 0.72, 0.85, 0.92, 1];

// ── Structural, renderer-agnostic capture of the CURRENT RangeBars svg (the capture-first discipline).
//    Reads the svg BY STRUCTURE — the viewBox, every <rect> (x/y/w/h/rx/fill/opacity), every <text>
//    (string/x/y/anchor/eff-font/fill), every <line> (x1/y1/x2/y2/stroke/dasharray). Deliberately NOT
//    keyed to the new inspect `ranges` section / data-ranges-* hooks, so it runs on the PRE-retrofit
//    code (which has no hooks). Finds the svg as the canvas's svg[aria-label] (the RangeBars root) whose
//    viewBox is "0 0 1000 560" (distinct from every other viz svg). The whole reader is inlined in
//    page.evaluate (Playwright only serializes the passed fn). Passed to the registry as `captureState`.
function captureRangesState() {
  const canvas = document.querySelector("#post-canvas");
  if (!canvas) return { error: "no #post-canvas" };
  // The RangeBars svg is the one with viewBox 0 0 1000 560 (its signature). Prefer the hook
  // (post-refactor) but fall back to the viewBox match (pre-retrofit code has no hook).
  let svg = canvas.querySelector("[data-ranges]");
  if (!svg) {
    for (const s of canvas.querySelectorAll("svg")) {
      if ((s.getAttribute("viewBox") || "").trim() === "0 0 1000 560") { svg = s; break; }
    }
  }
  if (!svg) return { error: "no RangeBars svg (viewBox 0 0 1000 560) found" };
  const r4 = (x) => Math.round((x + Number.EPSILON) * 1e4) / 1e4;
  const numAttr = (el, a) => { const v = el.getAttribute(a); return v == null ? null : r4(+v); };
  const rects = [...svg.querySelectorAll("rect")].map((el) => {
    const cs = getComputedStyle(el);
    return {
      x: numAttr(el, "x"), y: numAttr(el, "y"), w: numAttr(el, "width"), h: numAttr(el, "height"),
      rx: numAttr(el, "rx"),
      fill: cs.fill,
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
    };
  });
  const lines = [...svg.querySelectorAll("line")].map((el) => {
    const cs = getComputedStyle(el);
    return {
      x1: numAttr(el, "x1"), y1: numAttr(el, "y1"), x2: numAttr(el, "x2"), y2: numAttr(el, "y2"),
      stroke: cs.stroke,
      strokeWidth: +parseFloat(cs.strokeWidth).toFixed(3),
      dasharray: cs.strokeDasharray,
    };
  });
  return {
    viewBox: svg.getAttribute("viewBox"),
    nodeCount: svg.querySelectorAll("*").length,
    rects,
    texts,
    lines,
  };
}

// The `captured …` summary line (registry calls captureSummary(state) per file) — byte-identical text.
const captureSummary = (state) =>
  `${state.rects.length} rects, ${state.texts.length} texts, ${state.lines.length} lines, nodeCount ${state.nodeCount}`;

// ── THE HEADLINE CHECK — post-refactor t=1 == captured pre-retrofit baseline, field-for-field ────────
//    The registry owns the load (t=1, 200ms settle), the baseline-missing / cur.error guards, and the
//    per-fixture loop; this is just the field-for-field comparator it calls per fixture.
async function compareBaseline(baseline, cur, { check, id }) {
  let ok = true;
  let detail = "";
  const posTol = 0.5; // viewBox-px tolerance (attrs are exact; tolerance for any float formatting)
  const fontTol = 0.5;
  if (cur.viewBox !== baseline.viewBox) { ok = false; detail = `viewBox ${cur.viewBox} vs ${baseline.viewBox}`; }
  // Rects (bars) — count + every attr.
  if (cur.rects.length !== baseline.rects.length) { ok = false; detail = `rect count ${cur.rects.length} vs ${baseline.rects.length}`; }
  else {
    for (let i = 0; i < baseline.rects.length; i++) {
      const b = baseline.rects[i], c = cur.rects[i];
      for (const k of ["x", "y", "w", "h", "rx"]) if (Math.abs((c[k] ?? 0) - (b[k] ?? 0)) > posTol) { ok = false; detail = `rect[${i}].${k} ${c[k]} vs ${b[k]}`; }
      if (c.fill !== b.fill) { ok = false; detail = `rect[${i}] fill ${c.fill} vs ${b.fill}`; }
      if (Math.abs(c.opacity - b.opacity) > 0.01) { ok = false; detail = `rect[${i}] opacity ${c.opacity} vs ${b.opacity}`; }
      if (c.filter !== b.filter) { ok = false; detail = `rect[${i}] filter differs`; }
    }
  }
  // Texts (group labels, row labels, openEnd +, axis tick labels, marketLine label) — count + every attr.
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
    }
  }
  // Lines (axis baseline + ticks + marketLine) — count + every attr.
  if (cur.lines.length !== baseline.lines.length) { ok = false; detail = `line count ${cur.lines.length} vs ${baseline.lines.length}`; }
  else {
    for (let i = 0; i < baseline.lines.length; i++) {
      const b = baseline.lines[i], c = cur.lines[i];
      for (const k of ["x1", "y1", "x2", "y2"]) if (Math.abs((c[k] ?? 0) - (b[k] ?? 0)) > posTol) { ok = false; detail = `line[${i}].${k} ${c[k]} vs ${b[k]}`; }
      if (c.stroke !== b.stroke) { ok = false; detail = `line[${i}] stroke ${c.stroke} vs ${b.stroke}`; }
      if (Math.abs(c.strokeWidth - b.strokeWidth) > 0.05) { ok = false; detail = `line[${i}] strokeW ${c.strokeWidth} vs ${b.strokeWidth}`; }
      if (c.dasharray !== b.dasharray) { ok = false; detail = `line[${i}] dasharray ${c.dasharray} vs ${b.dasharray}`; }
    }
  }
  check(ok, `${id}: t=1 == pre-retrofit baseline (viewBox + every bar rect / label / axis tick / marketLine byte-identical)`, detail);
}

// ── 1. Unit suite (pure — no DOM) ─────────────────────────────────────────────
function unitSuite(check, approx) {
  const mkEntry = (label, start, end, openEnd) => ({ label, start, end, ...(openEnd ? { openEnd } : {}) });

  console.log("U1 — year→x scale + bar geometry (start/end → x/width; band y per lane/row):");
  const u1 = planRanges({
    topGroupLabel: "T", bottomGroupLabel: "B",
    topAccent: "amber", bottomAccent: "cyan",
    minYear: 2024, maxYear: 2052,
    topEntries: [mkEntry("a", 2025, 2027), mkEntry("b", 2026, 2027)],
    bottomEntries: [mkEntry("c", 2028, 2043)],
  });
  check(u1.minYear === 2024 && u1.maxYear === 2052, "axis range passes through", `[${u1.minYear},${u1.maxYear}]`);
  // x at minYear == barAreaX; x at maxYear == barAreaX + barAreaW.
  check(approx(u1.yearToX(u1.minYear), u1.barAreaX), "yearToX(minYear) == barAreaX", `${u1.yearToX(u1.minYear)} vs ${u1.barAreaX}`);
  check(approx(u1.yearToX(u1.maxYear), u1.barAreaX + u1.barAreaW), "yearToX(maxYear) == barAreaX+barAreaW");
  const b0 = u1.topEntries[0];
  check(approx(b0.x, u1.yearToX(2025)) && approx(b0.w, u1.yearToX(2027) - u1.yearToX(2025)), "bar x/width from start/end via yearToX", `x${b0.x} w${b0.w}`);
  check(b0.y === u1.topLaneY && u1.topEntries[1].y === u1.topLaneY + ROW_HEIGHT, "row y steps by ROW_HEIGHT per lane row", `${b0.y},${u1.topEntries[1].y}`);
  check(u1.bottomEntries[0].y === u1.bottomLaneY, "bottom lane starts at bottomLaneY", `${u1.bottomEntries[0].y}`);

  console.log("U2 — maxYear<=minYear guard MOVED into planRanges (no divide-by-zero; finite x):");
  const u2 = planRanges({ minYear: 2030, maxYear: 2030, topEntries: [mkEntry("x", 2030, 2030)], bottomEntries: [] });
  check(u2.maxYear > u2.minYear && Number.isFinite(u2.maxYear), "maxYear<=minYear → maxYear bumped to min+1", `[${u2.minYear},${u2.maxYear}]`);
  check(Number.isFinite(u2.topEntries[0].x) && Number.isFinite(u2.topEntries[0].w), "single degenerate entry → finite x/width (no NaN)", `x${u2.topEntries[0].x} w${u2.topEntries[0].w}`);
  check(u2.dropped.axisGuarded === true, "axis guard surfaced via a counter (never silent)");

  console.log("U3 — axis range DERIVED from data when min/max omitted (PostRenderer-inline → planRanges):");
  const u3 = planRanges({ topEntries: [mkEntry("a", 2025, 2030)], bottomEntries: [mkEntry("b", 2027, 2040)] });
  check(u3.minYear === 2025 && u3.maxYear === 2040, "min/max derived from data extents", `[${u3.minYear},${u3.maxYear}]`);
  const u3e = planRanges({ topEntries: [], bottomEntries: [] });
  check(Number.isFinite(u3e.minYear) && u3e.maxYear > u3e.minYear, "no entries → safe default finite axis", `[${u3e.minYear},${u3e.maxYear}]`);

  console.log("U4 — entries-per-lane cap (over MAX_ENTRIES_PER_LANE → dropped tail, surfaced):");
  const many = Array.from({ length: MAX_ENTRIES_PER_LANE + 3 }, (_, k) => mkEntry(`r${k}`, 2025 + k, 2030 + k));
  const u4 = planRanges({ minYear: 2024, maxYear: 2060, topEntries: many, bottomEntries: many });
  check(u4.topEntries.length === MAX_ENTRIES_PER_LANE && u4.bottomEntries.length === MAX_ENTRIES_PER_LANE, `each lane capped at ${MAX_ENTRIES_PER_LANE}`, `${u4.topEntries.length}/${u4.bottomEntries.length}`);
  check(u4.dropped.entriesDropped === 2 * 3, "over-cap rows surfaced via a counter", `got ${u4.dropped.entriesDropped}`);

  console.log("U5 — label fit-or-hide (over-long label hidden, never bleeds; surfaced):");
  const u5 = planRanges({
    minYear: 2024, maxYear: 2052,
    topEntries: [mkEntry("x".repeat(MAX_LABEL_CHARS + 30), 2025, 2030), mkEntry("short", 2026, 2031)],
    bottomEntries: [],
  });
  check(u5.topEntries[0].showLabel === false && u5.topEntries[1].showLabel === true, "over-long label hidden; short label shown", `${u5.topEntries[0].showLabel}/${u5.topEntries[1].showLabel}`);
  check(u5.dropped.labelsHidden >= 1, "hidden label surfaced via a counter", `got ${u5.dropped.labelsHidden}`);

  console.log("U6 — openEnd handling (the + marker x derives from yearToX(end)+offset):");
  const u6 = planRanges({ minYear: 2024, maxYear: 2052, topEntries: [mkEntry("oe", 2030, 2040, true), mkEntry("closed", 2030, 2035)], bottomEntries: [] });
  check(u6.topEntries[0].openEnd === true && u6.topEntries[1].openEnd === false, "openEnd flag preserved", `${u6.topEntries[0].openEnd}/${u6.topEntries[1].openEnd}`);
  check(approx(u6.topEntries[0].openEndX, u6.yearToX(2040) + 8), "openEnd + marker x == yearToX(end)+8", `${u6.topEntries[0].openEndX}`);

  console.log("U7 — marketLine x (from year via yearToX) + label uppercased downstream:");
  const u7 = planRanges({ minYear: 2024, maxYear: 2052, topEntries: [mkEntry("a", 2025, 2027)], bottomEntries: [], marketLine: { year: 2030, label: "markets" } });
  check(u7.marketLine && approx(u7.marketLine.x, u7.yearToX(2030)), "marketLine.x == yearToX(year)", u7.marketLine ? `${u7.marketLine.x}` : "missing");
  check(u7.marketLine.year === 2030 && u7.marketLine.label === "markets", "marketLine year/label pass through");
  const u7n = planRanges({ minYear: 2024, maxYear: 2052, topEntries: [mkEntry("a", 2025, 2027)], bottomEntries: [] });
  check(u7n.marketLine === null, "absent marketLine → null");

  console.log("U8 — accent resolution (missing/invalid → valid fallback; surfaced):");
  const u8 = planRanges({ topEntries: [mkEntry("a", 2025, 2027)], bottomEntries: [], topAccent: "bogus", bottomAccent: undefined });
  check(ACCENTS.includes(u8.topAccent) && ACCENTS.includes(u8.bottomAccent), "invalid/missing accents → valid fallbacks", `${u8.topAccent}/${u8.bottomAccent}`);

  console.log("U9 — negative/zero span + reversed start>end → min bar width, never negative:");
  const u9 = planRanges({ minYear: 2024, maxYear: 2052, topEntries: [mkEntry("zero", 2030, 2030), mkEntry("rev", 2035, 2030)], bottomEntries: [] });
  check(u9.topEntries[0].w >= 0 && u9.topEntries[1].w >= 0, "no negative bar width", `${u9.topEntries[0].w}/${u9.topEntries[1].w}`);
  check(u9.topEntries.every((e) => Number.isFinite(e.x) && Number.isFinite(e.w)), "all bar geometry finite (no NaN)");

  console.log("U10 — laneItemOpacity arithmetic: ∈[0,1], reveal=1 → all 1 (settled):");
  check([0, 0.5, 1].every((r) => [0, 1, 2].every((i) => { const o = laneItemOpacity(r, i, 3); return o >= 0 && o <= 1; })), "laneItemOpacity ∈ [0,1] across the range");
  check([0, 1, 2].every((i) => approx(laneItemOpacity(1, i, 3), 1)), "laneItemOpacity(reveal=1) == 1 for every row (settled)");
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
const overlap = (A, B) => {
  const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
  const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
  return ox > 1 && oy > 1 ? Math.min(ox, oy) : 0;
};

// ── 2. Sampled-t DOM checks (per fixture; the registry owns the loop + sampling) ────────────────
async function rangesDomChecks(ctx) {
  const { id, plan, reports, base, T: T_SAMPLES, check, approx, assertGatingClean } = ctx;
  console.log(`Sampled-t DOM pass — ${id} (top:${plan.topEntries.length} bot:${plan.bottomEntries.length} market:${!!plan.marketLine}, t ∈ {${T_SAMPLES.join(", ")}}):`);

  const R = base.ranges;
  if (!check(!!R, "ranges section present at t=1 (data-ranges-* hooks)")) return;

  // C1 — viewBox 1000×560 (the declared constraint), constant node count across all samples
  // (nothing mounts/unmounts mid-reveal — layout reserved from Beat 1; reveals drive opacity only).
  check(R.viewBox === `0 0 ${VIEW_W} ${VIEW_H}`, `C1: viewBox 0 0 ${VIEW_W} ${VIEW_H}`, R.viewBox);
  check(
    T_SAMPLES.every((t) => reports[t].ranges?.nodeCount === R.nodeCount),
    `C1: svg node count constant (${R.nodeCount}) — nothing mounts/unmounts (layout-reserved)`,
    T_SAMPLES.map((t) => reports[t].ranges?.nodeCount).join(","),
  );

  // C-geometry-static — every bar rect's LAYOUT attrs (x/y/w/h — viewBox px, transform-blind) are
  // byte-identical across all 10 samples; only the group opacity moves (a reveal, not a relayout).
  let geomOk = true, geomDetail = "";
  for (const t of T_SAMPLES) {
    const d = reports[t].ranges;
    for (let i = 0; i < R.bars.length; i++) {
      const a = R.bars[i], c = d.bars[i];
      if (!c) { geomOk = false; geomDetail = `bar ${i} missing at t=${t}`; continue; }
      for (const k of ["x", "y", "w", "h"]) if (Math.abs(a[k] - c[k]) > 0.5) { geomOk = false; geomDetail = `bar ${i}.${k} drifts at t=${t}`; }
    }
  }
  check(geomOk, "C-geometry-static: every bar rect (x/y/w/h) identical across all 10 samples", geomDetail);

  // C2 — bars within the viewBox (no overflow): every bar rect ⊆ [0,VIEW_W]×[0,VIEW_H].
  let inBox = true, inDetail = "";
  for (const b of R.bars) {
    if (b.x < -0.5 || b.y < -0.5 || b.x + b.w > VIEW_W + 0.5 || b.y + b.h > VIEW_H + 0.5) { inBox = false; inDetail = `bar at x${b.x} y${b.y} w${b.w} h${b.h} exceeds ${VIEW_W}×${VIEW_H}`; }
  }
  check(inBox, `C2: every bar rect within the ${VIEW_W}×${VIEW_H} viewBox (no overflow)`, inDetail);

  // C3 — bar height == BAR_HEIGHT (the declared constraint).
  check(R.bars.every((b) => Math.abs(b.h - BAR_HEIGHT) < 0.5), `C3: every bar height == ${BAR_HEIGHT}`, R.bars.map((b) => b.h).join(","));

  // C4 — fonts: group labels GROUP_LABEL_FONT mono; row labels ROW_LABEL_FONT; axis ticks AXIS_LABEL_FONT.
  let fontOk = true, fontDetail = "";
  for (const g of R.groupLabels) {
    if (Math.abs(g.fontSize - GROUP_LABEL_FONT) > 0.5) { fontOk = false; fontDetail = `group label "${(g.text || "").slice(0, 8)}" font ${g.fontSize} ≠ ${GROUP_LABEL_FONT}`; }
    if (!/mono/i.test(g.fontFamily) && !/JetBrains/i.test(g.fontFamily)) { fontOk = false; fontDetail = `group label family "${g.fontFamily}" not mono`; }
  }
  check(fontOk, `C4: group labels ${GROUP_LABEL_FONT}px mono`, fontDetail);
  check(R.rowLabels.every((l) => Math.abs(l.fontSize - ROW_LABEL_FONT) < 0.5), `C4: row labels ${ROW_LABEL_FONT}px`, R.rowLabels.map((l) => l.fontSize).join(","));

  // C5 — row labels sit in the LEFT label column (anchor end, x within [0, LABEL_COL_W]).
  let labelColOk = true, labelColDetail = "";
  for (const l of R.rowLabels) {
    if (l.x > LABEL_COL_W + 0.5) { labelColOk = false; labelColDetail = `row label x ${l.x} > ${LABEL_COL_W}`; }
    if (l.anchor !== "end") { labelColOk = false; labelColDetail = `row label anchor "${l.anchor}" ≠ end`; }
  }
  check(labelColOk, `C5: row labels right-anchored within the left label column (x ≤ ${LABEL_COL_W})`, labelColDetail);

  // C6 — no row-label overlap: ≥24px between consecutive row-label boxes within a lane (the declared
  // ≥24px-between-row-labels rule). Row labels are right-anchored at the same x, so check the gap on y.
  let rowGapOk = true, rowGapDetail = "";
  const sorted = [...R.rowLabels].sort((a, b) => a.rect.y - b.rect.y);
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].rect.y - (sorted[i - 1].rect.y + sorted[i - 1].rect.h);
    // only enforce within a lane (consecutive rows are ROW_HEIGHT apart; the lane jump is large + positive)
    if (gap < 0 && overlap(sorted[i].rect, sorted[i - 1].rect) > 1) { rowGapOk = false; rowGapDetail = `row labels overlap by ${overlap(sorted[i].rect, sorted[i - 1].rect).toFixed(1)}px`; }
  }
  check(rowGapOk, "C6: consecutive row labels never overlap (≥24px row pitch reserved)", rowGapDetail);

  // C-reveal — every group's opacity ∈ [0,1] across all samples; fully revealed at t=1.
  let revOk = true, revDetail = "";
  for (const t of T_SAMPLES) {
    for (const g of reports[t].ranges.groups) {
      if (g.opacity < -0.001 || g.opacity > 1.001) { revOk = false; revDetail = `group "${g.role}" opacity ${g.opacity} ∉ [0,1] at t=${t}`; }
    }
  }
  check(revOk, "C-reveal: every group opacity ∈ [0,1] across all samples", revDetail);
  check(R.groups.every((g) => approx(g.opacity, 1, 0.02)), "all groups fully revealed (opacity 1) at t=1", R.groups.map((g) => `${g.role}:${g.opacity}`).join(","));

  // C-marketLine — present iff the plan has one; vertical dashed within the viewBox.
  if (plan.marketLine) {
    check(R.marketLine != null, "C-marketLine: rendered when planned", R.marketLine ? "present" : "MISSING");
    if (R.marketLine) {
      check(R.marketLine.x1 === R.marketLine.x2, "marketLine is vertical (x1==x2)", `${R.marketLine.x1}/${R.marketLine.x2}`);
      check(/\d/.test(R.marketLine.dasharray || ""), "marketLine is dashed", R.marketLine.dasharray);
      check(R.marketLine.x1 >= -0.5 && R.marketLine.x1 <= VIEW_W + 0.5, "marketLine within viewBox", `${R.marketLine.x1}`);
    }
  } else {
    check(R.marketLine == null, "C-marketLine: absent when not planned");
  }

  // C-settle — at the FINAL frame (t=1) every group reveal is settled: opacity == 1 (the reveal is
  // opacity-only). RangeBars' last reveal window (marketLine appear(t,0.72,0.28); bottom lane
  // appear(t,0.45,0.5)) only closes at/near t=1, so the settle frame is t=1 (NOT 0.85 like matrix —
  // matrix's last cell settles at 0.84; here the marketLine settles exactly at 1.0).
  const settleBad = reports[1].ranges.groups.filter((g) => g.opacity < 0.98);
  check(settleBad.length === 0, "C-settle: every group fully revealed (opacity == 1) at the final frame t=1", settleBad.map((g) => `${g.role}:${g.opacity}`).join(","));

  // C8/C9 — the defensive clamps are surfaced (never silent). On the stress fixtures the planner must
  // bound the pathological input: ≤MAX_ENTRIES_PER_LANE rows/lane, hidden over-long labels, the axis
  // guard, and (always, every fixture) bars within the viewBox with no NaN geometry.
  check(plan.topEntries.length <= MAX_ENTRIES_PER_LANE && plan.bottomEntries.length <= MAX_ENTRIES_PER_LANE, `C8: ≤ ${MAX_ENTRIES_PER_LANE} rows/lane (cap)`, `${plan.topEntries.length}/${plan.bottomEntries.length}`);
  check([...plan.topEntries, ...plan.bottomEntries].every((e) => Number.isFinite(e.x) && Number.isFinite(e.w) && e.w >= 0), "C8: every bar geometry finite + non-negative width (no NaN)");
  if (id === "fuzz-110-ranges-overcap") {
    check(plan.dropped.entriesDropped > 0, "C8: over-cap rows dropped + surfaced", `got ${plan.dropped.entriesDropped}`);
    check(plan.dropped.labelsHidden > 0, "C8: the over-long row label is hidden (fit-or-hide) + surfaced", `got ${plan.dropped.labelsHidden}`);
  }
  if (id === "fuzz-111-ranges-degenerate") {
    // single entry + empty opposite lane + a zero-span bar — the planner must still produce a finite,
    // non-negative bar and an empty lane without NaN. (The maxYear≤minYear divide-by-zero GUARD itself
    // is exercised at the unit level — U2 — since a render-level degenerate axis clips its edge tick.)
    check(plan.topEntries.length === 1 && plan.bottomEntries.length === 0, "C8: single top entry + empty bottom lane", `${plan.topEntries.length}/${plan.bottomEntries.length}`);
    check(plan.topEntries[0].w >= 0 && Number.isFinite(plan.topEntries[0].w), "C8: zero-span bar → finite, non-negative width", `w=${plan.topEntries[0].w}`);
  }

  // C-mobile — gating arrays clean at every sample (only on the SANE-input fixtures; the stress
  // fixtures feed pathological input the clamps bound but cannot make pixel-clean — see
  // CLEAN_GATING_FIXTURES); textCoverage bounded at t=1 (every fixture).
  if (CLEAN_GATING_FIXTURES.has(id)) {
    assertGatingClean(check, reports, T_SAMPLES, " (C-mobile)");
  }
  check(base.textCoverage < 0.42, `textCoverage ${base.textCoverage} < 0.42 at t=1 (C-mobile)`);
}

// ── Entry — the registry owns CLI parse (--unit/--baseline-capture), the check/approx scoreboard, the
//    headless-Chromium lifecycle, the baseline capture/regression, the fixture loop + summary + exit.
//    Ranges opts into the byte-identity BASELINE via baselineDir/baselineFixtures/captureState/
//    compareBaseline/captureSummary + captureSettleMs:200 (its original 200ms settle).
await definePrimitiveGate({
  name: "ranges",
  fixtures: FIXTURES,
  sampledT: T_SAMPLES,
  plan: planRanges, // spec.visualization → plan (the registry's default planFor(viz) = planRanges(viz))
  unit: (check, { approx }) => unitSuite(check, approx),
  domChecks: rangesDomChecks,
  // ── byte-identity baseline (the headline regression: post-refactor t=1 == pre-retrofit baseline) ──
  baselineDir: BASELINE_DIR,
  baselineFixtures: BASELINE_FIXTURES,
  captureState: captureRangesState,
  compareBaseline,
  captureSummary,
  captureSettleMs: 200,
}).run();
