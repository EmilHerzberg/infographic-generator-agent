#!/usr/bin/env node
// PL-1.3 deterministic gate — DecompBar grow-from-zero segment animation (no LLM).
//
//   node tools/qa-decompbar.mjs --unit               # planStack suite + static timing (no dev server)
//   node tools/qa-decompbar.mjs --baseline-capture   # record the t=1 regression baseline
//                                                    #   (run BEFORE changing DecompBar/PostRenderer!)
//   npm run dev                                      # in another terminal — DOM passes need the dev server
//   npm run qa:decompbar                             # full: unit + sampled-t DOM + baseline equality
//
// Covers handoff §2.7 + the §7 Rev B delta (planning/primitive-library/handoffs/
// PL-1.3-decompbar-grow.md). Rev B replaced the overlapping per-segment stagger with a
// CHAINED CONTINUOUS-EDGE build: one eased edge E(t) over t ∈ [0.34, 0.62]; segment i grows
// g_i = clamp01((E − start_i)/f_i) — it starts exactly when the edge touches its left
// boundary; labels stamp at tStar_i (bisection-inverse of E at the segment's end).
//   1. planStack unit suite — §2.5.2 decision table (12 rows), estW char-class spot checks,
//      sum-to-1 ± 1e-6 / sliver-floor fixpoint / negative / NaN / all-zero / 6-segment clamps,
//      no-op identity vs the legacy normalization at 1e-9 for the whole regression corpus,
//      stress-fixture clamp REASONS (proves the checks fail on bad input pre-clamp), and the
//      Rev B chained-edge timing assertions (pure: edge window pinned 0/1, monotone; AT MOST
//      ONE segment mid-grow at every probe t; each segment starts at tStar_{i−1}; tStar
//      bisection correctness E(tStar) = end ± 1e-6; last tStar === 0.62 exactly; settle
//      0.68 ≤ 0.85; edge end === metric-row start 0.62).
//   2. Sampled-t DOM pass at T = {0, 0.32, 0.38, 0.44, 0.50, 0.56, 0.60, 0.65, 0.80, 1}
//      (pre-build, each segment's mid-grow region, label fades, settled, final):
//      bar + segment geometry static (C7, ≤0.5px; node count constant), fill ⊆ segment with
//      transform-matrix discipline (C8; `none` or matrix(g,0,0,1,0,0), g ∈ [0,1]; OMITTED at
//      g=1 — C11), label-fits-segment check (C4/C5: measured label width ≤ segment − 16
//      AND label bbox ⊆ segment bbox at EVERY sample; no containment truncation), label
//      font-size 26 + transform `none` probes (C6), t=0.80/t=1 settle, segment-count cap
//      (C1), collisions/clipped/outOfSafeMargin/belowMobileFloor clean at every sample,
//      PLUS the NEW Rev B edge-continuity row: Σ painted fill widths = E(t) × bar width
//      ± 1px AND at most one fill with 0 < g < 1, at every sample.
//   3. t=1 regression — fuzz-15/16/17 + density-06 + test-stack measured state (bar/segment
//      geometry, paint colors, label presence/text, all visible text leaves) equals the
//      pre-change baseline (C11 — existing posts unchanged; Rev B leaves t=1 untouched).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BASE, VIEWPORT, loadReport, sampleFixture, assertGatingClean } from "./lib/sampled-t.mjs";
import {
  planStack,
  estW,
  stackEdge,
  segmentGrow,
  labelStampT,
  EDGE_START,
  EDGE_END,
  LABEL_STAMP_DUR,
} from "../src/lib/stack.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UNIT_ONLY = process.argv.includes("--unit");
const BASELINE_CAPTURE = process.argv.includes("--baseline-capture");

// §7 Rev B sample set: pre-build, wrapper-fade end, the chained edge's sweep (each
// segment's mid-grow region), label fades, post-settle, final.
const T_SAMPLES = [0, 0.32, 0.38, 0.44, 0.5, 0.56, 0.6, 0.65, 0.8, 1];
// Sampled-t animation pass: the three fuzz stack fixtures + the PL-1.3 stress fixture.
const ANIM_FIXTURES = [
  "fuzz-15-stack-min",
  "fuzz-16-stack-5seg-m2",
  "fuzz-17-stack-4seg-m2",
  "fuzz-22-stack-stress-anim",
];
// t=1 regression corpus (§2.7 flag 3) — baseline recorded BEFORE the component change.
const CORPUS = [
  "fuzz-15-stack-min",
  "fuzz-16-stack-5seg-m2",
  "fuzz-17-stack-4seg-m2",
  "density-06-stack-overstuffed",
  "test-stack",
];
const BASELINE_DIR = join(ROOT, "planning", "primitive-library", "baselines", "pl-1.3-decompbar");

