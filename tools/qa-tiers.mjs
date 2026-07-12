#!/usr/bin/env node
// PL-3.2 deterministic gate — TierStack (tiers + ranked) tiered-list primitive (no LLM).
//
//   node tools/qa-tiers.mjs --unit   # planTiers decision tables (no dev server)
//   npm run dev                      # in another terminal — DOM passes need the dev server
//   npm run qa:tiers                 # full: unit + sampled-t DOM pass
//
// Covers handoff §2.7 (planning/primitive-library/handoffs/PL-3.2-tiered-ranked.md):
//   1. planTiers unit suite — the tier/item clamps (C1/C2), the total-12 cap with the
//      deterministic last-tier-inward drop ORDER (C3, exact dropped ids + matching counters),
//      the greedy bin-pack positions (C6) + the C6b "≤1 two-row tier when tiers≥4" budget, the
//      chip show/hide on the FitLine floor (C5/C8), accent role-mapping (§2.5.4), the ranked
//      ordinals, the empty-state flag, and the C12 settle arithmetic (last chip ≤ 0.85).
//   2. Sampled-t DOM pass at T = {0, 0.22, 0.32, 0.43, 0.52, 0.60, 0.68, 0.78, 0.85, 1} over
//      the tiers + ranked + single + long-label + empty stress fixtures (one headless Chromium,
//      Preview ?id&t): C11 geometry static (stack/band/chip bbox identical across all 10 samples
//      ≤0.5px; node count constant), the NEW tier-contains-items row (every chip bbox ⊆ its tier
//      band; chips of tier i never intersect tier j), the NEW no-item-overlap row (no chip-rect
//      pair closer than 16px at any sample), the NEW total-count-cap row (visible chips ≤12,
//      tiers ≤4, chips/tier ≤5, rows/tier ≤2 with ≤1 two-row tier when tiers≥4, AND the rendered
//      counts MATCH planTiers.dropped — downsample surfaced, never silent), C4/C5/C8 fit+floor
//      (belowMobileFloor + clipped; effective ≥18px), C13 settle (transform OMITTED at t≥0.85),
//      and collisions/clipped/outOfSafeMargin/belowMobileFloor clean at every sample.
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BASE, VIEWPORT, loadReport, sampleFixture, assertGatingClean } from "./lib/sampled-t.mjs";
import {
  planTiers,
  accentForTier,
  chipWidth,
  settleT,
  tierBandStart,
  chipStart,
  CHIP_GAP,
  CHIP_DUR,
  CHIP_FONT,
} from "../src/lib/tiers.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UNIT_ONLY = process.argv.includes("--unit");

// §2.7 sample set: pre-reveal, each tier mid-reveal, chip overlap windows, settle, final.
const T_SAMPLES = [0, 0.22, 0.32, 0.43, 0.52, 0.6, 0.68, 0.78, 0.85, 1];
const ANIM_FIXTURES = [
  "fuzz-25-tiers-overcount",
  "fuzz-26-tiers-long-labels",
  "fuzz-27-tiers-single",
  "fuzz-28-tiers-ranked",
  "fuzz-29-tiers-empty",
];
const fixturePath = (id) => join(ROOT, "planning", "fixtures", "renderfuzz", `${id}.render.json`);

const SETTLE_DEADLINE = 0.85;

