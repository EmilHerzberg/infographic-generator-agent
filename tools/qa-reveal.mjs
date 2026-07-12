#!/usr/bin/env node
// PL-1.4 + PL-1.5 deterministic gate — richer reveal of the TWO static text primitives
// (ClaimList "graveyard beat" + ComparisonColumns per-column/per-item stagger), no LLM.
//
//   node tools/qa-reveal.mjs --baseline-capture   # record the comparison t=1 pre-promotion
//                                                  #   baseline (run BEFORE extracting the component!)
//   npm run dev                                    # in another terminal — DOM passes need the dev server
//   npm run qa:reveal                              # full: sampled-t DOM passes + t=1 baseline equality
//
// Mirrors tools/qa-decompbar.mjs structure (one headless Chromium, Preview `?id&t`, the shared
// inspect.mjs measure(), the sampled-t discipline reused on TEXT primitives — no schema change,
// no new check TYPE). Covers handoffs PL-1.4-claimlist-reveal.md §1 (LC1–LC6) and
// PL-1.5-comparison-stagger.md §1 (CC1–CC6).
//
// Sampled-t set T = {0, 0.2, 0.35, 0.5, 0.65, 0.8, 1} (spec §1). At every sample:
//   • per-element LAYOUT box (transform-blind offset*) constant ≤0.5px across all samples
//     [animation-reserve, REUSED — LC2 / CC2]; node count constant (no mount/unmount).
//   • bounded transforms + literal "none" at settle [transform-discipline, REUSED — LC3 / CC3]:
//     the × kill marker scale ∈ [0,1] and OMITTED at t=0.8/1; the entry/item translateX → 0 and
//     OMITTED at settle.
//   • collisions / clipped / outOfSafeMargin / belowMobileFloor clean at EVERY sample [REUSED].
//   • t=1 final frame: claim + reality (PL-1.4) / every item (PL-1.5) full-opacity, transforms
//     omitted [final-frame, REUSED — LC5 / CC5].
//   • PL-1.5 only: t=1 structural identity vs the captured baseline (geometry + text + colors
//     equal) [static-identity, REUSED PL-1.3 variant — CC5].
//
// Rev B (PL-1.4 §4 + PL-1.5 §4) — design polish, additional checks layered on the same passes:
//   • RC7 (ClaimList) — strike-through scaleX ∈ [0,1], OMITTED at settle, strike box ⊆ claim-text
//     span box at every sample (the strike never extends past the words).
//   • RC8 (ClaimList) — × STAMP scale ∈ [1,1.3] + rotation ∈ [−8°,0°], OMITTED at settle; the
//     oversized 1.3× × never collides (assertGatingClean's collisions row proves it).
//   • RC9 (ClaimList) — t=1 final frame: strike full-width + transform omitted, × stamped.
//   • CC7 (comparison) — PAIRED reveal: per-ROW stagger across BOTH columns (left item i + right
//     item i share one reveal window); rows stagger top→bottom; settle ≤0.85; t=1 layout unchanged.
//   • CC8 (comparison) — WEIGHTED failure side: only the bad (friction) column carries the burnt
//     wash; its panel bg differs from the good column's at t=1 (the asymmetry signal); item/icon/
//     text geometry+colors == the (re)captured baseline; lowContrast/floors clean.
//   The PL-1.5 t=1 baseline was RECAPTURED as the intended Rev B state (it now records each
//   column's panel bg + wash; the item/icon/text geometry is byte-identical to the prior baseline).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BASE, VIEWPORT, loadReport, sampleFixture, sampleWindows, withBrowser, assertGatingClean } from "./lib/sampled-t.mjs";
import {
  planNarrative,
  narrativeDuration,
  narrativeFrames,
  narrativeProgressT,
  postDurationSeconds,
  READ_FLOOR,
  READ_FLOOR_MIN,
  READ_HARD_MIN,
  ASSEMBLY_END_T,
  CEIL,
  FLOOR_DUR,
  DEFAULT_DUR,
  FPS,
  CLAIM_ITEM_CAP,
  COMPARISON_ITEM_CAP,
  COMPARISON_INPLACE_PACE,
} from "../src/lib/narrative.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_CAPTURE = process.argv.includes("--baseline-capture");
const UNIT_ONLY = process.argv.includes("--unit");

const T_SAMPLES = [0, 0.2, 0.35, 0.5, 0.65, 0.8, 1];
const SETTLE = 0.8; // settle deadline ≤ 0.85 — at t=0.8 both primitives are fully settled

// Rev B × stamp bounds (RC8) — must match ClaimList.tsx X_OVERSCALE / X_OVERROT.
const X_OVERSCALE_MAX = 1.3; // stamp scale ∈ [1, 1.3]
const X_OVERROT_MIN = -8; // stamp rotation ∈ [−8°, 0°]

// PL-1.4 ClaimList fixtures (incl. the 4-entry long-text stress fixture).
const CLAIM_FIXTURES = ["fuzz-09-claims-min", "fuzz-10-claims-3entries-long", "fuzz-11-claims-2entries-m2", "fuzz-30-claims-stress-anim"];
// PL-1.5 comparison fixtures (incl. the 4-item-per-column long-text stress fixture).
const CMP_FIXTURES = ["fuzz-04-comparison-min", "fuzz-05-comparison-3items-m2", "fuzz-31-comparison-stress-anim"];
const BASELINE_DIR = join(ROOT, "planning", "primitive-library", "baselines", "pl-1.5-comparison");

const fixturePath = (id) =>
  join(ROOT, "planning", "fixtures", "renderfuzz", `${id}.render.json`);

let failures = 0;
const check = (ok, name, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "✔" : "✖"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  return ok;
};

const rectEq = (a, b, tol = 0.5) =>
  a && b && ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) <= tol);
const layoutEq = (a, b, tol = 0.5) =>
  a && b && ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) <= tol);

// A computed `transform` is bounded-and-omitted-at-settle compliant iff it is "none" or a
// pure scale/translate matrix within bounds. For the × kill marker: scale ∈ [0,1]. For the
// entry/item slide-in: translateX ∈ [−MAXTX, 0] (px), scale 1.
const parseMatrix = (transform) => {
  if (transform === "none") return { none: true };
  const m = (transform.match(/matrix\(([^)]+)\)/) || [])[1]?.split(",").map(Number);
  if (!m || m.length < 6) return null;
  return { none: false, a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] };
};

// Driver is the shared sampled-`t` harness (tools/lib/sampled-t.mjs, CHECKS.md gap #2).
const loadPage = (page, id, t) => loadReport(page, id, t);