const fixturePath = (id) =>
  id === "test-stack"
    ? join(ROOT, "src", "posts", "generated", "test-stack.render.json")
    : id.startsWith("density")
      ? join(ROOT, "planning", "fixtures", "density", `${id}.render.json`)
      : join(ROOT, "planning", "fixtures", "renderfuzz", `${id}.render.json`);

// Rev B: the timing functions/constants are IMPORTED from src/lib/stack.ts (the exact
// implementation DecompBar renders with — no mirroring drift possible). The DOM pass still
// independently verifies the real painted behavior at the sampled points.
const SETTLE_DEADLINE = 0.85;
const METRIC_ROW_START = 0.62; // PL-1.1 stagger start — the edge must END exactly here

let failures = 0;
const check = (ok, name, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "✔" : "✖"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  return ok;
};

const legacyNormalize = (segments) => {
  const segs = segments.slice(0, 5);
  const total = segs.reduce((sum, s) => sum + (s.width > 0 ? s.width : 0), 0) || 1;
  return segs.map((s) => (s.width > 0 ? s.width : 0) / total);
};

// ── 1. Unit suites (pure — no DOM) ────────────────────────────────────────────
async function unitSuite() {
  console.log("planStack decision table (§2.5.2 — all 12 rows; f via a 2-segment input):");
  // [fraction, label, show?, hideReason?] — filler segment carries the rest of the bar.
  const table = [
    [0.34, "context", true],
    [0.26, "handoff", true],
    [0.18, "retry", true],
    [0.12, "review", true], // tightest existing case
    [0.1, "drift", true],
    [0.5, "coordination", true], // L = 12 boundary
    [0.3, "flaky tools", true],
    [0.2, "model", true],
    [0.1, "handoff", false, "tooThin"], // the latent bleed defect — today this paints over neighbors
    [0.3, "Infrastructure", false, "tooLong"], // 14 chars > 12
    [0.05, "41%", false, "tooThin"], // below the 0.06/needed-f floor
    [0.005, "sliver", false, "tooThin"], // sliver → floored to 0.02 < 0.06
  ];
  for (const [f, label, show, reason] of table) {
    const [seg] = planStack([
      { width: f, color: "cyan", label },
      { width: 1 - f, color: "amber" },
    ]);
    const ok = seg.showLabel === show && (show || seg.hideReason === reason);
    check(
      ok,
      `f=${f} ${JSON.stringify(label)} → ${show ? "show" : `hide(${reason})`}`,
      `got ${seg.showLabel ? "show" : `hide(${seg.hideReason})`} (fraction ${seg.fraction.toFixed(4)})`,
    );
  }
  // The sliver row must also have been floored to exactly 0.02 (C3).
  const sliverRow = planStack([{ width: 0.005, color: "cyan", label: "sliver" }, { width: 0.995, color: "amber" }]);
  check(Math.abs(sliverRow[0].fraction - 0.02) < 1e-9, "sliver row fraction floored to exactly 0.02");

  console.log("estW char-class spot checks (px @26 — narrow 9 / caps+digits 18 / wide 22 / default 14):");
  const estTable = [
    ["i", 9], ["1", 9], ["A", 18], ["0", 18], ["M", 22], ["m", 22], ["%", 22], ["a", 14],
    ["drift", 50], ["retry", 55], ["model", 73], ["handoff", 88], ["review", 82],
    ["coordination", 148], ["flaky tools", 129], ["41%", 49],
  ];
  for (const [s, w] of estTable) {
    check(estW(s) === w, `estW(${JSON.stringify(s)}) === ${w}`, `got ${estW(s)}`);
  }

  console.log("Sum-to-1 / sliver floor / defensive clamps (C1–C3, §2.6):");
  const sums = (plan) => plan.reduce((s, x) => s + x.fraction, 0);
  const validFractions = (plan) => plan.every((x) => x.fraction === 0 || (x.fraction >= 0.02 - 1e-9 && x.fraction <= 1 + 1e-9));

  const sliver = planStack([{ width: 0.005, color: "cyan" }, { width: 0.995, color: "amber" }]);
  check(
    Math.abs(sliver[0].fraction - 0.02) < 1e-9 && Math.abs(sums(sliver) - 1) <= 1e-6 && validFractions(sliver),
    "sliver [0.005, 0.995] → [0.02, 0.98]; sum 1 ± 1e-6; fractions ∈ {0} ∪ [0.02, 1]",
    `got [${sliver.map((s) => s.fraction.toFixed(4)).join(", ")}]`,
  );
  // Cascade: the first redistribution pushes a second segment below the floor — the fixpoint
  // loop must catch it in pass 2 (each pass permanently pins ≥1 segment).
  const cascade = planStack([{ width: 0.001 }, { width: 0.0201 }, { width: 0.9789 }]);
  check(
    Math.abs(cascade[0].fraction - 0.02) < 1e-9 && Math.abs(cascade[1].fraction - 0.02) < 1e-9 &&
      Math.abs(cascade[2].fraction - 0.96) < 1e-9 && Math.abs(sums(cascade) - 1) <= 1e-6,
    "cascade [0.001, 0.0201, 0.9789] → [0.02, 0.02, 0.96] (fixpoint pins in 2 passes; sum preserved)",
    `got [${cascade.map((s) => s.fraction.toFixed(5)).join(", ")}]`,
  );
  const negative = planStack([{ width: -1 }, { width: 0.5 }, { width: 0.5 }]);
  check(
    negative[0].fraction === 0 && Math.abs(negative[1].fraction - 0.5) < 1e-9 && Math.abs(sums(negative) - 1) <= 1e-6,
    "negative width → 0 (zero-width stays zero; others renormalized)",
    `got [${negative.map((s) => s.fraction).join(", ")}]`,
  );
  const nan = planStack([{ width: NaN }, { width: 1 }]);
  check(nan[0].fraction === 0 && nan[1].fraction === 1, "NaN width → 0", `got [${nan.map((s) => s.fraction).join(", ")}]`);
  const allZero = planStack([{ width: 0 }, { width: 0 }]);
  check(
    allZero.every((s) => s.fraction === 0) && allZero.every((s) => !s.showLabel),
    "all-zero widths → all zero-width (total ‖ 1, today's behavior; never a division by zero)",
  );
  const six = planStack([
    { width: 0.3 }, { width: 0.2 }, { width: 0.2 }, { width: 0.1 }, { width: 0.1 }, { width: 0.1 },
  ]);
  check(six.length === 5, "6 declared segments → exactly 5 planned (C1 slice(0,5))", `got ${six.length}`);
  check(Math.abs(sums(six) - 1) <= 1e-6 && validFractions(six), "6-segment input: post-clamp sum 1 ± 1e-6, fractions valid");

  console.log("No-op identity vs legacy normalization (1e-9) — full regression corpus:");
  for (const id of CORPUS) {
    const spec = JSON.parse(await readFile(fixturePath(id), "utf8"));
    const plan = planStack(spec.visualization.segments);
    const legacy = legacyNormalize(spec.visualization.segments);
    const identical = plan.every((s, i) => Math.abs(s.fraction - legacy[i]) < 1e-9);
    const allLabelsShow = plan.every((s) => s.showLabel);
    check(identical, `${id}: planStack fractions === legacy normalization to 1e-9 (floor is a no-op)`);
    check(allLabelsShow, `${id}: every existing label still shows (C4 decision table regression)`);
  }

  console.log("Stress fixture pre-clamp reasons (fuzz-22 — checks fail on bad input, pass post-clamp):");
  const stress = JSON.parse(await readFile(fixturePath("fuzz-22-stack-stress-anim"), "utf8"));
  const raw = stress.visualization.segments;
  const plan = planStack(raw);
  check(raw.length >= 7, `fixture declares ${raw.length} segments (≥7 — pre-clamp would breach the C1 cap of 5)`);
  check(plan.length === 5, "planned segments clamped to exactly 5", `got ${plan.length}`);
  check(Math.abs(sums(plan) - 1) <= 1e-6 && validFractions(plan), "post-clamp sum 1 ± 1e-6; fractions ∈ {0} ∪ [0.02, 1]");
  const byLabel = (l) => plan.find((s) => s.label === l);
  check(byLabel("Infrastructure")?.showLabel === false && byLabel("Infrastructure")?.hideReason === "tooLong",
    `"Infrastructure" (14 ch) → hide(tooLong)`, `got ${JSON.stringify(byLabel("Infrastructure"))}`);
  check(byLabel("handoff")?.showLabel === false && byLabel("handoff")?.hideReason === "tooThin",
    `thin-segment "handoff" (0.10 declared) → hide(tooThin) — the bleed-defect fix`,
    `got ${JSON.stringify(byLabel("handoff"))}`);
  const sliverSeg = byLabel("sliver");
  check(
    sliverSeg && Math.abs(sliverSeg.fraction - 0.02) < 1e-9 && sliverSeg.hideReason === "tooThin",
    `0.005 sliver → floored to 0.02, label hidden(tooThin)`,
    `got ${JSON.stringify(sliverSeg)}`,
  );
  check(plan.some((s) => s.colorKey === undefined), "missing color passes through as undefined (accentHex → cyan, C12)");

  console.log("Rev B chained-edge timing (§7 — pure, the exact functions DecompBar renders with):");
  check(stackEdge(0) === 0 && stackEdge(EDGE_START) === 0, `E(t) pinned to exactly 0 for t ≤ ${EDGE_START} (window start)`);
  check(stackEdge(EDGE_END) === 1 && stackEdge(1) === 1, `E(t) pinned to exactly 1 for t ≥ ${EDGE_END} (window end)`);
  let monotone = true;
  let prevE = 0;
  for (let t = 0; t <= 1.0001; t += 0.001) {
    const e = stackEdge(t);
    if (e < prevE - 1e-9) monotone = false;
    prevE = e;
  }
  check(monotone, "E(t) monotone non-decreasing — the edge never jumps back or pauses");
  // The easing is symmetric (cubic-bezier(0.65, 0, 0.35, 1)) ⇒ the edge is at the track
  // midpoint exactly mid-window — an analytic anchor for the bisection inverse.
  const midT = (EDGE_START + EDGE_END) / 2;
  check(Math.abs(labelStampT(0.5) - midT) <= 1e-6, `labelStampT(0.5) === ${midT} ± 1e-6 (symmetric easing midpoint)`, `got ${labelStampT(0.5)}`);
  check(Math.abs(EDGE_END - METRIC_ROW_START) < 1e-9, `edge end ${EDGE_END} === metric-row start ${METRIC_ROW_START} (clean handover)`);
  check(EDGE_END + LABEL_STAMP_DUR <= SETTLE_DEADLINE, `bar fully settled at ${(EDGE_END + LABEL_STAMP_DUR).toFixed(2)} ≤ ${SETTLE_DEADLINE}`);

  console.log("Chained windows + tStar bisection (§7 — on real plans, 1001 probe points each):");
  for (const id of ["fuzz-16-stack-5seg-m2", "fuzz-22-stack-stress-anim"]) {
    const spec = JSON.parse(await readFile(fixturePath(id), "utf8"));
    const fr = planStack(spec.visualization.segments).map((s) => s.fraction);
    const segStarts = [];
    let cum = 0;
    for (const f of fr) {
      segStarts.push(cum);
      cum += f;
    }
    const ends = segStarts.map((s, i) => s + fr[i]);
    // ≤1 segment mid-grow at EVERY probe point — chained, never staggered.
    let maxMid = 0;
    for (let t = 0; t <= 1.0001; t += 0.001) {
      const mid = fr.filter((f, i) => {
        const g = segmentGrow(t, segStarts[i], f);
        return g > 0 && g < 1;
      }).length;
      if (mid > maxMid) maxMid = mid;
    }
    check(maxMid <= 1, `${id}: at most ONE segment mid-grow at every probe t — got max ${maxMid}`);
    // Chained handover: segment i starts growing exactly when the edge touches start_i,
    // i.e. at tStar_{i−1} — at which point segment i−1 is already complete.
    let chainOk = true;
    let chainDetail = "";
    for (let i = 1; i < fr.length; i++) {
      if (fr[i] <= 0) continue;
      const tTouch = labelStampT(ends[i - 1]); // E-inverse of start_i (= end_{i−1})
      const before = segmentGrow(tTouch - 0.004, segStarts[i], fr[i]);
      const after = segmentGrow(tTouch + 0.004, segStarts[i], fr[i]);
      const prevDone = segmentGrow(tTouch + 0.004, segStarts[i - 1], fr[i - 1]);
      if (!(before === 0 && after > 0 && prevDone === 1)) {
        chainOk = false;
        chainDetail = `segment ${i} @ tStar=${tTouch.toFixed(4)}: g(−ε)=${before}, g(+ε)=${after}, prev g(+ε)=${prevDone}`;
      }
    }
    check(chainOk, `${id}: each segment starts exactly at tStar_{i−1} (edge hands over at every boundary)`, chainDetail);
    // tStar bisection correctness: E(tStar_i) = end_i ± 1e-6 for every segment end.
    let bisectOk = true;
    let bisectDetail = "";
    for (let i = 0; i < ends.length; i++) {
      const err = Math.abs(stackEdge(labelStampT(ends[i])) - Math.min(ends[i], 1));
      if (err > 1e-6) {
        bisectOk = false;
        bisectDetail = `segment ${i}: |E(tStar) − end| = ${err.toExponential(2)}`;
      }
    }
    check(bisectOk, `${id}: E(tStar_i) === end_i ± 1e-6 for every segment (24-iteration bisection)`, bisectDetail);
    check(
      labelStampT(ends[fr.length - 1]) === EDGE_END,
      `${id}: last segment tStar === ${EDGE_END} exactly`,
      `got ${labelStampT(ends[fr.length - 1])}`,
    );
  }
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
// Driver is the shared sampled-`t` harness (tools/lib/sampled-t.mjs, CHECKS.md gap #2).
const loadPage = (page, id, t) => loadReport(page, id, t);

// Self-contained t=1 capture for the regression baseline. Works on BOTH the pre-change
// renderer (locates the bar by its ring shadow; segment color = segment background) and the
// post-change one (data hook; color moves to the fill child) — so one mechanism records the
// baseline and replays the comparison.
function captureStackState() {
  const canvas = document.querySelector("#post-canvas");
  if (!canvas) return { error: "no #post-canvas" };
  const cb = canvas.getBoundingClientRect();
  const toLocal = (r) => ({
    x: +(r.left - cb.left).toFixed(2), y: +(r.top - cb.top).toFixed(2),
    w: +r.width.toFixed(2), h: +r.height.toFixed(2),
  });
  const bar =
    canvas.querySelector("[data-decomp-bar]") ||
    [...canvas.querySelectorAll("div")].find((el) =>
      getComputedStyle(el).boxShadow.includes("rgba(244, 241, 234, 0.08)"),
    );
  const segments = bar
    ? [...bar.children].map((seg) => {
        let color = getComputedStyle(seg).backgroundColor;
        if (color === "rgba(0, 0, 0, 0)" || color === "transparent") {
          const fill = seg.firstElementChild;
          if (fill) color = getComputedStyle(fill).backgroundColor;
        }
        const labelEl = seg.querySelector("span");
        return {
          rect: toLocal(seg.getBoundingClientRect()),
          color,
          label: labelEl
            ? {
                text: labelEl.textContent,
                fontSize: parseFloat(getComputedStyle(labelEl).fontSize),
                rect: toLocal(labelEl.getBoundingClientRect()),
              }
            : null,
        };
      })
    : null;
  // All visible text leaves — whole-post t=1 geometry/text equality (not just the bar).
  const visible = (el) => {
    const s = getComputedStyle(el);
    return !(s.visibility === "hidden" || s.display === "none" || parseFloat(s.opacity) === 0);
  };
  const els = [...canvas.querySelectorAll("*")].filter(visible);
  const textEls = els.filter((el) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0),
  );
  const leaves = textEls
    .filter((el) => !textEls.some((o) => o !== el && el.contains(o)))
    .map((el) => ({
      text: el.textContent.trim().replace(/\s+/g, " "),
      fontSize: parseFloat(getComputedStyle(el).fontSize),
      rect: toLocal(el.getBoundingClientRect()),
    }));
  return { barRect: bar ? toLocal(bar.getBoundingClientRect()) : null, segments, leaves };
}

