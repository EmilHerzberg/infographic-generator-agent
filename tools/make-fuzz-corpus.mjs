#!/usr/bin/env node
// Materializes two RenderPost corpora that together exercise the renderer's no-overflow
// guarantee, and re-runnable on demand:  node tools/make-fuzz-corpus.mjs
//
//   planning/fixtures/renderfuzz/  — the RENDERER GATE: hard-but-fittable specs spanning
//       every viz kind × metric-count × headline-length. The renderer must lay each out with
//       0 QA errors (npm run qa:fuzz). This is the Sprint 1.1 acceptance set.
//
//   planning/fixtures/density/     — DELIBERATELY OVER-STUFFED specs (max viz + 4 metrics with
//       deltas + long headline + a long 2-line takeaway all at once). The renderer fits these
//       GEOMETRICALLY (no clip / margin breach) but only by shrinking type below the mobile
//       floor — which is the correct "too much content" signal. Reducing that density is NOT a
//       renderer job; it's the input AI filter / triage gate (Epic 02). These live here as that
//       sprint's fixtures, out of the renderer gate.
import { writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FUZZ = join(ROOT, "planning", "fixtures", "renderfuzz");
const DENSITY = join(ROOT, "planning", "fixtures", "density");

const H_SHORT = "Reliability compounds";
const H_LONG = "Per-step reliability compounds into end-to-end failure across long automation chains";
const T_SHORT = "Small per-step gaps compound into large end-to-end failure."; // ~59 chars, 1 line
const T_LONG = "Each step looks fine in isolation; multiplied across the chain the end-to-end success rate collapses well below intuition."; // 2 lines
const ACCENTS = ["cyan", "amber", "violet", "mint", "burnt"];

// metrics: deltas add a row of height, so the gate set uses them sparingly. `withDelta`
// off keeps cards short enough to pair with a takeaway; the density set turns them on.
const metricsN = (n, withDelta) =>
  Array.from({ length: n }, (_, i) => ({
    label: ["per-step rate", "chain length", "end-to-end", "failure odds"][i] || `metric ${i + 1}`,
    value: ["99%", "20 steps", "81.8%", "1 in 5"][i] || `${i}`,
    ...(withDelta ? { delta: ["↓ 18%", "↑ 4×", "↓ 21pt", "↑ 5×"][i] || "↓" } : {}),
    accent: ACCENTS[i % ACCENTS.length],
  }));

const viz = {
  chart: (n) => ({
    kind: "chart",
    series: Array.from({ length: n }, (_, i) => ({
      label: ["99%/step", "95%/step", "90%/step", "80%/step"][i],
      values: [1, 0.92, 0.85, 0.77, 0.7].map((v) => Math.max(0.05, v - i * 0.12)),
      color: ACCENTS[i % ACCENTS.length],
      endValueLabel: `${70 - i * 12}%`,
    })),
    xLabels: ["0", "5", "10", "15", "20"],
    yMax: 1,
    caption: "reliability vs. steps",
  }),
  comparison: (items) => ({
    kind: "comparison",
    left: { title: "Single agent", tone: "cyan", items: ["One model, one context", "Easy to debug", "No handoff loss", "Cheaper to run"].slice(0, items) },
    right: { title: "Multi-agent", tone: "burnt", items: ["Context fragments", "Handoffs lose state", "Failures multiply", "Hard to trace"].slice(0, items) },
    caption: "where complexity hides",
  }),
  stat: (big) => ({ kind: "stat", big, sub: "twenty 99%-reliable steps chained", note: "compounding", caption: "the math" }),
  claims: (n, maxLen) => ({
    kind: "claims",
    entries: Array.from({ length: n }, (_, i) => ({
      date: ["2021", "2022", "2023", "2024"][i],
      source: ["A research lab", "A keynote", "An analyst", "A vendor blog"][i],
      claim: maxLen
        ? "Autonomous agents will replace most knowledge work within twenty-four short months"
        : ["Agents replace knowledge work", "Full autonomy by next year", "Multi-agent solves reliability"][i] || "Bold claim",
      reality: maxLen ? "Still brittle on multi-step real tasks" : "Still brittle",
    })),
    caption: "claims vs. reality",
  }),
  pipeline: (n) => ({
    kind: "pipeline",
    nodes: Array.from({ length: n }, (_, i) => ({ step: i + 1, cumulative: `${Math.round(Math.pow(0.99, (i + 1) * 3) * 100)}%` })),
    perStepLabel: "99% per step",
    endLabel: "78%",
    endAccent: "burnt",
    caption: "compounding across steps",
  }),
  stack: (n) => ({
    kind: "stack",
    segments: Array.from({ length: n }, (_, i) => ({
      width: (n === 2 ? [0.6, 0.4] : [0.34, 0.26, 0.18, 0.12, 0.1])[i],
      color: ACCENTS[i % ACCENTS.length],
      label: ["context", "handoff", "retry", "review", "drift"][i],
    })),
    caption: "where the time goes",
  }),
};

// ── Renderer gate: hard but fittable (must pass qa:fuzz with 0 errors) ──────────────
const FIT = [
  ["chart-min", viz.chart(1), 0, false, H_SHORT, "none"],
  ["chart-4series-m2", viz.chart(4), 2, false, H_SHORT, "short"],
  ["chart-longhead-m1", viz.chart(2), 1, false, H_LONG, "none"],
  ["comparison-min", viz.comparison(2), 0, false, H_SHORT, "none"],
  ["comparison-3items-m2", viz.comparison(3), 2, false, H_SHORT, "none"],
  ["stat-min", viz.stat("81.8%"), 0, false, H_SHORT, "none"],
  ["stat-formula-m1", viz.stat("0.99²⁰ = 81.8%"), 1, true, H_SHORT, "none"],
  ["stat-m2", viz.stat("81.8%"), 2, false, H_SHORT, "short"],
  ["claims-min", viz.claims(2, false), 0, false, H_SHORT, "none"],
  ["claims-3entries-long", viz.claims(3, false), 0, false, H_LONG, "long"],
  ["claims-2entries-m2", viz.claims(2, false), 2, false, H_SHORT, "short"],
  ["pipeline-min", viz.pipeline(3), 0, false, H_SHORT, "none"],
  ["pipeline-8nodes-longhead", viz.pipeline(8), 0, false, H_LONG, "none"],
  ["pipeline-5nodes-m2", viz.pipeline(5), 2, false, H_SHORT, "short"],
  ["stack-min", viz.stack(2), 0, false, H_SHORT, "none"],
  ["stack-5seg-m2", viz.stack(5), 2, false, H_SHORT, "none"],
  ["stack-4seg-m2", viz.stack(4), 2, false, H_SHORT, "short"],
];

// ── Density set: deliberately over-stuffed (deferred to Epic 02 input filter) ──────
const DENSE = [
  ["chart-overstuffed", viz.chart(4), 4, true, H_LONG, "long"],
  ["comparison-overstuffed", viz.comparison(4), 4, true, H_LONG, "long"],
  ["stat-overstuffed", viz.stat("0.99²⁰ = 81.8%"), 4, true, H_LONG, "long"],
  ["claims-overstuffed", viz.claims(4, true), 4, true, H_LONG, "long"],
  ["pipeline-overstuffed", viz.pipeline(8), 4, true, H_LONG, "long"],
  ["stack-overstuffed", viz.stack(5), 4, true, H_LONG, "long"],
];

const takeaway = (kind) => (kind === "short" ? T_SHORT : kind === "long" ? T_LONG : undefined);

function build(prefix, rows, i) {
  const [name, visualization, mN, withDelta, headline, tk] = rows;
  const id = `${prefix}-${String(i + 1).padStart(2, "0")}-${name}`;
  const post = {
    id,
    eyebrow: prefix === "fuzz" ? "fuzz / renderer-gate" : "density / over-stuffed",
    headline,
    visualization,
    ...(mN > 0 ? { metrics: metricsN(mN, withDelta) } : {}),
    ...(takeaway(tk) ? { takeaway: takeaway(tk) } : {}),
  };
  return { id, post: JSON.parse(JSON.stringify(post)) };
}

async function clean(dir) {
  await mkdir(dir, { recursive: true });
  for (const f of await readdir(dir).catch(() => [])) {
    if (f.endsWith(".render.json")) await unlink(join(dir, f));
  }
}

async function main() {
  await clean(FUZZ);
  await clean(DENSITY);
  for (let i = 0; i < FIT.length; i++) {
    const { id, post } = build("fuzz", FIT[i], i);
    await writeFile(join(FUZZ, `${id}.render.json`), JSON.stringify(post, null, 2) + "\n");
  }
  for (let i = 0; i < DENSE.length; i++) {
    const { id, post } = build("density", DENSE[i], i);
    await writeFile(join(DENSITY, `${id}.render.json`), JSON.stringify(post, null, 2) + "\n");
  }
  console.log(`✔ wrote ${FIT.length} gate specs → planning/fixtures/renderfuzz/`);
  console.log(`✔ wrote ${DENSE.length} density specs → planning/fixtures/density/  (deferred to Epic 02)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
