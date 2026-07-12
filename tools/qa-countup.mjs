#!/usr/bin/env node
// PL-1.1 deterministic gate — MetricCard count-up (no LLM, no tokens).
//
//   node tools/qa-countup.mjs --unit     # parser unit suite only (no dev server needed)
//   npm run dev                          # in another terminal — DOM passes need the dev server
//   npm run qa:countup                   # full: parser suite + measured-tnum + sampled-t stability
//
// Covers handoff §2.7 (planning/primitive-library/handoffs/PL-1.1-metriccard-countup.md):
//   1. Parser unit suite — §2.5.1 decision table + caps C1–C5 edges + round-trip + clamp guards.
//   2. Measured tabular-figures check (§3 hardening) — digits 0–9 rendered at the value
//      font/size must have equal advance widths (spread ≤ 0.5px); fails loudly if the font
//      lacks `tnum` (or didn't load), never silently.
//   3. Sampled-`t` stability pass (CHECKS.md gap #2 / "animation reserve" row) — drives the
//      Preview page via its existing `?id=<fixture>&t=<0..1>` URL params, one headless browser,
//      re-running the exported inspector `measure()` at each sample. Asserts constant card
//      geometry/zone/zoom, width(t) ≤ width(1), gating checks clean at EVERY sample, the
//      4-card clamp, and final-frame byte-for-byte exactness.
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE, withBrowser, loadReport, sampleFixture, assertGatingClean } from "./lib/sampled-t.mjs";
import { loadFace, digitAdvances } from "./lib/fontkit-metrics.mjs";
import { planCountUp, deltaTrendRole } from "../src/lib/countup.ts";
import { colors } from "../src/tokens/design.ts";

// #RRGGBB → "rgb(r, g, b)" (the form getComputedStyle returns) for the deltaTrend color check.
const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UNIT_ONLY = process.argv.includes("--unit");

// Sample set from §2.7: pre-reveal, every card mid-count, post-settle.
const T_SAMPLES = [0, 0.3, 0.6, 0.64, 0.7, 0.76, 0.83, 0.9, 1];
const FIXTURES = ["fuzz-18-metrics-countup-anim", "fuzz-19-metrics-countup-fade"];

let failures = 0;
const check = (ok, name, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "✔" : "✖"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  return ok;
};

// ── 1. Parser unit suite (pure — no DOM) ──────────────────────────────────────
function unitSuite() {
  console.log("Parser unit suite (§2.5.1 decision table + caps + round-trip):");

  // The full decision table from the spec — every brief example, verbatim.
  const table = [
    ["+14.3%", true],
    ["−7.5%", true], // U+2212
    ["53k", true],
    ["169,179", true],
    ["2013", false, "year"],
    ["~2027", false, "regex"],
    ["19% slower", false, "regex"],
    ["$12,345,678", true],
    ["1 in 5", false, "regex"],
    ["0.99²⁰", false, "regex"],
    // Caps edges. Reasons matter: "length"/"intDigits" prove the CAP demoted a value the
    // regex accepted (i.e. the check fails on bad input pre-clamp, not by accident).
    ["999,999,999", true], // C1 boundary: 9 int digits
    ["1,234,567,890", false, "intDigits"], // C1 breach: 10 int digits
    ["1.23", true], // C2 boundary
    ["1.234", false, "regex"], // C2 breach: 3 decimals
    ["$5", true],
    ["€5", true],
    ["£5", true],
    ["+-5", false, "regex"], // C3 breach: two prefix chars
    ["5pp", true],
    ["5ms", true],
    ["5×", true],
    ["5 %", false, "regex"], // C4 breach: space before suffix
    ["5km", false, "regex"], // C4 breach: not in the whitelist
    ["$123,456,789.00", false, "length"], // C5 breach: 15 chars (regex-valid shape!)
    ["$12,345,678.99", true], // C5 boundary: 14 chars
    // Year-rule edges
    ["2,013", true], // grouped 4-digit counts normally
    ["+2013", true], // prefixed ⇒ not a bare year
    ["999", true],
    ["20133", true], // 5 digits ⇒ not a year
    // Round-trip guard (formatter can't reproduce ⇒ demoted before render)
    ["007", false, "roundTrip"],
    ["0,123", false, "roundTrip"],
    [" 53k", false, "roundTrip"], // padded input can't round-trip byte-for-byte
  ];

  for (const [value, animates, reason] of table) {
    const plan = planCountUp(value);
    check(
      plan.animate === animates && (animates || !reason || plan.reason === reason),
      `${JSON.stringify(value)} → ${animates ? "count" : `fade(${reason})`}`,
      `got ${plan.animate ? "count" : `fade(${plan.reason})`}`,
    );
  }

  // Round-trip + frame-formatter invariants for every animatable case.
  console.log("Parser display(p) invariants:");
  const animatable = table.filter(([, a]) => a).map(([v]) => v);
  for (const value of animatable) {
    const plan = planCountUp(value);
    if (!plan.animate) continue; // already failed above
    const final = plan.display(1);
    let ok = final === value && plan.display(1.5) === value; // verbatim at p ≥ 1 (C11)
    ok &&= plan.display(-1) === plan.display(0); // p clamped
    const d = (value.match(/\.(\d+)/) || [, ""])[1].length;
    for (let p = 0; ok && p <= 1; p += 0.05) {
      const s = plan.display(p);
      ok &&= s.length <= value.trim().length; // C10 proxy: never wider than the final (tabular)
      ok &&= ((s.match(/\.(\d+)/) || [, ""])[1].length) === d; // C2: decimal count preserved
    }
    check(ok, `${JSON.stringify(value)} round-trips + monotone width + fixed decimals`);
  }
  // Spot-check the zero frame keeps prefix/suffix/decimals (incl. U+2212 verbatim).
  const zeroFrames = [
    ["+14.3%", "+0.0%"],
    ["−7.5%", "−0.0%"],
    ["169,179", "0"],
    ["$12,345,678", "$0"],
    ["53k", "0k"],
  ];
  for (const [value, expect] of zeroFrames) {
    const plan = planCountUp(value);
    check(plan.animate && plan.display(0) === expect, `${JSON.stringify(value)} display(0) === ${JSON.stringify(expect)}`,
      plan.animate ? `got ${JSON.stringify(plan.display(0))}` : "did not animate");
  }
}