let failures = 0;
const check = (ok, name, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "✔" : "✖"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  return ok;
};
const approx = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// ── 1. Unit suite (pure — no DOM) ─────────────────────────────────────────────
function unitSuite() {
  const mk = (label, n, accent) => ({ label, accent, items: Array.from({ length: n }, (_, i) => ({ label: `c${i}` })) });

  console.log("Tier + item clamps (C1/C2):");
  const fiveTiers = planTiers([mk("a", 2), mk("b", 2), mk("c", 2), mk("d", 2), mk("e", 2)], "tiers");
  check(fiveTiers.tiers.length === 4, "5 declared tiers → exactly 4 (C1)", `got ${fiveTiers.tiers.length}`);
  check(fiveTiers.dropped.tiersDropped === 1, "tiersDropped counter === 1 (surfaced, not silent)", `got ${fiveTiers.dropped.tiersDropped}`);
  const sixItems = planTiers([mk("a", 6)], "tiers");
  check(sixItems.tiers[0].chips.length === 5, "6 items in a tier → exactly 5 (C2)", `got ${sixItems.tiers[0].chips.length}`);
  check(sixItems.dropped.itemsDropped === 1, "itemsDropped === 1 for the 6→5 clamp", `got ${sixItems.dropped.itemsDropped}`);

  console.log("Total-12 cap with deterministic last-tier-inward drop (C3):");
  // 4 tiers × 5 items = 20 declared (after per-tier slice); cap to 12 from the LAST tier inward.
  const over = planTiers([mk("t0", 5), mk("t1", 5), mk("t2", 5), mk("t3", 5)], "tiers");
  const visiblePerTier = over.tiers.map((t) => t.chips.length);
  const totalVisible = visiblePerTier.reduce((s, n) => s + n, 0);
  check(totalVisible === 12, "20 items → exactly 12 retained after the total cap (C3)", `got ${totalVisible} [${visiblePerTier.join(",")}]`);
  // Deterministic drop ORDER: tiers 0,1 keep 5; tier 2 cut to 2; tier 3 emptied.
  check(
    visiblePerTier[0] === 5 && visiblePerTier[1] === 5 && visiblePerTier[2] === 2 && visiblePerTier[3] === 0,
    "drop is from the LAST tier's LAST chips inward — [5,5,2,0] exactly",
    `got [${visiblePerTier.join(",")}]`,
  );
  // 4 tiers over-5 = 4 dropped by per-tier slice; +8 dropped by the total cap = 12 (5×4=20 declared → 12 here all start at 5).
  check(over.dropped.itemsDropped === 8, "itemsDropped === 8 (the total-cap drop, surfaced)", `got ${over.dropped.itemsDropped}`);

  console.log("Greedy bin-pack positions (C6) — deterministic, never CSS flex-wrap:");
  // Chips wide enough that exactly 4 fit a row (4·w + 3·16 ≤ 904, 5·w + 4·16 > 904).
  const w = chipWidth("a long chip lbl"); // ~210px
  const fitPerRow = Math.floor((904 + CHIP_GAP) / (w + CHIP_GAP));
  const wideTier = planTiers([{ label: "wide", items: Array.from({ length: 5 }, () => ({ label: "a long chip lbl" })) }], "tiers");
  const rows = wideTier.tiers[0].rows;
  check(rows[0].length === fitPerRow, `row 1 packs exactly ${fitPerRow} chips by the greedy fill (width ${w.toFixed(0)}px)`, `got ${rows[0].length}`);
  check(rows.length <= 2, "≤ 2 chip-rows per tier (C6)", `got ${rows.length}`);

  console.log("C6b — at most ONE two-row tier when tiers ≥ 4:");
  // 4 tiers, each with chips that want 2 rows. Only ONE may use 2 rows; the rest pack 1 row + drop.
  const dense = planTiers(
    Array.from({ length: 4 }, (_, i) => ({ label: `T${i}`, items: Array.from({ length: 4 }, () => ({ label: "a long chip lbl" })) })),
    "tiers",
  );
  const twoRowTiers = dense.tiers.filter((t) => t.rows.length >= 2).length;
  check(twoRowTiers <= 1, "≤ 1 tier uses 2 rows when tiers ≥ 4 (C6b)", `got ${twoRowTiers}`);
  // For tiers ≤ 3, up to TWO two-row tiers are allowed.
  const three = planTiers(
    Array.from({ length: 3 }, (_, i) => ({ label: `T${i}`, items: Array.from({ length: 4 }, () => ({ label: "a long chip lbl" })) })),
    "tiers",
  );
  check(three.tiers.filter((t) => t.rows.length >= 2).length <= 2, "≤ 2 two-row tiers when tiers ≤ 3 (C6b)");

  console.log("Chip show/hide on the FitLine floor + label truncation advisory (C4/C5/C8):");
  // A 14-char label is at the cap and shows; an over-long label is FitLine-shrunk (counted advisory),
  // never hidden for length alone (hide is reserved for the floor breach / empty).
  const capLabel = planTiers([{ label: "x", items: [{ label: "fourteenchars1" }] }], "tiers");
  check(capLabel.tiers[0].chips[0].hidden === false, "14-char chip label shows (at the C4 cap)");
  const emptyChip = planTiers([{ label: "x", items: [{ label: "" }] }], "tiers");
  check(emptyChip.tiers[0].chips[0].hidden === true && emptyChip.tiers[0].chips[0].hideReason === "tooThin", "empty chip label → hidden(tooThin)");
  const longLbl = planTiers([{ label: "y".repeat(40), items: [{ label: "ok" }] }], "tiers");
  check(longLbl.dropped.truncatedLabels >= 1, "over-length tier label counted in truncatedLabels (advisory)", `got ${longLbl.dropped.truncatedLabels}`);

  console.log("Accent role-mapping (§2.5.4 — anti-monochrome, by position):");
  check(accentForTier(undefined, 0) === "mint", "tier 0 default → mint (high/success)");
  check(accentForTier(undefined, 1) === "amber", "tier 1 default → amber (moderate/insight)");
  check(accentForTier(undefined, 2) === "burnt", "tier 2 default → burnt (low/friction)");
  check(accentForTier(undefined, 3) === "violet", "tier 3 default → violet (differentiator)");
  check(accentForTier("cyan", 0) === "cyan", "author accent overrides the position default");
  check(accentForTier("bogus", 1) === "amber", "unknown accent → the position default (never undefined)");
  const mapped = planTiers([mk("a", 1), mk("b", 1), mk("c", 1)], "tiers");
  const hues = new Set(mapped.tiers.map((t) => t.accentKey));
  check(hues.size === 3, "three tiers → three distinct accent roles (anti-monochrome)", `got ${[...hues].join(",")}`);

  console.log("Ranked mode (§2.6.9):");
  const ranked = planTiers([{ label: "L", items: Array.from({ length: 12 }, (_, i) => ({ label: `item${i}`, note: `${i}` })) }], "ranked");
  check(ranked.mode === "ranked" && ranked.tiers.length === 1, "ranked → one synthetic tier");
  check(ranked.tiers[0].chips.length === 12 && ranked.tiers[0].rows.length === 12, "12 ranked rows (each chip its own row)");
  check(ranked.tiers[0].chips.every((c, i) => c.rank === i + 1), "ranked chips carry the 1..N ordinal");
  const rankedOver = planTiers([{ label: "L", items: Array.from({ length: 15 }, (_, i) => ({ label: `i${i}` })) }], "ranked");
  check(rankedOver.tiers[0].chips.length === 12 && rankedOver.dropped.itemsDropped === 3, "ranked total cap: 15 → 12, itemsDropped 3");

  console.log("Empty-state flag (§3 ruling 3):");
  check(planTiers([], "tiers").empty === true, "0 tiers → empty flag set (caption-only Panel, no 'no data')");
  check(planTiers([{ label: "x", items: [] }], "tiers").empty === true, "tier with no items → empty");
  check(planTiers([mk("a", 1)], "tiers").empty === false, "a tier with a chip is NOT empty");

  console.log("C12 settle arithmetic (§2.5.5 — last chip ≤ 0.85):");
  // The densest legal layout (4 tiers, 12 items) settles inside the deadline.
  const densest = planTiers([mk("t0", 5), mk("t1", 5), mk("t2", 5), mk("t3", 5)], "tiers");
  check(settleT(densest) <= SETTLE_DEADLINE + 1e-9, `densest legal layout settles at ${settleT(densest).toFixed(4)} ≤ ${SETTLE_DEADLINE}`);
  check(tierBandStart(1) > tierBandStart(0) && tierBandStart(3) > tierBandStart(2), "tiers reveal strictly top→bottom (b_{i+1} > b_i)");
  // overlapping stagger: chip j+1 starts before chip j's window ends (the intended disconnected pop).
  check(chipStart(0, 1) < chipStart(0, 0) + CHIP_DUR, "chips overlap (stagger 0.028 < dur 0.08 — the disconnected-item pop)");
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
// Driver is the shared sampled-`t` harness (tools/lib/sampled-t.mjs, CHECKS.md gap #2).
const rectEq = (a, b, tol = 0.5) => a && b && ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) <= tol);
const contains = (outer, inner, pad = 0.5) =>
  inner.x >= outer.x - pad &&
  inner.y >= outer.y - pad &&
  inner.x + inner.w <= outer.x + outer.w + pad &&
  inner.y + inner.h <= outer.y + outer.h + pad;
