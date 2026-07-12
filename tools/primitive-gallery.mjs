#!/usr/bin/env node
// Primitive REVIEW gallery — a self-contained out/primitives/index.html showing each animated
// primitive's rendered MP4 front-and-centre, grouped by family, with its knobs/modes labelled. Built
// for Emil's subjective video-quality review of the library as it grows (distinct from the A/B
// testbench gallery in tools/bench-gallery.mjs, which is models × Path A|B per brief).
//
//   1) render the showcase MP4s into out/  (npm run remotion:render:gen -- <id> out/<id>.mp4)
//   2) node tools/primitive-gallery.mjs    # emit out/primitives/index.html (skips missing MP4s)
//
// The manifest below is the curated showcase set — extend it as primitives/variants land. Each entry's
// `file` is relative to out/ ; the page references ../<file> so the existing out/*.mp4 are reused
// in place (no copying). Missing files render a labelled placeholder, never a broken <video>.
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "out");
const GALLERY_DIR = join(OUT, "primitives");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ── The curated showcase. Group = a primitive family; items = one tile each. ────────────────────
const SECTIONS = [
  {
    title: "Narrative reveal modes",
    sprint: "PL-4.1",
    blurb: "The two text primitives gained an optional cinematic reveal the authoring model picks per post (revealMode). The default and narrative modes share an identical final frame — only the journey differs.",
    items: [
      { file: "pl14b-claims.mp4", title: "Claims — stagger", tag: "default · ~12s", desc: "All claims listed, staggered in, each strikes its own reality." },
      { file: "pl41-claims-spotlight.mp4", title: "Claims — spotlight", tag: "narrative · content-timed", desc: "Listed from the start; revealed + struck one-by-one DOWN the list with reading time per claim." },
      { file: "pl15b-comparison.mp4", title: "Comparison — paired", tag: "default · ~12s", desc: "Both columns, per-row point/counterpoint stagger." },
      { file: "pl41-comparison-sequential.mp4", title: "Comparison — sequential", tag: "narrative · side-by-side", desc: "Both boxes side-by-side from the start; left items reveal, then right items." },
      { file: "pl41-comparison-centered.mp4", title: "Comparison — sequentialCentered", tag: "narrative · moving boxes", desc: "One box centered standalone → slides off → the other centers → both slide into the two-up." },
    ],
  },
  {
    title: "Chart family",
    sprint: "PL-2.1 – PL-2.4 (opens Epic PL-2)",
    blurb: "Five graph types now, up from one. Each is a modern trio (pure d3-scale planner + component + deterministic gate), grows/draws on from a single t, ships Path B + OpenAI/DeepSeek (deferred from Anthropic until PL-0.5).",
    items: [
      { file: "showcase-bar-hours.mp4", title: "Bar — hours reclaimed", tag: "magnitude · simple vertical, sorted", desc: "Compare N magnitudes; bars grow from a 0 baseline, top result highlighted." },
      { file: "showcase-bar-failures.mp4", title: "Bar — what breaks agents", tag: "knob: horizontal orientation", desc: "Long category phrases read on the y-axis; ranked by incident share." },
      { file: "showcase-bar-beforeafter.mp4", title: "Bar — manual vs automated", tag: "knob: grouped (2 series)", desc: "Two series side-by-side per task — the before/after gap." },
      { file: "showcase-scatter-autonomy.mp4", title: "Scatter — autonomy vs consistency", tag: "relationship · OLS trend (inverse)", desc: "Points pop in; the auto-fit trend line draws on with a negative slope." },
      { file: "showcase-donut-runtime.mp4", title: "Donut — where run time goes", tag: "composition · sweep-on", desc: "Composition of one whole; ring sweeps from 12 o'clock, center total." },
      { file: "showcase-area-shift.mp4", title: "Area — shift to autonomous", tag: "knob: stacked, over time", desc: "Layers stack to a 100% total over quarters; fills on left→right." },
      { file: "showcase-histogram-latency.mp4", title: "Histogram — latency distribution", tag: "distribution · grow + p95 marker", desc: "Contiguous bins grow from baseline; the p95 marker line draws on to flag the tail." },
      { file: "showcase-line-reliability.mp4", title: "Line — uptime with annotations", tag: "trend · markers + annotations", desc: "The line draws on left→right; markers + 'added retries'/'fixed handoffs' callouts label the inflection." },
    ],
  },
];

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

