#!/usr/bin/env node
// PL-0.3 baseline-invalidation helper. Snapshots the exported inspector measure() at t=1 for
// one fixture per primitive (the "reference set") so the render-truth/font change can be checked
// for sub-pixel geometry drift (the #1 risk: any element shifting >0.5px invalidates the gates).
//   node tools/lib/measure-snapshot.mjs > out/before.json    # before the change
//   node tools/lib/measure-snapshot.mjs > out/after.json     # after; then diff
import { chromium } from "playwright";
import { measure } from "./inspect.mjs";

const BASE = process.env.PREVIEW_URL || "http://localhost:5173";
const FIXTURES = [
  "fuzz-18-metrics-countup-anim", // MetricCard
  "fuzz-20-stat-ring-anim", // StatHero
  "fuzz-22-stack-stress-anim", // DecompBar
  "fuzz-23-divergence-dumbbell-stress", // Divergence (text-dense)
  "fuzz-25-tiers-overcount", // TierStack
  "fuzz-30-claims-stress-anim", // ClaimList (text-dense)
  "fuzz-31-comparison-stress-anim", // ComparisonColumns
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 2080 }, deviceScaleFactor: 1 }); // tall enough for 1080×1920 (9:16); canvas-relative checks unaffected
  const out = {};
  for (const id of FIXTURES) {
    await page.goto(`${BASE}/?id=${encodeURIComponent(id)}&t=1`, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForSelector("#post-canvas", { timeout: 20000 });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForTimeout(250);
    const r = await page.evaluate(measure);
    // Per-text-leaf bounding boxes — the render-truth-sensitive quantity (font metrics drive
    // text width/position). Captured directly so before/after can be diffed at <=0.5px.
    const leaves = await page.evaluate(() => {
      const canvas = document.querySelector("#post-canvas");
      const cb = canvas.getBoundingClientRect();
      const vis = (el) => {
        const s = getComputedStyle(el);
        return !(s.visibility === "hidden" || s.display === "none" || parseFloat(s.opacity) === 0);
      };
      const els = [...canvas.querySelectorAll("*")].filter(vis);
      const textEls = els.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0));
      return textEls
        .filter((el) => !textEls.some((o) => o !== el && el.contains(o)))
        .map((el) => {
          const rr = el.getBoundingClientRect();
          return {
            text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40),
            x: +(rr.left - cb.left).toFixed(2), y: +(rr.top - cb.top).toFixed(2),
            w: +rr.width.toFixed(2), h: +rr.height.toFixed(2),
          };
        });
    });
    out[id] = {
      canvas: r.canvas,
      measuredCount: r.measuredCount,
      textCoverage: r.textCoverage,
      leaves,
      collisions: r.collisions,
      clipped: r.clipped,
      outOfSafeMargin: r.outOfSafeMargin,
      belowMobileFloor: r.belowMobileFloor,
    };
  }
  process.stdout.write(JSON.stringify(out, null, 2));
} finally {
  await browser.close();
}
