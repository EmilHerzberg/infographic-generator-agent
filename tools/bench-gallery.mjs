#!/usr/bin/env node
// Comparison gallery for the A/B testbench. Reads out/bench/manifest.json and emits a single
// self-contained out/bench/index.html: per brief, rows = models, columns = Path A | Path B, each
// cell = the rendered MP4 front-and-center + a quiet metric strip. Built for Emil's subjective
// side-by-side video judgement (the primary signal); metrics are supporting depth.
//
//   node tools/bench-gallery.mjs            # rebuild the gallery from the existing manifest
//   (benchmark.mjs also calls buildGallery() automatically at the end of a run)
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const secs = (ms) => (ms ? (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + "s" : "—");
const ktok = (t) => (t ? (t >= 1000 ? (t / 1000).toFixed(t >= 10000 ? 0 : 1) + "k" : String(t)) : "—");

const STATUS_LABEL = {
  ok: "QA pass",
  qa_failed: "QA fail",
  provider_error: "provider error",
  error: "error",
};

function modelLabel(m) {
  return m.model ? `${m.provider} · ${m.model}` : m.provider;
}

// Overview dashboard panel — per-path QA + token totals computed from the manifest, plus the
// historical bake-off trajectory + library status as context. The cost ratio (B/A) is the headline.
function overviewHtml(manifest) {
  const A = manifest.cells.filter((c) => c.path === "A");
  const B = manifest.cells.filter((c) => c.path === "B");
  if (!A.length && !B.length) return "";
  const okc = (x) => x.filter((c) => c.status === "ok").length;
  const tok = (x) => x.reduce((s, c) => s + (c.tokens || 0), 0);
  const Atok = tok(A), Btok = tok(B);
  const ratio = Atok ? Math.round(Btok / Atok) : "—";
  const tk = (t) => (t >= 1e6 ? (t / 1e6).toFixed(1) + "M" : ktok(t));
  return `<div class="overview">
    <div class="ostat"><div class="ostat-k">Path A · JSON renderer</div><div class="ostat-v">${okc(A)}<span>/${A.length} QA</span></div><div class="ostat-s">${tk(Atok)} tok total · production default</div></div>
    <div class="ostat hot"><div class="ostat-k">Path B · TSX agent</div><div class="ostat-v">${okc(B)}<span>/${B.length} QA</span></div><div class="ostat-s">${tk(Btok)} tok · <b>${ratio}× Path A</b> · the ship target</div></div>
    <div class="ostat"><div class="ostat-k">QA trajectory</div><div class="ostat-v">${okc(A) + okc(B)}<span>/${A.length + B.length} now</span></div><div class="ostat-s">measured bake-offs: 20 → 23 → 24/26</div></div>
    <div class="ostat"><div class="ostat-k">Primitive library</div><div class="ostat-v">complete</div><div class="ostat-s">~20 primitives · overflow-hardened · byte-gated</div></div>
  </div>`;
}

function cellHtml(cell) {
  if (!cell) return `<div class="cell empty">— not run —</div>`;
  const statusClass = cell.status === "ok" ? "ok" : cell.status === "qa_failed" ? "warn" : "bad";
  // A rendered video that did NOT pass QA is shown for inspection but would NOT ship — mark it loudly.
  const rejected = cell.mp4 && cell.status !== "ok";
  const video = cell.mp4
    ? `<div class="vidwrap${rejected ? " rejected" : ""}">
         <video class="vid" src="${esc(cell.mp4)}" controls preload="metadata" loop playsinline></video>
         ${rejected ? `<div class="rejectbar">✕ REJECTED · would not ship${cell.reason ? ` · ${esc(cell.reason)}` : ""}</div>` : ""}
       </div>`
    : `<div class="novid">no video<br><span>${esc(cell.error || cell.reason || cell.status || "—")}</span></div>`;
  const before = cell.beforeMp4
    ? `<a class="beforelink" href="${esc(cell.beforeMp4)}" target="_blank">▸ before fix (overlapping)</a>`
    : "";
  const chips = [
    `<span class="chip ${statusClass}">${esc(STATUS_LABEL[cell.status] || cell.status || "—")}</span>`,
    `<span class="chip">gen ${secs(cell.genMs)}</span>`,
    `<span class="chip">render ${secs(cell.renderMs)}</span>`,
    `<span class="chip">${ktok(cell.tokens)} tok</span>`,
    `<span class="chip">${cell.iterations ?? 0} it</span>`,
  ].join("");
  return `<div class="cell">
    ${video}
    <div class="chips">${chips}</div>
    ${before}
  </div>`;
}

export async function buildGallery(manifest, outDir) {
  const byId = new Map(manifest.cells.map((c) => [c.id, c]));
  const find = (briefSlug, m, path) => {
    // match a cell by brief + provider(+model) + path
    return manifest.cells.find(
      (c) => c.brief === briefSlug && c.path === path && c.provider === m.provider && (m.model ? c.model === m.model : true)
    );
  };

  const models = manifest.models;
  const paths = [...new Set(manifest.cells.map((c) => c.path))].sort(); // usually ["A","B"]

  const totalCells = manifest.cells.length;
  const okCount = manifest.cells.filter((c) => c.status === "ok").length;
  const videoCount = manifest.cells.filter((c) => c.mp4).length;

  const sections = manifest.briefs
    .map((b) => {
      const headRow = `<div class="row head">
        <div class="rowlabel"></div>
        ${paths.map((p) => `<div class="colhead">Path ${p}<span>${p === "A" ? "JSON renderer" : "TSX agent"}</span></div>`).join("")}
      </div>`;
      const modelRows = models
        .map((m) => {
          const cells = paths.map((p) => cellHtml(find(b.slug, m, p))).join("");
          return `<div class="row">
            <div class="rowlabel">${esc(modelLabel(m))}</div>
            ${cells}
          </div>`;
        })
        .join("");
      return `<section class="brief">
        <h2>${esc(b.slug)}</h2>
        <p class="brieftext">${esc(b.text)}</p>
        <div class="grid" style="--cols:${paths.length}">
          ${headRow}
          ${modelRows}
        </div>
      </section>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Path A vs Path B — A/B testbench</title>
<style>
  :root{
    --bg:#0E1116; --panel:#161A21; --panel2:#1B212B; --line:#262D38;
    --text:#E6EAF0; --muted:#8A94A6; --cyan:#36D6E7; --mint:#5BE8B5; --amber:#F2B752; --burnt:#F2865E; --violet:#A78BFA;
    --ok:#5BE8B5; --warn:#F2B752; --bad:#F2865E;
    --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --mono: ui-monospace, "JetBrains Mono", "SF Mono", Menlo, monospace;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font);-webkit-font-smoothing:antialiased}
  header{padding:28px 28px 18px;border-bottom:1px solid var(--line);position:sticky;top:0;background:linear-gradient(180deg,var(--bg),rgba(14,17,22,.92));backdrop-filter:blur(6px);z-index:10}
  h1{margin:0;font-size:20px;letter-spacing:.2px}
  h1 .a{color:var(--cyan)} h1 .b{color:var(--violet)}
  .sub{color:var(--muted);font-size:13px;margin-top:6px}
  .sub b{color:var(--text)}
  .legend{margin-top:10px;font-size:12px;color:var(--muted);display:flex;gap:18px;flex-wrap:wrap}
  .legend code{font-family:var(--mono);color:var(--text)}
  .overview{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:18px;max-width:1500px}
  .ostat{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
  .ostat.hot{border-color:var(--violet);background:linear-gradient(180deg,var(--panel),rgba(167,139,250,.07))}
  .ostat-k{font-family:var(--mono);font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
  .ostat-v{font-size:26px;font-weight:800;margin-top:5px;color:var(--text);line-height:1}
  .ostat-v span{font-size:13px;font-weight:500;color:var(--muted)}
  .ostat.hot .ostat-v{color:var(--violet)}
  .ostat-s{font-size:11.5px;color:var(--muted);margin-top:7px;font-family:var(--mono)}
  .ostat-s b{color:var(--burnt)}
  @media(max-width:900px){.overview{grid-template-columns:repeat(2,1fr)}}
  main{padding:8px 28px 80px;max-width:1500px;margin:0 auto}
  section.brief{margin:34px 0;padding-top:8px}
  section.brief h2{font-size:15px;font-family:var(--mono);color:var(--cyan);margin:0 0 4px;text-transform:lowercase}
  .brieftext{color:var(--muted);font-size:13px;line-height:1.5;margin:0 0 16px;max-width:900px}
  .grid{display:flex;flex-direction:column;gap:14px}
  .row{display:grid;grid-template-columns:160px repeat(var(--cols),1fr);gap:14px;align-items:start}
  .row.head{align-items:end;border-bottom:1px solid var(--line);padding-bottom:8px}
  .rowlabel{font-size:13px;color:var(--text);font-weight:600;padding-top:8px;word-break:break-word}
  .colhead{font-size:14px;font-weight:700;color:var(--text)}
  .colhead span{display:block;font-size:11px;font-weight:500;color:var(--muted);font-family:var(--mono)}
  .cell{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px;align-items:center}
  .cell.empty{color:var(--muted);font-size:12px;justify-content:center;min-height:120px;font-family:var(--mono)}
  .vidwrap{position:relative;width:100%;max-width:240px}
  .vid{width:100%;aspect-ratio:9/16;background:#000;border-radius:8px;display:block}
  .vidwrap.rejected .vid{outline:2px solid var(--bad);outline-offset:0;border-radius:8px}
  .rejectbar{position:absolute;top:8px;left:8px;right:8px;background:rgba(242,134,94,.92);color:#2a0f06;font-family:var(--mono);font-size:9.5px;font-weight:700;padding:3px 6px;border-radius:5px;line-height:1.25;text-align:center}
  .novid{width:100%;max-width:240px;aspect-ratio:9/16;background:var(--panel2);border:1px dashed var(--line);border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:var(--bad);font-size:13px;font-weight:600;gap:6px;padding:10px}
  .novid span{color:var(--muted);font-size:11px;font-weight:400;font-family:var(--mono);word-break:break-word}
  .chips{display:flex;flex-wrap:wrap;gap:5px;justify-content:center}
  .chip{font-family:var(--mono);font-size:10.5px;color:var(--muted);background:var(--panel2);border:1px solid var(--line);border-radius:999px;padding:2px 8px;white-space:nowrap}
  .chip.ok{color:#06231a;background:var(--ok);border-color:var(--ok);font-weight:700}
  .chip.warn{color:#2a1e02;background:var(--warn);border-color:var(--warn);font-weight:700}
  .chip.bad{color:#2a0f06;background:var(--bad);border-color:var(--bad);font-weight:700}
  .beforelink{font-family:var(--mono);font-size:10.5px;color:var(--burnt);text-decoration:none;border-bottom:1px dotted var(--burnt)}
  .beforelink:hover{color:var(--amber);border-color:var(--amber)}
  footer{color:var(--muted);font-size:12px;padding:0 28px 40px;text-align:center;font-family:var(--mono)}
</style></head>
<body>
<header>
  <h1>Path <span class="a">A</span> vs Path <span class="b">B</span> — A/B testbench</h1>
  <div class="sub">Same brief, same model, both engines. Judge the <b>video quality</b> yourself — the chips (QA, time, tokens) are supporting depth. <b>${okCount}/${totalCells}</b> passed QA · <b>${videoCount}/${totalCells}</b> rendered a video · ${esc(manifest.generatedAt)}</div>
  <div class="legend">
    <span><code>Path A</code> — model emits validated JSON → fixed renderer (no AI code runs; production default)</span>
    <span><code>Path B</code> — model writes React/Remotion TSX, self-corrects through QA (more freedom · executes AI code · gVisor in prod)</span>
  </div>
  ${overviewHtml(manifest)}
</header>
<main>
${sections}
</main>
<footer>Emil Herzberg · AI Systems · Automation · Design — A/B production decision testbench</footer>
</body></html>`;

  const out = join(outDir, "index.html");
  await writeFile(out, html);
  return out;
}

// standalone: rebuild from the existing manifest
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("bench-gallery.mjs")) {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const OUT_DIR = join(ROOT, "out", "bench");
  try {
    const manifest = JSON.parse(await readFile(join(OUT_DIR, "manifest.json"), "utf8"));
    const out = await buildGallery(manifest, OUT_DIR);
    console.error(`✔ gallery rebuilt: ${out}`);
  } catch (e) {
    console.error(`✖ ${e.message} (run the benchmark first: node tools/benchmark.mjs)`);
    process.exit(1);
  }
}