// ── PL-4.2 deltaTrend unit suite (pure — no DOM) ─────────────────────────────
// The author-stated trend maps to a semantic-accent ROLE; flat/absent ⇒ neutral (null). Cross-checks
// the role→hex against the design tokens so a token change can't silently drift the rendered color.
function deltaTrendUnitSuite() {
  console.log("\ndeltaTrend role mapping (PL-4.2 — pure):");
  check(deltaTrendRole("up") === "successMint", '"up" → successMint role', `got ${deltaTrendRole("up")}`);
  check(deltaTrendRole("down") === "frictionOrange", '"down" → frictionOrange role', `got ${deltaTrendRole("down")}`);
  check(deltaTrendRole("flat") === null, '"flat" → null (neutral)', `got ${deltaTrendRole("flat")}`);
  check(deltaTrendRole(undefined) === null, "absent → null (neutral, byte-identical default)", `got ${deltaTrendRole(undefined)}`);
  // The roles must resolve to the Multi-Accent semantic accents (the design source of truth).
  check(colors.semanticAccent.successMint === colors.accent.mint, "successMint hex == accent.mint (Multi-Accent strategy)");
  check(colors.semanticAccent.frictionOrange === colors.accent.burnt, "frictionOrange hex == accent.burnt (Multi-Accent strategy)");
}

// ── 2+3. DOM passes (dev server + headless Chromium) ─────────────────────────
// Driver (browser/page lifecycle, ?id&t load, fonts.ready, FitLine settle, measure()) is the
// shared sampled-`t` harness (tools/lib/sampled-t.mjs, CHECKS.md gap #2).
const loadPage = (page, id, t) => loadReport(page, id, t);

function tabularFiguresCheck(digits) {
  console.log("Measured tabular-figures check (§3 hardening):");
  const spread = (a) => Math.max(...a) - Math.min(...a);
  check(
    digits.spaceGroteskLoaded,
    "Space Grotesk 600 loaded on the preview page",
    "font not loaded — measurement would test the fallback font, refusing to pass silently",
  );
  const tnumSpread = spread(digits.tabular);
  check(
    tnumSpread <= 0.5,
    `digits 0–9 @ 72px tabular-nums: advance-width spread ${tnumSpread.toFixed(3)}px ≤ 0.5px`,
    `font does NOT implement tnum — the C10 width-safety proof is void; widen the ghost reservation strategy`,
  );
  console.log(`    (info: proportional spread ${spread(digits.proportional).toFixed(3)}px — tnum actually changes metrics: ${spread(digits.proportional) - tnumSpread > 0.01 ? "yes" : "no/already tabular"})`);
}

