# Quality-Assurance Plan — beyond geometry

> **STATUS: IMPLEMENTED (Q0–Q5).** Framework (`tools/lib/qa.mjs`, `tools/qa.mjs`),
> data-fidelity judge (`tools/lib/judge.mjs`), vision backstop (`tools/lib/vision.mjs`),
> deterministic DOM checks + motion checks (`tools/lib/inspect.mjs` + `?t=` preview),
> wired into the agent `finish`/salvage gates, with `npm run qa` (CI) and
> `npm run qa:regression` (fixtures). Calibrated on real outputs (crowding threshold 0.42).

The structural inspector (`tools/lib/inspect.mjs`) now gates on the *spatial* defects:
collisions, safe margins, mobile-floor type sizes, **clipping/overflow**, **crowding
(text coverage)**, and signature presence (contrast is advisory). Those are the limit
of what pure geometry can catch. This plan adds the next tiers — **semantic**,
**data-fidelity**, **chart-quality**, and **motion** checks — so the harness rejects
posts that are *wrong* or *unreadable*, not just *misaligned*.

Everything plugs into the existing loop the same way: a check produces findings →
findings gate `finish` → the agent's fix-loop resolves them. No model-specific tuning.

## Principles

1. **Three mechanism kinds, used by fit:**
   - **Deterministic DOM checks** (cheap, no model) — anything measurable from the rendered DOM. Extend the inspector.
   - **LLM judge** (semantic/data) — a separate model call verifying facts/claims the DOM can't.
   - **Vision** (subjective aesthetics + chart readability) — a vision model critiques the screenshot.
2. **Severity, not pass/fail soup.** Every finding is `error | warn | info`. Only `error` blocks `finish`. `warn` is fed to the loop to fix but won't hard-block once the step budget is low. `info` is advisory. This prevents subjective checks from false-blocking good designs.
3. **Calibrate on real outputs.** Every threshold is tuned against the existing renders (the four `compounding-failure-rate*` posts + the hand-built posts) so known-good passes. Keep them as a regression fixture set.
4. **Cheap before expensive.** Run deterministic checks first; only call the LLM judge / vision pass after the structural gates pass (a free pre-filter).

## Severity model (applies to all checks)

| Level | Behavior | Examples |
|---|---|---|
| `error` | Blocks `finish` — must be resolved | collision, clipped, crowded, sub-floor text, missing signature, data contradiction, signature not visible by 1.2s |
| `warn` | Loop should fix; allowed to finish if unresolved after budget | weak hierarchy, ragged alignment, literal `^`/quotes, thin chart stroke, unit ambiguity |
| `info` | Advisory only | redundant numbers, mild imbalance, color-distribution drift |

---

## Phase Q0 — QA framework (foundational)

Refactor so every check emits uniform findings and one runner aggregates them.

- **`tools/lib/qa.mjs`** — a `runQA(id, { motion, base, provider })` that calls the inspector + the new checks and returns `{ findings: [{ check, severity, message, data }], pass }` where `pass = no error-level findings`.
- Refactor `inspect.mjs` to return its raw measurements **and** emit findings (collision/clip/crowd/floor/margin/signature) into this shape.
- **`tools/qa.mjs`** CLI — `node tools/qa.mjs <id> [--motion]` prints the full severity-grouped report. Usable standalone and in CI.
- The agent's `finish` gate calls `runQA` instead of `inspect` directly; blocks on `error`.

Deliverable: one report shape, one runner, existing gates ported into it. No behavior change yet.

---

## Phase Q1 — Cheap deterministic DOM checks (extend the inspector)

All measurable from the DOM; calibrate thresholds on the four real outputs.

| Check | Logic | Severity |
|---|---|---|
| **Bottom-80 reserve** | tighten bottom margin from 64→80px for non-signature content (briefing: platform chrome) | error |
| **Visual hierarchy** | `max display font ÷ median body font`; flat layout if `< ~1.8` | warn |
| **Alignment** | cluster element left-edges/centers onto gridlines; count off-grid outliers | warn |
| **Balance** | text center-of-mass offset from canvas center; flag large dead quadrants | info |
| **Duplicate encoding** | same display string (number/label) rendered ≥2× | info |
| **Typographic polish** | literal `^`, `*`, ` -- `, straight quotes `'"'` in display text → suggest `¹⁰`, `×`, `—`, curly quotes | warn |
| **Stroke floors** | computed `stroke-width` of chart/line SVG vs floor (chart ≥5px, signal ≥3px) | warn |
| **Color strategy** | sample accent colors in use; count distinct semantic roles + area share; flag monochrome (anti-monochrome rule) and over-accenting | warn |

Touchpoint: `tools/lib/inspect.mjs` `measure()` + new helpers. Each returns findings.

