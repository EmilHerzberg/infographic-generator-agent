// Unified QA runner. Aggregates the structural inspector + (optionally) the
// data-fidelity judge, vision backstop, and motion checks into one severity-tagged
// findings list. pass = no error-level findings. See docs/QA_PLAN.md.
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { inspectLayout } from "./inspect.mjs";
import { ROOT } from "./agent-tools.mjs";
import { judgeDataFidelity } from "./judge.mjs";
import { visionReview } from "./vision.mjs";

// severity ordering for display/sort
export const SEV_ORDER = { error: 0, warn: 1, info: 2 };

// Fraction of pixels that DIFFER between two same-size PNGs (RGB sum-abs-diff over a small AA-noise floor).
// Used by the anti-frozen check to tell an animating main visual (bars grow, connectors draw → many pixels
// change frame-to-frame) from a static one (the model forgot the progress prop → the region is identical).
export function vizChangeRatio(pathA, pathB) {
  let a, b;
  try { a = PNG.sync.read(readFileSync(pathA)); b = PNG.sync.read(readFileSync(pathB)); }
  catch { return null; } // a shot missing (no [data-viz], render slip) → caller treats as inconclusive
  if (a.width !== b.width || a.height !== b.height) return { ratio: 1, sameDim: false }; // resized ⇒ not frozen
  const da = a.data, db = b.data;
  const total = a.width * a.height;
  let changed = 0;
  for (let i = 0; i < da.length; i += 4)
    if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 24) changed++;
  return { ratio: +(changed / total).toFixed(4), sameDim: true, total };
}

function structuralFindings(r) {
  const f = [];
  const add = (check, severity, message, data) => f.push({ check, severity, message, data });

  for (const c of r.collisions || []) add("collision", "error", `"${c.a}" overlaps "${c.b}" by ${c.overlapPx}px`, c);
  for (const c of r.clipped || []) add("clipped", "error", `${c.el} is clipped on ${c.axis} (overflow ${c.overflowPx}px) — content is cut off`, c);
  for (const o of r.textOccluded || []) add("textOccluded", "error", `${o.el} is drawn over by a ${o.byRole} (${o.hits} samples cross the lettering) — the graphic occludes the text, making it unreadable; move the label or the line apart`, o);
  for (const o of r.textOverflowsBox || []) add("textOverflowsBox", "error", `"${o.el}" is wider than its box (spills ${o.overflowPx}px past both sides of a ${o.boxWidthPx}px container) — the label paints outside the box border; widen the box, shorten the label, or shrink the text`, o);
  if (r.crowded) add("crowded", "error", `over-crowded: text covers ${Math.round(r.textCoverage * 100)}% of the canvas (max ~${Math.round((r.crowdedCap ?? 0.42) * 100)}% on this aspect) — remove secondary elements`, { textCoverage: r.textCoverage, crowdedCap: r.crowdedCap });
  for (const m of r.belowMobileFloor || []) add("mobileFloor", "error", `${m.el} is ${m.sourcePx}px (~${m.downscaledPx}px on phone) — below the ${m.floorPx}px floor`, m);
  for (const m of r.outOfSafeMargin || []) add("safeMargin", "error", `${m.el} breaches the ${m.side} safe margin by ${m.byPx}px`, m);
  if (!r.signaturePresent) add("signature", "error", "creator signature is missing", {});

  for (const c of r.lowContrast || []) add("contrast", "warn", `${c.el} contrast ${c.ratio} (min ${c.min})`, c);

  // Q1 — deterministic design checks (thresholds calibrated on real outputs)
  if (r.hierarchyRatio && r.hierarchyRatio < 1.8)
    add("hierarchy", "warn", `weak visual hierarchy — largest text only ${r.hierarchyRatio}× the body; enlarge the hero or shrink secondary text`, { hierarchyRatio: r.hierarchyRatio });
  for (const t of r.typo || []) add("typography", "warn", `${t.el}: ${t.issue}`, t);
  for (const b of r.bottomReserve || []) add("bottomReserve", "warn", `${b.el} sits ${b.byPx}px into the bottom 80px platform-reserve zone`, b);
  if (r.marksUnlabeled) {
    const K = { bar: "bars", donut: "segments", funnel: "stages" }[r.marksUnlabeled.kind] || "marks";
    add("marksUnlabeled", "warn", `${r.marksUnlabeled.unlabeled} of ${r.marksUnlabeled.count} ${K} have NO label — every ${K.replace(/s$/, "")} needs its category and/or value, or the chart is unreadable. Label all ${K} (or use the matching primitive, which labels them for you).`, r.marksUnlabeled);
  }
  // A taxonomy chip whose label the planner HID (fit-or-hide floor) renders as an empty box — that
  // falsifies the map ("3 players each" with one nameless). The generic marksUnlabeled check needs
  // ≥40% unlabeled so a single empty chip slips through; here even ONE is a defect the model can fix
  // (shorten the name — "Arize Phoenix" → "Arize" — or drop the item).
  if (r.taxonomy && !r.taxonomy.empty) {
    const bare = (r.taxonomy.nodes || []).filter((n) => n.rank >= 1 && !n.label);
    if (bare.length)
      add("taxChipUnlabeled", "error", `${bare.length} taxonomy chip(s) render as an EMPTY box — the label did not fit at the legible floor and was hidden. Shorten the affected label(s) to one short word or drop the item; every drawn chip must carry its name.`, { count: bare.length, ranks: bare.map((n) => n.rank) });
  }
  if (typeof r.accentHues === "number" && r.accentHues < 2)
    add("monochrome", "warn", `only ${r.accentHues} accent hue in use — add a second semantic accent (anti-monochrome)`, { accentHues: r.accentHues });
  for (const d of r.duplicates || []) add("duplicate", "info", `"${d.text}" rendered ${d.count}× — avoid redundant encoding`, d);
  if (Math.abs(r.balanceX || 0) > 0.18 || Math.abs(r.balanceY || 0) > 0.18)
    add("balance", "info", `content off-center (x ${r.balanceX}, y ${r.balanceY})`, { balanceX: r.balanceX, balanceY: r.balanceY });
  if ((r.crampedPairs || 0) > 6) add("cramped", "info", `${r.crampedPairs} tightly-spaced element pairs — consider more whitespace`, { crampedPairs: r.crampedPairs });

  return f;
}

