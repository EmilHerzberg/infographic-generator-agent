# Agent Harness — Build Plan

Provider-agnostic agent that turns a post brief into a rendered, on-brand asset by
**writing → rendering → inspecting → fixing** in a loop until it passes hard gates.
This is Path B (TSX power mode) generalized beyond Claude. See `docs/SHIP_PLAN.md`
for how it relates to Path A (JSON).

## Status

- **Phase A — done & verified.** AI SDK adopted; `tools/generate.mjs` runs Path A via `generateObject`.
- **Phase B — done & verified.** `/preview/:id` route + `tools/lib/inspect.mjs`; inspector renders real posts and measures collisions/floors/margins/contrast/signature. Signature exempted from the bottom-reserve rule.
- **Phase C — built & machinery-verified.** `tools/agent.mjs` (AI SDK `generateText` loop) + tool surface in `tools/lib/agent-tools.mjs`; generated posts auto-discovered via the preview registry glob. `--selftest` drives write→typecheck→inspect→gate without an LLM and passes. The inspector caught a real systemic bug (PostFrame header `pt-12` put every eyebrow inside the 64px safe margin) — fixed to `pt-16`. Live LLM run needs a provider API key (same as Path A).
- **Phase D/E — pending.**

## Decisions locked (from design conversation)

- **Framework:** adopt **Vercel AI SDK 6** for the provider abstraction, agent
  loop, structured output, and multimodal — do NOT hand-roll the provider layer.
- **Providers:** Anthropic, Google (Gemini), DeepSeek, OpenAI-compatible (generic
  `baseURL` → OpenRouter / Ollama / LM Studio / any endpoint). Optionally surface
  **OpenRouter** so users can bring ONE key for many models.
- **Feedback channel:** BOTH — structural inspector (measured facts) + vision
  (screenshot). Structural gates `finish`; vision refines aesthetics; degrades to
  structural-only for any non-vision model.
- **Render/measure engine:** **Playwright** screenshots + measures the live React
  component each loop iteration; **Remotion** produces the final PNG/MP4.
- **Agent code freedom:** build against existing primitives first; revisit
  loosening to freer TSX once the inspector proves reliable. (DEFERRED.)

## Build-vs-buy split

| Buy (AI SDK / Playwright) | Build (ours — domain-specific) |
|---|---|
| Provider models: `@ai-sdk/{anthropic,google,deepseek,openai-compatible}` | **`inspect_layout`** — DOM measurement encoding our collision/mobile/signature rules (the keystone) |
| Structured output: `generateObject({ schema })` | Preview mount route (`/preview/:id`) at 1080×1350 |
| Agent loop: `Agent` / `generateText` + `tools` + `stopWhen` | Tool bodies: read/write/typecheck/render |
| Multimodal image inputs (vision feedback) | Remotion finals wiring |
| Playwright: headless render + screenshot + `getBoundingClientRect` | The briefing bundle (`context/`) — already built |

No framework provides the layout inspector — it's unique to this design system and
also doubles as a CI check and the Path A renderer's quality gate.

## The structural inspector (spec)

`inspect_layout({ id }) → report`. Renders the post in Playwright, measures, returns:

```jsonc
{
  "pass": false,
  "collisions":      [{ "a": "headline", "b": "metricCard#2", "overlapPx": 14 }],
  "outOfSafeMargin": [{ "el": "signature", "side": "bottom", "byPx": 8 }],
  "belowMobileFloor":[{ "el": "eyebrow", "sourcePx": 22, "downscaledPx": 7.9, "floorPx": 11 }],
  "lowContrast":     [{ "el": "takeaway", "ratio": 2.9, "min": 4.5 }],
  "signaturePresent": true
}
```

Measures: pairwise element/text-box overlaps; breaches of the safe-margin rect;
computed font-size × 2.77 downscale vs the mobile floors (`context/07-mobile-first.md`);
contrast ratios for important text; presence of the creator signature. Elements
identified generically (text/element leaf nodes) + optional `data-inspect="<role>"`
attributes on primitives for precise labels. Pure measurement — no model needed —
so it runs as a deterministic gate and in CI.

## Phases & deliverables

**Phase A — Adopt AI SDK + refactor the existing generator (foundation)**
- Add deps: `ai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/deepseek`,
  `@ai-sdk/openai-compatible`, `zod`.
- `tools/lib/model.mjs` — resolve `--provider` → AI SDK model instance (key/baseURL/model from env).
- Refactor `tools/generate.mjs` onto `generateObject({ schema: jsonSchema(infographicSchema) })`.
  Reuse the existing `schemas/infographic.schema.json` via the `jsonSchema()` wrapper (no Zod rewrite).
- Delete the hand-rolled `tools/providers/*`; keep `tools/lib/context.mjs`.
  Keep a thin quality-checklist reporter (schema validation now handled by AI SDK).
- Gate: `npm run generate` still produces a validated `<id>.json` — now via AI SDK.

**Phase B — Preview route + structural inspector (keystone)**
- Vite route `/preview/:id` rendering the post in a fixed 1080×1350 `PostFrame`.
- `tools/lib/inspect.mjs` — Playwright: launch, navigate, screenshot, measure → report.
- Add `data-inspect` attributes to primitives where helpful.
- Gate: run inspector against an existing post (`AIPredictionGraveyard`) and print a real report.

**Phase C — Tool surface + orchestrator loop**
- Tools (AI SDK `tool()` defs + bodies): `read_file`, `list_dir`, `write_post`,
  `typecheck`, `inspect_layout`, `render_preview`, `finish`.
- `tools/agent.mjs` — AI SDK `Agent`: briefing + tool contract + loop with
  `stopWhen: stepCountIs(N)`; hard gates before `finish` (typecheck clean + inspector
  pass + signature present); iteration/budget caps; fallback to Path A on repeated failure.
- Scope file tools to the repo subtree; generated code in `src/posts/generated/<id>/`.

**Phase D — Vision wiring + Remotion finals**
- Attach the Playwright screenshot as an image part for vision-capable providers.
- On success → Remotion renders production PNG/MP4 via the existing pipeline.

**Phase E — Polish**
- Worktree isolation, retries, cost/usage reporting, OpenRouter single-key option.

## Risks & mitigations

- **Model writes invalid TSX / typecheck loops** → typecheck tool + iteration cap +
  Path A fallback; constrain to primitives first.
- **Local code execution** (running model-written TSX) → repo-subtree-locked tools,
  no bash, generated dir isolation; acceptable for local single-user.
- **Playwright HMR timing** (write → Vite reload → measure) → wait-for-selector /
  ready signal before measuring.
- **Schema too large for some providers' structured-output** → `generateObject`
  handles per-provider; if a provider rejects, fall back to tool-mode or trim schema.

## Out of scope (for now)

Mastra (durable workflows / evals — revisit later), LangGraph.js, hosted MP4 render
backend, the static gallery/playground site (separate Milestone 3 track).
