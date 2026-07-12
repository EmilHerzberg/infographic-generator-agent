#!/usr/bin/env node
// One-off: RE-RENDER every bench cell's MP4 from its EXISTING spec (no model calls, no Path B re-run)
// so a shared-chrome fix (e.g. FitZone flutter, PL-6c) reaches all videos. Bundles the Remotion root
// ONCE (require.context globs src/posts/generated at bundle time) then renders each composition by id.
//   node tools/rerender-bench.mjs
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";
import { enableTailwind } from "@remotion/tailwind";
import { readFileSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GEN = join(ROOT, "src", "posts", "generated");
const SPECS = join(ROOT, "out", "bench", "specs");
const OUT = join(ROOT, "out", "bench");

// CONCURRENCY=1 → deterministic single-worker render (kills Remotion cross-worker sub-pixel
// measurement jitter on cells whose zoom is measurement-dependent — a width/over-budget shrink).
// ONLY="id1,id2" → re-render just those cells (default: all cells with an mp4).
const CONCURRENCY = process.env.CONCURRENCY ? Number(process.env.CONCURRENCY) : undefined;
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",").map((s) => s.trim())) : null;

const manifest = JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8"));
const cells = manifest.cells.filter((c) => c.mp4 && (!ONLY || ONLY.has(c.id)));
console.log(`re-rendering ${cells.length} bench cells (bundle once, render each)${CONCURRENCY ? `, concurrency=${CONCURRENCY}` : ""}…`);

// 1) stage every spec into GEN_DIR so the bundle's require.context picks them up
const staged = [];
for (const c of cells) {
  let found = false;
  for (const ext of [".tsx", ".render.json"]) {
    const src = join(SPECS, c.id + ext);
    if (existsSync(src)) {
      const dst = join(GEN, c.id + ext);
      copyFileSync(src, dst);
      staged.push(dst);
      found = true;
      break;
    }
  }
  if (!found) console.error(`  ⚠ no spec found for ${c.id} — skipping`);
}

const webpackOverride = (current) => {
  const withTw = enableTailwind(current);
  return {
    ...withTw,
    resolve: {
      ...withTw.resolve,
      alias: { ...(withTw.resolve?.alias ?? {}), "@": join(ROOT, "src") },
    },
  };
};

let ok = 0;
const failures = [];
try {
  const t0 = Date.now();
  const serveUrl = await bundle({
    entryPoint: join(ROOT, "src", "remotion", "generated-index.ts"),
    webpackOverride,
  });
  console.log(`bundled in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  for (const c of cells) {
    const r0 = Date.now();
    try {
      const composition = await selectComposition({ serveUrl, id: c.id });
      await renderMedia({
        composition,
        serveUrl,
        codec: "h264",
        imageFormat: "jpeg",
        overwrite: true,
        outputLocation: join(OUT, c.id + ".mp4"),
        ...(CONCURRENCY ? { concurrency: CONCURRENCY } : {}),
      });
      ok++;
      console.log(`  ✔ ${c.id}  (${((Date.now() - r0) / 1000).toFixed(0)}s)`);
    } catch (e) {
      failures.push(c.id);
      console.error(`  ✖ ${c.id} — ${String(e.message || e).split("\n")[0].slice(0, 160)}`);
    }
  }
} finally {
  // 2) unstage — leave GEN_DIR as we found it
  for (const f of staged) rmSync(f, { force: true });
}

console.log(`\n${failures.length ? "✖" : "✔"} ${ok}/${cells.length} re-rendered${failures.length ? " — failed: " + failures.join(", ") : ""}`);
process.exit(failures.length ? 1 : 0);
