// qa:render-flutter — the regression gate for the single-frame "measured-fit" render flutter.
//
// The flutter (a FitLine/FitZone value that compresses on scattered frames then snaps back) is a
// CROSS-WORKER measurement race in the Remotion render. It is INVISIBLE to the preview-based inspector
// (every ?t sample is a fresh settled mount) — it lives only in the rendered frame sequence. Root fix:
// production renders at --concurrency=1 (server/render/render.mjs). This gate proves that fix holds:
//
//   1. STATIC — server/render/render.mjs still pins --concurrency=1 (can't be silently dropped).
//   2. CLEAN  — a FitLine-heavy canary rendered at --concurrency=1 has ZERO flutter frames (the guarantee).
//   3. CANARY — the same fixture at --concurrency=4 STILL flutters (proves the detector + fixture remain
//               meaningful; a WARN, not a hard fail — if Remotion fixes the race upstream this goes quiet).
//
// Verified: fuzz-119-matrix-overflow flutters 28/181 frames multi-worker, 0/181 at --concurrency=1.
import { spawnSync } from "node:child_process";
import { readFileSync, copyFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { detectFlutter, loadFramesDir } from "./lib/flutter.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CANARY = "fuzz-119-matrix-overflow"; // matrix cells use FitLine; overlong values keep zoom active
const FRAMES = "120-300";                  // steady window where the fit is engaged
const OUT = join(ROOT, "out", "render-flutter-tmp"); // no leading dot: remotion reads a dotted dir as an extension
const specSrc = join(ROOT, "planning", "fixtures", "renderfuzz", `${CANARY}.render.json`);
const specDst = join(ROOT, "src", "posts", "generated", `${CANARY}.render.json`);

let failures = 0;
const check = (ok, name, detail = "") => { if (!ok) failures++; console.log(`  ${ok ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`); };

// 1. STATIC: the production render must pin --concurrency=1. The server/ tree ships only in the
// full product (the open-source distribution has no server) — skip the assertion there instead of
// crashing; the CLEAN/CANARY checks below are the substance either way.
const renderMjs = join(ROOT, "server", "render", "render.mjs");
if (existsSync(renderMjs)) {
  const renderSrc = readFileSync(renderMjs, "utf8");
  const pinned = /"remotion",\s*"render"[\s\S]*?"--concurrency=1"/.test(renderSrc);
  check(pinned, "render.mjs pins --concurrency=1", pinned ? "" : "the production render must render single-worker or the flutter returns");
} else {
  console.log("  · no server/ tree (open-source layout) — skipping the production-pin assertion");
}

function renderSeq(id, outDir, concurrency) {
  mkdirSync(outDir, { recursive: true });
  copyFileSync(specSrc, specDst); // generated-index auto-discovers it
  try {
    const args = ["remotion", "render", "src/remotion/generated-index.ts", id, `"${outDir}"`,
      "--sequence", "--image-format=png", `--frames=${FRAMES}`, `--concurrency=${concurrency}`, "--log=error"];
    const r = spawnSync("npx", args, { cwd: ROOT, encoding: "utf8", timeout: 600000, shell: true });
    if (r.status !== 0) throw new Error(`render exited ${r.status}: ${(r.stderr || "").slice(-300)}`);
  } finally {
    rmSync(specDst, { force: true });
  }
  return detectFlutter(loadFramesDir(outDir), { theta: 200, rho: 0.3, fps: 30 }).count;
}

rmSync(OUT, { recursive: true, force: true });
console.log(`render-flutter gate — canary ${CANARY} frames ${FRAMES}`);

// 2. CLEAN: production settings (--concurrency=1) must produce zero flutter
const clean = renderSeq(CANARY, join(OUT, "c1"), 1);
check(clean === 0, "single-worker render is flutter-free", clean === 0 ? "" : `${clean} flutter frames at --concurrency=1 (the fix regressed or a primitive re-introduced a measured fit)`);

// 3. CANARY (WARN): the fixture must still flutter multi-worker, else the detector/fixture went stale
const multi = renderSeq(CANARY, join(OUT, "c4"), 4);
if (multi > 0) console.log(`  ✔ canary still reproduces the race — ${multi} flutter frames at --concurrency=4 (detector + fixture valid)`);
else console.log(`  ⚠ canary produced 0 flutter frames multi-worker — detector or fixture may be stale, or Remotion fixed the race upstream; review before trusting this gate`);

rmSync(OUT, { recursive: true, force: true });
console.log(failures ? `\nFAIL — ${failures} check(s) failed` : `\nPASS — the measured-fit render flutter is gated`);
process.exit(failures ? 1 : 0);
