// Unified QA runner. Aggregates the structural inspector + (optionally) the
// data-fidelity judge, vision backstop, and motion checks into one severity-tagged
// findings list. pass = no error-level findings. See docs/QA_PLAN.md.
import { join } from "node:path";
import { inspectLayout } from "./inspect.mjs";
import { ROOT } from "./agent-tools.mjs";
import { judgeDataFidelity } from "./judge.mjs";
import { visionReview } from "./vision.mjs";

// severity ordering for display/sort
export const SEV_ORDER = { error: 0, warn: 1, info: 2 };

function structuralFindings(r) {
  const f = [];
  const add = (check, severity, message, data) => f.push({ check, severity, message, data });

  for (const c of r.collisions || []) add("collision", "error", `"${c.a}" overlaps "${c.b}" by ${c.overlapPx}px`, c);
  for (const c of r.clipped || []) add("clipped", "error", `${c.el} is clipped on ${c.axis} (overflow ${c.overflowPx}px) — content is cut off`, c);
  for (const o of r.textOccluded || []) add("textOccluded", "error", `${o.el} is drawn over by a ${o.byRole} (${o.hits} samples cross the lettering) — the graphic occludes the text, making it unreadable; move the label or the line apart`, o);
  for (const o of r.textOverflowsBox || []) add("textOverflowsBox", "error", `"${o.el}" is wider than its box (spills ${o.overflowPx}px past both sides of a ${o.boxWidthPx}px container) — the label paints outside the box border; widen the box, shorten the label, or shrink the text`, o);
  if (r.crowded) add("crowded", "error", `over-crowded: text covers ${Math.round(r.textCoverage * 100)}% of the canvas (max ~35%) — remove secondary elements`, { textCoverage: r.textCoverage });
  for (const m of r.belowMobileFloor || []) add("mobileFloor", "error", `${m.el} is ${m.sourcePx}px (~${m.downscaledPx}px on phone) — below the ${m.floorPx}px floor`, m);
  for (const m of r.outOfSafeMargin || []) add("safeMargin", "error", `${m.el} breaches the ${m.side} safe margin by ${m.byPx}px`, m);
  if (!r.signaturePresent) add("signature", "error", "creator signature is missing", {});

  for (const c of r.lowContrast || []) add("contrast", "warn", `${c.el} contrast ${c.ratio} (min ${c.min})`, c);

  // Q1 — deterministic design checks (thresholds calibrated on real outputs)
  if (r.hierarchyRatio && r.hierarchyRatio < 1.8)
    add("hierarchy", "warn", `weak visual hierarchy — largest text only ${r.hierarchyRatio}× the body; enlarge the hero or shrink secondary text`, { hierarchyRatio: r.hierarchyRatio });
  for (const t of r.typo || []) add("typography", "warn", `${t.el}: ${t.issue}`, t);
  for (const b of r.bottomReserve || []) add("bottomReserve", "warn", `${b.el} sits ${b.byPx}px into the bottom 80px platform-reserve zone`, b);
  if (typeof r.accentHues === "number" && r.accentHues < 2)
    add("monochrome", "warn", `only ${r.accentHues} accent hue in use — add a second semantic accent (anti-monochrome)`, { accentHues: r.accentHues });
  for (const d of r.duplicates || []) add("duplicate", "info", `"${d.text}" rendered ${d.count}× — avoid redundant encoding`, d);
  if (Math.abs(r.balanceX || 0) > 0.18 || Math.abs(r.balanceY || 0) > 0.18)
    add("balance", "info", `content off-center (x ${r.balanceX}, y ${r.balanceY})`, { balanceX: r.balanceX, balanceY: r.balanceY });
  if ((r.crampedPairs || 0) > 6) add("cramped", "info", `${r.crampedPairs} tightly-spaced element pairs — consider more whitespace`, { crampedPairs: r.crampedPairs });

  return f;
}

/**
 * Run the full QA suite for a rendered post.
 * opts: { base, brief, judge, vision, judgeModelProvider, visionModelProvider }
 */
export async function runQA(id, opts = {}) {
  const base = opts.base || process.env.PREVIEW_URL || "http://localhost:5173";
  const url = `${base}/?id=${encodeURIComponent(id)}`;
  const screenshotPath = join(ROOT, "out", `.qa-${id}.png`);

  let report;
  try {
    report = await inspectLayout({ url, screenshotPath });
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
      const early = await inspectLayout({ url: `${base}/?id=${encodeURIComponent(id)}&t=${tEarly}` });
      if ((early.signatureOpacity ?? 1) < 0.6)
        findings.push({ check: "motionSignature", severity: "error", message: `signature only ${Math.round((early.signatureOpacity || 0) * 100)}% visible at 1.2s — it must be visible by 1.2s`, data: { signatureOpacity: early.signatureOpacity } });
      const settle = await inspectLayout({ url: `${base}/?id=${encodeURIComponent(id)}&t=0.85` });
      if (report.textCoverage > 0 && settle.textCoverage < 0.9 * report.textCoverage)
        findings.push({ check: "motionLateReveal", severity: "warn", message: `content still revealing after the settle point (~${Math.round((settle.textCoverage / report.textCoverage) * 100)}% in place at t=0.85) — finish reveals earlier`, data: {} });
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
