#!/usr/bin/env node
// RENDER-TRUTH verification (PL-0.3 deliverable A — CHECKS.md gap #1). PROVES the inspected Preview
// renders what the Remotion MP4 actually renders, on text-dense fixtures, within a stated tolerance.
//
// Root cause (now fixed): the Preview/inspector loaded brand fonts ONLINE (the <link> in index.html,
// Google Fonts) while the MP4 loads them OFFLINE (base64 woff2 via src/remotion/fonts-local.css). Any
// metric divergence (or a headless fallback) made measured text widths/positions diverge from the
// video — the likely cause of the "MetricCard % overlap passed QA but showed in the MP4". The fix:
// load the SAME offline faces app-wide (src/main.tsx) + drop the online <link>, so the Preview is
// pixel-faithful to the MP4. This tool is the proof.
//
//   npm run dev                 # the Preview side needs the dev server
//   node tools/render-truth.mjs # render the settled MP4 frame per fixture, pixelmatch vs the Preview
//
// Method per fixture: (1) screenshot the Preview #post-canvas at t=1 (1080×1350); (2) render the
// SAME composition's SETTLED frame via Remotion (`remotion still` at the last frame, where the MP4's
// useProgressT() = easeOutCubic(1) = 1 — identical to the final MP4 frame, far cheaper than a full
// render); (3) pixelmatch the two opaque PNGs. The measurable quantity proven in agreement is the
// rendered text: any text element whose bbox/advance differed between Preview and MP4 (a font-metric
// gap, or a tight overflow) would surface as diff pixels. We assert the mismatched fraction is below
// MAX_DIFF_FRACTION. MP4 render is slow, so this is a runnable/documented proof, not a per-run gate.
import { readFile, writeFile, mkdir, copyFile, rm, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PREVIEW_URL || "http://localhost:5173";
const OUT = join(ROOT, "out", "render-truth");
const GEN_DIR = join(ROOT, "src", "posts", "generated");

// Text-dense fixtures (claims + divergence — the spec's pick) PLUS a scatter one: scatter's viewBox
// is ROW-AWARE (PL-0.8) via runtime DOM measurement, so it's the primitive most exposed to a
// Preview↔MP4 divergence — guard it here permanently. The last two are NON-PORTRAIT (square 1080×1080,
// vertical 1080×1920): they make the FORMAT-PARITY gate below live — a pass on them proves both surfaces
// honor a non-default `format` (a portrait-only list left the parity assert dormant).
const FIXTURES = [
  "fuzz-30-claims-stress-anim",
  "fuzz-23-divergence-dumbbell-stress",
  "fuzz-69-scatter-dense-overflow",
  "fuzz-fmt-square",
  "fuzz-fmt-vertical",
  "fuzz-fmt-stat-square", // a FitZone hug-and-center kind at a non-default aspect (the bar fixtures don't
                          // exercise the format-specific FitZone-shrink / footer-anchor path — see the fill check)
];

// Remotion timeline: 14s × 30fps = 420 frames; useProgressT settles to 1 at 85% (frame 357), so the
// last frame (419) renders the SETTLED state — exactly the Preview's t=1.
const FPS = 30, DURATION_S = 14;
const LAST_FRAME = Math.round(DURATION_S * FPS) - 1;

// Tolerance. Preview (Chromium screenshot) and the Remotion still (also Chromium, but a different
// bundler/AA path + the AbsoluteFill #0E1116 backdrop) won't be byte-identical even when fonts match;
// AA on glyph edges differs. A font/layout DIVERGENCE moves whole glyph runs and lights up far more
// pixels than edge AA. threshold 0.1 per pixel; assert < 2% of pixels mismatch.
const PIXELMATCH_THRESHOLD = 0.1;
const MAX_DIFF_FRACTION = 0.02;
// FILL floor: rendered content must span ≥ this fraction of the frame HEIGHT. Catches a viz/footer
// "collapse" (PostFrame's fr-grid regressing from `auto minmax(0,1fr) auto` back to content-height) that
// pixelmatch CANNOT — Preview + Remotion would collapse IDENTICALLY (a===b, ~0% diff) yet pool dead space.
// A row counts as content if any pixel's brightest channel exceeds BG_LUMA (bg is the dark ~#0E1116 vignette).
const MIN_FILL_FRACTION = 0.8;
const BG_LUMA = 60;
function contentCoverage(png) {
  const { width, height, data } = png;
  let top = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    let has = false;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (Math.max(data[i], data[i + 1], data[i + 2]) > BG_LUMA) { has = true; break; }
    }
    if (has) { if (top < 0) top = y; bottom = y; }
  }
  return top < 0 ? 0 : (bottom - top + 1) / height;
}

let failures = 0;
const check = (ok, name, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "✔" : "✖"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  return ok;
};

const fixturePath = (id) => join(ROOT, "planning", "fixtures", "renderfuzz", `${id}.render.json`);

