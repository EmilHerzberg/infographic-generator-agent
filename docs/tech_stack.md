# Tech stack

| Layer | Tool |
|---|---|
| Build | Vite 5 (React 18 + TS, ESM) |
| Styling | Tailwind 3 + PostCSS (tokens → utility classes via `tailwind.config.ts`) |
| Motion (in-page) | Framer Motion 11 (available; not yet used in current compositions) |
| Motion (video) | Remotion 4 — composition registry in `src/remotion/Root.tsx` |
| Remotion Tailwind | `@remotion/tailwind` via `enableTailwind()` in `remotion.config.ts` |
| Fonts | `@remotion/google-fonts` (Space Grotesk · Inter · Plus Jakarta Sans · JetBrains Mono) |
| Icons (recommended) | `lucide-react` (install when first used) |
| Optional charting | D3.js (not currently used; the SVG `LineChart` is bespoke) |
| Typecheck | `tsc --noEmit` (`npm run typecheck`) |

## Path alias

`@/` → `src/` — wired in `vite.config.ts`, `tsconfig.json` (`paths`), and `remotion.config.ts` (Webpack `resolve.alias`). All three need to agree if the alias is added or changed.

## Tokens

- `src/tokens/design.ts` — `colors`, `fonts`, `formats`, `layout` (radius), `motion` (duration, easing array), `text` (typography scale), `stroke`, `brand`. All component sizing reads from here.
- `src/tokens/motion.ts` — `easings` (Remotion bezier objects), `easingBezier` (raw arrays), `motionRole` (semantic → easing name), `duration`, `parallax`, `camera`, `storyPattern`, **and the Attention Choreography layer**: `beat` (5-beat timestamps), `shortBeat` (3-beat timestamps), `durationMs` ranges, `staggerMs` ranges, `pauseMs` ranges, `anticipationMs`, `focusLockMs`, `motionPriority`, `motionPriorityLimit`.

## Conventions

- Strict TS. `noEmit` build (Vite owns the bundle).
- No hardcoded hex outside `design.ts`.
- No inline pixel sizes for important text — use `text` scale.
- Easings imported from `motion.ts`, never inline cubic-bezier.
- Each post in `src/posts/<topic>.tsx` (+ optional `<topic>.data.ts`). Motion variant in `src/remotion/compositions/<topic>.tsx`.
- Visual format selection (per post): classify content type first using `memory/visual_content_arsenal_v1.md`. Add new primitives in `src/components/primitives/` as new visual formats are adopted (Pipeline, Swimlane, Stack, Matrix, DecisionTree, AgentLoop, HubAndSpoke, FilteringFunnel, Heatmap, Timeline, MetaphorFrame).

## Format defaults

| Format | Size | Use |
|---|---|---|
| portrait | 1080×1350 | LinkedIn feed default |
| landscape | 1920×1080 | video |
| square | 1080×1080 | diagrams only |
