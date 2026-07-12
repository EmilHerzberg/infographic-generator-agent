# Prompt — React component generation

You are writing a React component for the LinkedIn content system.

## Active defaults

- Visual identity: **Design System V2** (`/memory/visual_identity_v2.md`)
- Layout safety: **Layout Collision Protection V1** (`/memory/layout_collision_protection_v1.md`)
- Creator identity: **Creator Identity Mark V1** (`/memory/creator_identity_mark_v1.md`) — every post component renders `CreatorSignature`
- Mobile-first: hard (`/memory/mobile_first_readability.md`)
- Tokens: `src/tokens/design.ts` (`colors`, `fonts`, `text`, `stroke`, `formats`, `layout`, `spacing`, `zones`, `maxLines`, `density`, `motion`, `brand`) and `src/tokens/motion.ts` (easings, motionRole, duration).
- Tailwind theme exposes: `bg-bg-deep-ink`, `bg-bg-warm-graphite`, `bg-bg-midnight-slate`, `bg-bg-soft-panel`, `text-text-primary/secondary/tertiary`, `accent-cyan/amber/violet/mint/burnt`, `rounded-panel`, `rounded-card`, `shadow-panel`, `shadow-card`, `shadow-glow-cyan`, `shadow-glow-copper`, `bg-grid-faint bg-grid`, `bg-warm-vignette`, `bg-panel-sheen`.

## Rules

- **Always consume tokens.** Never hardcode hex, never inline pixel sizes for type/strokes — pull from `text.*` and `stroke.*`.
- **Mobile floors are non-negotiable.** Reference the floors table in `mobile_first_readability.md` when setting font sizes. For essential text, use the `TextBox` helper (`@/components/primitives/TextBox`) — it warns if `fontSize` is below floor and enforces `maxLines`.
- **Safe margins** — outer padding ≥`layout.safeMargin` (64px). PostFrame already uses `px-16`. Don't override below that.
- **Spacing minimums** — use `spacing.*` tokens: 24/32/40/48/56 px between labels/cards/text-and-visual/headline-and-visual/visual-and-takeaway. Don't tighten these to fit more content — reduce content instead.
- **Density caps** — see `density.*`: ≤5 major cards · ≤7 workflow nodes · ≤4 metric cards · ≤3 active animated elements on screen at once. Cluster or split if more.
- **Max lines** — see `maxLines.*` tokens. TextBox enforces this with line-clamp.
- **No uncontrolled absolute positioning.** If you must use `absolute`, declare the bounding box in code comments (`// bbox: x=64, y=240, w=952, h=420 · P2 · collisionRisk=low`).
- **Primitives that place multiple text elements inside one SVG/container** must declare each text element's internal bbox in a comment at the top of the component, and the math that proves spacing meets the floors (`spacing.betweenTextAndVisual = 40px` between endpoint labels and nodes, `spacing.betweenSmallLabels = 24px` between adjacent labels, etc.). Hardcoded `padding-right`/`padding-left` values must reference `spacing.*` tokens or be derived from them. **Example failure mode**: `Pipeline.tsx` v1 used `padRight = 200` with a 72px endpoint label; the endpoint sat 36px from the last node — 4px short of the 40px floor. Fix was to derive `padRight` from `endLabelEstimatedWidth + spacing.betweenTextAndVisual + buffer`.
- **No text directly over busy visuals** without a dark backing panel (`bg-bg-soft-panel/70` or similar) + ≥16px padding.
- **CreatorSignature is mandatory** in every post/composition. `PostFrame` renders it by default; pass `signatureVariant`, `signaturePlacement`, `signatureEntranceProgress`, `signaturePulseProgress` from your Remotion composition to drive its motion. Never omit, never disable.
- **Layout stability under animation.** Animations drive opacity / transform / scale / color only. **Never toggle conditional rendering, mount/unmount siblings, or animate `width: 0 → auto` inside a flex container** — those reshuffle adjacent layout. If an element appears later in the timeline, reserve its layout space from the start (render it always when its data exists) and drive `opacity: 0 → 1` via a `*Reveal` prop. Use `shrink-0` on slots that should hold their natural width regardless of opacity. **Design-time presence/absence** (this post has a signal, that post doesn't) is decided by passing `undefined` at the component prop level — never inside an `interpolate`.
- **Semantic color usage.** Every visual uses three roles: primary `systemCyan` (or whatever `colorRolePlan.primarySystemAccent` declares) for active data/path/mechanism · warm contrast `insightAmber`/`frictionOrange` for insight/friction · differentiator `strategicViolet`/`successMint` for abstraction/alternative/completion. Use **semantic Tailwind classes** (`text-system-cyan`, `bg-insight-amber`, `shadow-glow-violet`, `text-success-mint`, `text-friction-orange`) in new code where intent matters. Existing `accent-cyan`/`accent-amber`/etc. continue to work but read as less intentional. Never apply an accent without a semantic reason — color is communication, not decoration.
- Composition order: container with `rounded-panel` / `rounded-card`, `shadow-panel` / `shadow-card`, then a panel-sheen overlay if surface, then the content.
- Glow shadows: `shadow-glow-cyan` for data/signal, `shadow-glow-copper` for insight. Use sparingly.
- Backgrounds layer in order: base color → `bg-grid-faint bg-grid` → `bg-warm-vignette` → content.
- Animation: import `easings` and `motionRole`/`easingFor()` from `@/tokens/motion`. Map every element with motion to a role; comment the role in code only if it's non-obvious. **Motion paths must not cross declared text bounding boxes.**
- TypeScript strict. No `any` unless necessary.

## Icon library

Prefer `lucide-react`. Recommended set: `Workflow`, `Bot`, `BrainCircuit`, `Network`, `Activity`, `TrendingUp`, `TrendingDown`, `Search`, `Database`, `Layers`, `GitBranch`, `Gauge`, `ShieldAlert`, `Timer`, `Zap`, `Cpu`, `Route`, `Radar`, `Boxes`, `ChartNoAxesCombined`, `CircleDot`, `Orbit`, `Waypoints`. Stroke width 1.5–1.75. Color = accent meaning.

(`lucide-react` is not currently in dependencies. Install when first needed.)

## Forbidden

- Hardcoded hex (`style={{ color: "#3CF2FF" }}`) — use the token.
- Inline pixel sizes for important text (`text-[11px]` on a label) — use `text` scale.
- New primitives that duplicate existing ones (`Panel`, `MetricCard`, `LineChart`, `SignatureMark`, `PostFrame`). Extend or compose instead.
- Unused props, dead code, premature abstraction.
