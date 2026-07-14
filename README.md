<p align="center">
  <a href="https://ai-videos.herzberg-dynamics.de/">
    <img src=".github/assets/banner.png" alt="infographic-generator-agent — one line in, one on-brand video out" width="100%">
  </a>
</p>

<p align="center">
  <a href="https://ai-videos.herzberg-dynamics.de/"><b>▶&nbsp; Live showcase — watch real generated videos at ai-videos.herzberg-dynamics.de&nbsp;→</b></a>
</p>

# infographic-generator-agent

**Turn a one-line brief into an on-brand animated video.** An AI agent classifies your idea, composes
the right visualization — charts, diagrams, comparisons — as motion, and renders a vertical
(1080×1350) MP4 with [Remotion](https://remotion.dev). Bring your own model key (DeepSeek, OpenAI,
Anthropic, or Google Gemini). One consistent visual style, every output.

There are two engines:

- **Path A** — the model emits a *validated JSON spec* that a fixed, layout-safe renderer draws. Cheap,
  deterministic, fast (~2 iterations). No model-authored code runs.
- **Path B** — the model *writes a real React/Remotion component* and self-corrects it through a headless
  QA gate (overflow, collisions, mobile floors) until it passes. More creative; it executes
  AI-generated code locally (see [SECURITY.md](SECURITY.md)).

## What it produces

<p align="center">
  <img src=".github/assets/gallery.png" alt="Example outputs — different topics, one consistent visual style" width="100%">
</p>

<p align="center"><sub>Real outputs. Each started as a single line; the agent classified it, picked the visual form, and QA-corrected the layout.</sub></p>

## Quick start

```bash
git clone https://github.com/EmilHerzberg/infographic-generator-agent && cd infographic-generator-agent
npm install
npx playwright install chromium      # the QA inspector renders headlessly
cp .env.example .env                 # then add ONE provider key (see below)
```

**Generate a video from a brief:**

```bash
# Path A (validated JSON → fixed primitives)
npm run generate -- --provider deepseek --brief "Reliability compounds: 99% per step is 81.8% over twenty steps."

# Path B (the agent writes + self-corrects a component) — needs the dev server running (see below)
npm run agent -- --provider deepseek --brief "Reliability compounds: 99% per step is 81.8% over twenty steps."
```

**Inspect / preview a generated post** (two terminals):

```bash
# terminal A — the preview harness the QA inspector also drives
npm run dev
# terminal B — generate, then open the id it prints:
#   http://localhost:5173/?id=<post-id>
```

**Render an MP4:**

```bash
npm run remotion:studio     # interactive
npm run remotion:render     # headless → out/
```

## Providers

You only need the key for the provider you use. Set it in `.env`:

| Provider  | env var              | example model (default)     |
|-----------|----------------------|-----------------------------|
| DeepSeek  | `DEEPSEEK_API_KEY`   | `deepseek-v4-pro`           |
| OpenAI    | `OPENAI_API_KEY`     | `gpt-5.5`                   |
| Anthropic | `ANTHROPIC_API_KEY`  | `claude-opus-4-8`           |
| Gemini    | `GEMINI_API_KEY`     | `gemini-2.5-pro`            |

Override the model with `--model <id>` or the `<PROVIDER>_MODEL` env var. **Reasoning-tier models work
best** — weaker/cheaper models often fail to converge in Path B's self-correction loop.

## How it works

1. **Triage** — a quick check that the brief is one substantive idea (not empty/spam).
2. **Generate** — classify the content, pick a visual form, compose from the primitive library
   (`src/components/primitives/`) — bar/line/area/scatter/histogram/donut/candlestick charts,
   funnels, pipelines, tier stacks, taxonomies, divergences, stat heroes, comparison layouts, …
3. **QA** — a headless inspector (`tools/inspect.mjs`, Playwright) measures the rendered frame against
   hard rules (no overflow, no collisions, mobile-legible type, safe margins) and the agent iterates.
4. **Render** — Remotion composites the animated component to a vertical MP4.

## Make it yours

- **Brand / signature:** edit `brand.config.json` (name, monogram, subtitle, signature, email) — it
  re-skins every generated video and the AI briefing. No code change.
- **Design tokens:** `src/tokens/design.ts` (colors, type scale, motion).
- **Briefing / voice:** `context/*.md` drives what the model aims for.

## Requirements

Node 20+ and a headless Chromium (via `npx playwright install chromium`). See
[CONTRIBUTING.md](CONTRIBUTING.md) for the project layout and the QA tooling.

## License

MIT — see [LICENSE](LICENSE).
