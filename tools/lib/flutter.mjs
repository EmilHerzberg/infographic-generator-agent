// Render-truth flutter detector. The single-frame "measured-fit" flutter (a value that compresses on
// scattered frames, then snaps back — the cross-worker FitLine/FitZone measurement race, root-fixed by
// rendering at --concurrency=1) is INVISIBLE to the preview-based inspector: every ?t sample is a fresh,
// settled, isolated mount, so measure() always sees the settled layout. It only exists in the actual
// RENDERED frame sequence. This detector runs on rendered frames and catches it structurally.
//
// Mechanism: a flutter frame is an ISOLATED OUTLIER — it differs from BOTH neighbours while the two
// neighbours are (near-)identical to each other. That signature distinguishes a 1-frame glitch that
// reverts from legitimate animation (where consecutive frames all differ, so neighbours never match).
// Verified against a real fluttering render: flags exactly the 10 compressed frames, 0 false positives
// across 420 frames (the funnel A/B was: dPrev/dNext≈530 changed px, dSkip≈0 — neighbours pixel-identical).
import fs from "fs";
import { PNG } from "pngjs";

// changed-pixel count between two decoded PNGs (per-channel abs-sum > NOISE, tolerant of H.264 residual)
function changedPx(a, b, noise = 24) {
  const da = a.data, db = b.data;
  let c = 0;
  for (let i = 0; i < da.length; i += 4) {
    if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > noise) c++;
  }
  return c;
}

/**
 * Detect single-frame flutter in an ordered list of frame PNGs (Buffers or decoded PNGs).
 * @param {Array<Buffer|import("pngjs").PNG>} frames  ordered frame images (decode Buffers lazily)
 * @param {{theta?:number, rho?:number, fps?:number, minRun?:number}} opts
 *   theta  — min changed px vs a neighbour to count the frame as "changed" (default 40, tuned for 270²)
 *   rho    — neighbours must be ≤ rho·min(dPrev,dNext) similar to each other to call it isolated (default 0.4)
 * @returns {{flags: Array<{index:number, frame:number, t:number|null, dPrev:number, dNext:number, dSkip:number}>, count:number}}
 */
export function detectFlutter(frames, opts = {}) {
  const { theta = 40, rho = 0.4, fps = null } = opts;
  const imgs = frames.map((f) => (f && f.data ? f : PNG.sync.read(f)));
  const n = imgs.length;
  const flags = [];
  if (n < 3) return { flags, count: 0 };
  // consecutive diffs dc[i] = changed(i, i+1)
  const dc = new Array(n - 1);
  for (let i = 1; i < n; i++) dc[i - 1] = changedPx(imgs[i - 1], imgs[i]);
  for (let i = 1; i < n - 1; i++) {
    const dPrev = dc[i - 1], dNext = dc[i];
    if (dPrev < theta || dNext < theta) continue;
    const dSkip = changedPx(imgs[i - 1], imgs[i + 1]);
    if (dSkip <= rho * Math.min(dPrev, dNext)) {
      flags.push({ index: i, frame: i + 1, t: fps ? +(i / fps).toFixed(3) : null, dPrev, dNext, dSkip });
    }
  }
  return { flags, count: flags.length };
}

/** Load an ordered directory of frame PNGs (….png sorted lexically). */
export function loadFramesDir(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".png")).sort();
  return files.map((f) => PNG.sync.read(fs.readFileSync(`${dir}/${f}`)));
}
