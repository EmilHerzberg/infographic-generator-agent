# Components

V2 primitives. All token-driven — never hardcode hex or pixel literals for important text.

## Layout

- **`layout/PostFrame`** — the canvas. 20/60/20 grid, format-aware (`portrait | square | landscape`), warm-graphite background with subtle grid + warm vignette, signature in bottom-right.

  Props: `{ eyebrow?, headline, visualization, summary?, signal?, format?, signature? }`.

## Primitives

- **`primitives/Panel`** — labeled surface for visualizations. `rounded-panel`, layered chrome, optional mint status dot. Children render in a centered flex column.
- **`primitives/MetricCard`** — `{ label, value, delta?, accent? }`. `accent` ∈ `cyan | amber | violet | mint | burnt` — color carries meaning per V2 accent semantics.
- **`primitives/LineChart`** — SVG, animatable via `reveal: 0..1` (path-length stroke-dashoffset trick). Series: `{ label, values, color, endValueLabel? }`. End-value labels are first-class — sized for mobile (≥40px source).
- **`primitives/Pipeline`** — SVG, horizontal workflow with N nodes, `signalProgress` 0..1, `nodesReveal` 0..1, `endpointReveal` 0..1. Token-driven sizing.
- **`primitives/CreatorSignature`** — mandatory animated creator identity mark. EH monogram + name + subtitle (+ optional email). Variants: `compact | minimal | final | service`. Placement: `bottomRight | bottomLeft`. Props include `entranceProgress` and `pulseProgress` for Remotion-driven motion.
- **`primitives/SignatureMark`** — legacy `EH / AI SYSTEMS` mono mark. Superseded by `CreatorSignature` (kept for backwards compatibility).
- **`primitives/TextBox`** — text container that enforces `maxLines` (line-clamp) and warns if `fontSize` falls below the mobile floor for its `role` (headline · subtitle · body · label · annotation · metricValue · finalTakeaway). Use this for essential text.

## How to add a new primitive

1. Read `/prompts/react_component.md` (token rules) and `/memory/mobile_first_readability.md` (floors).
2. Consume sizes from `src/tokens/design.ts → text` and strokes from `stroke`.
3. Use Tailwind theme classes for color (`text-accent-amber`, `bg-bg-soft-panel`, etc.), not inline `style={{ color }}`.
4. If the primitive will animate in Remotion, accept a `reveal` prop (0..1) and drive opacity / scale / dash-offset from it.
5. Add it to this list.

## How to add a new post

1. `src/posts/<topic>.tsx` — composes `PostFrame` + primitives.
2. (optional) `src/posts/<topic>.data.ts` — series, copy, constants.
3. `src/App.tsx` swaps the import to preview.
4. `src/remotion/compositions/<topic>.tsx` — wraps the post in `AbsoluteFill`, drives `reveal` through `interpolate` with easings from `@/tokens/motion`. **Beat map first, then code.** Comment the animation's narrative purpose, main motion event, and eye path at the top of the file.
5. Register in `src/remotion/Root.tsx`.

## Before writing any new post or composition

1. **Classify content type** — one of 20 from `memory/visual_content_arsenal_v1.md`.
2. **Pick primary visual format** from the recommended set for that content type. Line charts only when the content is genuinely change-over-time / trend / signal emergence / before-after metric movement.
3. **Anti-repetition note** — what recent format(s) this avoids.
4. **Layout safety map** — canvas, safe margins (`layout.safeMargin`/`preferredMargin`), zones (`zones.portrait`/`square`/`landscape`), bounding boxes for every major element with `priority` + `textSize` + `maxLines` + `collisionRisk`, and (for motion) motion paths with `crossesTextZone` + `mitigation`. See `memory/layout_collision_protection_v1.md`.
5. Read `/prompts/infographic.md` (stills) or `/prompts/motion_graphic.md` + `/prompts/remotion_video.md` (motion).
6. **Color Role Plan** — declare three semantic accents (primary `systemCyan` · warm `insightAmber`/`frictionOrange` · differentiator `strategicViolet`/`successMint`) with what each means in THIS visual. Use semantic Tailwind utilities (`text-system-cyan`, `bg-insight-amber`, `text-strategic-violet`, `text-success-mint`, `text-friction-orange`) in new code. See `memory/visual_identity_v2.md → Multi-Accent Color Strategy`.
7. For motion: produce a **beat map** (3 beats for ≤8s, 5 beats for 10–15s) per `memory/motion_timing_sequence_v2.md`. Each beat declares `collisionRisk` and `overlapMitigation`.
8. Validate the spec against the matching schema — `contentType`, `primaryVisualFormat`, `formatSelectionReason` (and `chartJustification` if applicable), plus the new layout fields (`canvas`, `safeMargins`, `layoutZones`, `boundingBoxes`, `collisionCheck`, `finalFrameCheck`), `colorRolePlan`, `creatorSignature`. Motion also requires `motionPaths`, `beatMap`, `mainMotionEvent`, `eyePath`, `focusLockMoment`, `finalFrameTest`, `readingSequence`, `headlineEntranceStyle`, `colorSequencing`.
8. Use sizing from `@/tokens/design → text`; spacing from `spacing.*`; zone bounds from `zones.*`; density caps from `density.*`; easings + timing from `@/tokens/motion`. For essential text, wrap with `TextBox` to get line-clamping + floor warnings.
9. Run `/prompts/quality_check.md` (sections 1–5) before declaring done. `collisionCheck.safeToRender` must be true.

## Adding primitives for new visual formats

The current primitives (`PostFrame`, `Panel`, `MetricCard`, `LineChart`, `SignatureMark`) cover chart-driven posts. As the system adopts non-chart formats, expect to add primitives like: `Pipeline`, `Swimlane`, `Stack`, `Matrix`, `DecisionTree`, `AgentLoop`, `HubAndSpoke`, `FilteringFunnel`, `Heatmap`, `Timeline`, `MetaphorFrame`. When adding one, follow `/prompts/react_component.md` — token-driven, mobile-floor-safe, no hardcoded hex or pixel sizes.
