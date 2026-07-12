# QA finding taxonomy — model-fixable vs renderer-fixable

The Path A self-correcting loop (`tools/render.mjs`, Epic 01 / Sprint 1.2) regenerates a spec when
QA fails — but only when regenerating can actually help. Every error-level finding is classified by
**who can fix it**. Implementation: `tools/lib/classify.mjs`.

## Classes

| Class | Meaning | Loop action |
|---|---|---|
| `model` | The model fixes it by emitting different content/data/accents. | Regenerate with the finding as feedback. |
| `content` | A model fix of the "reduce / shorten" kind (too dense). | Regenerate with reduce-oriented feedback. |
| `renderer` | Needs an engineering change in `PostRenderer`/primitives. | **Stop**, raise an engineering flag. |
| `ambiguous` | Geometric overflow — usually density in Path A, but a renderer bug if persistent. | `content` on first sight; `renderer` if it recurs after a regen. |

## Mapping (by finding `check`)

**Renderer (engineering — regeneration won't help)**
- `render` — component threw / bad import.
- `signature`, `motionSignature` — the signature is rendered by `PostFrame`; absence / late visibility is a code bug.
- `motionLateReveal` — reveal choreography lives in the renderer.
- `mobileFloor` — Path A type sizes are **fixed** in the primitives, not chosen by the model.
- `balance`, `bottomReserve`, `hierarchy` — layout/sizing decisions owned by the primitives.

**Model (emit different content/data)**
- `dataFidelity` — wrong number / unsupported claim → fix the data.
- `typography` — literal `^` exponent or `--` → the model writes the text; use `¹⁰` / `—`.
- `duplicate` — redundant text → drop the repeat.
- `monochrome` — only one accent hue → assign a second semantic accent.
- `contrast` — pick a different accent for that element.
- `vision` — readability/labeling → usually a content/labeling fix.

**Content (reduce / shorten — a model fix)**
- `crowded`, `cramped` — too much on the canvas → fewer metrics / shorter takeaway / fewer items.

**Ambiguous (density first, renderer if it persists)**
- `collision`, `clipped`, `safeMargin` — in Path A, overflow is usually too-much-content, so the
  first occurrence is treated as `content` (reduce and retry). If the **same** check recurs after a
  regeneration, it's reclassified `renderer` — the content changed but the overflow didn't, so it's a
  layout limit, not a density problem.

## Why this split

- Looping on a true renderer bug is wasted spend — it can never converge, so we stop and flag it for
  a code fix (Sprint 1.1-style hardening).
- Looping on a content problem is exactly what the loop is for — the model reduces/fixes and retries.
- The recurrence rule for ambiguous findings is the tie-breaker: it distinguishes "the brief was too
  dense" (fixable by the model) from "this layout can't hold even reduced content" (a renderer limit).

> Note: genuinely over-dense briefs are also screened **before** generation by the input filter /
> triage gate (Epic 02). The loop's `content` class is the output-side counterpart.