// Output-format dims, mirroring design.ts `formats` (kept literal — this .mjs can't import the TS token).
// The FORMAT-PARITY GATE below asserts the Preview canvas AND the Remotion still both equal the post's
// declared format. This is the single guard against Preview/Remotion drifting out of format lockstep —
// which would otherwise either hard-fail the pixelmatch on a size mismatch or (worse) silently measure a
// post against the wrong-shaped box. Absent `format` ⇒ portrait (today's fixtures).
const FORMAT_DIMS = { portrait: { width: 1080, height: 1350 }, square: { width: 1080, height: 1080 }, vertical: { width: 1080, height: 1920 } };
async function expectedDims(id) {
  try {
    const post = JSON.parse(await readFile(fixturePath(id), "utf8"));
    return FORMAT_DIMS[post.format] || FORMAT_DIMS.portrait;
  } catch {
    return FORMAT_DIMS.portrait;
  }
}

async function previewShot(page, id) {
  await page.goto(`${BASE}/?id=${encodeURIComponent(id)}&t=1`, { waitUntil: "networkidle", timeout: 20000 });
  const canvas = await page.waitForSelector("#post-canvas", { timeout: 20000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(300);
  return canvas.screenshot();
}

// Render the settled frame of the SAME composition the MP4 uses, via `remotion still`. The fixture's
// render.json is copied into src/posts/generated/ (where generated-index.ts auto-discovers it) just
// for the render, then removed.
function renderStill(id, framePngPath) {
  // shell:true so Windows resolves npx(.cmd); args are repo-controlled fixture ids (no injection risk).
  const r = spawnSync(
    "npx",
    ["remotion", "still", "src/remotion/generated-index.ts", id, `"${framePngPath}"`, `--frame=${LAST_FRAME}`, "--log=error"],
    { cwd: ROOT, encoding: "utf8", timeout: 600000, shell: true },
  );
  return r;
}

async function compare(previewBuf, stillBuf, id, expected) {
  const a = PNG.sync.read(previewBuf);
  let b = PNG.sync.read(stillBuf);
  // Remotion still is the full frame; the Preview screenshot is the #post-canvas (must be the same dims).
  if (a.width !== b.width || a.height !== b.height) {
    return { sizeMismatch: `${a.width}×${a.height} vs ${b.width}×${b.height}` };
  }
  // FORMAT-PARITY GATE: both surfaces must equal the post's declared format. a===b above only proves they
  // agree with EACH OTHER; this proves they agree with the SPEC — the drift the format spine must prevent.
  if (expected && (a.width !== expected.width || a.height !== expected.height)) {
    return { formatMismatch: `both ${a.width}×${a.height}, expected ${expected.width}×${expected.height} for the post's format` };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: PIXELMATCH_THRESHOLD });
  await writeFile(join(OUT, `${id}.diff.png`), PNG.sync.write(diff));
  return { diffPixels, total: a.width * a.height, fraction: diffPixels / (a.width * a.height) };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1180, height: 2080 }, deviceScaleFactor: 1 }); // tall enough for 1080×1920 (9:16); the #post-canvas screenshot is element-bound, so shorter formats are unaffected
    for (const id of FIXTURES) {
      console.log(`Render-truth — ${id} (Preview t=1 vs Remotion settled frame ${LAST_FRAME}):`);
      const previewBuf = await previewShot(page, id);
      await writeFile(join(OUT, `${id}.preview.png`), previewBuf);

      // Stage the fixture into the Remotion-discovered dir, render, clean up.
      const staged = join(GEN_DIR, `${id}.render.json`);
      let wasStaged = false;
      try { await access(staged); } catch { wasStaged = true; }
      const stillPath = join(OUT, `${id}.still.png`);
      let r;
      try {
        if (wasStaged) await copyFile(fixturePath(id), staged);
        r = renderStill(id, stillPath);
      } finally {
        if (wasStaged) await rm(staged, { force: true });
      }
      if (!r || r.status !== 0) {
        check(false, `${id}: Remotion still rendered`, (r?.stderr || r?.error?.message || "render failed").split("\n").slice(-3).join(" | "));
        continue;
      }
      check(true, `${id}: Remotion settled frame rendered (${stillPath.replace(ROOT, ".")})`);

      const stillBuf = await readFile(stillPath);
      const res = await compare(previewBuf, stillBuf, id, await expectedDims(id));
      if (res.sizeMismatch) { check(false, `${id}: frame size parity`, res.sizeMismatch); continue; }
      if (res.formatMismatch) { check(false, `${id}: format parity (Preview == Remotion == spec.format)`, res.formatMismatch); continue; }
      check(
        res.fraction < MAX_DIFF_FRACTION,
        `${id}: Preview ↔ MP4-frame agree — ${(res.fraction * 100).toFixed(3)}% pixels differ < ${(MAX_DIFF_FRACTION * 100).toFixed(0)}% (offline-font parity proven)`,
        `${res.diffPixels}/${res.total} px differ — see out/render-truth/${id}.diff.png`,
      );
      const cov = contentCoverage(PNG.sync.read(stillBuf));
      check(
        cov >= MIN_FILL_FRACTION,
        `${id}: content fills the frame — ${(cov * 100).toFixed(1)}% of height ≥ ${(MIN_FILL_FRACTION * 100).toFixed(0)}% (no viz/footer collapse)`,
        `only ${(cov * 100).toFixed(1)}% of height has content — viz/footer likely collapsed (did the fr-grid regress?)`,
      );
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${failures ? "✖ FAIL" : "✔ PASS"} — ${failures} failing check(s)`);
  process.exit(failures ? 2 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
