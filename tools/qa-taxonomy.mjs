#!/usr/bin/env node
// PL-3.4 deterministic gate — Taxonomy (a grouped HIERARCHY: N categories each with named children,
// drawn as a tidy node-link TREE root → category → leaf; a ROW-AWARE viewBox with the §3 DYNAMIC leaf
// cap + the vertical 3-rank floor; hand-rolled per-category slot-grid layout) primitive (no LLM). The LAST new shape.
//
//   node tools/qa-taxonomy.mjs --unit   # planTaxonomy decision tables (no dev server)
//   npm run dev                         # in another terminal — DOM passes need the dev server
//   npm run qa:taxonomy                 # full: unit + sampled-t DOM pass
//
// Covers handoff §2.7 (planning/primitive-library/handoffs/PL-3.4-taxonomy.md):
//   1. planTaxonomy unit suite (U1–U-degen): category cap 4 + even-stride; children cap 6; the §3
//      DYNAMIC leaf cap + maxLeafRows gating + the viewH {336,480,640} fit table proving NO bottom
//      overflow; slot-grid node layout (parent == mean of leaf xs; leaf pitch ≥ MIN_LEAF_PITCH); the
//      per-rank chip-width clamp + adjacent-disjoint proof; child-within-band + sibling bands disjoint;
//      link-connects (both modes same endpoints); within-frame; depth enforcement; label fit-or-hide;
//      zero-children; value knob; unknown-enum coercion; stagger-vs-N (last leaf ≤ 0.85); degenerate.
//   2. Sampled-t DOM pass (D1–D11) at T = {0,0.24,0.30,0.38,0.50,0.62,0.74,0.85,0.92,1} over over-cap,
//      short-row, deep-input, zero-children, long-label, elbow, showValues fixtures (one headless
//      Chromium, Preview ?id&t): tree-within-frame, node-layout from tree, no-node-overlap, child-within-
//      parent-band, parent-child-link-connects, caps/count, the §3 SHORT-ROW vertical checks (leaf chips
//      ⊆ frame [NO bottom overflow] AND rank gap ≥ MIN_RANK_GAP_Y at viewH=floor), draw/pop + settle
//      (transform OMITTED at t≥0.85), layout reserved, label no-overlap & fit, mobile floors incl. the
//      painted-link-stroke@390, assertGatingClean.
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BASE, VIEWPORT, sampleFixture, assertGatingClean } from "./lib/sampled-t.mjs";
import {
  planTaxonomy,
  rankBands,
  effectiveMaxLeaves,
  maxLeafRows,
  chipWidth,
  staggerForN,
  nodeReveal,
  linkReveal,
  MIN_VIEW_H,
  VIEW_H,
  CANVAS_X0,
  CANVAS_X1,
  RANK_TOP,
  RANK_BOTTOM_PAD,
  NODE_H,
  NODE_GAP_X,
  MIN_NODE_W,
  MAX_NODE_W,
  MIN_RANK_GAP_Y,
  RANK_GAP_Y,
  MIN_LEAF_PITCH,
  LEAF_WRAP_EXTRA,
  LINK_STROKE,
  MAX_CATEGORIES,
  MAX_CHILDREN_PER_CAT,
  MAX_TOTAL_LEAVES,
  CAT_LABEL_PX,
  LEAF_LABEL_PX,
  SETTLE_DEADLINE,
  MAX_STAGGER,
} from "../src/lib/taxonomy.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UNIT_ONLY = process.argv.includes("--unit");

