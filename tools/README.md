# tools/ — multi-provider post generator

Generate an on-brand post spec from any AI provider using the portable briefing
bundle in `context/`. See `docs/SHIP_PLAN.md` for the full architecture.

## Setup

1. `cp .env.example .env` and fill in the key for ONE provider.
2. (Optional) edit `brand.config.json` to use your own name/monogram/subtitle.

## Run

```bash
# DeepSeek
npm run generate -- --provider deepseek --brief "Why single-agent beats multi-agent for most automation" --id single-vs-multi

# Claude
npm run generate -- --provider anthropic --brief "..." --id my-post

# Gemini (Google AI Studio)
npm run generate -- --provider gemini --brief "..."

# Any OpenAI-compatible endpoint (OpenAI, OpenRouter, local Ollama/llama.cpp)
npm run generate -- --provider openai --brief "..." --model gpt-4o
```

Flags: `--brief` (required), `--provider` (required), `--id`, `--model`,
`--motion` (include the motion briefing for video specs), `--out` (output dir,
default `src/posts/generated/`).

## Output

Writes `<id>.json` — a spec validated against `schemas/infographic.schema.json`.
The console reports schema validity and any `qualityChecklist` items not yet true.

## What this is / isn't (today)

- ✅ Proves any provider can drive the design system: the AI fills structured
  content + layout/color/safety plans, it does **not** write rendering code.
- ⏳ The JSON spec → PNG/MP4 step needs the renderer in `docs/SHIP_PLAN.md`
  (Milestone 2), or use the Claude CLI / TSX power path for pixels today.

## Agent harness (Path B — TSX power mode)

Instead of emitting JSON, the agent writes a React/Remotion component, then renders →
inspects → fixes it in a loop until it passes hard gates. Built on the Vercel AI SDK,
so it works across the same four providers.

```bash
npm run dev                       # the inspector needs the dev server running
node tools/agent.mjs --provider anthropic --brief "your post idea" --id my-post
node tools/agent.mjs --selftest   # exercise write→typecheck→inspect→gate without an LLM
```

The structural inspector (Playwright) measures collisions, mobile-floor type sizes,
safe margins, contrast, and signature presence — and gates `finish` on them. Run it
standalone on any registered post:

```bash
node tools/inspect.mjs ai-prediction-graveyard --screenshot out/check.png
```

## Quality assurance (QA)

The agent's `finish` gate runs a layered QA suite (see `docs/QA_PLAN.md`). Run it standalone:

```bash
npm run qa -- <post-id>                          # deterministic checks (structural + density + typography...)
npm run qa -- <post-id> --motion                 # + multi-frame motion (signature-by-1.2s, settle)
npm run qa -- <post-id> --judge --brief "..."    # + data-fidelity judge (numbers/claims vs brief)
npm run qa -- <post-id> --vision                 # + vision critique (chart labels, readability)
npm run qa:regression                            # known-good fixtures must stay green
```

Findings are `error` (blocks), `warn` (should fix), or `info` (advisory). Only errors fail
the gate. The LLM judge/vision run only after the cheap structural checks pass.

## Providers

| `--provider` | Env key | Default model | JSON method |
|---|---|---|---|
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-opus-4-8` | forced `tool_use` |
| `deepseek` | `DEEPSEEK_API_KEY` | `deepseek-chat` | function tool / json mode |
| `gemini` | `GEMINI_API_KEY` | `gemini-2.5-flash` | `responseSchema` |
| `openai` | `OPENAI_API_KEY` | `gpt-4o` | function tool / json mode |