// ── PL-1.4 ClaimList sampled-t suite ──────────────────────────────────────────
async function claimSuite(page) {
  for (const id of CLAIM_FIXTURES) {
    const spec = JSON.parse(await readFile(fixturePath(id), "utf8"));
    const declared = spec.visualization.entries.length;
    const expected = Math.min(declared, 4); // LC1 — slice(0,4)
    console.log(`ClaimList sampled-t — ${id} (declared ${declared}, t ∈ {${T_SAMPLES.join(", ")}}):`);

    const reports = await sampleFixture(page, id, T_SAMPLES);
    const base = reports[1];
    const C = base.claimList;
    if (!check(!!C, "claimList section present at t=1")) continue;

    // LC1 entry cap + LC2 node-count constancy.
    check(C.entries.length === expected, `entries === ${expected} (≤4 cap, LC1)`, `got ${C.entries.length}`);
    check(
      T_SAMPLES.every((t) => reports[t].claimList?.entries.length === expected),
      "entry count constant across every sample",
      `counts: ${T_SAMPLES.map((t) => reports[t].claimList?.entries.length).join(",")}`,
    );
    check(
      T_SAMPLES.every((t) => reports[t].claimList?.nodeCount === C.nodeCount),
      `DOM node count constant (${C.nodeCount}) — nothing mounts/unmounts across t (LC2)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].claimList?.nodeCount).join(",")}`,
    );

    // LC2 layout-box static: every entry's box (entry/header/claim/reality/kill) geometrically
    // constant across ALL samples ≤0.5px, transform-blind (offset*).
    let geomOk = true, geomDetail = "";
    for (const t of T_SAMPLES) {
      const c = reports[t].claimList;
      for (let i = 0; i < C.entries.length; i++) {
        for (const part of ["entry", "header", "claim", "reality", "kill"]) {
          const a = c.entries[i]?.[part]?.layout, b = C.entries[i][part]?.layout;
          if (b && !layoutEq(a, b)) { geomOk = false; geomDetail = `entry ${i} ${part} layout drifts at t=${t}`; }
        }
      }
    }
    check(geomOk, "every entry box (header/claim/reality/×) layout constant across all 7 samples (≤0.5px, LC2)", geomDetail);

    // LC3 transform discipline: the × kill marker scale ∈ [0,1] and OMITTED at settle; the
    // entry slide-in translateX ∈ [−16, 0] and OMITTED at settle (never an identity transform).
    // (The × kill marker's transform is now the Rev B STAMP — bounded + asserted by RC8 below,
    //  not here, since it's scale+rotation rather than the old scale-only pop.)
    let txOk = true, txDetail = "";
    for (const t of T_SAMPLES) {
      const c = reports[t].claimList;
      for (let i = 0; i < c.entries.length; i++) {
        const entry = c.entries[i].entry;
        if (entry) {
          const m = parseMatrix(entry.transform);
          if (!m) { txOk = false; txDetail = `entry ${i} transform "${entry.transform}" unparseable at t=${t}`; }
          else if (!m.none) {
            if (Math.abs(m.a - 1) > 1e-6 || Math.abs(m.d - 1) > 1e-6 || m.e < -16.5 || m.e > 0.5)
              { txOk = false; txDetail = `entry ${i} transform "${entry.transform}" not translateX∈[−16,0] at t=${t}`; }
          }
          if (t >= SETTLE && !(m && m.none)) { txOk = false; txDetail = `entry ${i} transform "${entry.transform}" at t=${t} — must be OMITTED (none) once settled (LC3)`; }
        }
      }
    }
    check(txOk, "entry translateX∈[−16,0]; OMITTED (none) at t ≥ 0.8 (LC3)", txDetail);

    // LC5 final frame: at t=1 every entry's claim AND reality are full opacity (the entry's
    // own opacity carries header+claim; the reality line rides the second beat). No permanent dim.
    let finalOk = true, finalDetail = "";
    for (let i = 0; i < C.entries.length; i++) {
      const e = C.entries[i];
      if (e.entry && Math.abs(e.entry.opacity - 1) > 1e-3) { finalOk = false; finalDetail = `entry ${i} opacity ${e.entry.opacity} at t=1`; }
      if (e.claim && Math.abs(e.claim.opacity - 1) > 1e-3) { finalOk = false; finalDetail = `entry ${i} claim opacity ${e.claim.opacity} at t=1`; }
      if (e.reality && Math.abs(e.reality.opacity - 1) > 1e-3) { finalOk = false; finalDetail = `entry ${i} reality opacity ${e.reality.opacity} at t=1`; }
    }
    check(finalOk, "t=1: every entry claim + reality full-opacity (LC5 — no permanent dim)", finalDetail);

    // Reveal ordering (the two-beat "graveyard" sequence — claim made, THEN reality strikes):
    // the reality line trails the entry/claim, so for every entry at every sample its reality
    // opacity is ≤ its entry opacity (the reality can never lead the claim it contradicts).
    let orderOk = true, orderDetail = "";
    for (const t of T_SAMPLES) {
      for (const e of reports[t].claimList.entries) {
        const eo = e.entry?.opacity ?? 1, ro = e.reality?.opacity ?? 0;
        if (ro > eo + 1e-3) { orderOk = false; orderDetail = `entry ${e.index} reality opacity ${ro} > entry opacity ${eo} at t=${t}`; }
      }
    }
    check(orderOk, "two-beat ordering: reality line trails the entry/claim at every sample (the graveyard beat)", orderDetail);

    // RC7 (Rev B) — strike-through: scaleX ∈ [0,1]; OMITTED (none) at settle; the strike line's
    // painted box ⊆ the claim TEXT span's box at every sample (never extends past the words).
    // The scaleX(killP) origin-left shrinks the painted box from the left edge, so the strike
    // rect must always sit within the claim-span rect (±0.5px tolerance for sub-pixel rounding).
    let strikeOk = true, strikeDetail = "";
    for (const t of T_SAMPLES) {
      const c = reports[t].claimList;
      for (let i = 0; i < c.entries.length; i++) {
        const e = c.entries[i], strike = e.strike, span = e.claimSpan;
        if (!strike) { strikeOk = false; strikeDetail = `entry ${i} has no data-claim-strike at t=${t}`; continue; }
        const m = parseMatrix(strike.transform);
        if (!m) { strikeOk = false; strikeDetail = `entry ${i} strike transform "${strike.transform}" unparseable at t=${t}`; }
        else if (!m.none) {
          // scaleX is matrix a; b/c/d must be 0/0/1 (pure horizontal scale, no rotate/skew).
          if (m.a < -1e-6 || m.a > 1 + 1e-6 || m.b !== 0 || m.c !== 0 || Math.abs(m.d - 1) > 1e-6)
            { strikeOk = false; strikeDetail = `entry ${i} strike transform "${strike.transform}" not scaleX∈[0,1] at t=${t}`; }
        }
        if (t >= SETTLE && !(m && m.none)) { strikeOk = false; strikeDetail = `entry ${i} strike transform "${strike.transform}" at t=${t} — must be OMITTED (none) once settled (RC7)`; }
        // strike box ⊆ claim-span box (within ≤0.5px) at every sample.
        if (span && strike.rect.w > 0.01) {
          const s = strike.rect, p = span.rect;
          if (s.x < p.x - 0.5 || s.y < p.y - 0.5 || s.x + s.w > p.x + p.w + 0.5 || s.y + s.h > p.y + p.h + 0.5)
            { strikeOk = false; strikeDetail = `entry ${i} strike box {${s.x.toFixed(1)},${s.y.toFixed(1)},${s.w.toFixed(1)},${s.h.toFixed(1)}} ⊄ claim-span {${p.x.toFixed(1)},${p.y.toFixed(1)},${p.w.toFixed(1)},${p.h.toFixed(1)}} at t=${t}`; }
        }
      }
    }
    check(strikeOk, "RC7 strike: scaleX∈[0,1] + OMITTED at settle; strike box ⊆ claim-span box at every sample", strikeDetail);

    // RC8 (Rev B) — × stamp: during the stamp the × transform is scale ∈ [1,1.3] + rotation
    // ∈ [−8°,0°]; literal "none" at settle. (collisions clean at every sample — already asserted
    // by assertGatingClean below — proves the oversized 1.3× × never collides.)
    let stampOk = true, stampDetail = "";
    for (const t of T_SAMPLES) {
      const c = reports[t].claimList;
      for (let i = 0; i < c.entries.length; i++) {
        const kill = c.entries[i].kill;
        if (!kill) continue;
        const m = parseMatrix(kill.transform);
        if (!m) { stampOk = false; stampDetail = `entry ${i} × transform "${kill.transform}" unparseable at t=${t}`; }
        else if (!m.none) {
          // matrix(a,b,c,d,e,f) for scale(s)·rotate(θ): a=d=s·cosθ, b=s·sinθ, c=−s·sinθ.
          const s = Math.hypot(m.a, m.b); // uniform scale magnitude
          const deg = (Math.atan2(m.b, m.a) * 180) / Math.PI; // rotation in degrees
          if (s < 1 - 1e-3 || s > X_OVERSCALE_MAX + 1e-3)
            { stampOk = false; stampDetail = `entry ${i} × scale ${s.toFixed(3)} ∉ [1,1.3] at t=${t}`; }
          if (deg < X_OVERROT_MIN - 0.1 || deg > 0.1)
            { stampOk = false; stampDetail = `entry ${i} × rotation ${deg.toFixed(2)}° ∉ [−8,0] at t=${t}`; }
        }
        if (t >= SETTLE && !(m && m.none)) { stampOk = false; stampDetail = `entry ${i} × transform "${kill.transform}" at t=${t} — must be OMITTED (none) once settled (RC8)`; }
      }
    }
    check(stampOk, "RC8 stamp: × scale∈[1,1.3] + rotation∈[−8,0]; OMITTED at settle (the oversized × never collides — see collisions)", stampDetail);

    // RC9 (Rev B) — final frame at t=1: strike scaleX=1 (transform omitted ⇒ natural full width),
    // × stamped (transform omitted), claim + reality legible (covered by LC5 above). Here assert
    // the Rev B transforms are settled and the strike spans the full claim-span width.
    let rc9Ok = true, rc9Detail = "";
    for (let i = 0; i < C.entries.length; i++) {
      const e = C.entries[i];
      if (e.strike) {
        const m = parseMatrix(e.strike.transform);
        if (!(m && m.none)) { rc9Ok = false; rc9Detail = `entry ${i} strike transform "${e.strike.transform}" at t=1 — must be OMITTED (scaleX=1 natural)`; }
        if (e.claimSpan && Math.abs(e.strike.rect.w - e.claimSpan.rect.w) > 1.0)
          { rc9Ok = false; rc9Detail = `entry ${i} strike width ${e.strike.rect.w.toFixed(1)} ≠ claim-span width ${e.claimSpan.rect.w.toFixed(1)} at t=1 (strike not full)`; }
      }
      if (e.kill) {
        const m = parseMatrix(e.kill.transform);
        if (!(m && m.none)) { rc9Ok = false; rc9Detail = `entry ${i} × transform "${e.kill.transform}" at t=1 — must be OMITTED`; }
      }
    }
    check(rc9Ok, "RC9 final frame: strike full-width + transform omitted; × stamped (transform omitted) at t=1", rc9Detail);

    // Gating checks clean at EVERY sample.
    assertGatingClean(check, reports, T_SAMPLES);
  }
}