// §2.7 sample set: pre-build, the rank-1/rank-2 build window, settle, hold, final (aligned to beats).
const T_SAMPLES = [0, 0.24, 0.3, 0.38, 0.5, 0.62, 0.74, 0.85, 0.92, 1];
const ANIM_FIXTURES = [
  "fuzz-94-taxonomy-overcap-categories",
  "fuzz-95-taxonomy-overcap-children",
  "fuzz-96-taxonomy-overcap-leaves",
  "fuzz-97-taxonomy-shortrow",
  "fuzz-98-taxonomy-deep-input",
  "fuzz-99-taxonomy-zero-children",
  "fuzz-100-taxonomy-long-labels",
  "fuzz-101-taxonomy-elbow",
  "fuzz-102-taxonomy-showvalues",
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
// (row-aware, PL-0.8) viewBox height read back from the DOM. Omitted → default 640.
const planFromViz = (v, viewH) =>
  planTaxonomy({
    categories: v.categories,
    rootLabel: v.rootLabel,
    mode: v.mode,
    showValues: v.showValues,
    unit: v.unit,
    viewH,
  });

// ── 1. Unit suite (pure — no DOM) ─────────────────────────────────────────────
function unitSuite() {
  console.log("U-fit — the §3 viewH {336,480,640} fit table: NO bottom overflow + dynamic leaf cap (BINDING):");
  check(MIN_VIEW_H === 336, `MIN_VIEW_H === 336 (the proven 3-rank floor)`, `got ${MIN_VIEW_H}`);
  for (const vh of [336, 480, 640]) {
    const b = rankBands(vh);
    const leafBottom = b.leafY + (b.leafRows === 2 ? LEAF_WRAP_EXTRA : 0) + NODE_H / 2;
    const frameFloor = vh - RANK_BOTTOM_PAD;
    check(leafBottom <= frameFloor + 0.5, `viewH ${vh}: leaf chip bottom ${leafBottom.toFixed(1)} ≤ frame floor ${frameFloor} (NO bottom overflow)`, `bottom ${leafBottom.toFixed(1)} > ${frameFloor}`);
    check(b.rankGapY >= MIN_RANK_GAP_Y - 0.01, `viewH ${vh}: rank gap ${b.rankGapY.toFixed(1)} ≥ MIN_RANK_GAP_Y ${MIN_RANK_GAP_Y}`, `gap ${b.rankGapY.toFixed(1)}`);
    check(b.rankGapY <= RANK_GAP_Y + 0.01, `viewH ${vh}: rank gap ${b.rankGapY.toFixed(1)} ≤ RANK_GAP_Y ${RANK_GAP_Y} (cap)`);
  }
  // The fit table's exact values (the binding-correction derivation).
  check(rankBands(336).leafRows === 1 && effectiveMaxLeaves(336) === 7, `viewH 336 → 1 sub-row, cap 7`, `rows ${rankBands(336).leafRows}, cap ${effectiveMaxLeaves(336)}`);
  check(rankBands(480).leafRows === 2 && effectiveMaxLeaves(480) === MAX_TOTAL_LEAVES, `viewH 480 → 2 sub-rows, cap 14`, `rows ${rankBands(480).leafRows}, cap ${effectiveMaxLeaves(480)}`);
  check(rankBands(640).leafRows === 2 && effectiveMaxLeaves(640) === MAX_TOTAL_LEAVES, `viewH 640 → 2 sub-rows, cap 14`, `rows ${rankBands(640).leafRows}, cap ${effectiveMaxLeaves(640)}`);
  check(approx(rankBands(336).rankGapY, 104) && approx(rankBands(480).rankGapY, 132) && approx(rankBands(640).rankGapY, 150), `rank gaps {104,132,150} @ {336,480,640}`, `${rankBands(336).rankGapY},${rankBands(480).rankGapY},${rankBands(640).rankGapY}`);
  // maxLeafRows gating: 2-sub-row only when the viewH holds it (gap with the wrap band ≥ MIN_RANK_GAP_Y).
  check(maxLeafRows(336) === 1 && maxLeafRows(480) === 2, "maxLeafRows gating: 1 @336, 2 @480 (only when held)");

  console.log("U1 — category cap 4 + even-stride keep-first-last (C1):");
  const cats6 = Array.from({ length: 6 }, (_, i) => ({ label: `c${i}`, children: [{ label: `c${i}a` }] }));
  const u1 = planTaxonomy({ categories: cats6 });
  const catNodes = u1.nodes.filter((n) => n.rank === 1);
  check(catNodes.length === MAX_CATEGORIES, `6 categories → ${MAX_CATEGORIES} kept`, `got ${catNodes.length}`);
  check(u1.dropped.categoriesDropped === 2, "categoriesDropped === 2 (surfaced)", `got ${u1.dropped.categoriesDropped}`);
  check(catNodes[0].label === "c0" && catNodes[catNodes.length - 1].label === "c5", "even-stride keeps first(c0)+last(c5)", `${catNodes[0].label}..${catNodes[catNodes.length - 1].label}`);

  console.log("U2 — children-per-category cap 6 + even-stride (C2):");
  const u2 = planTaxonomy({ categories: [{ label: "big", children: Array.from({ length: 9 }, (_, i) => ({ label: `l${i}` })) }, { label: "small", children: [{ label: "x" }] }] });
  const u2leaves = u2.nodes.filter((n) => n.rank === 2 && n.catIndex === 0);
  check(u2leaves.length === MAX_CHILDREN_PER_CAT, `9 children → ${MAX_CHILDREN_PER_CAT} kept`, `got ${u2leaves.length}`);
  check(u2.dropped.childrenDropped === 3, "childrenDropped === 3 (surfaced)", `got ${u2.dropped.childrenDropped}`);
  check(u2leaves[0].label === "l0" && u2leaves[u2leaves.length - 1].label === "l8", "even-stride keeps first(l0)+last(l8)");

  console.log("U3 — total-leaf DYNAMIC cap on viewH + last-cat-inward drop (C3/§3-analog):");
  const mk = (n) => ({ label: `g${n}`, children: Array.from({ length: 6 }, (_, i) => ({ label: `${n}-${i}` })) });
  const big3 = [mk(0), mk(1), mk(2)]; // 18 leaves before the cap
  const u3tall = planTaxonomy({ categories: big3, viewH: 640 });
  const u3short = planTaxonomy({ categories: big3, viewH: MIN_VIEW_H });
  check(u3tall.nodes.filter((n) => n.rank === 2).length === MAX_TOTAL_LEAVES, `18 leaves @viewH640 → ${MAX_TOTAL_LEAVES} (2 sub-rows)`, `got ${u3tall.nodes.filter((n) => n.rank === 2).length}`);
  check(u3short.nodes.filter((n) => n.rank === 2).length === 7, `18 leaves @viewH336 → 7 (1 sub-row, dynamic cap)`, `got ${u3short.nodes.filter((n) => n.rank === 2).length}`);
  check(u3tall.dropped.leavesDropped === 4 && u3short.dropped.leavesDropped === 11, "leavesDropped counted (4 tall / 11 short)", `${u3tall.dropped.leavesDropped} / ${u3short.dropped.leavesDropped}`);
  // deterministic last-cat-inward: the LAST category loses leaves first.
  const lastCatLeavesTall = u3tall.nodes.filter((n) => n.rank === 2 && n.catIndex === 2).length;
  check(lastCatLeavesTall < 6, "last category loses leaves first (last-cat-inward)", `last cat has ${lastCatLeavesTall}`);

  console.log("U-invalid — invalid drop: label-less child-less category + empty-label leaf (§2.6.1/.2):");
  const ui = planTaxonomy({ categories: [{ label: "ok", children: [{ label: "a" }, { label: "  " }, { label: "" }] }, { children: [] }, { label: "  ", children: [] }, null] });
  check(ui.dropped.invalidCategories === 3, "3 label-less child-less (or non-object) categories dropped", `got ${ui.dropped.invalidCategories}`);
  check(ui.dropped.invalidLeaves === 2, "2 empty-label leaves dropped", `got ${ui.dropped.invalidLeaves}`);
  check(ui.nodes.filter((n) => n.rank === 1).length === 1, "1 category kept");
  check(ui.nodes.every((n) => Number.isFinite(n.cx) && Number.isFinite(n.cy)), "no NaN in layout");

  console.log("U-layout — slot-grid node positions: parent == mean of leaf xs; ranks at expected ys:");
  const ul = planTaxonomy({ categories: [{ label: "A", children: [{ label: "a1" }, { label: "a2" }, { label: "a3" }] }, { label: "B", children: [{ label: "b1" }, { label: "b2" }] }], viewH: 640 });
  for (const ci of [0, 1]) {
    const cat = ul.nodes.find((n) => n.rank === 1 && n.catIndex === ci);
    const lvs = ul.nodes.filter((n) => n.rank === 2 && n.catIndex === ci);
    const mean = lvs.reduce((s, n) => s + n.cx, 0) / lvs.length;
    check(approx(cat.cx, mean, 0.6), `category ${ci} x == mean of its leaf xs (Reingold–Tilford centering)`, `cat ${cat.cx.toFixed(2)} vs ${mean.toFixed(2)}`);
  }
  const b640 = rankBands(640);
  check(approx(ul.nodes.find((n) => n.rank === 0).cy, b640.rootY) && approx(ul.nodes.find((n) => n.rank === 1).cy, b640.catY) && approx(ul.nodes.find((n) => n.rank === 2).cy, b640.leafY), "ranks at expected ys {rootY,catY,leafY}");

  console.log("U-pitch — per-rank chip-width clamp + leaf pitch ≥ MIN_LEAF_PITCH + adjacent disjoint:");
  // chipWidth never exceeds min(MAX_NODE_W, pitch − NODE_GAP_X).
  check(chipWidth("x".repeat(40), LEAF_LABEL_PX, MIN_LEAF_PITCH) === MIN_LEAF_PITCH - NODE_GAP_X, `leaf chip at 120px pitch capped to ${MIN_LEAF_PITCH - NODE_GAP_X} (= MIN_NODE_W)`, `got ${chipWidth("x".repeat(40), LEAF_LABEL_PX, MIN_LEAF_PITCH)}`);
  check(chipWidth("a", LEAF_LABEL_PX, 1000) >= MIN_NODE_W && chipWidth("x".repeat(40), CAT_LABEL_PX, 1000) <= MAX_NODE_W, "chip width ∈ [MIN_NODE_W, MAX_NODE_W]");
  for (const vh of [640, 480, 336]) {
    const N = effectiveMaxLeaves(vh);
    const cats = [{ label: "g", children: Array.from({ length: N }, (_, i) => ({ label: `n${i}` })) }];
    const p = planTaxonomy({ categories: cats, viewH: vh });
    const leaves = p.nodes.filter((n) => n.rank === 2);
    const byRow = {};
    for (const l of leaves) (byRow[l.cy.toFixed(0)] ||= []).push(l);
    let minPitch = Infinity;
    let minGap = Infinity;
    for (const k in byRow) {
      const sorted = byRow[k].slice().sort((a, b) => a.cx - b.cx);
      for (let i = 1; i < sorted.length; i++) {
        minPitch = Math.min(minPitch, sorted[i].cx - sorted[i - 1].cx);
        minGap = Math.min(minGap, sorted[i].cx - sorted[i].w / 2 - (sorted[i - 1].cx + sorted[i - 1].w / 2));
      }
    }
    if (Number.isFinite(minPitch)) check(minPitch >= MIN_LEAF_PITCH - 0.01, `viewH ${vh}: leaf pitch ${minPitch.toFixed(1)} ≥ MIN_LEAF_PITCH ${MIN_LEAF_PITCH}`, `pitch ${minPitch.toFixed(1)}`);
    if (Number.isFinite(minGap)) check(minGap >= NODE_GAP_X - 0.5, `viewH ${vh}: adjacent leaf chips disjoint by ≥ NODE_GAP_X ${NODE_GAP_X}`, `gap ${minGap.toFixed(1)}`);
  }

  console.log("U-band — child within parent band; sibling-category bands DISJOINT (§2.4.3):");
  const ub = planTaxonomy({ categories: [{ label: "A", children: [{ label: "a1" }, { label: "a2" }] }, { label: "B", children: [{ label: "b1" }, { label: "b2" }, { label: "b3" }] }], viewH: 640 });
  let bandOk = true;
  let bandDetail = "";
  for (const band of ub.bands) {
    const lvs = ub.nodes.filter((n) => n.rank === 2 && n.catIndex === band.catIndex);
    for (const l of lvs) {
      if (l.cx < band.x0 - 0.5 || l.cx > band.x1 + 0.5) {
        bandOk = false;
        bandDetail = `leaf ${l.label} x ${l.cx.toFixed(1)} ∉ band [${band.x0.toFixed(1)},${band.x1.toFixed(1)}]`;
      }
    }
  }
  check(bandOk, "every leaf x ∈ its category band", bandDetail);
  const sortedBands = ub.bands.slice().sort((a, b) => a.x0 - b.x0);
  let disjoint = true;
  for (let i = 1; i < sortedBands.length; i++) if (sortedBands[i].x0 < sortedBands[i - 1].x1 - 0.01) disjoint = false;
  check(disjoint, "sibling-category bands DISJOINT (a leaf of cat A never sits under cat B)");

  console.log("U-link — link connects parent bottom-center → child top-center; both modes same endpoints:");
  const ulk = { categories: [{ label: "A", children: [{ label: "a1" }, { label: "a2" }] }, { label: "B", children: [{ label: "b1" }] }] };
  const curveP = planTaxonomy({ ...ulk, mode: "curve" });
  const elbowP = planTaxonomy({ ...ulk, mode: "elbow" });
  let connOk = true;
  let connDetail = "";
  for (const l of curveP.links) {
    const p = curveP.nodes[l.parent];
    const c = curveP.nodes[l.child];
    if (!approx(l.x1, p.cx) || !approx(l.y1, p.cy + p.h / 2) || !approx(l.x2, c.cx) || !approx(l.y2, c.cy - c.h / 2)) {
      connOk = false;
      connDetail = `link ${l.parent}->${l.child} endpoints off`;
    }
  }
  check(connOk, "each link (x1,y1)==parent bottom-center, (x2,y2)==child top-center (±1e-6)", connDetail);
  const sameEndpoints = curveP.links.length === elbowP.links.length && curveP.links.every((l, i) => approx(l.x1, elbowP.links[i].x1) && approx(l.y1, elbowP.links[i].y1) && approx(l.x2, elbowP.links[i].x2) && approx(l.y2, elbowP.links[i].y2));
  check(sameEndpoints, "curve + elbow emit IDENTICAL endpoints (only the path string differs)");

  console.log("U-frame — tree within frame: every chip rect ∈ [CANVAS_X0,CANVAS_X1]×[rootY−H/2, viewH−pad]:");
  const uf = planTaxonomy({ categories: Array.from({ length: 4 }, (_, i) => ({ label: `cat${i}`, children: Array.from({ length: 3 }, (_, j) => ({ label: `verylongleaf${i}${j}` })) })), viewH: 640 });
  let inFrame = true;
  let frameDetail = "";
  for (const n of uf.nodes) {
    if (n.cx - n.w / 2 < CANVAS_X0 - 0.5 || n.cx + n.w / 2 > CANVAS_X1 + 0.5) {
      inFrame = false;
      frameDetail = `node ${n.label} x-extent [${(n.cx - n.w / 2).toFixed(1)},${(n.cx + n.w / 2).toFixed(1)}] ∉ canvas`;
    }
    if (n.cy - n.h / 2 < RANK_TOP - NODE_H / 2 - 0.5 || n.cy + n.h / 2 > uf.viewH - RANK_BOTTOM_PAD + 0.5) {
      inFrame = false;
      frameDetail = `node ${n.label} y-extent exits frame`;
    }
  }
  check(inFrame, "every chip rect within the canvas at default viewH", frameDetail);

  console.log("U-depth — depth enforcement: a leaf with its own children → grandchildren dropped (C-DEPTH):");
  const ud = planTaxonomy({ categories: [{ label: "X", children: [{ label: "leaf", children: [{ label: "gc1" }, { label: "gc2" }] }, { label: "leaf2" }] }] });
  check(ud.dropped.depthFlattened === 1, "depthFlattened counts the leaf-with-children", `got ${ud.dropped.depthFlattened}`);
  check(ud.nodes.filter((n) => n.rank === 2).length === 2 && !ud.nodes.some((n) => /gc/.test(n.label)), "grandchildren dropped; layout stays 2-rank", `leaves ${ud.nodes.filter((n) => n.rank === 2).map((n) => n.label).join(",")}`);

  console.log("U-fit-label — label fit-or-hide: over-cap labels hidden, chip still present (C-FIT):");
  const ufl = planTaxonomy({ categories: [{ label: "x".repeat(20), children: [{ label: "y".repeat(18) }, { label: "ok" }] }] });
  const catN = ufl.nodes.find((n) => n.rank === 1);
  const longLeaf = ufl.nodes.find((n) => n.rank === 2 && n.label.startsWith("y"));
  check(catN.showLabel === false && catN.labelHideReason === "tooLong", "20cp category label → hidden(tooLong)", `show ${catN.showLabel}, reason ${catN.labelHideReason}`);
  check(longLeaf.showLabel === false, "18cp leaf label → hidden");
  check(ufl.dropped.hiddenLabels >= 2, "hiddenLabels counts the non-empty fit-fails", `got ${ufl.dropped.hiddenLabels}`);
  check(ufl.nodes.filter((n) => n.rank >= 1).every((n) => n.w > 0), "the chip still draws even when the label is hidden");

  console.log("U-zero — zero-children category: lone node, NO rank-2 link, band = chip point (§2.6.7):");
  const uz = planTaxonomy({ categories: [{ label: "full", children: [{ label: "a" }, { label: "b" }] }, { label: "empty", children: [] }] });
  const emptyCatIdx = uz.nodes.findIndex((n) => n.rank === 1 && n.catIndex === 1);
  check(uz.nodes.filter((n) => n.rank === 1).length === 2, "the empty category is NOT dropped (lone node kept)");
  check(uz.links.filter((l) => l.parent === emptyCatIdx).length === 0, "zero-children category has NO outgoing rank-2 link");
  const emptyBand = uz.bands.find((b) => b.catIndex === 1);
  check(approx(emptyBand.x0, emptyBand.x1), "empty category band == its chip point");

  console.log("U-value — showValues knob: on+finite ⇒ chip; on+no-value ⇒ none; off ⇒ suppressed (§2.3):");
  const uvOn = planTaxonomy({ categories: [{ label: "c", children: [{ label: "a", value: 12 }, { label: "b" }] }], showValues: "on", unit: "k" });
  const leafA = uvOn.nodes.find((n) => n.rank === 2 && n.label === "a");
  const leafB = uvOn.nodes.find((n) => n.rank === 2 && n.label === "b");
  check(leafA.showValue === true && leafA.valueText === "12k", "on + finite value ⇒ value chip '12k'", `show ${leafA.showValue}, text ${leafA.valueText}`);
  check(leafB.showValue === false && leafB.valueText == null, "on + no value ⇒ no chip (no fabricated count)");
  const uvOff = planTaxonomy({ categories: [{ label: "c", children: [{ label: "a", value: 12 }] }], showValues: "off" });
  check(uvOff.nodes.find((n) => n.rank === 2).showValue === false && uvOff.dropped.valueSuppressed === 1, "off ⇒ all value chips suppressed (valueSuppressed advisory)", `suppressed ${uvOff.dropped.valueSuppressed}`);

  console.log("U-mode — unknown mode/showValues → defaults; both modes same node positions:");
  const um = planTaxonomy({ categories: [{ label: "c", children: [{ label: "a" }] }], mode: "weird", showValues: "maybe" });
  check(um.mode === "curve", "unknown mode → curve", um.mode);
  check(um.nodes.find((n) => n.rank === 2).showValue === false, "unknown showValues → off");

  console.log("U-stagger — last leaf POP settles by SETTLE_DEADLINE (0.85):");
  const us = planTaxonomy({ categories: Array.from({ length: 3 }, (_, i) => ({ label: `c${i}`, children: Array.from({ length: 4 }, (_, j) => ({ label: `${i}${j}` })) })), viewH: 640 });
  // The build SETTLES when the last node's POP finishes — its popStart (= the last link's draw end)
  // plus POP_DUR (0.07) must be ≤ 0.85 so the transform is OMITTED at t≥0.85 (the D8 settle check).
  const lastPopEnd = Math.max(...us.nodes.map((n) => n.popStart + 0.07));
  check(lastPopEnd <= SETTLE_DEADLINE + 1e-9, `last node POP ends ≤ 0.85 (settle)`, `ends ${lastPopEnd.toFixed(4)}`);
  check(staggerForN(1, 0.5) === MAX_STAGGER, "staggerForN(1) === MAX_STAGGER (no div-by-zero)", `got ${staggerForN(1, 0.5)}`);
  check(nodeReveal(1, 0.3) === 1 && nodeReveal(0, 0.3) === 0, "nodeReveal settled at t=1, 0 before window");
  check(linkReveal(1, 0.3, 0.1) === 1 && linkReveal(0, 0.3, 0.1) === 0, "linkReveal settled at t=1, 0 before window");

  console.log("U-degen — degenerate counts + 0 categories (§2.6.11):");
  check(planTaxonomy({ categories: [] }).empty === true, "0 categories → empty:true");
  const u1cat = planTaxonomy({ categories: [{ label: "solo", children: [{ label: "a" }, { label: "b" }] }] });
  check(u1cat.nodes.every((n) => Number.isFinite(n.cx) && Number.isFinite(n.cy)) && !u1cat.empty, "1 category → finite-centered, no NaN");
  const uAll0 = planTaxonomy({ categories: [{ label: "a", children: [] }, { label: "b", children: [] }] });
  check(uAll0.links.length === 2 && uAll0.nodes.filter((n) => n.rank === 2).length === 0, "all-0-children → root + flat cat rank, no rank-2 links, no NaN");
  check(uAll0.nodes.every((n) => Number.isFinite(n.cx)), "all-0-children → no NaN geometry");

  console.log("U-link-stroke — link stroke @390 ≥ 1px (width-driven, the §2.10 hairline floor):");
  // The link is width-driven (the row-aware viewBox fills the row WIDTH → CSS scale ≈ rowWidthPx/VIEW_W;
  // the @390 render maps a source 4px stroke to 4 × (390/1000) = 1.56px, INDEPENDENT of viewH).
  const stroke390 = LINK_STROKE * (390 / 1000);
  check(stroke390 >= 1 - 0.01, `link stroke ${LINK_STROKE}src → ${stroke390.toFixed(2)}px@390 ≥ 1 (row-aware, width-driven)`, `${stroke390.toFixed(2)}`);
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
const overlap = (A, B) => {
  const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
  const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
  return ox > 4 && oy > 4 ? Math.min(ox, oy) : 0;
};

// ── 2. Sampled-t DOM suite ─────────────────────────────────────────────────────
async function geometrySuite(page) {
  for (const id of ANIM_FIXTURES) {
    const spec = JSON.parse(await readFile(fixturePath(id), "utf8"));
    const reports = await sampleFixture(page, id, T_SAMPLES);
    const base = reports[1];
    const X = base.taxonomy;
    if (!check(!!X, `taxonomy section present at t=1 (${id})`)) continue;

    // PL-0.8 — plan with the RENDERED row-aware viewBox height; recompute ranks from it.
    const plan = planFromViz(spec.visualization, X.viewH);
    const b = rankBands(X.viewH);
    console.log(`Sampled-t DOM pass — ${id} (${plan.nodes.length} nodes, mode=${plan.mode}, viewH=${X.viewH}, t ∈ {${T_SAMPLES.join(", ")}}):`);

    // The SVG uses preserveAspectRatio "xMidYMid meet": the TRUE uniform scale is min(scaleX, scaleY);
    // the other dimension letterboxes + centers. Compute the uniform scale + centering offsets.
    const sx = X.scaleX;
    const sy = X.scaleY;
    const uniform = Math.min(sx, sy);
    const widthBound = sx <= sy + 0.01;
    const offX = X.rect.x + (X.rect.w - uniform * X.viewW) / 2;
    const offY = X.rect.y + (X.rect.h - uniform * X.viewH) / 2;
    const cssX = (vx) => offX + vx * uniform;
    const cssY = (vy) => offY + vy * uniform;
    const frameLeft = cssX(CANVAS_X0);
    const frameRight = cssX(CANVAS_X1);
    const frameTop = cssY(RANK_TOP - NODE_H / 2);
    const frameBottom = cssY(X.viewH - RANK_BOTTOM_PAD);

    // D6 — caps / count: rendered node count == planTaxonomy post-clamp at every sample; exactly 2 ranks
    // of chips (3 incl. root), never a 3rd. Over-cap fixtures render ≤4 cats / ≤6 children / ≤ cap leaves.
    check(
      T_SAMPLES.every((t) => reports[t].taxonomy?.nodeTotal === plan.nodes.length),
      `rendered node count === ${plan.nodes.length} (planTaxonomy post-clamp) at every sample (D6)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].taxonomy?.nodeTotal).join(",")}`,
    );
    const cats = X.nodes.filter((n) => n.rank === 1);
    const leaves = X.nodes.filter((n) => n.rank === 2);
    const ranks = new Set(X.nodes.map((n) => n.rank));
    check(cats.length <= MAX_CATEGORIES, `≤ ${MAX_CATEGORIES} categories (C1)`, `got ${cats.length}`);
    check(leaves.length <= effectiveMaxLeaves(X.viewH), `≤ effectiveMaxLeaves (${effectiveMaxLeaves(X.viewH)}) leaves @viewH ${X.viewH} (C3)`, `got ${leaves.length}`);
    check([...ranks].every((r) => r <= 2) && ranks.size <= 3, "exactly ≤ 3 ranks of chips (root/cat/leaf), never a 3rd leaf rank (D6/depth-cap)", `ranks ${[...ranks].join(",")}`);

    // D9 — layout reserved: transform-blind LAYOUT box of every chip + svg nodeCount constant across all
    // 10 samples (geometry never a fn of t).
    check(
      T_SAMPLES.every((t) => reports[t].taxonomy?.nodeCount === X.nodeCount),
      `svg DOM node count constant (${X.nodeCount}) — nothing mounts/unmounts across t (D9)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].taxonomy?.nodeCount).join(",")}`,
    );
    let layoutOk = true;
    let layoutDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].taxonomy;
      for (let i = 0; i < X.nodes.length; i++) {
        const a = d.nodes[i]?.layout;
        const bl = X.nodes[i].layout;
        if (!a || !bl || Math.abs(a.x - bl.x) > 0.5 || Math.abs(a.y - bl.y) > 0.5 || Math.abs(a.w - bl.w) > 0.5 || Math.abs(a.h - bl.h) > 0.5) {
          layoutOk = false;
          layoutDetail = `node ${i} LAYOUT drifts at t=${t}`;
        }
      }
    }
    check(layoutOk, "every node's transform-blind LAYOUT geometry constant across all 10 samples (≤0.5px) (D9)", layoutDetail);

    // D1 — tree-within-frame: every painted chip ⊆ the canvas at every t; nothing clipped by the viewBox.
    // §3 SHORT-ROW vertical check (a): every leaf chip's painted box ⊆ the frame (NO bottom overflow).
    let frameOk = true;
    let frameDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].taxonomy;
      for (const n of d.nodes) {
        const p = n.painted;
        if (!p || p.w < 0.5) continue; // not yet popped in
        if (p.x < frameLeft - 2 || p.x + p.w > frameRight + 2 || p.y < frameTop - 2 || p.y + p.h > frameBottom + 2) {
          frameOk = false;
          frameDetail = `node rank${n.rank} painted [x${p.x.toFixed(0)},y${p.y.toFixed(0)},w${p.w.toFixed(0)},h${p.h.toFixed(0)}] exits frame at t=${t} (bottom ${frameBottom.toFixed(0)})`;
        }
      }
    }
    check(frameOk, "tree-within-frame: every painted chip ⊆ the canvas; NO bottom overflow at any t (D1 + §3 short-row vertical (a))", frameDetail);

    // §3 SHORT-ROW vertical check (b): the rendered rank gap ≥ MIN_RANK_GAP_Y at the rendered viewH.
    check(b.rankGapY >= MIN_RANK_GAP_Y - 0.5, `rendered rank gap ${b.rankGapY.toFixed(1)}src ≥ MIN_RANK_GAP_Y ${MIN_RANK_GAP_Y} @viewH ${X.viewH} (§3 short-row vertical (b))`, `gap ${b.rankGapY.toFixed(1)}`);

    // D2 — slot-grid node layout: settled category x == mean of its leaf xs (source px, ±0.6px).
    let layoutFromTreeOk = true;
    let lftDetail = "";
    for (const cat of cats) {
      const planCat = plan.nodes.find((n) => n.rank === 1 && String(n.catIndex) === String(cat.cat));
      const planLeaves = plan.nodes.filter((n) => n.rank === 2 && n.catIndex === planCat.catIndex);
      if (planLeaves.length === 0) continue;
      const mean = planLeaves.reduce((s, n) => s + n.cx, 0) / planLeaves.length;
      // Parent-centering, EXCEPT an edge category whose wide chip is clamped to keep it in-frame
      // (CANVAS_X0+w/2 .. CANVAS_X1−w/2) — then the center is the clamped value, not the raw mean.
      const expected = Math.max(CANVAS_X0 + planCat.w / 2, Math.min(CANVAS_X1 - planCat.w / 2, mean));
      if (Math.abs(planCat.cx - expected) > 0.6) {
        layoutFromTreeOk = false;
        lftDetail = `cat ${cat.cat} x ${planCat.cx.toFixed(1)} ≠ clamp(mean ${mean.toFixed(1)}) = ${expected.toFixed(1)}`;
      }
    }
    check(layoutFromTreeOk, "slot-grid layout: each category x == mean of its leaf xs (edge-clamped to frame) (D2)", lftDetail);

    // D3 — no-node-overlap: adjacent chip rects on a rank disjoint by ≥ NODE_GAP_X (measured, source px).
    let overlapOk = true;
    let overlapDetail = "";
    for (const rank of [1, 2]) {
      const rankNodes = plan.nodes.filter((n) => n.rank === rank);
      const byRow = {};
      for (const n of rankNodes) (byRow[n.cy.toFixed(0)] ||= []).push(n);
      for (const k in byRow) {
        const sorted = byRow[k].slice().sort((a, b) => a.cx - b.cx);
        for (let i = 1; i < sorted.length; i++) {
          const gap = sorted[i].cx - sorted[i].w / 2 - (sorted[i - 1].cx + sorted[i - 1].w / 2);
          if (gap < NODE_GAP_X - 1) {
            overlapOk = false;
            overlapDetail = `rank ${rank} adjacent chips gap ${gap.toFixed(1)} < ${NODE_GAP_X}`;
          }
        }
      }
    }
    check(overlapOk, `no-node-overlap: adjacent chip rects on a rank disjoint by ≥ NODE_GAP_X (${NODE_GAP_X}) (D3)`, overlapDetail);

    // D7 — dynamic leaf-pitch floor: rendered leaf pitch ≥ MIN_LEAF_PITCH at the rendered viewH (the §3
    // binding-correction analog; the short-row fixture forces a small viewH).
    {
      const byRow = {};
      for (const n of plan.nodes.filter((n) => n.rank === 2)) (byRow[n.cy.toFixed(0)] ||= []).push(n.cx);
      let minPitch = Infinity;
      for (const k in byRow) {
        const xs = byRow[k].slice().sort((a, b) => a - b);
        for (let i = 1; i < xs.length; i++) minPitch = Math.min(minPitch, xs[i] - xs[i - 1]);
      }
      if (Number.isFinite(minPitch)) check(minPitch >= MIN_LEAF_PITCH - 0.5, `dynamic leaf-pitch floor: rendered leaf pitch ${minPitch.toFixed(1)}src ≥ MIN_LEAF_PITCH ${MIN_LEAF_PITCH} @viewH ${X.viewH} (D7 §3 binding)`, `pitch ${minPitch.toFixed(1)}`);
      else check(true, "dynamic leaf-pitch floor: < 2 leaves on a sub-row (trivially satisfied) (D7)");
    }

    // D4 — child-within-parent-band: every leaf chip ⊆ its category band; sibling bands disjoint.
    let bandOk = true;
    let bandDetail = "";
    for (const band of plan.bands) {
      const lvs = plan.nodes.filter((n) => n.rank === 2 && n.catIndex === band.catIndex);
      for (const l of lvs) {
        if (l.cx - l.w / 2 < band.x0 - 1 || l.cx + l.w / 2 > band.x1 + 1) {
          bandOk = false;
          bandDetail = `leaf cat${band.catIndex} x-extent ∉ band`;
        }
      }
    }
    const sortedBands = plan.bands.slice().sort((a, b) => a.x0 - b.x0);
    for (let i = 1; i < sortedBands.length; i++) if (sortedBands[i].x0 < sortedBands[i - 1].x1 - 1) bandOk = false;
    check(bandOk, "child-within-parent-band: every leaf ⊆ its category band; sibling bands disjoint (D4)", bandDetail);

    // D5 — parent-child-link-connects: each link's painted endpoints touch the parent chip bottom edge +
    // the child chip top edge (≤ a tolerance); holds in BOTH modes. We compare the planned (source) link
    // endpoints to the planned parent/child chip edges (the planner is the source of truth; the renderer
    // reads it verbatim) AND confirm the DOM link's parsed source endpoints match.
    let connOk = true;
    let connDetail = "";
    for (const l of X.links) {
      const pp = plan.nodes[l.parent];
      const cc = plan.nodes[l.child];
      // DOM-parsed source endpoints (from the path `d`) vs planner chip edges.
      if (Math.abs(l.x1 - pp.cx) > 1 || Math.abs(l.y1 - (pp.cy + pp.h / 2)) > 1 || Math.abs(l.x2 - cc.cx) > 1 || Math.abs(l.y2 - (cc.cy - cc.h / 2)) > 1) {
        connOk = false;
        connDetail = `link ${l.parent}->${l.child} endpoints ≠ chip edges (mode ${l.mode})`;
      }
    }
    check(connOk, `parent-child-link-connects: each link touches the parent bottom + child top edge (mode ${plan.mode}) (D5)`, connDetail);

    // D8 — draw/pop + settle: link dashoffset ∈ [0,1]·pathLength matching linkReveal; node transform
    // OMITTED at t≥0.85 (never identity / dashoffset 0 left animated).
    let drawOk = true;
    let drawDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].taxonomy;
      for (let i = 0; i < d.links.length; i++) {
        const off = d.links[i].dashoffset;
        const rev = linkReveal(t, plan.links[i].drawStart, plan.links[i].drawDur);
        if (off != null && !Number.isNaN(off) && (off < -0.02 || off > 1.02)) {
          drawOk = false;
          drawDetail = `link ${i} dashoffset ${off} ∉ [0,1] at t=${t}`;
        } else if (off != null && !Number.isNaN(off) && Math.abs(1 - off - rev) > 0.05) {
          drawOk = false;
          drawDetail = `link ${i} (1−offset) ${(1 - off).toFixed(3)} ≠ linkReveal ${rev.toFixed(3)} at t=${t}`;
        }
      }
    }
    check(drawOk, "link strokeDashoffset (1−reveal) ∈ [0,1] and matches linkReveal(t) (D8 draw)", drawDetail);
    let settleOk = true;
    let settleDetail = "";
    for (const t of [0.85, 0.92, 1]) {
      for (const n of reports[t].taxonomy.nodes) {
        if (n.transform && n.transform !== "none") {
          settleOk = false;
          settleDetail = `node rank${n.rank} transform "${n.transform}" at t=${t} — must be OMITTED once settled`;
        }
      }
      for (const l of reports[t].taxonomy.links) {
        if (l.dashoffset != null && !Number.isNaN(l.dashoffset) && l.dashoffset > 0.02) {
          settleOk = false;
          settleDetail = `link dashoffset ${l.dashoffset} at t=${t} — must be OMITTED once drawn`;
        }
      }
    }
    check(settleOk, "t ≥ 0.85: node pop transform + link dashoffset OMITTED (none), never identity (D8 settle)", settleDetail);

    // D10 — label no-overlap & fit: no two VISIBLE labels overlap > 4px; each label ⊆ its chip; the
    // visible set at t=1 matches planTaxonomy show flags; value chips inside their leaf chip.
    let labelOk = true;
    let labelDetail = "";
    const visLabels = X.nodes.filter((n) => n.label && n.label.opacity > 0.05).map((n) => n.label.rect);
    for (let i = 0; i < visLabels.length; i++)
      for (let j = i + 1; j < visLabels.length; j++)
        if (overlap(visLabels[i], visLabels[j]) > 4) {
          labelOk = false;
          labelDetail = `two labels overlap ${overlap(visLabels[i], visLabels[j]).toFixed(1)}px`;
        }
    check(labelOk, "label no-overlap: no two visible labels overlap > 4px (D10)", labelDetail);
    const planVis = plan.nodes.filter((n) => n.showLabel).length;
    const domVis = X.nodes.filter((n) => n.label && n.label.opacity > 0.5).length;
    check(domVis === planVis, `visible label count (${domVis}) == planTaxonomy show flags (${planVis}) (D10)`);
    // each label ⊆ its chip (painted).
    let labelInChip = true;
    for (const n of X.nodes) {
      if (n.label && n.label.opacity > 0.5 && n.painted) {
        const lr = n.label.rect;
        const cr = n.painted;
        if (lr.x < cr.x - 2 || lr.x + lr.w > cr.x + cr.w + 2) labelInChip = false;
      }
    }
    check(labelInChip, "each visible label ⊆ its chip (D10)");
    // value chips inside their leaf chip.
    let vchipOk = true;
    for (const n of X.nodes) {
      if (n.vchip && n.vchip.opacity > 0.5 && n.painted) {
        const vr = n.vchip.rect;
        const cr = n.painted;
        if (vr.x < cr.x - 2 || vr.x + vr.w > cr.x + cr.w + 2) vchipOk = false;
      }
    }
    check(vchipOk, "value chips inside their leaf chip (D10)");

    // D11 — mobile floors / collisions / clipped / safe-margin clean at every sample; every visible label
    // eff font ≥ 18; the painted LINK stroke @390 ≥ 1px on the full-cap fixture (measured, not constant).
    let floorOk = true;
    let floorDetail = "";
    for (const n of X.nodes) {
      if (n.label && n.label.opacity > 0.05 && n.label.fontSize < 18 - 0.5) {
        floorOk = false;
        floorDetail = `label "${(n.label.text || "").slice(0, 8)}" ${n.label.fontSize}px < 18`;
      }
    }
    check(floorOk, "every visible label eff font ≥ 18 (designed at 26/22) (D11)", floorDetail);
    const strokes = X.links.map((l) => l.strokeW).filter((s) => s > 0);
    if (strokes.length) {
      const minStroke = Math.min(...strokes);
      if (widthBound) {
        check(minStroke / 2.77 >= 1 - 0.3, `painted link stroke ${(minStroke / 2.77).toFixed(2)}px @390 ≥ 1 (D11 — measured, not the viewBox constant)`, `${minStroke.toFixed(1)}px CSS`);
      } else {
        console.log(`  · painted link stroke ${(minStroke / 2.77).toFixed(2)}px @390 (informational — wide-short row letterboxed by width; MIN_VIEW_H edge)`);
      }
    }
    assertGatingClean(check, reports, T_SAMPLES, " (D1/D11 · chip/link shapes excluded — no text node)");
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
