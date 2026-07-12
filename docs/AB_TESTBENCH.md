# A/B Testbench — Path A vs Path B production decision

A modular bake-off to decide which generation engine ships in production. Same briefs, same models,
**both engines**, side-by-side. Emil judges **final video quality himself** (the primary signal); the
recorded metrics (QA pass, generate/render time, tokens, iterations) are supporting depth.

## The two paths

| | **Path A** (`generatePost`) | **Path B** (`generatePostB`) |
|---|---|---|
| What the model emits | a validated `RenderPost` **JSON** spec | a real **React/Remotion TSX** component |
| Who makes pixels | a fixed `PostRenderer` (no AI code runs) | the AI-authored component itself |
| Self-correction | regenerate the spec through the QA gate | write → typecheck → inspect → fix loop |
| Freedom / variance | bounded by the renderer's vocabulary | open — can invent layouts (more variance) |
| Production isolation | **runc** + hardening (multi-tenant-safe, ~2 min) | **gVisor** sandbox (executes AI code, slower) |
| Status today | production default | testbench only (this is the evaluation) |

Both engines are now **callable services with the same input and result shape**
(`{status, qa, iterations, tokens}`), and both render through the same Remotion root
(`src/remotion/generated-index.ts`, which globs `.render.json` for A and `.tsx` for B). That symmetry is
what makes the comparison fair.

## Run it

```bash
npm run dev            # the QA layout inspector (BOTH paths) needs the dev server running
npm run bench          # full matrix: 8 briefs × every model with a key × A & B × video
npm run bench:serve    # open the gallery (prints the URL)
```

Useful flags (`node tools/benchmark.mjs ...`):

- `--briefs reliability-compounds,byok-economics` — only these briefs (slugs from `planning/fixtures/briefs/good/`)
- `--providers anthropic,deepseek` — only these models (default: every provider whose key is in `.env`)
- `--paths A` — only one engine
- `--models anthropic=claude-opus-4-8,openai=gpt-5.5` — pin specific model ids per provider
- `--still` — render stills instead of videos (faster/cheaper smoke test)
- `--resume` — continue a run that was interrupted (skips already-completed cells)
- `--no-gallery` — skip rebuilding the gallery at the end

Outputs land in `out/bench/`:

- `manifest.json` — every cell's result (written incrementally → crash-safe / resumable)
- `<id>.mp4` — the rendered video for each cell
- `specs/<id>.{render.json,tsx}` — the exact spec/component each model produced (archived so the
  Remotion bundle stays tiny between renders)
- `index.html` — the comparison gallery (rows = models, columns = Path A | Path B)

## How models are selected

Every provider in the registry (`tools/lib/model.mjs`) whose key/credentials are present in `.env` is
included automatically: `anthropic`, `openai`, `deepseek`, `gemini`, `compatible`, `vertex`. A provider
with no key is skipped; if a key is present but the call fails, that cell records `provider_error` and the
run continues — so the gallery honestly shows which models made the cut.

## Notes / caveats

- **Isolation in the testbench:** renders here use the direct Remotion render for reliability and speed.
  The production isolation difference (Path A runc ~2 min vs Path B gVisor >7 min on this box, measured in
  Epic 06) is a known production constraint, not re-measured per cell. Factor it into the decision: Path B's
  extra freedom costs real sandbox time.
- **Honest outputs:** a cell that fails QA still renders its video (the model's actual output) so you can
  see *how* it failed, not just that it did.
- **BYOK parity:** the runner uses the `.env` keys for local evaluation; the same services take a per-user
  key in production (`apiKey` param), used in-memory, never logged.
