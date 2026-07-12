# Ship Plan — make this a downloadable, multi-provider content generator

Goal: someone downloads this project, adds their own AI API key (Claude **or**
DeepSeek **or** Google AI Studio **or** any OpenAI-compatible endpoint), gives it
post content, and the AI produces an on-brand LinkedIn/Reddit asset using the same
design system, briefing, and rules the original operator uses.

## Two generation architectures (both shipped / planned)

| | **Path A — JSON default** | **Path B — TSX power mode** |
|---|---|---|
| What the AI emits | Schema-valid JSON (`schemas/*.schema.json`) | React/Remotion component code |
| Who renders | Fixed, pre-built components | The generated code itself |
| Works on | Claude, DeepSeek, Gemini, OpenAI-compatible | Claude-tier models (via the bundled Claude CLI) |
| Safety | High — no AI code executed locally | Executes model-written code; trusted use only |
| Expressiveness | Bounded to existing components | Unbounded |
| Status | **Built** (`tools/generate.mjs`) | Works today via Claude CLI + `prompts/` |

The JSON-driven design is what makes this provider-agnostic — content lives in
data, not JSX, so any decent LLM can fill the structure. TSX mode stays as the
"advanced custom layout" path for Claude.

## The portable briefing bundle (`context/`)

The knowledge that used to live only in the operator's agent memory is extracted
into `context/*.md` (10 files, ~9k words) + `manifest.json`. The generator
concatenates them (substituting `{{BRAND_*}}` from `brand.config.json`) and injects
the result as the LLM system prompt. Swap `brand.config.json` to re-skin the whole
system — the design rules stay, the identity changes.

## What's built (Milestone 1 — feasibility proof)

- `context/` briefing bundle + `manifest.json` (placeholdered).
- `brand.config.json` — brand values, swappable.
- `.env.example` — key slots per provider.
- `tools/generate.mjs` — provider-agnostic CLI.
  - `tools/providers/` — `anthropic`, `deepseek`/`openai` (OpenAI-compatible),
    `gemini`. Each forces schema-valid JSON natively (tool/function calling or
    `responseSchema`).
  - `tools/lib/context.mjs` — briefing assembly + brand substitution.
  - `tools/lib/validate.mjs` — dependency-free JSON-Schema-subset validator.
- `npm run generate -- --provider deepseek --brief "..."` → validated `<id>.json`.

Verified offline: briefing assembles, placeholders substitute, validator catches
missing-required + bad-enum. Network call needs the user's API key.

## The key gap (Milestone 2 — the renderer)

`schemas/infographic.schema.json` is a rich *spec/plan* format, but
`visualization.data` is currently `unknown`: today each post is a bespoke
`src/posts/*.tsx` consuming a typed `*.data.ts`. **There is no universal
"schema-valid JSON → pixels" renderer yet.** So Path A currently outputs a
*validated plan*; turning that plan into a PNG/MP4 still needs either:

- **(a)** Claude CLI / TSX power mode (works today), or
- **(b)** a generic renderer that maps each `visualization.kind`
  (`pipeline`, `matrix`, `comparison`, `chart`, `stack`, `timeline`, …) to the
  existing primitives (`Pipeline`, `ComparisonMatrix`, `LineChart`, `MetricCard`,
  `DecompBar`, `RangeBars`, `ClaimList`) and lays them out from the bounding-box
  map. **This is the main remaining build for true end-to-end Path A.**

Recommended next step: define concrete `data` shapes per `kind`, build a
`<PostRenderer post={json} />` that switches on `kind`, register it as a Remotion
composition with `defaultProps` fed from the JSON, then render via the existing
`remotion:render` pipeline. Start with 2–3 kinds (pipeline, comparison, stack).

## Milestone 3 — showcase + distribution

- Static **gallery / playground** site (Vite already builds to `dist/`): live
  in-browser JSON editor ↔ live composition preview. Deployable to any host
  (your own server — it's a static bundle; `npm run build` → upload `dist/`).
- **Download/open-source packaging**: `git init`, gitignore the committed
  compiled `.js` next to `.tsx` sources, keep `brand.config.json` + `context/`
  as the swappable identity layer, bundle the Claude CLI setup as the power path.
- Optional **MP4-render backend** (only if you want hosted "type JSON → download
  video"): wrap `remotion:render` in a small Node endpoint. Not needed for the
  static showcase.

## Hosting note

The showcase is a static Vite bundle — Vercel / Netlify / GitHub Pages / your own
VPS all work identically. Only an optional MP4-render service needs a running Node
process. No lock-in either way.
