// CONTENT BUDGET BY ASPECT — the single source of truth for "how much content fits which output
// aspect, per visual form". Consumed by BOTH upstream gates: the Concierge chat (briefing.md via
// {{FORMAT_CAPACITY}}) and the LLM triage (skip-chat path), so a too-dense brief is caught and
// concretely improved BEFORE any generation spend — instead of burning a 32-iteration QA loop.
//
// The numbers are COMFORTABLE capacities, not hard caps: the layout gate rejects well above them;
// staying inside is what makes a run converge in few iterations. Calibrated from the fixture corpus
// (fuzz-*), the primitives' own caps (e.g. Pipeline fitNodes ≤8) and the measured chrome shares
// (square viz row ≈ 46–70% of the frame). Portrait is the calibrated baseline; square holds roughly
// TWO THIRDS of it; vertical stacks MORE items but is width-limited (long labels fit worse).

// Structured form (kept in sync with the prompt text below; available for future deterministic checks).
export const CAPACITY = {
  //                 [portrait, square, vertical]
  statSupport:       [3, 2, 2],  // support metrics beside 1 hero number
  barCategories:     [6, 4, 5],
  lineSeriesPoints:  [[2, 10], [2, 7], [2, 8]], // series × points
  donutSegments:     [5, 4, 5],
  funnelStages:      [5, 4, 6],
  pipelineNodes:     [7, 5, 8],
  claims:            [3, 2, 3],
  comparisonPerSide: [4, 3, 4],
  divergencePairs:   [5, 4, 6],
  tierStack:         [[4, 3], [3, 2], [4, 2]], // tiers × items each
  taxonomy:          [[4, 3], [3, 2], [4, 3]], // categories × children
  distributionGroups:[4, 3, 4],
  rangesPerLane:     [4, 3, 4],
  scatterLabeled:    [6, 4, 5],
  footerMetricCards: [4, 2, 2],
  distinctNumbers:   [7, 5, 6],
};

// The prompt block both gates embed. Order of each triple: 4:5 portrait | 1:1 square | 9:16 vertical.
export const FORMAT_CAPACITY_GUIDE = `<<< CONTENT BUDGET BY ASPECT (comfortable capacities — staying inside converges fast; the layout gate rejects well above them) >>>
The three output aspects hold DIFFERENT amounts of content. 4:5 portrait (1080×1350) is the calibrated baseline. 1:1 square (1080×1080) has ~20% less area and proportionally more chrome — it holds roughly TWO THIRDS of portrait's content and is the STRICTEST. 9:16 vertical (1080×1920) is tall but NARROW: it stacks more items vertically, but long labels and side-by-side layouts fit WORSE than portrait.
Comfortable item budgets per visual form (4:5 | 1:1 | 9:16):
- hero stat: 1 big number + 3 | 2 | 2 support metrics
- bar chart: 6 | 4 | 5 categories
- line/area chart: 2 series with 10 | 7 | 8 points, ≤1 annotation per series
- donut: 5 | 4 | 5 segments
- funnel: 5 | 4 | 6 stages
- pipeline (compounding steps): 7 | 5 | 8 nodes
- claims ledger (claim vs reality): 3 | 2 | 3 claims
- comparison columns: 4 | 3 | 4 items per side
- 2×2 matrix: exactly 4 cells on every aspect — the most SQUARE-NATIVE form
- divergence (before→after pairs): 5 | 4 | 6 pairs
- tier stack: 4 tiers × 3 items | 3 × 2 | 4 × 2
- taxonomy tree: 4 categories × 3 children | 3 × 2 | 4 × 3
- distribution (box plots): 4 | 3 | 4 groups
- ranges/timeline: 4 | 3 | 4 entries per lane
- scatter: 6 | 4 | 5 LABELED points (more unlabeled points are fine)
- footer metric cards (supporting stats): 4 | 2 | 2
Global: distinct NUMBERS carried by one post ≈ 7 | 5 | 6. On square and vertical, category labels ≤ ~3 words (long German compounds count double).
When content exceeds the budget of the best-fitting form at the chosen aspect, there are exactly THREE honest fixes — always propose ONE concretely, naming the form and the counts: (a) TRIM to the top-N items (say WHICH to drop and why), (b) SWITCH to a form that holds this content at this aspect, or (c) SWITCH the aspect to one whose budget fits (e.g. 7 bar categories: too many for 1:1, fine on 4:5).`;

const FMT_INDEX = { portrait: 0, square: 1, vertical: 2 };
/** One-line focus note for a specific target aspect (appended when the aspect is already known). */
export function aspectFocusLine(format) {
  const i = FMT_INDEX[format] ?? 0;
  const name = ["4:5 portrait", "1:1 square", "9:16 vertical"][i];
  const strict = format === "square"
    ? " This is the STRICTEST aspect — when in doubt, cut content or recommend 4:5."
    : format === "vertical"
      ? " Width is the constraint here — shorten labels; avoid side-by-side layouts with long text."
      : "";
  return (
    `CURRENTLY SELECTED ASPECT: ${name}. This is what will ACTUALLY be generated — judge every content ` +
    `budget above against THIS column, no matter which aspect you or the user discussed.${strict} If the ` +
    `user asks to switch aspect, set \`suggestedAspect\` to it, but do NOT treat the switch as done or ` +
    `release readiness ok/strong until THIS line changes to the new aspect (the picker actually moved). ` +
    `Until then the content must still fit ${name}; if it doesn't, say so and tell them to click the new ` +
    `aspect in the studio. Never claim a video "runs in 4:5" while this line still says something else.`
  );
}