// Multi-frame LAYOUT STABILITY (anti-shake). A settled, static-content text box (an axis tick, a
// category label, the takeaway, the signature) must not MOVE between two frames of the animation.
// Match anchors by their text across the two frames — a count-up value (content differs per frame)
// never matches, and a string rendered twice in one frame is dropped as ambiguous. Two exclusions keep
// this from firing on LEGITIMATE entrances rather than real reflow:
//   (1) require near-full opacity in both frames (a still-fading element is not settled yet), AND
//   (2) exclude any element carrying a non-identity CSS transform in EITHER frame — a slide/scale/spring
//       entrance moves the PAINTED box by design even after it's fully opaque (fade finishes before the
//       slide does), which is NOT a shake. Only elements with transform=none in both frames are diffed,
//       so what remains moves solely via LAYOUT. If that drifts, the mid-section's height or a chart's
//       axis scale is a function of `t`, the layout resizes every frame and shoves the footer (the
//       "shaking bars / footer pushed up" defect). A fixed-viewBox primitive moves nothing (0px).
export function worstAnchorDrift(frameA, frameB, { minOpacity = 0.9, minSize = 8 } = {}) {
  const usable = (arr) => {
    const byText = new Map();
    const dup = new Set();
    for (const a of arr || []) {
      if (!a.text || a.w < minSize || a.h < minSize || a.opacity < minOpacity) continue;
      if (byText.has(a.text)) { dup.add(a.text); continue; }
      byText.set(a.text, a);
    }
    for (const t of dup) byText.delete(t); // same string rendered ≥2× in a frame → can't match unambiguously
    return byText;
  };
  const A = usable(frameA?.anchors), B = usable(frameB?.anchors);
  let worst = null;
  for (const [text, a] of A) {
    const b = B.get(text);
    if (!b) continue;
    if (a.transformed || b.transformed) continue; // mid-animation entrance transform (slide/scale) — not a layout shake
    const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
    const drift = Math.max(dx, dy);
    if (!worst || drift > worst.drift) worst = { text, drift: +drift.toFixed(1), dx: +dx.toFixed(1), dy: +dy.toFixed(1) };
  }
  return worst;
}