---

## Phase Q2 — Data-fidelity LLM judge (highest stakes)

The worst failure for a data-heavy brand is a confidently **wrong** number. Currently 100% unchecked.

- After structural gates pass, dump the rendered text leaves (the inspector already collects them).
- **`tools/lib/judge.mjs`** — call a judge model (`JUDGE_MODEL`, default a strong reasoning model) with `{ brief, renderedText }` and a strict schema:
  ```
  { dataFidelityPass: boolean,
    issues: [{ type: "wrong_number"|"unsupported_claim"|"unit_ambiguity"|"mislabel",
               detail: string, severity: "error"|"warn" }] }
  ```
- Prompt: verify every number is consistent with the brief, re-check arithmetic, no claim unsupported by the brief, units/labels unambiguous.
- `wrong_number` / `unsupported_claim` → `error`; `unit_ambiguity` → `warn`.
- Integrate as a gate in `finish` (runs only after structural pass — cheap pre-filter). Configurable model so it can be cheaper/faster than the builder.

---

## Phase Q3 — Vision backstop

The realistic catch for chart readability, semantic "feels off", and residual crowding geometry can't measure.

- Reuse the screenshot the inspector already produces.
- **`tools/lib/vision.mjs`** — send the image to a vision model (`VISION_MODEL`, default the run's provider if vision-capable, else a fixed vision judge) with a structured critique schema:
  ```
  { readable: boolean, chartLinesLabeled: boolean|null,
    issues: [{ kind, detail, severity }], verdict: "ship"|"revise" }
  ```
- Specifically ask: are chart lines directly labeled with their variable? any value misreadable? does the headline carry the message? does it look crowded/unbalanced?
- `verdict: "revise"` with `error` issues blocks; aesthetic nits are `warn`.
- **Provider gap:** non-vision models (e.g. DeepSeek V3) can't self-review — fall back to a fixed vision judge model or skip with a logged warning. Vision-capable builders (Claude, Gemini, gpt-5.5, DeepSeek V4) can self-review in-loop.

---

## Phase Q4 — Multi-frame motion checks

Today only the **final frame** is inspected; the animation itself is unchecked.

- Add `?t=` support to the preview route (`src/preview/Preview.tsx` reads `t` from the query and passes it to the component) so the inspector can render any progress point.
- **`inspectMotion(id)`** runs the inspector at `t ≈ 0.086` (1.2s of 14s), `0.5`, `1.0`:
  | Check | Logic | Severity |
  |---|---|---|
  | Signature by 1.2s | signature opacity ≥ 0.6 at `t≈0.086` | error |
  | Reveal monotonic | each major element's opacity non-decreasing across t (no flicker/disappear) | warn |
  | No late entrance | nothing first appears after `t≈0.85` (must settle before the end) | warn |
  | Final-frame hold | `t=1` is the clean gated frame (already enforced) | error |

---

## Phase Q5 — Orchestration + CI + regression fixtures

- Wire `runQA` into the agent `finish` gate (errors block; warns surfaced to the loop with fix instructions; the salvage path also runs `runQA`).
- Feed findings back as **actionable instructions**, not raw data (e.g. "headline font only 1.4× body — enlarge the headline or shrink secondary text").
- **CI check**: `node tools/qa.mjs <id>` must report zero `error` findings for any committed generated post.
- **Regression fixtures**: keep the four `compounding-failure-rate*` renders + hand-built posts as a calibration set; a script asserts known-good posts stay green so threshold tuning can't silently regress.

---

## Recommended build order (by leverage)

1. **Q0** (framework) — small, unlocks everything else cleanly.
2. **Q2** (data-fidelity judge) — highest stakes; a wrong infographic is worse than an ugly one.
3. **Q3** (vision backstop) — knocks out chart-readability + semantic ambiguity + residual crowding in one move.
4. **Q1** (cheap DOM batch) — an afternoon of deterministic checks; big floor-raise.
5. **Q4** (motion) — once stills are solid.
6. **Q5** folds in incrementally as each phase lands.

## Risks & mitigations

- **Over-gating subjective checks** → only `error` blocks; calibrate on real outputs; keep thresholds one-line tunable; regression fixtures catch over-tightening.
- **Judge/vision cost & latency** → run only after structural gates pass; configurable cheaper models; cache by content hash.
- **Vision provider gaps** → configurable fixed vision/judge model; skip-with-warning for non-vision builders.
- **Judge false positives on correct data** → schema forces specific `type` + `detail`; `warn` (not `error`) for ambiguity vs hard contradiction.

## Out of scope (separate tracks)

JSON→pixels renderer (Path A finisher), the showcase/gallery site, open-source packaging.