// Browser-free tnum proof (PL-0.3 deliverable C / fontkit). Reads the SHIPPED offline woff2 — the
// exact face the MP4 and the now-parity Preview render with — and asserts the REAL tabular-nums
// advances are equal, no DOM. Runs in --unit, so the C10 width-safety guarantee is provable without
// the dev server. (The DOM-measured form above still runs in the full pass, testing the live face.)
async function tabularFiguresUnitCheck() {
  console.log("fontkit tabular-figures unit check (browser-free — reads the shipped offline woff2):");
  const spread = (a) => Math.max(...a) - Math.min(...a);
  let font;
  try {
    font = await loadFace("Space Grotesk", 600, "latin");
  } catch (e) {
    check(false, "offline Space Grotesk 600 woff2 readable by fontkit", e.message);
    return;
  }
  check(true, "offline Space Grotesk 600 woff2 read by fontkit (no browser)");
  check(
    font.availableFeatures.includes("tnum"),
    "font file declares the `tnum` (tabular figures) OpenType feature",
    `availableFeatures: ${font.availableFeatures.filter((f) => /num$/.test(f)).join(",") || "(no *num features)"}`,
  );
  const tnum = digitAdvances(font, 72, ["tnum"]);
  const prop = digitAdvances(font, 72, []);
  const tnumSpread = spread(tnum);
  check(
    tnumSpread <= 0.5,
    `digits 0–9 @ 72px tnum advance-width spread ${tnumSpread.toFixed(3)}px ≤ 0.5px (real font metrics)`,
    `the font's tnum advances are NOT uniform — the C10 width-safety proof is void`,
  );
  console.log(`    (info: proportional spread ${spread(prop).toFixed(3)}px — tnum actually changes metrics: ${spread(prop) - tnumSpread > 0.01 ? "yes" : "no/already tabular"})`);
}