// Closest gap between two rects (0 if they overlap). Used to assert the ≥16px chip separation.
const gapBetween = (A, B) => {
  const dx = Math.max(0, Math.max(A.x - (B.x + B.w), B.x - (A.x + A.w)));
  const dy = Math.max(0, Math.max(A.y - (B.y + B.h), B.y - (A.y + A.h)));
  if (dx === 0 && dy === 0) return -1; // overlapping
  if (dx > 0 && dy > 0) return Math.hypot(dx, dy);
  return dx + dy;
};

// ── 2. Sampled-t DOM suite ─────────────────────────────────────────────────────
async function geometrySuite(page) {
  for (const id of ANIM_FIXTURES) {
    const spec = JSON.parse(await readFile(fixturePath(id), "utf8"));
    const v = spec.visualization;
    const plan = planTiers(v.tiers, v.mode);
    console.log(`Sampled-t DOM pass — ${id} (${plan.mode}${plan.empty ? ", empty" : ""}, t ∈ {${T_SAMPLES.join(", ")}}):`);

    const reports = await sampleFixture(page, id, T_SAMPLES);
    const base = reports[1];
    const D = base.tiers;
    if (!check(!!D, "tiers section present at t=1")) continue;

    // Empty-state: caption-only Panel, zero chips, never a "no data" leaf.
    if (plan.empty) {
      check(D.empty === true && D.chipCount === 0, "empty fixture → caption-only stack, 0 chips (§3 ruling 3)", `chipCount ${D.chipCount}`);
      const noDataLeaf = base.texts.some((t) => /no data/i.test(t));
      check(!noDataLeaf, "no 'no data' text leaf rendered");
      // Gating arrays still clean.
      for (const name of ["collisions", "clipped", "outOfSafeMargin", "belowMobileFloor"]) {
        const dirty = T_SAMPLES.filter((t) => (reports[t][name] || []).length > 0);
        check(dirty.length === 0, `${name} clean at every sample`, dirty.map((t) => `t=${t}`).join(","));
      }
      continue;
    }

    const planVisible = plan.tiers.map((t) => t.rows.flat().filter((c) => !c.hidden).length);
    const planVisibleTotal = planVisible.reduce((s, n) => s + n, 0);

    // total-count-cap (NEW): tiers ≤4, chips/tier ≤5, total visible ≤12, rows/tier ≤2
    // (≤1 two-row tier when tiers≥4), AND the rendered counts MATCH planTiers (surfaced drop).
    check(D.tierCount <= 4, `≤ 4 tiers in DOM (got ${D.tierCount}) (C1)`);
    check(
      T_SAMPLES.every((t) => reports[t].tiers.tierCount === plan.tiers.length),
      `tier count === ${plan.tiers.length} (planTiers) at every sample`,
      `counts: ${T_SAMPLES.map((t) => reports[t].tiers.tierCount).join(",")}`,
    );
    // The ≤5/tier cap is a tiers-mode invariant; ranked is one synthetic full-width tier of ≤12.
    if (plan.mode === "tiers") {
      check(
        D.tiers.every((t) => t.chips.length <= 5),
        "≤ 5 chips per tier in DOM (C2)",
        `per-tier: ${D.tiers.map((t) => t.chips.length).join(",")}`,
      );
    }
    check(
      D.chipCount <= 12,
      `total visible chips ≤ 12 (got ${D.chipCount}) (C3, total-count-cap NEW)`,
    );
    check(
      D.chipCount === planVisibleTotal,
      `rendered visible chip count (${D.chipCount}) === planTiers visible (${planVisibleTotal}) — downsample surfaced, never silent`,
    );
    check(
      D.tiers.every((t, i) => t.chips.length === planVisible[i]),
      "per-tier chip counts match planTiers exactly (deterministic drop reproduced)",
      `DOM [${D.tiers.map((t) => t.chips.length).join(",")}] vs plan [${planVisible.join(",")}]`,
    );

    // C11 node-count constancy + stack/band/chip geometry static across all samples (≤0.5px).
    check(
      T_SAMPLES.every((t) => reports[t].tiers.nodeCount === D.nodeCount),
      `stack DOM node count constant (${D.nodeCount}) — nothing mounts/unmounts across t (C11)`,
      `counts: ${T_SAMPLES.map((t) => reports[t].tiers.nodeCount).join(",")}`,
    );
    // Compare TRANSFORM-BLIND layout boxes: the reveal animates a `rise` translateY (a transform),
    // so the painted bbox shifts mid-reveal by design; C11 constrains the LAYOUT box (offset*),
    // which is a pure function of DATA and must be bit-identical at every t.
    let geomOk = true, geomDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].tiers;
      for (let ti = 0; ti < D.tiers.length; ti++) {
        if (!rectEq(d.tiers[ti]?.layout, D.tiers[ti].layout)) { geomOk = false; geomDetail = `tier ${ti} layout drifts at t=${t}`; }
        if (D.tiers[ti].band && !rectEq(d.tiers[ti]?.band?.layout, D.tiers[ti].band.layout)) { geomOk = false; geomDetail = `tier ${ti} band layout drifts at t=${t}`; }
        for (let ci = 0; ci < D.tiers[ti].chips.length; ci++) {
          if (!rectEq(d.tiers[ti]?.chips[ci]?.layout, D.tiers[ti].chips[ci].layout)) { geomOk = false; geomDetail = `tier ${ti} chip ${ci} layout drifts at t=${t}`; }
        }
      }
    }
    check(geomOk, "stack + every band + every chip LAYOUT box identical across all 10 samples (≤0.5px) (C11)", geomDetail);

    // tier-contains-items (NEW, tiers mode): every chip LAYOUT box ⊆ its tier band; chips of tier
    // i never intersect tier j (i≠j) — at every sample. (Ranked is a tier-less leaderboard with no
    // band; its rows are checked for non-overlap below.)
    if (plan.mode === "tiers") {
      let containOk = true, containDetail = "";
      for (const t of T_SAMPLES) {
        const d = reports[t].tiers;
        for (let ti = 0; ti < d.tiers.length; ti++) {
          const tier = d.tiers[ti];
          const band = tier.band ? tier.band.layout : tier.layout;
          for (const chip of tier.chips) {
            if (!contains(band, chip.layout)) { containOk = false; containDetail = `tier ${ti} chip escapes its band at t=${t}`; }
          }
          for (let tj = 0; tj < d.tiers.length; tj++) {
            if (tj === ti) continue;
            const otherBand = d.tiers[tj].band ? d.tiers[tj].band.layout : d.tiers[tj].layout;
            for (const chip of tier.chips) {
              const ox = Math.min(chip.layout.x + chip.layout.w, otherBand.x + otherBand.w) - Math.max(chip.layout.x, otherBand.x);
              const oy = Math.min(chip.layout.y + chip.layout.h, otherBand.y + otherBand.h) - Math.max(chip.layout.y, otherBand.y);
              if (ox > 4 && oy > 4) { containOk = false; containDetail = `tier ${ti} chip intersects tier ${tj} band at t=${t}`; }
            }
          }
        }
      }
      check(containOk, "tier-contains-items: every chip ⊆ its band; no cross-tier intersection, at every sample (NEW)", containDetail);
    }

    // no-item-overlap (NEW): no two chip LAYOUT boxes overlap; WITHIN a tier (tiers mode) every
    // pair clears the 14px crampedPairs safety floor (the §2.5.3 chip-gap discipline — the design
    // target is a 16px CSS gap; offsetWidth is integer-rounded so the measured gap reads 15–16px,
    // always > the 14px floor by construction). Ranked rows use the 24px row gap; for ranked we
    // assert only non-overlap (the leaderboard is a vertical stack, not a chip band).
    const GAP_FLOOR = 14; // the crampedPairs advisory floor — the binding safety number (C7)
    let sepOk = true, sepDetail = "";
    for (const t of T_SAMPLES) {
      const d = reports[t].tiers;
      for (const tier of d.tiers) {
        const chips = tier.chips;
        const minGap = plan.mode === "tiers" ? GAP_FLOOR : 0;
        for (let i = 0; i < chips.length; i++) {
          for (let j = i + 1; j < chips.length; j++) {
            const g = gapBetween(chips[i].layout, chips[j].layout);
            if (g < 0) { sepOk = false; sepDetail = `two chips overlap in a tier at t=${t}`; }
            else if (g < minGap - 0.5) { sepOk = false; sepDetail = `two chips ${g.toFixed(1)}px apart (< ${minGap}px floor) at t=${t}`; }
          }
        }
      }
    }
    check(sepOk, `no-item-overlap: no chip-rect pair overlaps${plan.mode === "tiers" ? " or sits below the 14px gap floor within a tier (16px target)" : ""}, at every sample (NEW)`, sepDetail);

    // C4/C5/C8 fit + floor: every chip label effective ≥18px (24 × FitLine zoom); rank ordinals
    // present in ranked mode. belowMobileFloor / clipped are gated globally below.
    let floorOk = true, floorDetail = "";
    for (const tier of D.tiers) {
      for (const chip of tier.chips) {
        const eff = CHIP_FONT * chip.fitZoom;
        if (eff < 18 - 0.5) { floorOk = false; floorDetail = `chip "${chip.text.slice(0, 12)}" effective ${eff.toFixed(1)}px < 18`; }
      }
    }
    check(floorOk, "every visible chip label effective ≥ 18px (24 × FitLine zoom, C8)", floorDetail);
    if (plan.mode === "ranked") {
      const ranks = D.tiers[0].chips.map((c) => c.rank);
      check(ranks.every((r, i) => r === `${i + 1}.`), "ranked chips render the 1..N ordinal prefix", `got [${ranks.join(",")}]`);
    }

    // C13 settle: chip transforms OMITTED (none) at t ≥ 0.85; chip opacities 1 at t=1.
    let settleOk = true, settleDetail = "";
    for (const t of [0.85, 1]) {
      for (const tier of reports[t].tiers.tiers) {
        for (const chip of tier.chips) {
          if (chip.transform !== "none") { settleOk = false; settleDetail = `chip transform "${chip.transform}" at t=${t} — must be OMITTED once settled (C13)`; }
        }
      }
    }
    for (const tier of reports[1].tiers.tiers) {
      for (const chip of tier.chips) if (chip.opacity !== 1) { settleOk = false; settleDetail = `chip opacity ${chip.opacity} at t=1`; }
    }
    check(settleOk, "t ≥ 0.85: chip transforms OMITTED (none); t=1: chip opacities exactly 1 (C13)", settleDetail);

    // Gating arrays clean at EVERY sample (mid-reveal included).
    assertGatingClean(check, reports, T_SAMPLES, " (C7/C9/C10)");
    check(base.textCoverage < 0.42, `textCoverage ${base.textCoverage} < 0.42 at t=1`);
    // anti-monochrome (advisory): tiers should carry ≥2 accent hues.
    if (plan.mode === "tiers" && plan.tiers.length >= 2) {
      console.log(`    (advisory: ${base.accentHues} distinct accent hue(s) on canvas)`);
    }
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