async function captureState(page, id) {
  await page.goto(`${BASE}/?id=${encodeURIComponent(id)}&t=1`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForSelector("#post-canvas", { timeout: 20000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(250);
  return page.evaluate(captureStackState);
}

async function captureBaseline() {
  await mkdir(BASELINE_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    for (const id of CORPUS) {
      const state = await captureState(page, id);
      if (state.error || !state.barRect) {
        console.error(`✖ ${id}: ${state.error || "no stack bar found"}`);
        process.exitCode = 1;
        continue;
      }
      await writeFile(join(BASELINE_DIR, `${id}.t1.json`), JSON.stringify(state, null, 2));
      console.log(`captured ${id}.t1.json (${state.segments.length} segments, ${state.leaves.length} text leaves)`);
    }
  } finally {
    await browser.close();
  }
}

const rectEq = (a, b, tol = 0.5) =>
  a && b && ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) <= tol);

const matrixOf = (transform) => {
  if (transform === "none") return { g: 1, none: true };
  const m = (transform.match(/matrix\(([^)]+)\)/) || [])[1]?.split(",").map(Number);
  if (!m || m.length < 6) return null;
  // C8 discipline: a fill transform may ONLY be scaleX — matrix(g, 0, 0, 1, 0, 0).
  if (m[1] !== 0 || m[2] !== 0 || m[3] !== 1 || m[4] !== 0 || m[5] !== 0) return null;
  return { g: m[0], none: false };
};