// ── PL-1.5 comparison sampled-t suite ─────────────────────────────────────────
async function comparisonSuite(page) {
  for (const id of CMP_FIXTURES) {
    const spec = JSON.parse(await readFile(fixturePath(id), "utf8"));
    const expLeft = Math.min(spec.visualization.left.items.length, 4);
    const expRight = Math.min(spec.visualization.right.items.length, 4);
    console.log(`comparison sampled-t — ${id} (left ${expLeft}/right ${expRight}, t ∈ {${T_SAMPLES.join(", ")}}):`);

    const reports = await sampleFixture(page, id, T_SAMPLES);
    const base = reports[1];
    const M = base.comparison;
    if (!check(!!M, "comparison section present at t=1")) continue;

    // CC1 item cap + side ordering + CC2 node-count constancy.
    check(M.columns.length === 2 && M.columns[0].side === "left" && M.columns[1].side === "right",
      "two columns, left then right (data-cmp-col)", `got ${M.columns.map((c) => c.side).join(",")}`);
    check(M.columns[0]?.items.length === expLeft && M.columns[1]?.items.length === expRight,
      `items ≤4/col (left ${expLeft}, right ${expRight}, CC1)`,
      `got ${M.columns.map((c) => c.items.length).join("/")}`);
    check(
      T_SAMPLES.every((t) => reports[t].comparison?.nodeCount === M.nodeCount),
      `DOM node count constant (${M.nodeCount}) — nothing mounts/unmounts across t (CC2)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].comparison?.nodeCount).join(",")}`,
    );

    // CC2 item-box static: every item box (and its icon + text) geometrically constant across
    // ALL samples ≤0.5px, transform-blind (offset*).
    let geomOk = true, geomDetail = "";
    for (const t of T_SAMPLES) {
      const m = reports[t].comparison;
      for (let ci = 0; ci < M.columns.length; ci++) {
        for (let ii = 0; ii < M.columns[ci].items.length; ii++) {
          const a = m.columns[ci]?.items[ii]?.layout, b = M.columns[ci].items[ii].layout;
          if (!layoutEq(a, b)) { geomOk = false; geomDetail = `col ${ci} item ${ii} layout drifts at t=${t}`; }
        }
      }
    }
    check(geomOk, "every item box layout constant across all 7 samples (≤0.5px, CC2)", geomDetail);

    // CC3 transform discipline: item translateX ∈ [−12,0] + optional bounded icon scale ∈ [0,1];
    // both OMITTED (none) at settle (never an identity transform).
    let txOk = true, txDetail = "";
    for (const t of T_SAMPLES) {
      const m = reports[t].comparison;
      for (const col of m.columns) {
        for (let ii = 0; ii < col.items.length; ii++) {
          const it = col.items[ii];
          const mt = parseMatrix(it.transform);
          if (!mt) { txOk = false; txDetail = `${col.side} item ${ii} transform "${it.transform}" unparseable at t=${t}`; }
          else if (!mt.none) {
            if (Math.abs(mt.a - 1) > 1e-6 || Math.abs(mt.d - 1) > 1e-6 || mt.e < -12.5 || mt.e > 0.5)
              { txOk = false; txDetail = `${col.side} item ${ii} transform "${it.transform}" not translateX∈[−12,0] at t=${t}`; }
          }
          if (t >= SETTLE && !(mt && mt.none)) { txOk = false; txDetail = `${col.side} item ${ii} transform "${it.transform}" at t=${t} — must be OMITTED (none) once settled (CC3)`; }
          if (it.icon) {
            const mi = parseMatrix(it.icon.transform);
            if (mi && !mi.none) {
              const s = mi.a;
              if (s < -1e-6 || s > 1 + 1e-6 || Math.abs(mi.d - s) > 1e-6 || mi.b !== 0 || mi.c !== 0)
                { txOk = false; txDetail = `${col.side} item ${ii} icon transform "${it.icon.transform}" not scale∈[0,1] at t=${t}`; }
            }
            if (t >= SETTLE && !(mi && mi.none)) { txOk = false; txDetail = `${col.side} item ${ii} icon transform "${it.icon.transform}" at t=${t} — must be OMITTED at settle (CC3)`; }
          }
        }
      }
    }
    check(txOk, "item translateX∈[−12,0] + icon scale∈[0,1]; both OMITTED (none) at t ≥ 0.8 (CC3)", txDetail);

    // CC7 (Rev B) — PAIRED reveal: the stagger is per-ROW across BOTH columns, so left item i
    // and right item i share one reveal window (they land together as a matched pair). At every
    // sample, for each row index, the left and right items' opacity match (the column-offset is
    // removed). Also asserts the per-row stagger holds (row 0 leads row 1, etc.).
    let pairOk = true, pairDetail = "";
    for (const t of T_SAMPLES) {
      const m = reports[t].comparison;
      const L = m.columns[0].items, R = m.columns[1].items;
      const rows = Math.min(L.length, R.length);
      for (let i = 0; i < rows; i++) {
        if (Math.abs(L[i].opacity - R[i].opacity) > 1e-3)
          { pairOk = false; pairDetail = `row ${i} left opacity ${L[i].opacity.toFixed(3)} ≠ right ${R[i].opacity.toFixed(3)} at t=${t} (not paired)`; }
      }
      // per-row stagger: earlier rows are at least as revealed as later rows (left column).
      for (let i = 1; i < L.length; i++) {
        if (L[i].opacity > L[i - 1].opacity + 1e-3)
          { pairOk = false; pairDetail = `row ${i} leads row ${i - 1} (left col) at t=${t} — stagger not top→bottom`; }
      }
    }
    check(pairOk, "CC7 paired reveal: left item i and right item i share a reveal window at every sample; rows stagger top→bottom", pairDetail);
    // CC7 also: the paired reveal is mid-build at an early sample (proves it's not instant).
    const e02 = reports[0.2].comparison;
    if (e02 && e02.columns[0].items[0]) {
      const firstRow = e02.columns[0].items[0].opacity;
      const lastRow = e02.columns[0].items[e02.columns[0].items.length - 1].opacity;
      check(firstRow > lastRow - 1e-6,
        "CC7: row 0 leads the deepest row at t=0.2 (the per-row stagger is live)",
        `row0 opacity ${firstRow.toFixed(3)} vs deepest ${lastRow.toFixed(3)}`);
    }

    // CC8 (Rev B) — WEIGHT the failure side: the bad (right/AlertTriangle) column's panel bg
    // differs from the good (left/Check) column's bg at t=1 (the burnt wash + border make the
    // asymmetry), while item/icon/text geometry+colors stay equal (the regression suite asserts
    // that). The good column carries NO wash; the bad column carries one.
    const good = M.columns[0], bad = M.columns[1];
    check(good.wash == null && bad.wash != null,
      "CC8 weighting: only the bad (friction) column carries a burnt wash overlay (good col neutral)",
      `good.wash=${good.wash} bad.wash=${bad.wash}`);
    check(bad.bg !== good.bg || bad.wash !== good.wash || bad.borderWidth !== good.borderWidth,
      "CC8: bad-column background differs from good-column background at t=1 (the asymmetry signal)",
      `good {bg:${good.bg}, border:${good.borderWidth}px} vs bad {bg:${bad.bg}, wash:${bad.wash}, border:${bad.borderWidth}px}`);
    // CC8: lowContrast advisory must stay clean (the wash is bg-only — text legibility unaffected).
    check((reports[1].lowContrast || []).length === 0,
      "CC8: lowContrast clean at t=1 (the bg wash does not push any text below contrast)",
      JSON.stringify(reports[1].lowContrast || []));

    // CC5 final frame: at t=1 every item full opacity.
    let finalOk = true, finalDetail = "";
    for (const col of M.columns) {
      for (let ii = 0; ii < col.items.length; ii++) {
        if (Math.abs(col.items[ii].opacity - 1) > 1e-3) { finalOk = false; finalDetail = `${col.side} item ${ii} opacity ${col.items[ii].opacity} at t=1`; }
      }
    }
    check(finalOk, "t=1: every item full-opacity (CC5)", finalDetail);

    // Gating checks clean at EVERY sample.
    assertGatingClean(check, reports, T_SAMPLES);
  }
}