/**
 * Run the full QA suite for a rendered post.
 * opts: { base, brief, judge, vision, judgeModelProvider, visionModelProvider }
 */
export async function runQA(id, opts = {}) {
  const base = opts.base || process.env.PREVIEW_URL || "http://localhost:5173";
  // Output format the post is measured at. Non-portrait ⇒ Preview sizes #post-canvas to it (Path A reads
  // it from the spec; Path B — a spec-less TSX — is told via this param, so the agent iterates at the true
  // size). Empty for portrait ⇒ the URL is byte-identical to today (no behaviour change for existing posts).
  const fmtParam = opts.format && opts.format !== "portrait" ? `&format=${encodeURIComponent(opts.format)}` : "";
  const url = `${base}/?id=${encodeURIComponent(id)}${fmtParam}`;
  const screenshotPath = join(ROOT, "out", `.qa-${id}.png`);
  // Anti-frozen check (motion only): viz-region shots at a mid frame vs the final frame, diffed below.
  const vizEarlyPath = join(ROOT, "out", `.qa-${id}-viz-e.png`);
  const vizFinalPath = join(ROOT, "out", `.qa-${id}-viz-f.png`);

  let report;
  try {
    report = await inspectLayout({ url, screenshotPath, vizShotPath: opts.motion ? vizFinalPath : undefined });
  } catch (e) {
    // Component failed to render (runtime error / bad import) — don't crash the run.
    return {
      findings: [{ check: "render", severity: "error", message: `component failed to render — likely a runtime error or bad import path; run typecheck. (${(e.message || "").split("\n")[0]})`, data: {} }],
      pass: false,
      report: {},
    };
  }
  const findings = [];

  if (report.error) {
    findings.push({ check: "render", severity: "error", message: report.error, data: {} });
    return { findings, pass: false, report };
  }

  findings.push(...structuralFindings(report));

  // Q4 — multi-frame motion checks (signature-by-1.2s; content settled before the end)
  if (opts.motion) {
    try {
      // Map 1.2s of video to component progress t using the SAME easing as
      // src/remotion/generated.tsx: t = easeOutCubic(frame / (duration*0.85)).
      const DUR_S = 14, SETTLE = 0.85;
      const lin = Math.min(1, 1.2 / (DUR_S * SETTLE));
      const tEarly = (1 - Math.pow(1 - lin, 3)).toFixed(3); // ≈ 0.273
      const early = await inspectLayout({ url: `${base}/?id=${encodeURIComponent(id)}${fmtParam}&t=${tEarly}` });
      if ((early.signatureOpacity ?? 1) < 0.6)
        findings.push({ check: "motionSignature", severity: "error", message: `signature only ${Math.round((early.signatureOpacity || 0) * 100)}% visible at 1.2s — it must be visible by 1.2s`, data: { signatureOpacity: early.signatureOpacity } });
      const settle = await inspectLayout({ url: `${base}/?id=${encodeURIComponent(id)}${fmtParam}&t=0.85` });
      if (report.textCoverage > 0 && settle.textCoverage < 0.9 * report.textCoverage)
        findings.push({ check: "motionLateReveal", severity: "warn", message: `content still revealing after the settle point (~${Math.round((settle.textCoverage / report.textCoverage) * 100)}% in place at t=0.85) — finish reveals earlier`, data: {} });

      // Layout stability (anti-shake): compare a MID-animation frame (bars/reveals partway) against the
      // near-settled t=0.85 frame — chosen because axis/category/headline labels are fully revealed by
      // t≈0.45 (so they're comparable) while a t-dependent-height chart is still mid-resize (so a shake
      // shows). t=0.85 is before the signature's end pulse, so the signature box isn't falsely "moving".
      const SHAKE_PX = 6; // clean fixtures drift ~0px (SVG primitives are exact); a real footer-push is >10px
      const mid = await inspectLayout({ url: `${base}/?id=${encodeURIComponent(id)}${fmtParam}&t=0.45`, vizShotPath: vizEarlyPath });
      const drift = worstAnchorDrift(mid, settle);
      if (drift && drift.drift > SHAKE_PX) {
        const dir = drift.dy >= drift.dx ? `${drift.dy}px vertically` : `${drift.dx}px horizontally`;
        findings.push({
          check: "layoutShake",
          severity: "error",
          message: `"${drift.text}" shifts ${drift.drift}px (${dir}) between t=0.45 and t=0.85 — this element carries NO CSS transform, so it is moving via LAYOUT reflow, not an entrance animation. A settled label must hold still. The mid-section's height or a chart's axis scale is changing WITH the animation, so the layout resizes every frame and pushes surrounding content (visible shaking). Give the chart/plot a FIXED height/width for all t and grow bars via transform (scaleY about the baseline), NOT by resizing their container from the animating values; or use the BarChart/LineChart primitive (fixed viewBox — stable by construction). (Legitimate slide/scale entrances are exempt — they are excluded from this check.)`,
          data: drift,
        });
      }

      // Anti-frozen MAIN VISUAL (2c): the viz region (PostFrame's <main data-viz>) must CHANGE between the
      // mid frame (t=0.45) and the final frame — bars grow, connectors draw, dots pop. If it's essentially
      // identical, the model didn't thread the progress prop into its primitive (which defaults to the
      // FINAL frame) → a dead, block-only reveal (the "Divergence rendered static" defect). Conservative
      // WARN (non-blocking): ANY real internal motion OR a block still revealing at t=0.45 makes the two
      // frames differ, so a genuinely animated post is never flagged — this fires only on a clearly static
      // visual. It cannot catch every case (a frozen viz whose blocks all reveal AFTER t=0.45 slips
      // through); the contract's ANIMATE-THE-MAIN-VISUAL rule is the primary fix, this is the safety net.
      // Threshold 0.003: a truly frozen viz diffs to ~0; the lowest observed LEGITIMATE motion across the
      // primitive corpus is a sparse claim-list at ~0.008 (≈2.7× margin), so this never flags a real post.
      const vc = vizChangeRatio(vizEarlyPath, vizFinalPath);
      if (vc && vc.sameDim && vc.ratio < 0.003)
        findings.push({
          check: "vizStatic",
          severity: "warn",
          message: `the main visual is essentially IDENTICAL at t=0.45 and t=1 (only ${(vc.ratio * 100).toFixed(1)}% of its pixels change) — it looks FROZEN. Pass the component's progress into the primitive: t={t} (every animated primitive accepts t) so its marks actually animate. A visual that only fades in as a block while its internals stay static reads as broken.`,
          data: vc,
        });
    } catch (e) {
      findings.push({ check: "motion", severity: "info", message: `motion checks skipped: ${e.message}`, data: {} });
    }
  }

  // Cheap-before-expensive: skip the LLM judge/vision if structural+motion already failed.
  const structuralBlocked = findings.some((x) => x.severity === "error");

  // Q2 — data-fidelity judge (only if requested + a brief is available)
  if (opts.judge && opts.brief && !structuralBlocked) {
    try {
      findings.push(...(await judgeDataFidelity({ brief: opts.brief, texts: report.texts || [], provider: opts.judgeModelProvider })));
    } catch (e) {
      findings.push({ check: "judge", severity: "info", message: `judge skipped: ${e.message}`, data: {} });
    }
  }

  // Q3 — vision backstop (only if requested)
  if (opts.vision && !structuralBlocked) {
    try {
      findings.push(...(await visionReview({ screenshotPath, provider: opts.visionModelProvider })));
    } catch (e) {
      findings.push({ check: "vision", severity: "info", message: `vision skipped: ${e.message}`, data: {} });
    }
  }

  const pass = !findings.some((x) => x.severity === "error");
  return { findings, pass, report };
}

export function formatFindings(findings) {
  if (!findings.length) return "  (no findings)";
  return [...findings]
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
    .map((x) => `  [${x.severity.toUpperCase()}] ${x.check}: ${x.message}`)
    .join("\n");
}

// Compact, instruction-style summary fed back to the agent loop.
export function findingsForAgent(findings) {
  const blocking = findings.filter((x) => x.severity === "error");
  const warns = findings.filter((x) => x.severity === "warn");
  const lines = [];
  if (blocking.length) lines.push("MUST FIX (blocking):", ...blocking.map((x) => `- ${x.message}`));
  if (warns.length) lines.push("SHOULD FIX:", ...warns.map((x) => `- ${x.message}`));
  return lines.join("\n") || "all checks passed";
}
