// QA finding taxonomy (Epic 01 / Sprint 1.2). Splits the self-correcting loop's findings into
// who can actually fix them, so render.mjs knows whether to regenerate (model) or stop and raise
// an engineering flag (renderer). Full rationale: docs/QA_TAXONOMY.md.
//
//   'model'     — the model fixes it by emitting different content/data/accents next iteration.
//   'content'   — a model fix of the "reduce/shorten" kind (too dense). Drives regeneration too.
//   'renderer'  — needs an engineering change in PostRenderer/primitives; regenerating won't help.
//   'ambiguous' — geometric overflow that, in Path A, is USUALLY too-much-content (→ treat as
//                 'content' first) but is a renderer bug if it RECURS after a regen (→ 'renderer').

export const CHECK_CLASS = {
  // ── pure engineering: regeneration cannot help ────────────────────────────────
  render: "renderer", // component threw / bad import
  signature: "renderer", // PostFrame always renders the signature; absence is a code bug
  motionSignature: "renderer", // signature-by-1.2s is a motion-timing concern in the renderer
  motionLateReveal: "renderer", // reveal choreography lives in the renderer
  mobileFloor: "renderer", // Path A type sizes are FIXED in the primitives, not model-controlled
  balance: "renderer", // centering is layout, not content
  bottomReserve: "renderer", // platform-reserve placement is layout
  hierarchy: "renderer", // size hierarchy is set by the primitives

  // ── content / data: the model fixes by emitting something different ───────────
  dataFidelity: "model", // wrong number / unsupported claim — fix the data
  typography: "model", // literal caret exponent / double hyphen — the model writes the text
  duplicate: "model", // redundant encoding — drop the repeat
  monochrome: "model", // assign a second semantic accent (the contract asks for multi-accent)
  contrast: "model", // pick a different accent for that element
  vision: "model", // readability/labeling — usually a content/labeling fix

  // ── too much content: the model fixes by REDUCING ────────────────────────────
  crowded: "content",
  cramped: "content",

  // ── ambiguous geometric overflow: density first, renderer if it persists ──────
  collision: "ambiguous",
  clipped: "ambiguous",
  safeMargin: "ambiguous",
};

/**
 * Split error-level findings into what the model can fix vs. what needs an engineering fix.
 * @param errors  findings with severity === 'error'
 * @param prevChecks  Set of `check` names that were errors in the PREVIOUS iteration; an
 *                    ambiguous finding that recurs is reclassified as a renderer bug.
 * @returns { model: Finding[], renderer: Finding[] }  (model includes 'content' fixes)
 */
export function classifyFindings(errors, prevChecks = new Set()) {
  const model = [];
  const renderer = [];
  for (const f of errors) {
    let cls = CHECK_CLASS[f.check] || "renderer"; // unknown → conservative: stop and flag
    if (cls === "ambiguous") cls = prevChecks.has(f.check) ? "renderer" : "content";
    if (cls === "renderer") renderer.push(f);
    else model.push(f);
  }
  return { model, renderer };
}