// ── PL-1.5 t=1 structural baseline (pre-promotion) ────────────────────────────
// Renderer-agnostic capture: works on the PRE-promotion inline DOM (the 2-col grid of Panels,
// no data-cmp-* hooks) AND the post-promotion component. Records per-column item boxes, icon
// rects/colors, and text — the geometry/text/colors CC5 equates. One mechanism records the
// baseline and replays the comparison (≤0.5px rect tolerance, exact text/color).
function captureComparisonState() {
  const canvas = document.querySelector("#post-canvas");
  if (!canvas) return { error: "no #post-canvas" };
  const cb = canvas.getBoundingClientRect();
  const toLocal = (r) => ({
    x: +(r.left - cb.left).toFixed(2), y: +(r.top - cb.top).toFixed(2),
    w: +r.width.toFixed(2), h: +r.height.toFixed(2),
  });
  // The comparison grid: post-promotion is [data-cmp]; pre-promotion is the 2-col grid in main.
  const root =
    canvas.querySelector("[data-cmp]") ||
    [...canvas.querySelectorAll(".grid")].find((el) => /grid-cols-2/.test(el.className) && el.querySelectorAll("svg").length > 0);
  if (!root) return { error: "no comparison grid found" };
  // Columns: post = [data-cmp-col]; pre = the two direct grid children.
  const colEls = root.querySelector("[data-cmp-col]")
    ? [...root.querySelectorAll("[data-cmp-col]")]
    : [...root.children];
  // An item row holds an svg and a text span as DIRECT children (the inline Column markup:
  // `<div class="flex items-start gap-3"><Icon/><span/></div>`); requiring DIRECT children
  // avoids matching the Panel/column ancestor divs that merely contain a nested svg+span.
  const directChild = (el, sel) => [...el.children].find((c) => c.matches(sel));
  const columns = colEls.map((col) => {
    const itemEls = col.querySelector("[data-cmp-item]")
      ? [...col.querySelectorAll("[data-cmp-item]")]
      : [...col.querySelectorAll("div")].filter((d) => directChild(d, "svg") && directChild(d, "span"));
    const items = itemEls.map((item) => {
      const icon = directChild(item, "svg") || item.querySelector("svg");
      // The TEXT span: post-promotion is [data-cmp-text]; pre-promotion is the lone direct
      // span (the icon is a bare svg, not wrapped). Prefer the text hook, then a non-icon
      // direct span, so the icon-wrapper span (post-promotion) is never mistaken for text.
      const txt =
        item.querySelector("[data-cmp-text]") ||
        [...item.children].find((c) => c.matches("span") && !c.matches("[data-cmp-icon]") && !c.querySelector("svg")) ||
        item.querySelector("span") ||
        item;
      return {
        rect: toLocal(item.getBoundingClientRect()),
        icon: icon
          ? { rect: toLocal(icon.getBoundingClientRect()), color: getComputedStyle(icon).color, stroke: getComputedStyle(icon).stroke }
          : null,
        text: (txt.textContent || "").trim().replace(/\s+/g, " "),
        textFontSize: parseFloat(getComputedStyle(txt).fontSize),
      };
    });
    // Column title (Panel label).
    const titleEl = col.querySelector(".font-mono") || col.querySelector("span");
    // Rev B (CC8): the column's panel background + optional burnt wash overlay color. The
    // baseline records these so the gate can assert the intended Rev B asymmetry (the bad
    // column carries a wash, the good column does not) survives — geometry/text/icon stay equal.
    const cs = getComputedStyle(col);
    const washEl = col.querySelector("[data-cmp-wash]");
    return {
      rect: toLocal(col.getBoundingClientRect()),
      title: titleEl ? (titleEl.textContent || "").trim() : null,
      bg: cs.backgroundColor,
      borderColor: cs.borderTopColor,
      borderWidth: +(parseFloat(cs.borderTopWidth) || 0).toFixed(2),
      wash: washEl ? getComputedStyle(washEl).backgroundColor : null,
      items,
    };
  });
  return { rootRect: toLocal(root.getBoundingClientRect()), columns };
}