// ── 2. Sampled-t DOM suite ───────────────────────────────────────────────────
async function geometrySuite(page) {
  for (const id of ANIM_FIXTURES) {
    const spec = JSON.parse(await readFile(fixturePath(id), "utf8"));
    const plan = planStack(spec.visualization.segments);
    console.log(`Sampled-t DOM pass — ${id} (t ∈ {${T_SAMPLES.join(", ")}}):`);

    const reports = await sampleFixture(page, id, T_SAMPLES);
    const base = reports[1];
    const D = base.decompBar;
    if (!check(!!D, "decompBar section present at t=1")) continue;

    // C1 segment cap + C7 node-count constancy at every sample.
    check(
      T_SAMPLES.every((t) => reports[t].decompBar?.segments.length === plan.length),
      `segment count === ${plan.length} (planStack) at every sample (C1)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].decompBar?.segments.length).join(",")}`,
    );
    check(
      T_SAMPLES.every((t) => reports[t].decompBar?.nodeCount === D.nodeCount),
      `bar DOM node count constant (${D.nodeCount}) — nothing mounts/unmounts across t (C7)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].decompBar?.nodeCount).join(",")}`,
    );

    // Label presence matches planStack at t=1 (data-decided, constant in t).
    check(
      D.segments.every((s, i) => !!s.label === plan[i].showLabel) &&
        T_SAMPLES.every((t) => reports[t].decompBar.segments.every((s, i) => !!s.label === plan[i].showLabel)),
      "label presence === planStack showLabel for every segment at every sample (C4/C7)",
      `t=1 presence: [${D.segments.map((s) => !!s.label).join(",")}] vs plan [${plan.map((p) => p.showLabel).join(",")}]`,
    );

    // C7 geometry static: bar + every segment bbox identical across ALL samples (≤0.5px).
    let geomOk = true, geomDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].decompBar;
      if (!rectEq(d.rect, D.rect)) { geomOk = false; geomDetail = `bar rect drifts at t=${t}`; }
      for (let i = 0; i < D.segments.length; i++) {
        if (!rectEq(d.segments[i]?.rect, D.segments[i].rect)) { geomOk = false; geomDetail = `segment ${i} rect drifts at t=${t}`; }
      }
    }
    check(geomOk, "bar + every segment bbox identical across all 10 samples (≤0.5px)", geomDetail);

    // C8 fill ⊆ segment + matrix discipline; C11 settle (transform OMITTED at t=0.80 and t=1).
    let fillOk = true, fillDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].decompBar;
      for (let i = 0; i < d.segments.length; i++) {
        const seg = d.segments[i], fill = seg.fill;
        if (!fill) { fillOk = false; fillDetail = `segment ${i} fill missing at t=${t}`; continue; }
        const m = matrixOf(fill.transform);
        if (!m || m.g < -1e-6 || m.g > 1 + 1e-6) {
          fillOk = false; fillDetail = `segment ${i} transform "${fill.transform}" not none/scaleX[0,1] at t=${t}`;
        }
        if (t >= 0.8 && !(m && m.none)) {
          fillOk = false; fillDetail = `segment ${i} transform "${fill.transform}" at t=${t} — must be OMITTED (none) once settled (C11)`;
        }
        const s = seg.rect, f = fill.rect;
        if (f.x < s.x - 0.5 || f.y < s.y - 0.5 || f.x + f.w > s.x + s.w + 0.5 || f.y + f.h > s.y + s.h + 0.5) {
          fillOk = false; fillDetail = `segment ${i} fill rect escapes its segment at t=${t}`;
        }
      }
    }
    check(fillOk, `fill ⊆ segment ±0.5px; transform none/matrix(g,0,0,1,0,0) g ∈ [0,1]; OMITTED at t ≥ 0.80`, fillDetail);

    // NEW (Rev B §7) edge continuity: ONE leading edge — at every sample the total painted
    // fill width equals E(t) × bar width (±1px) and at most one fill is mid-grow (0 < g < 1).
    // Disconnected growing chunks (the Rev A stagger) are impossible under this row.
    let edgeOk = true;
    let edgeDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].decompBar;
      const painted = d.segments.reduce((sum, s) => sum + (s.fill?.rect.w ?? 0), 0);
      const expected = stackEdge(t) * d.rect.w;
      if (Math.abs(painted - expected) > 1) {
        edgeOk = false;
        edgeDetail = `Σ fill widths ${painted.toFixed(2)}px ≠ E(${t}) × ${d.rect.w}px = ${expected.toFixed(2)}px`;
      }
      const midGrow = d.segments.filter((s) => {
        const m = matrixOf(s.fill?.transform ?? "none");
        return m && !m.none && m.g > 0 && m.g < 1;
      }).length;
      if (midGrow > 1) {
        edgeOk = false;
        edgeDetail = `${midGrow} fills mid-grow at t=${t} — the build must chain, never stagger`;
      }
    }
    check(edgeOk, "edge continuity: Σ painted fill widths = E(t) × bar width ± 1px; ≤1 fill mid-grow, at EVERY sample (Rev B)", edgeDetail);

    // NEW label-fits-segment (C4/C5 — the defect fix): measured label width ≤ segment − 16,
    // label bbox ⊆ segment bbox, and zero containment truncation, at EVERY sample.
    let labelFitOk = true, labelFitDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].decompBar;
      for (let i = 0; i < d.segments.length; i++) {
        const seg = d.segments[i];
        if (!seg.label) continue;
        const L = seg.label, s = seg.rect, r = L.rect;
        if (L.textWidth > s.w - 16 + 0.5) { labelFitOk = false; labelFitDetail = `seg ${i} label width ${L.textWidth} > ${(s.w - 16).toFixed(1)} at t=${t}`; }
        if (r.x < s.x - 0.5 || r.y < s.y - 0.5 || r.x + r.w > s.x + s.w + 0.5 || r.y + r.h > s.y + s.h + 0.5) {
          labelFitOk = false; labelFitDetail = `seg ${i} label bbox escapes its segment at t=${t}`;
        }
        if (L.clippedPx > 0) { labelFitOk = false; labelFitDetail = `seg ${i} label truncated by containment (${L.clippedPx}px) at t=${t}`; }
      }
    }
    check(labelFitOk, "label-fits-segment: width ≤ segment − 16, bbox ⊆ segment, no truncation, at EVERY sample", labelFitDetail);

    // C6 label probes: font-size 26 constant; computed transform `none` at every sample.
    let probeOk = true, probeDetail = "";
    for (const t of T_SAMPLES) {
      for (const [i, seg] of reports[t].decompBar.segments.entries()) {
        if (!seg.label) continue;
        if (seg.label.fontSize !== 26) { probeOk = false; probeDetail = `seg ${i} label font-size ${seg.label.fontSize} ≠ 26 at t=${t}`; }
        if (seg.label.transform !== "none") { probeOk = false; probeDetail = `seg ${i} label transform "${seg.label.transform}" at t=${t} — labels are NEVER transformed`; }
      }
    }
    check(probeOk, "label font-size 26px constant + computed transform `none` at every sample (C6)", probeDetail);

    // C9/C11 settle: at t=0.80 and t=1 every label opacity is exactly 1 (fills checked above).
    let settleOk = true, settleDetail = "";
    for (const t of [0.8, 1]) {
      for (const [i, seg] of reports[t].decompBar.segments.entries()) {
        if (seg.label && seg.label.opacity !== 1) { settleOk = false; settleDetail = `seg ${i} label opacity ${seg.label.opacity} at t=${t}`; }
      }
    }
    check(settleOk, "t=0.80 and t=1: every label opacity exactly 1 (bar fully settled ≤ 0.85)", settleDetail);

    // Gating checks clean at EVERY sample (mid-wipe, mid-label-fade included).
    assertGatingClean(check, reports, T_SAMPLES);

    // Density (labels add no new text vs today).
    check(base.textCoverage < 0.42, `textCoverage ${base.textCoverage} < 0.42 at t=1`);

    // C12 adjacent colors — ADVISORY only, never gates.
    const colors = D.segments.map((s) => s.fill?.color);
    const adjacentSame = colors.filter((c, i) => i > 0 && c && c === colors[i - 1]).length;
    if (adjacentSame > 0) console.log(`    (advisory: ${adjacentSame} adjacent segment pair(s) share a resolved color)`);
  }
}