async function domSuite() {
  await withBrowser(async (page) => {
    // Measured tnum check — on the live preview page so we test the font that actually renders.
    await loadPage(page, FIXTURES[0], 1);
    const digits = await page.evaluate(() => {
      const host = document.createElement("div");
      host.style.cssText = "position:absolute;left:-9999px;top:0";
      document.body.appendChild(host);
      const widthsFor = (tabular) => {
        const out = [];
        for (let d = 0; d <= 9; d++) {
          const span = document.createElement("span");
          span.className = "font-display font-semibold";
          span.style.cssText = `font-size:72px;line-height:1;white-space:nowrap;display:inline-block;${tabular ? "font-variant-numeric:tabular-nums;" : ""}`;
          span.textContent = String(d).repeat(10);
          host.appendChild(span);
          out.push(span.getBoundingClientRect().width / 10); // ×10 amplifies sub-pixel differences
          span.remove();
        }
        return out;
      };
      const result = { tabular: widthsFor(true), proportional: widthsFor(false) };
      host.remove();
      result.spaceGroteskLoaded = !!(document.fonts && document.fonts.check('600 72px "Space Grotesk"'));
      return result;
    });
    tabularFiguresCheck(digits);

    // Sampled-t stability pass over both stress fixtures.
    for (const id of FIXTURES) {
      const spec = JSON.parse(await readFile(join(ROOT, "planning", "fixtures", "renderfuzz", `${id}.render.json`), "utf8"));
      const expected = spec.metrics.slice(0, 4).map((m) => m.value);
      console.log(`Sampled-t stability — ${id} (t ∈ {${T_SAMPLES.join(", ")}}):`);
      check(spec.metrics.length >= 5, `fixture declares ${spec.metrics.length} metrics (≥5 — pre-clamp would breach the C6 cap of 4)`);

      const reports = await sampleFixture(page, id, T_SAMPLES);
      const base = reports[1];

      // C6 data-count cap: the renderer's slice(0,4) must hold at every sample.
      check(
        T_SAMPLES.every((t) => reports[t].metricCards.length === 4),
        "card count clamped to 4 at every sample (C6)",
        `counts: ${T_SAMPLES.map((t) => reports[t].metricCards.length).join(",")}`,
      );
      check(
        base.metricCards.every((c) => ["0", "1", "2", "3"].includes(c.index)),
        "card indices clamped to 0..3",
        `indices: ${base.metricCards.map((c) => c.index).join(",")}`,
      );

      // C9 geometry stability + C10 width monotonicity + C8 floor, per card, across all samples.
      for (let j = 0; j < base.metricCards.length; j++) {
        const b = base.metricCards[j];
        let geomOk = true, widthOk = true, detail = "";
        for (const t of T_SAMPLES) {
          const c = reports[t].metricCards[j];
          if (!c) { geomOk = false; detail = `card missing at t=${t}`; break; }
          for (const k of ["x", "y", "w", "h"]) {
            if (Math.abs(c.rect[k] - b.rect[k]) > 0.5) { geomOk = false; detail = `rect.${k} drifts ${Math.abs(c.rect[k] - b.rect[k]).toFixed(2)}px at t=${t}`; }
          }
          if (Math.abs(c.zoneWidth - b.zoneWidth) > 0.5) { geomOk = false; detail = `zoneWidth drifts at t=${t}`; }
          if (Math.abs(c.zoom - b.zoom) > 0.002) { geomOk = false; detail = `zoom ${c.zoom} vs ${b.zoom} at t=${t}`; }
          if (c.valueTextWidth > b.valueTextWidth + 0.5) { widthOk = false; detail = `width(t=${t}) ${c.valueTextWidth} > width(1) ${b.valueTextWidth}`; }
        }
        check(geomOk, `card ${j} [${b.mode}] bbox/zone/zoom constant across all 9 samples (≤0.5px / ≤0.002)`, detail);
        check(widthOk, `card ${j} value width(t) ≤ width(1) at every sample (C10)`, detail);
        check(72 * b.zoom >= 18, `card ${j} effective value size ${(72 * b.zoom).toFixed(1)}px ≥ 18px mobile floor (C8)`);
      }

      // Gating checks clean at EVERY sample (mid-count overlap/clip/margin/floor).
      assertGatingClean(check, reports, T_SAMPLES);

      // C11 settle + final-frame exactness: byte-for-byte at t=0.90 (post-settle) and t=1.
      for (const t of [0.9, 1]) {
        const got = reports[t].metricCards.map((c) => c.valueText);
        check(
          expected.every((v, j) => got[j] === v),
          `t=${t}: value textContent === schema value byte-for-byte (incl. U+2212/commas)`,
          `expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`,
        );
      }

      // Mode sanity: fixture A counts, fixture B fades.
      const wantMode = id.endsWith("anim") ? "count" : "fade";
      check(base.metricCards.every((c) => c.mode === wantMode), `all 4 visible cards in ${wantMode} mode`,
        `modes: ${base.metricCards.map((c) => c.mode).join(",")}`);
    }

    // PL-4.2 deltaTrend DOM pass — fuzz-127 [up, down, flat, default]. Delta TEXT color == the trend
    // role hex (up=mint, down=orange); flat + default == neutral (text.secondary, today's color);
    // geometry constant across t (color-only, no layout shift). Defaults are byte-identical neutral.
    {
      const DT = "fuzz-127-metric-deltatrend";
      console.log(`\ndeltaTrend DOM (${DT}) — color == role @ t=1, geometry constant:`);
      const mint = hexToRgb(colors.semanticAccent.successMint);
      const orange = hexToRgb(colors.semanticAccent.frictionOrange);
      const neutral = hexToRgb(colors.text.secondary);
      const dtReports = await sampleFixture(page, DT, [0.7, 1]);
      const cards = dtReports[1].metricCards;
      check(cards.length === 4, "4 metric cards render", `got ${cards.length}`);
      const byIdx = Object.fromEntries(cards.map((c) => [c.index, c]));
      const up = byIdx["0"], down = byIdx["1"], flat = byIdx["2"], def = byIdx["3"];
      check(!!(up?.delta && down?.delta && flat?.delta && def?.delta), "every card has a measured delta row");
      check(up?.delta?.color === mint, `up delta color == successMint ${mint}`, `got ${up?.delta?.color}`);
      check(up?.delta?.trend === "up", "up card carries data-delta-trend=up");
      check(down?.delta?.color === orange, `down delta color == frictionOrange ${orange}`, `got ${down?.delta?.color}`);
      check(down?.delta?.trend === "down", "down card carries data-delta-trend=down");
      check(flat?.delta?.color === neutral, `flat delta color == neutral ${neutral}`, `got ${flat?.delta?.color}`);
      check(flat?.delta?.color !== mint && flat?.delta?.color !== orange, "flat delta is NOT an accent color");
      check(def?.delta?.color === neutral, `default (no deltaTrend) delta color == neutral ${neutral} (byte-identical)`, `got ${def?.delta?.color}`);
      check(def?.delta?.trend === null, "default card has NO data-delta-trend attribute");
      // Geometry constant across t (color-only ⇒ no card/delta shift; delta box reserved).
      let stable = true, sd = "";
      for (const c of cards) {
        const a = dtReports[0.7].metricCards.find((x) => x.index === c.index);
        for (const k of ["x", "y", "w", "h"]) {
          if (Math.abs(c.rect[k] - a.rect[k]) > 0.5) { stable = false; sd = `card ${c.index} rect.${k}`; }
          if (c.delta && a.delta && Math.abs(c.delta.rect[k] - a.delta.rect[k]) > 0.5) { stable = false; sd = `card ${c.index} delta.${k}`; }
        }
      }
      check(stable, "card + delta geometry constant across t (color-only, no shift)", sd);
    }
  });
}

unitSuite();
deltaTrendUnitSuite(); // PL-4.2 — pure role mapping (runs in --unit too)
await tabularFiguresUnitCheck(); // browser-free tnum proof (fontkit) — runs in --unit too
if (!UNIT_ONLY) {
  console.log(`\nDOM passes — need the dev server at ${BASE} (npm run dev)\n`);
  await domSuite();
}
console.log(`\n${failures ? "✖ FAIL" : "✔ PASS"} — ${failures} failing check(s)`);
process.exit(failures ? 2 : 0);