function tile(item, present) {
  const video = present
    ? `<video class="vid" src="../${esc(item.file)}" controls preload="metadata" loop muted playsinline></video>`
    : `<div class="novid">not rendered<br><span>${esc(item.file)}</span></div>`;
  return `<div class="cell">
    <div class="vidwrap">${video}</div>
    <div class="meta">
      <div class="title">${esc(item.title)}</div>
      <div class="tag">${esc(item.tag)}</div>
      <div class="desc">${esc(item.desc)}</div>
    </div>
  </div>`;
}

async function build() {
  await mkdir(GALLERY_DIR, { recursive: true });
  let total = 0, present = 0;
  const sectionsHtml = [];
  for (const s of SECTIONS) {
    const cells = [];
    for (const it of s.items) {
      total++;
      const ok = await exists(join(OUT, it.file));
      if (ok) present++;
      cells.push(tile(it, ok));
    }
    sectionsHtml.push(`<section>
      <h2>${esc(s.title)} <span class="sprint">${esc(s.sprint)}</span></h2>
      <p class="blurb">${esc(s.blurb)}</p>
      <div class="grid">${cells.join("")}</div>
    </section>`);
  }

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Primitive library — review gallery</title>
<style>
  :root{--bg:#0E1116;--panel:#161A21;--panel2:#1B212B;--line:#262D38;--text:#E6EAF0;--muted:#8A94A6;
    --cyan:#36D6E7;--violet:#A78BFA;--mono:ui-monospace,"JetBrains Mono",Menlo,monospace;
    --font:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font);-webkit-font-smoothing:antialiased}
  header{padding:28px;border-bottom:1px solid var(--line);position:sticky;top:0;background:linear-gradient(180deg,var(--bg),rgba(14,17,22,.92));backdrop-filter:blur(6px);z-index:10}
  h1{margin:0;font-size:20px} h1 .c{color:var(--cyan)}
  .sub{color:var(--muted);font-size:13px;margin-top:6px}
  main{padding:8px 28px 80px;max-width:1500px;margin:0 auto}
  section{margin:34px 0}
  section h2{font-size:15px;font-family:var(--mono);color:var(--cyan);margin:0 0 4px;display:flex;gap:10px;align-items:baseline}
  .sprint{font-size:11px;color:var(--muted);font-weight:400}
  .blurb{color:var(--muted);font-size:13px;line-height:1.5;margin:0 0 18px;max-width:920px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px}
  .cell{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:10px}
  .vidwrap{width:100%} .vid{width:100%;aspect-ratio:1080/1350;background:#000;border-radius:8px;display:block}
  .novid{width:100%;aspect-ratio:1080/1350;background:var(--panel2);border:1px dashed var(--line);border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:var(--muted);font-size:13px;gap:6px;padding:10px}
  .novid span{font-family:var(--mono);font-size:10.5px}
  .meta{display:flex;flex-direction:column;gap:4px}
  .title{font-size:14px;font-weight:700}
  .tag{font-family:var(--mono);font-size:11px;color:var(--violet)}
  .desc{font-size:12px;color:var(--muted);line-height:1.45}
  footer{color:var(--muted);font-size:12px;padding:0 28px 40px;text-align:center;font-family:var(--mono)}
</style></head>
<body>
<header>
  <h1>Primitive library — <span class="c">review gallery</span></h1>
  <div class="sub">Each animated primitive, front-and-centre. Judge the video quality yourself. <b>${present}/${total}</b> rendered.</div>
</header>
<main>
${sectionsHtml.join("\n")}
</main>
<footer>Emil Herzberg · AI Systems · Automation · Design — primitive review gallery</footer>
</body></html>`;

  const out = join(GALLERY_DIR, "index.html");
  await writeFile(out, html);
  return { out, total, present };
}

const { out, total, present } = await build();
console.error(`✔ primitive gallery: ${out.replace(ROOT, ".")}  (${present}/${total} MP4s present)`);