// ── 3. t=1 regression vs pre-change baseline ─────────────────────────────────
async function regressionSuite(page) {
  console.log(`t=1 regression — corpus vs pre-change baseline (${BASELINE_DIR.replace(ROOT, ".")}):`);
  for (const id of CORPUS) {
    let baseline;
    try {
      baseline = JSON.parse(await readFile(join(BASELINE_DIR, `${id}.t1.json`), "utf8"));
    } catch {
      check(false, `${id}: baseline missing`, "run `node tools/qa-decompbar.mjs --baseline-capture` on the PRE-change renderer");
      continue;
    }
    const current = await captureState(page, id);
    let ok = true, detail = "";
    if (!rectEq(current.barRect, baseline.barRect)) { ok = false; detail = "bar rect differs"; }
    if (current.segments?.length !== baseline.segments.length) { ok = false; detail = `segment count ${current.segments?.length} vs ${baseline.segments.length}`; }
    else {
      for (let i = 0; i < baseline.segments.length; i++) {
        const b = baseline.segments[i], c = current.segments[i];
        if (!rectEq(c.rect, b.rect)) { ok = false; detail = `segment ${i} rect differs`; }
        if (c.color !== b.color) { ok = false; detail = `segment ${i} color ${c.color} vs ${b.color}`; }
        if (!!c.label !== !!b.label) { ok = false; detail = `segment ${i} label presence differs`; }
        else if (b.label) {
          if (c.label.text !== b.label.text) { ok = false; detail = `segment ${i} label text ${JSON.stringify(c.label.text)} vs ${JSON.stringify(b.label.text)}`; }
          if (c.label.fontSize !== b.label.fontSize) { ok = false; detail = `segment ${i} label size differs`; }
          if (!rectEq(c.label.rect, b.label.rect)) { ok = false; detail = `segment ${i} label rect differs`; }
        }
      }
    }
    if (current.leaves?.length !== baseline.leaves.length) { ok = false; detail = `text-leaf count ${current.leaves?.length} vs ${baseline.leaves.length}`; }
    else {
      for (let i = 0; i < baseline.leaves.length; i++) {
        const b = baseline.leaves[i], c = current.leaves[i];
        if (c.text !== b.text || c.fontSize !== b.fontSize || !rectEq(c.rect, b.rect)) {
          ok = false; detail = `leaf ${i} (${JSON.stringify(b.text.slice(0, 24))}) differs`;
        }
      }
    }
    check(ok, `${id}: t=1 geometry + colors + label presence + text === pre-change baseline`, detail);
  }
}

if (BASELINE_CAPTURE) {
  console.log(`Capturing t=1 regression baseline from the CURRENT renderer at ${BASE} → ${BASELINE_DIR}\n`);
  await captureBaseline();
  process.exit(process.exitCode || 0);
}

await unitSuite();
if (!UNIT_ONLY) {
  console.log(`\nDOM passes — need the dev server at ${BASE} (npm run dev)\n`);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await geometrySuite(page);
    await regressionSuite(page);
  } finally {
    await browser.close();
  }
}
console.log(`\n${failures ? "✖ FAIL" : "✔ PASS"} — ${failures} failing check(s)`);
process.exit(failures ? 2 : 0);
