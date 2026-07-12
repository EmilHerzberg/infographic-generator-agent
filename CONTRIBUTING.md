# Contributing

Thanks for your interest! This project generates marketing videos with an AI agent and a Remotion
renderer. Contributions to the primitive library, QA gates, and provider support are especially welcome.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env    # add one provider key
npm run typecheck && npm run build
```

## Project layout

- `tools/` — the engine + CLIs. `generate.mjs` (Path A), `agent.mjs` (Path B), `render.mjs`, and
  `tools/lib/*` (model resolution, briefing assembly, the agent tool-set, the QA inspector). `qa-*.mjs`
  are per-primitive visual checks; `triage-eval.mjs` / `guard-eval.mjs` are deterministic evals.
- `src/components/primitives/` — the layout-safe visual library (the building blocks the agent composes).
- `src/components/layout/` — `PostFrame`, the creator signature.
- `src/remotion/` — the Remotion root + compositions + offline fonts (render-truth parity).
- `src/preview/` — the `?id=` harness the QA inspector drives (`npm run dev`).
- `src/tokens/` — design tokens (colors, type, motion).
- `src/lib/` — per-visualization math (scales, layout).
- `context/`, `prompts/`, `schemas/` — the AI briefing, prompt contracts, and JSON schemas.
- `brand.config.json` — swappable brand identity.

## The QA gates

The inspector renders a post headless (Playwright) and asserts hard rules: no text overflow, no
collisions, mobile-legible type (source-pixel floors), safe margins, a present creator signature.
`npm run qa` runs it; `npm run qa:<primitive>` targets one; `npm run qa:fuzz` stress-tests. Path B's
agent loop calls the same gates and iterates until they pass — so a new primitive should come with a
`qa:*` check.

## Pull requests

1. Fork + branch.
2. `npm run typecheck && npm run build` must pass.
3. If you touch a primitive or the renderer, run the relevant `npm run qa:*`.
4. Keep the visual language consistent (see `context/` and the existing primitives).
5. Describe the change and, for visuals, attach a rendered frame or clip.

## Note on Path B

Path B executes AI-generated TSX locally to render it. See [SECURITY.md](SECURITY.md) for the model and
the sandboxing guidance if you expose it to untrusted input.