async function captureState(page, id) {
  await page.goto(`${BASE}/?id=${encodeURIComponent(id)}&t=1`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForSelector("#post-canvas", { timeout: 20000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(250);
  return page.evaluate(captureComparisonState);
}

async function captureBaseline() {
  await mkdir(BASELINE_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    for (const id of CMP_FIXTURES) {
      const state = await captureState(page, id);
      if (state.error) { console.error(`✖ ${id}: ${state.error}`); process.exitCode = 1; continue; }
      await writeFile(join(BASELINE_DIR, `${id}.t1.json`), JSON.stringify(state, null, 2));
      console.log(`captured ${id}.t1.json (${state.columns.length} columns, ${state.columns.reduce((s, c) => s + c.items.length, 0)} items)`);
    }
  } finally {
    await browser.close();
  }
}

async function comparisonRegressionSuite(page) {
  console.log(`comparison t=1 structural identity vs pre-promotion baseline (${BASELINE_DIR.replace(ROOT, ".")}):`);
  for (const id of CMP_FIXTURES) {
    let baseline;
    try {
      baseline = JSON.parse(await readFile(join(BASELINE_DIR, `${id}.t1.json`), "utf8"));
    } catch {
      check(false, `${id}: baseline missing`, "run `node tools/qa-reveal.mjs --baseline-capture` on the PRE-promotion renderer");
      continue;
    }
    const current = await captureState(page, id);
    let ok = true, detail = "";
    if (current.error) { check(false, `${id}: ${current.error}`); continue; }
    if (!rectEq(current.rootRect, baseline.rootRect)) { ok = false; detail = "root grid rect differs"; }
    if (current.columns.length !== baseline.columns.length) { ok = false; detail = `column count ${current.columns.length} vs ${baseline.columns.length}`; }
    else {
      for (let ci = 0; ci < baseline.columns.length; ci++) {
        const b = baseline.columns[ci], c = current.columns[ci];
        if (!rectEq(c.rect, b.rect)) { ok = false; detail = `col ${ci} rect differs`; }
        if (c.title !== b.title) { ok = false; detail = `col ${ci} title ${JSON.stringify(c.title)} vs ${JSON.stringify(b.title)}`; }
        // Rev B (CC8): the panel bg + burnt wash are part of the intended baseline now.
        if (c.bg !== b.bg) { ok = false; detail = `col ${ci} panel bg ${c.bg} vs ${b.bg}`; }
        if ((c.wash || null) !== (b.wash || null)) { ok = false; detail = `col ${ci} wash ${c.wash} vs ${b.wash}`; }
        if (c.borderColor !== b.borderColor || c.borderWidth !== b.borderWidth) { ok = false; detail = `col ${ci} border ${c.borderWidth}px ${c.borderColor} vs ${b.borderWidth}px ${b.borderColor}`; }
        if (c.items.length !== b.items.length) { ok = false; detail = `col ${ci} item count ${c.items.length} vs ${b.items.length}`; }
        else {
          for (let ii = 0; ii < b.items.length; ii++) {
            const bi = b.items[ii], cii = c.items[ii];
            if (!rectEq(cii.rect, bi.rect)) { ok = false; detail = `col ${ci} item ${ii} rect differs`; }
            if (cii.text !== bi.text) { ok = false; detail = `col ${ci} item ${ii} text ${JSON.stringify(cii.text)} vs ${JSON.stringify(bi.text)}`; }
            if (cii.textFontSize !== bi.textFontSize) { ok = false; detail = `col ${ci} item ${ii} font-size differs`; }
            if (!!cii.icon !== !!bi.icon) { ok = false; detail = `col ${ci} item ${ii} icon presence differs`; }
            else if (bi.icon) {
              if (!rectEq(cii.icon.rect, bi.icon.rect)) { ok = false; detail = `col ${ci} item ${ii} icon rect differs`; }
              if (cii.icon.color !== bi.icon.color) { ok = false; detail = `col ${ci} item ${ii} icon color ${cii.icon.color} vs ${bi.icon.color}`; }
              if (cii.icon.stroke !== bi.icon.stroke) { ok = false; detail = `col ${ci} item ${ii} icon stroke ${cii.icon.stroke} vs ${bi.icon.stroke}`; }
            }
          }
        }
      }
    }
    check(ok, `${id}: t=1 geometry + text + colors === pre-promotion baseline (CC5)`, detail);
  }
}

// ══ PL-4.1 NARRATIVE SUITE ═══════════════════════════════════════════════════════════════════
// The narrative modes (ClaimList spotlight, ComparisonColumns sequential) evolve the check model
// (§2.7): the single settle≤0.85 rule is replaced by per-window read floors + a 0.92 assembly. Every
// constraint maps to a deterministic check; the planner (src/lib/narrative.ts) is the one brain the
// renderer AND these checks share — the unit suite tests it with no DOM, the DOM suite samples WITHIN
// each focus window (sampleWindows derives the t-set from the same plan).

// Narrative fixtures: a spotlight claims pair (vs its stagger sibling — same content, N3) and a
// sequential comparison set (a 5+5 cap/degraded stress + a 4+4 N3 pair vs its paired sibling).
const NARR_CLAIMS = { spotlight: "fuzz-32-claims-spotlight", stagger: "fuzz-33-claims-spotlight-stagger" };
const NARR_CMP_N3 = { sequential: "fuzz-36-comparison-seq-n3", paired: "fuzz-35-comparison-seq-pair-n3" };
const NARR_CMP_STRESS = "fuzz-34-comparison-sequential"; // 5+5 "sequential" (in-place) — CC-CAP 5 + degraded
const NARR_CMP_CENTERED = "fuzz-37-comparison-seqcentered-n3"; // 4+4 "sequentialCentered" (moving boxes)

// in-place `sequential` is paced up (brisk); moving `sequentialCentered` keeps the full reading pace.
const paceFor = (spec) =>
  spec.visualization?.kind === "comparison" && spec.visualization?.revealMode === "sequential"
    ? COMPARISON_INPLACE_PACE
    : 1;
const isInPlace = (spec) => paceFor(spec) < 1;

const planForFixture = (spec) => {
  const viz = spec.visualization;
  if (viz.kind === "claims") {
    return planNarrative(
      "spotlight",
      (viz.entries ?? []).map((e) => ({ claim: e.claim, reality: e.reality, realityNote: e.note })),
    );
  }
  return planNarrative("sequential", { left: viz.left?.items ?? [], right: viz.right?.items ?? [] }, { pace: paceFor(spec) });
};

// ── 1. Unit suite (pure planner — no DOM) ─────────────────────────────────────
function narrativeUnitSuite() {
  console.log("\nplanNarrative / narrativeDuration unit suite (§2.5.0–§2.5.1, no DOM):");

  // Worked examples (§2.5.0 — the duration-correctness source of truth).
  const ex1 = planNarrative("spotlight", Array.from({ length: 3 }, () => ({ claim: "x".repeat(50), reality: "y".repeat(45) })));
  check(Math.abs(narrativeDuration(ex1) - 15.85) < 0.01 && !ex1.degraded,
    "worked ex1: spotlight 3×95chars → DUR 15.85s, degraded false", `got ${narrativeDuration(ex1).toFixed(2)} degraded=${ex1.degraded}`);
  const ex2 = planNarrative("spotlight", Array.from({ length: 4 }, () => ({ claim: "x".repeat(30), reality: "y".repeat(30) })));
  check(Math.abs(narrativeDuration(ex2) - 18.4) < 0.01 && !ex2.degraded,
    "worked ex2: spotlight 4×60chars → DUR 18.40s, degraded false", `got ${narrativeDuration(ex2).toFixed(2)} degraded=${ex2.degraded}`);
  const ex3 = planNarrative("sequential", { left: Array.from({ length: 5 }, () => "z".repeat(40)), right: Array.from({ length: 5 }, () => "z".repeat(40)) });
  check(Math.abs(narrativeDuration(ex3) - 25) < 0.01 && ex3.degraded && Math.abs(ex3.windows[0].readSeconds - 1.4) < 0.01,
    "worked ex3: sequential 5+5×40chars → DUR 25s, degraded true, read 1.40s", `got ${narrativeDuration(ex3).toFixed(2)} degraded=${ex3.degraded} read0=${ex3.windows[0].readSeconds.toFixed(2)}`);

  // N6 duration in [FLOOR_DUR, CEIL]; frames == round(DUR·FPS).
  for (const [label, plan] of [["ex1", ex1], ["ex2", ex2], ["ex3", ex3]]) {
    const d = narrativeDuration(plan);
    check(d >= FLOOR_DUR - 1e-9 && d <= CEIL + 1e-9, `${label}: DUR ∈ [${FLOOR_DUR}, ${CEIL}] (N6)`, `got ${d}`);
    check(narrativeFrames(plan) === Math.round(d * FPS), `${label}: frames == round(DUR·FPS) (N6)`, `${narrativeFrames(plan)} vs ${Math.round(d * FPS)}`);
  }

  // N4 reading-time floor: every read ≥ READ_FLOOR (or ≥ READ_FLOOR_MIN/READ_HARD_MIN when degraded).
  for (const [label, plan] of [["ex1", ex1], ["ex2", ex2], ["ex3", ex3]]) {
    const floor = plan.degraded ? READ_HARD_MIN : READ_FLOOR;
    const minRead = Math.min(...plan.windows.map((w) => w.readSeconds));
    check(minRead >= floor - 1e-9, `${label}: every read ≥ ${plan.degraded ? "hard/min floor" : "READ_FLOOR"} ${floor}s (N4${plan.degraded ? " degraded" : ""})`, `min read ${minRead.toFixed(3)}`);
    // read window length in t maps back to readSeconds: (readEndT−readStartT)·DUR ≈ readSeconds.
    let mapOk = true, mapDetail = "";
    for (const w of plan.windows) {
      const secs = ((w.readEndT - w.readStartT) / ASSEMBLY_END_T) * plan.durationSeconds;
      if (Math.abs(secs - w.readSeconds) > 0.02) { mapOk = false; mapDetail = `window ${w.index}: t-span→${secs.toFixed(3)}s ≠ readSeconds ${w.readSeconds.toFixed(3)}`; }
    }
    check(mapOk, `${label}: (readEndT−readStartT)·DUR == readSeconds (N4 t-mapping)`, mapDetail);
  }

  // N7 narrative settle: assembly.endT == 0.92; windows ordered & non-overlapping; leadIn first.
  for (const [label, plan] of [["ex1", ex1], ["ex3", ex3]]) {
    check(Math.abs(plan.assembly.endT - ASSEMBLY_END_T) < 1e-9, `${label}: assembly.endT == ${ASSEMBLY_END_T} (N7)`, `got ${plan.assembly.endT}`);
    let ordered = plan.leadInT <= plan.windows[0].enterStartT + 1e-9, oDetail = "";
    let prevExit = 0;
    for (const w of plan.windows) {
      if (w.enterStartT < prevExit - 1e-9) { ordered = false; oDetail = `window ${w.index} enter ${w.enterStartT} < prev exit ${prevExit}`; }
      if (!(w.enterStartT <= w.readStartT && w.readStartT <= w.readEndT && w.readEndT <= w.exitStartT + 1e-9 && w.exitStartT <= w.exitEndT)) {
        ordered = false; oDetail = `window ${w.index} sub-beats not monotonic`;
      }
      prevExit = w.exitEndT;
    }
    check(ordered, `${label}: windows monotonic & non-overlapping; lead-in precedes first window (N7)`, oDetail);
    check(plan.windows[plan.windows.length - 1].exitEndT <= plan.assembly.startT + 1e-9,
      `${label}: last focus window ends by assembly.startT (N7)`, `lastExit ${plan.windows[plan.windows.length - 1].exitEndT} > assemblyStart ${plan.assembly.startT}`);
  }

  // N8 caps/degraded: ClaimList cap 4 / comparison cap 5; the planner only sequences kept items.
  const capC = planNarrative("spotlight", Array.from({ length: 9 }, () => ({ claim: "a".repeat(20), reality: "b".repeat(20) })));
  check(capC.windows.length === CLAIM_ITEM_CAP, `ClaimList sequences ≤ ${CLAIM_ITEM_CAP} items (N8 cap)`, `got ${capC.windows.length}`);
  const capM = planNarrative("sequential", { left: Array.from({ length: 8 }, () => "x".repeat(20)), right: Array.from({ length: 8 }, () => "x".repeat(20)) });
  check(capM.windows.filter((w) => w.side === "left").length === COMPARISON_ITEM_CAP && capM.windows.filter((w) => w.side === "right").length === COMPARISON_ITEM_CAP,
    `Comparison sequences ≤ ${COMPARISON_ITEM_CAP} items/col (N8 cap, CC-CAP bump 4→5)`, `got ${capM.windows.filter((w) => w.side === "left").length}/${capM.windows.filter((w) => w.side === "right").length}`);
  // degraded equalization: comparison 5+5 long content → degraded, fits CEIL exactly, reads ≥ floor_min.
  const deg = planNarrative("sequential", { left: Array.from({ length: 5 }, () => "z".repeat(70)), right: Array.from({ length: 5 }, () => "z".repeat(70)) });
  check(deg.degraded && Math.abs(narrativeDuration(deg) - CEIL) < 0.01 && Math.min(...deg.windows.map((w) => w.readSeconds)) >= READ_FLOOR_MIN - 1e-9,
    `degraded branch: 5+5×70chars fits CEIL exactly, reads ≥ READ_FLOOR_MIN ${READ_FLOOR_MIN}s (N8)`, `degraded=${deg.degraded} DUR=${narrativeDuration(deg).toFixed(2)} minRead=${Math.min(...deg.windows.map((w) => w.readSeconds)).toFixed(3)}`);

  // Default-mode posts → DEFAULT_DUR via postDurationSeconds (byte-identical; not narrative).
  check(postDurationSeconds({ visualization: { kind: "claims", entries: [] } }, DEFAULT_DUR) === DEFAULT_DUR,
    `postDurationSeconds default (no revealMode) == DEFAULT_DUR ${DEFAULT_DUR}s (default unaffected)`);
  check(postDurationSeconds({ visualization: { kind: "comparison", revealMode: "paired", left: { items: ["a"] }, right: { items: ["b"] } } }, DEFAULT_DUR) === DEFAULT_DUR,
    `postDurationSeconds paired == DEFAULT_DUR ${DEFAULT_DUR}s (default unaffected)`);
}

// ── 2. Narrative duration-correctness vs the fixture's declared composition (N6) ──
async function narrativeDurationSuite() {
  console.log("\nnarrative duration-correctness — declared composition duration == formula (N6):");
  for (const id of [NARR_CLAIMS.spotlight, NARR_CMP_N3.sequential, NARR_CMP_CENTERED, NARR_CMP_STRESS]) {
    const spec = JSON.parse(await readFile(fixturePath(id), "utf8"));
    const declared = postDurationSeconds(spec, DEFAULT_DUR);
    const plan = planForFixture(spec);
    check(Math.abs(declared - narrativeDuration(plan)) < 1e-6,
      `${id}: postDurationSeconds == narrativeDuration(plan) (N6)`, `${declared} vs ${narrativeDuration(plan)}`);
    // in-place `sequential` is intentionally compact (paced); its floor is below FLOOR_DUR.
    const durLo = isInPlace(spec) ? 5 : FLOOR_DUR;
    check(declared >= durLo - 1e-9 && declared <= CEIL + 1e-9, `${id}: declared DUR ∈ [${durLo}, ${CEIL}]`, `got ${declared.toFixed(2)}`);
  }
}

// ── 2b. Narrative RENDER-TRUTH: real on-screen seconds via the shared frame→t map ──
// The t-space reading-time floor (N4) is NECESSARY but NOT SUFFICIENT: what the viewer actually
// experiences is governed by the frame→t mapping the Remotion composition uses. Narrative posts use
// the LINEAR narrativeProgressT (NOT the default eased useProgressT, which races through early `t`
// and would compress the reads into a fraction of their designed seconds while bloating the settled
// assembly into a multi-second frozen end-card). This suite proves the content-aware reading time is
// truly DELIVERED by iterating EVERY frame through the SAME shared mapping the renderer consumes.
async function narrativeRenderTruthSuite() {
  console.log("\nnarrative RENDER-TRUTH — real on-screen seconds via the shared frame→t map (the MP4's actual timing):");
  for (const id of [NARR_CLAIMS.spotlight, NARR_CMP_N3.sequential, NARR_CMP_STRESS]) {
    const spec = JSON.parse(await readFile(fixturePath(id), "utf8"));
    const plan = planForFixture(spec);
    const frames = narrativeFrames(plan);
    // Real seconds a t-interval occupies on screen = (# frames whose mapped t ∈ [t0,t1]) / FPS.
    const secondsInT = (t0, t1) => {
      let n = 0;
      for (let f = 0; f < frames; f++) { const t = narrativeProgressT(f, frames); if (t >= t0 && t <= t1) n++; }
      return n / FPS;
    };
    // Each read window's REAL seconds ≥ floor. The plan reserves a clean tail by mapping the timeline
    // into t ∈ [0, ASSEMBLY_END_T], so real read seconds = readSeconds·ASSEMBLY_END_T; the effective
    // on-screen floor is READ_FLOOR·0.92 (hard-min·0.92 when degraded), minus a 1-frame slack.
    const floor = (plan.degraded ? READ_HARD_MIN : READ_FLOOR) * ASSEMBLY_END_T - 1 / FPS;
    let minReal = Infinity, worst = -1;
    for (const w of plan.windows) { const s = secondsInT(w.readStartT, w.readEndT); if (s < minReal) { minReal = s; worst = w.index; } }
    if (isInPlace(spec)) {
      // in-place sequential: both boxes are visible the whole time, so there is NO single-focus
      // reading floor (the per-item reveal is a brisk build, not a read-it-now dwell). Assert instead
      // that items are still perceptible AND the whole thing is brisk (the speed-up Emil asked for).
      check(minReal >= 0.25, `${id}: in-place — each item still on screen ≥ 0.25s`, `min ${minReal.toFixed(2)}s at window ${worst}`);
      check(plan.durationSeconds <= 14, `${id}: in-place sequential is brisk (≤14s, paced ×${COMPARISON_INPLACE_PACE})`, `${plan.durationSeconds.toFixed(1)}s`);
    } else {
      check(minReal >= floor, `${id}: every read ≥ ${floor.toFixed(2)}s ON SCREEN (render-truth, not just t-space)`, `min ${minReal.toFixed(2)}s at window ${worst}`);
    }
    // The settled assembly must be a CLEAN hold, not a frozen end-card. The eased map bloated it to
    // >60% of the runtime; the linear map keeps it ~0.08·DUR. ≤0.14·DUR proves the bug is fixed.
    const tailSec = secondsInT(ASSEMBLY_END_T, 1);
    check(tailSec <= 0.14 * plan.durationSeconds, `${id}: settled tail ${tailSec.toFixed(2)}s ≤ 0.14·DUR (clean hold, not a frozen end-card)`, `tail ${tailSec.toFixed(2)}s of ${plan.durationSeconds.toFixed(2)}s`);
    // And the reading sequence dominates the runtime (the reads ARE the content now, not the hold).
    const seqSec = secondsInT(plan.leadInT, plan.assembly.startT);
    check(seqSec >= 0.6 * plan.durationSeconds, `${id}: reading sequence ${seqSec.toFixed(2)}s ≥ 0.6·DUR (reads dominate on-screen time)`, `seq ${seqSec.toFixed(2)}s of ${plan.durationSeconds.toFixed(2)}s`);
  }
}

// ── 3. Narrative DOM suite (sampled WITHIN each focus window) ──────────────────
async function narrativeClaimsSuite(page) {
  const id = NARR_CLAIMS.spotlight;
  const spec = JSON.parse(await readFile(fixturePath(id), "utf8"));
  const plan = planForFixture(spec);
  const { tSamples, reports } = await sampleWindows(page, id, plan);
  console.log(`\nClaimList spotlight DOM — ${id} (windowed t ∈ {${tSamples.join(", ")}}):`);

  const base = reports[1].claimList;
  if (!check(!!base, "claimList section present at t=1 (spotlight)")) return;
  const expected = Math.min(spec.visualization.entries.length, CLAIM_ITEM_CAP);
  check(base.entries.length === expected, `entries === ${expected} (≤${CLAIM_ITEM_CAP} cap, CL1)`, `got ${base.entries.length}`);

  // N1 no mount/unmount — node count + entry count constant across every windowed sample.
  check(tSamples.every((t) => reports[t].claimList?.nodeCount === base.nodeCount),
    `N1: DOM node count constant (${base.nodeCount}) — nothing mounts/unmounts (spotlight)`,
    tSamples.map((t) => reports[t].claimList?.nodeCount).join(","));
  check(tSamples.every((t) => reports[t].claimList?.entries.length === expected),
    "N1: entry count constant across every sample", tSamples.map((t) => reports[t].claimList?.entries.length).join(","));

  // N2 (Rev D) — the spotlight box is the STACKED LIST from t=0 (Emil "list under each other from the
  // beginning"). Every entry's slot (offset*) is reserved & constant across ALL samples (the reveal is
  // opacity + the entry slide-in only — same as stagger). Layout-stability fully restored.
  let n2Ok = true, n2Detail = "";
  for (const t of tSamples) {
    const c = reports[t].claimList;
    for (let i = 0; i < base.entries.length; i++) {
      for (const part of ["entry", "header", "claim", "reality", "kill"]) {
        const a = c.entries[i]?.[part]?.layout, b = base.entries[i][part]?.layout;
        if (b && !layoutEq(a, b)) { n2Ok = false; n2Detail = `entry ${i} ${part} layout drifts at t=${t}`; }
      }
    }
  }
  check(n2Ok, "N2 (Rev D): every entry box layout (offset*) constant across all samples — stacked from t=0 (≤0.5px)", n2Detail);

  // N4 reading-time floor (DOM): the focused entry is opacity 1 across [readStartT, readEndT].
  let n4Ok = true, n4Detail = "";
  for (const w of plan.windows) {
    for (const t of [w.readStartT, (w.readStartT + w.readEndT) / 2, w.readEndT].map((x) => +Math.max(0, Math.min(1, x)).toFixed(4))) {
      const e = reports[t]?.claimList?.entries[w.index];
      if (!e) continue;
      if (Math.abs((e.entry?.opacity ?? 0) - 1) > 0.02) { n4Ok = false; n4Detail = `entry ${w.index} opacity ${e.entry?.opacity} ≠ 1 at read t=${t}`; }
    }
  }
  check(n4Ok, "N4: focused entry opacity == 1 across its full read window (edges + mid)", n4Detail);

  // N5 (Rev D) — CUMULATIVE top→bottom reveal: the list builds in order and entries STAY (Emil "list
  // under each other"). At every sample, entry opacities are non-increasing by index (an earlier entry
  // is always ≥ a later one), and at each window's read-mid the focused entry is fully revealed while
  // entries BELOW it are not yet shown. This proves the one-at-a-time DOWN-the-list reveal.
  let n5Ok = true, n5Detail = "";
  for (const t of tSamples) {
    const es = reports[t].claimList.entries;
    for (let i = 1; i < es.length; i++) {
      if ((es[i].entry?.opacity ?? 0) > (es[i - 1].entry?.opacity ?? 0) + 1e-3) {
        n5Ok = false; n5Detail = `entry ${i} opacity ${es[i].entry?.opacity} > entry ${i - 1} ${es[i - 1].entry?.opacity} at t=${t} (not top→bottom)`;
      }
    }
  }
  check(n5Ok, "N5 (Rev D): cumulative top→bottom reveal — entry opacities non-increasing by index at every sample", n5Detail);
  let revealOk = true, revealDetail = "";
  for (const w of plan.windows) {
    const tMid = +Math.max(0, Math.min(1, (w.readStartT + w.readEndT) / 2)).toFixed(4);
    const es = reports[tMid]?.claimList?.entries;
    if (!es) continue;
    if (Math.abs((es[w.index]?.entry?.opacity ?? 0) - 1) > 0.02) { revealOk = false; revealDetail = `entry ${w.index} not full at its read-mid t=${tMid}`; }
    if (es[w.index + 1] && (es[w.index + 1].entry?.opacity ?? 0) > 0.5) { revealOk = false; revealDetail = `entry ${w.index + 1} already showing at entry ${w.index}'s read-mid t=${tMid}`; }
  }
  check(revealOk, "N5 (Rev D): at each entry's read-mid it is fully revealed and the NEXT entry is not yet shown", revealDetail);
  assertGatingClean(check, reports, tSamples, " (spotlight, stacked)");

  // N7 narrative settle (DOM): at t ≥ 0.92 every entry opacity 1, all transforms `none`.
  for (const t of tSamples.filter((x) => x >= ASSEMBLY_END_T)) {
    const c = reports[t].claimList;
    let ok = true, d = "";
    for (const e of c.entries) {
      if (Math.abs((e.entry?.opacity ?? 0) - 1) > 1e-3) { ok = false; d = `entry ${e.index} opacity ${e.entry?.opacity}`; }
      for (const part of ["entry", "strike", "kill"]) {
        const m = parseMatrix(e[part]?.transform ?? "none");
        if (e[part] && !(m && m.none)) { ok = false; d = `entry ${e.index} ${part} transform ${e[part].transform} not none`; }
      }
    }
    check(ok, `N7: t=${t} ≥ ${ASSEMBLY_END_T} — every entry opacity 1, transforms none (settled tail)`, d);
  }

  // CL2 kill inside focus — RC7 strike scaleX∈[0,1] + RC8 × scale∈[1,1.3]/rot∈[−8,0], omitted at settle.
  let killOk = true, killDetail = "";
  for (const t of tSamples) {
    const c = reports[t].claimList;
    for (const e of c.entries) {
      const ms = parseMatrix(e.strike?.transform ?? "none");
      if (ms && !ms.none && (ms.a < -1e-6 || ms.a > 1 + 1e-6 || ms.b !== 0 || ms.c !== 0 || Math.abs(ms.d - 1) > 1e-6)) { killOk = false; killDetail = `entry ${e.index} strike not scaleX∈[0,1] at t=${t}`; }
      const mk = parseMatrix(e.kill?.transform ?? "none");
      if (mk && !mk.none) {
        const s = Math.hypot(mk.a, mk.b), deg = (Math.atan2(mk.b, mk.a) * 180) / Math.PI;
        if (s < 1 - 1e-3 || s > X_OVERSCALE_MAX + 1e-3 || deg < X_OVERROT_MIN - 0.1 || deg > 0.1) { killOk = false; killDetail = `entry ${e.index} × scale ${s.toFixed(3)}/rot ${deg.toFixed(2)} out of bounds at t=${t}`; }
      }
    }
  }
  check(killOk, "CL2: Rev-B strike scaleX∈[0,1] + × stamp scale∈[1,1.3]/rot∈[−8,0] inside the focus beat (RC7/RC8)", killDetail);
}

// N3 final-frame-assembled — spotlight t=1 measure() == stagger t=1 (same content).
async function narrativeClaimsFinalFrame(page) {
  console.log(`\nN3 final-frame-assembled — claims spotlight t=1 == stagger t=1 (same content):`);
  const a = (await sampleFixture(page, NARR_CLAIMS.spotlight, [1]))[1].claimList;
  const b = (await sampleFixture(page, NARR_CLAIMS.stagger, [1]))[1].claimList;
  if (!check(a && b && a.entries.length === b.entries.length, "both modes render the same entry count at t=1", `${a?.entries.length} vs ${b?.entries.length}`)) return;
  let ok = true, detail = "";
  for (let i = 0; i < a.entries.length; i++) {
    for (const part of ["entry", "header", "claim", "reality", "kill"]) {
      const ra = a.entries[i][part]?.rect, rb = b.entries[i][part]?.rect;
      if (rb && !rectEq(ra, rb)) { ok = false; detail = `entry ${i} ${part} rect spotlight≠stagger`; }
      const oa = a.entries[i][part]?.opacity, ob = b.entries[i][part]?.opacity;
      if (ob != null && oa != null && Math.abs(oa - ob) > 1e-3) { ok = false; detail = `entry ${i} ${part} opacity ${oa}≠${ob}`; }
    }
    if (a.entries[i].claim?.text !== b.entries[i].claim?.text) { ok = false; detail = `entry ${i} claim text differs`; }
  }
  check(ok, "N3: spotlight t=1 geometry+opacity+text == stagger t=1 (thumbnail mode-independent)", detail);
}

// One fixture per call — each gets its own FRESH browser at the call site (the 5+5 stress fixture
// alone samples ~55 windowed t-points; chaining two fixtures' ~100 navigations on a single page
// goes stale on Vite's HMR websocket — the reliable pattern, used by the claims suites too).
async function narrativeComparisonSuite(page, id, centered = false) {
  {
    const spec = JSON.parse(await readFile(fixturePath(id), "utf8"));
    const plan = planForFixture(spec);
    const { tSamples, reports } = await sampleWindows(page, id, plan);
    console.log(`\nComparison ${centered ? "sequentialCentered (moving)" : "sequential (in-place)"} DOM — ${id} (windowed t ∈ {${tSamples.join(", ")}}):`);

    const base = reports[1].comparison;
    if (!check(!!base, `comparison section present at t=1 (${id})`)) return;
    const expLeft = Math.min(spec.visualization.left.items.length, COMPARISON_ITEM_CAP);
    const expRight = Math.min(spec.visualization.right.items.length, COMPARISON_ITEM_CAP);
    check(base.columns[0]?.items.length === expLeft && base.columns[1]?.items.length === expRight,
      `items ≤${COMPARISON_ITEM_CAP}/col (left ${expLeft}, right ${expRight}, CC-CAP)`, `got ${base.columns.map((c) => c.items.length).join("/")}`);

    // N1 node count constant.
    check(tSamples.every((t) => reports[t].comparison?.nodeCount === base.nodeCount),
      `N1: DOM node count constant (${base.nodeCount}) — nothing mounts/unmounts (sequential)`,
      tSamples.map((t) => reports[t].comparison?.nodeCount).join(","));

    // N2 every item box + column box layout (offset*) constant ≤0.5px across all samples.
    let n2Ok = true, n2Detail = "";
    for (const t of tSamples) {
      const m = reports[t].comparison;
      for (let ci = 0; ci < base.columns.length; ci++) {
        if (!layoutEq(m.columns[ci]?.layout, base.columns[ci].layout)) { n2Ok = false; n2Detail = `col ${ci} layout drifts at t=${t}`; }
        for (let ii = 0; ii < base.columns[ci].items.length; ii++) {
          if (!layoutEq(m.columns[ci]?.items[ii]?.layout, base.columns[ci].items[ii].layout)) { n2Ok = false; n2Detail = `col ${ci} item ${ii} layout drifts at t=${t}`; }
        }
      }
    }
    check(n2Ok, "N2: every item + column box layout (offset*) constant across all windowed samples (≤0.5px)", n2Detail);

    const cmpRootCx = base.rect.x + base.rect.w / 2;
    const colCxAt = (tSample, side) => {
      const col = reports[tSample]?.comparison?.columns.find((x) => x.side === side);
      return col ? col.rect.x + col.rect.w / 2 : null;
    };
    const leftW = plan.windows.find((w) => w.side === "left");
    const rightW = plan.windows.find((w) => w.side === "right");
    const tLeftMid = leftW && +Math.max(0, Math.min(1, (leftW.readStartT + leftW.readEndT) / 2)).toFixed(4);
    const tRightMid = rightW && +Math.max(0, Math.min(1, (rightW.readStartT + rightW.readEndT) / 2)).toFixed(4);

    if (centered) {
      // CMP-centered (sequentialCentered / Emil mode 1) — the focused column is a STANDALONE CENTERED
      // box: during left-focus the LEFT column's transform-aware rect is centered in the panel; during
      // right-focus the RIGHT column is. (Old CMP1 "no panel translates" is RETIRED — panels move
      // center→off-screen→seat; grid seats / offset* stay constant per N2, transforms none at settle.)
      if (leftW) {
        const cx = colCxAt(tLeftMid, "left");
        check(cx != null && Math.abs(cx - cmpRootCx) <= 14, "CMP-centered: LEFT column centered standalone during left-focus", `left cx ${cx?.toFixed(1)} vs ${cmpRootCx.toFixed(1)} at t=${tLeftMid}`);
      }
      if (rightW) {
        const cx = colCxAt(tRightMid, "right");
        check(cx != null && Math.abs(cx - cmpRootCx) <= 14, "CMP-centered: RIGHT column centered standalone during right-focus", `right cx ${cx?.toFixed(1)} vs ${cmpRootCx.toFixed(1)} at t=${tRightMid}`);
      }
    } else {
      // CMP-inplace (sequential / Emil mode 2) — both boxes SIDE-BY-SIDE from the start, NOT centered:
      // each column stays in its own seat (left of center / right of center). Both visible from t=0.
      const t0 = tSamples[0];
      const lo = reports[t0]?.comparison?.columns.find((c) => c.side === "left")?.opacity ?? 0;
      const ro = reports[t0]?.comparison?.columns.find((c) => c.side === "right")?.opacity ?? 0;
      check(lo > 0.9 && ro > 0.9, "CMP-inplace: BOTH columns visible side-by-side from t=0 (no movement)", `left op ${lo}, right op ${ro} at t=${t0}`);
      if (leftW) {
        const cx = colCxAt(tLeftMid, "left");
        check(cx != null && cx < cmpRootCx - 20, "CMP-inplace: LEFT column stays in its LEFT seat (not centered)", `left cx ${cx?.toFixed(1)} not < ${cmpRootCx.toFixed(1)}`);
      }
      if (rightW) {
        const cx = colCxAt(tRightMid, "right");
        check(cx != null && cx > cmpRootCx + 20, "CMP-inplace: RIGHT column stays in its RIGHT seat (not centered)", `right cx ${cx?.toFixed(1)} not > ${cmpRootCx.toFixed(1)}`);
      }
    }

    // N4 read floor (DOM): each item is opacity 1 across its read window edges.
    let n4Ok = true, n4Detail = "";
    for (const w of plan.windows) {
      const colIdx = w.side === "left" ? 0 : 1;
      const localIdx = plan.windows.filter((x) => x.side === w.side && x.index < w.index).length;
      for (const t of [w.readStartT, (w.readStartT + w.readEndT) / 2, w.readEndT].map((x) => +Math.max(0, Math.min(1, x)).toFixed(4))) {
        const it = reports[t]?.comparison?.columns[colIdx]?.items[localIdx];
        if (it && Math.abs(it.opacity - 1) > 0.02) { n4Ok = false; n4Detail = `${w.side} item ${localIdx} opacity ${it.opacity} ≠ 1 at read t=${t}`; }
      }
    }
    check(n4Ok, "N4: each focused item opacity == 1 across its read window (edges + mid)", n4Detail);

    // N7 settle (DOM): at t ≥ 0.92 every item + column opacity 1, transforms none.
    for (const t of tSamples.filter((x) => x >= ASSEMBLY_END_T)) {
      const m = reports[t].comparison;
      let ok = true, d = "";
      for (const col of m.columns) {
        if (Math.abs(col.opacity - 1) > 1e-3) { ok = false; d = `${col.side} column opacity ${col.opacity}`; }
        const cm = parseMatrix(col.transform);
        if (!(cm && cm.none)) { ok = false; d = `${col.side} column transform ${col.transform} not none`; }
        for (let ii = 0; ii < col.items.length; ii++) {
          if (Math.abs(col.items[ii].opacity - 1) > 1e-3) { ok = false; d = `${col.side} item ${ii} opacity ${col.items[ii].opacity}`; }
          const im = parseMatrix(col.items[ii].transform);
          if (!(im && im.none)) { ok = false; d = `${col.side} item ${ii} transform ${col.items[ii].transform} not none`; }
        }
      }
      check(ok, `N7: t=${t} ≥ ${ASSEMBLY_END_T} — every column+item opacity 1, transforms none (${id})`, d);
    }

    // CMP3 weighted final (CC8) at t=1 — only the bad column carries the wash.
    const good = base.columns[0], bad = base.columns[1];
    check(good.wash == null && bad.wash != null, "CMP3: only the friction column carries the burnt wash at t=1 (CC8)", `good.wash=${good.wash} bad.wash=${bad.wash}`);

    // gating clean. In-place (mode 2): all samples (nothing ever moves off-frame). Centered (mode 1):
    // only the HELD read-mid states + assembly + final — NOT the switch, where a box DELIBERATELY
    // slides off-frame as it leaves (off the safe margin by design — the choreography, not a defect).
    if (centered) {
      const heldSamples = [
        ...plan.windows.map((w) => +Math.max(0, Math.min(1, (w.readStartT + w.readEndT) / 2)).toFixed(4)),
        +Math.max(0, Math.min(1, (plan.assembly.startT + plan.assembly.endT) / 2)).toFixed(4),
        1,
      ].filter((t) => reports[t]);
      assertGatingClean(check, reports, heldSamples, ` (sequentialCentered ${id}, held states)`);
    } else {
      assertGatingClean(check, reports, tSamples, ` (sequential ${id}, all samples)`);
    }
  }
}

// N3 final-frame-assembled — BOTH sequential variants' t=1 == paired t=1 (same 4+4 content). The
// thumbnail must be identical whichever narrative mode is chosen.
async function narrativeComparisonFinalFrame(page) {
  console.log(`\nN3 final-frame-assembled — comparison sequential variants t=1 == paired t=1 (same content):`);
  const b = (await sampleFixture(page, NARR_CMP_N3.paired, [1]))[1].comparison;
  for (const [label, seqId] of [["sequential (in-place)", NARR_CMP_N3.sequential], ["sequentialCentered (moving)", NARR_CMP_CENTERED]]) {
    const a = (await sampleFixture(page, seqId, [1]))[1].comparison;
    if (!check(a && b && a.columns.length === b.columns.length, `${label}: two columns at t=1 (vs paired)`)) continue;
    let ok = true, detail = "";
    for (let ci = 0; ci < a.columns.length; ci++) {
      if (!rectEq(a.columns[ci].rect, b.columns[ci].rect)) { ok = false; detail = `col ${ci} rect differs`; }
      if (a.columns[ci].bg !== b.columns[ci].bg) { ok = false; detail = `col ${ci} bg differs`; }
      if ((a.columns[ci].wash || null) !== (b.columns[ci].wash || null)) { ok = false; detail = `col ${ci} wash differs`; }
      if (a.columns[ci].items.length !== b.columns[ci].items.length) { ok = false; detail = `col ${ci} item count differs`; continue; }
      for (let ii = 0; ii < a.columns[ci].items.length; ii++) {
        if (!rectEq(a.columns[ci].items[ii].rect, b.columns[ci].items[ii].rect)) { ok = false; detail = `col ${ci} item ${ii} rect differs`; }
        if (Math.abs(a.columns[ci].items[ii].opacity - b.columns[ci].items[ii].opacity) > 1e-3) { ok = false; detail = `col ${ci} item ${ii} opacity differs`; }
        if (a.columns[ci].items[ii].text?.text !== b.columns[ci].items[ii].text?.text) { ok = false; detail = `col ${ci} item ${ii} text differs`; }
      }
    }
    check(ok, `N3: ${label} t=1 geometry+opacity+text+wash == paired t=1 (thumbnail mode-independent)`, detail);
  }
}

// Unit-only mode: planner suite, no DOM.
if (UNIT_ONLY) {
  narrativeUnitSuite();
  await narrativeDurationSuite().catch((e) => check(false, "narrative duration suite", e.message));
  await narrativeRenderTruthSuite().catch((e) => check(false, "narrative render-truth suite", e.message));
  console.log(`\n${failures ? "✖ FAIL" : "✔ PASS"} — ${failures} failing check(s)`);
  process.exit(failures ? 2 : 0);
}

if (BASELINE_CAPTURE) {
  console.log(`Capturing comparison t=1 pre-promotion baseline from the CURRENT renderer at ${BASE} → ${BASELINE_DIR}\n`);
  await captureBaseline();
  process.exit(process.exitCode || 0);
}

console.log(`DOM passes — need the dev server at ${BASE} (npm run dev)\n`);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await claimSuite(page);
  await comparisonSuite(page);
  await comparisonRegressionSuite(page);
} finally {
  await browser.close();
}

// PL-4.1 narrative suite (additive — default-mode suites above stay byte-identical). The unit +
// duration suites are pure (no DOM); the DOM suites run in a FRESH browser (a long-lived page can
// go stale on Vite's HMR websocket — a clean page per phase is the reliable pattern).
narrativeUnitSuite();
await narrativeDurationSuite();
await narrativeRenderTruthSuite();
// Each DOM suite gets a FRESH browser (a single page accumulating ~20 networkidle navigations over
// Vite's persistent HMR websocket goes stale — a clean page per suite is the reliable pattern).
await withBrowser((page) => narrativeClaimsSuite(page));
await withBrowser((page) => narrativeClaimsFinalFrame(page));
// "sequential" (in-place, mode 2) — 4+4 + the 5+5 stress; "sequentialCentered" (moving, mode 1) — 4+4.
for (const id of [NARR_CMP_N3.sequential, NARR_CMP_STRESS]) {
  await withBrowser((page) => narrativeComparisonSuite(page, id, false));
}
await withBrowser((page) => narrativeComparisonSuite(page, NARR_CMP_CENTERED, true));
await withBrowser((page) => narrativeComparisonFinalFrame(page));
console.log(`\n${failures ? "✖ FAIL" : "✔ PASS"} — ${failures} failing check(s)`);
process.exit(failures ? 2 : 0);
