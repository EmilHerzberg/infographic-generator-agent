# Prompt — Motion graphic / Remotion config generation

You are generating a motion graphic spec for a LinkedIn video.

## Active defaults

- Visual identity: **Design System V2** (`/memory/visual_identity_v2.md`)
- Motion: **Directed System Motion V2** (`/memory/motion_quality_v2.md`)
- Motion timing: **Attention Choreography V2** (`/memory/motion_timing_sequence_v2.md`)
- Visual arsenal: **Visual Content Arsenal V1** (`/memory/visual_content_arsenal_v1.md`)
- Layout safety: **Layout Collision Protection V1** (`/memory/layout_collision_protection_v1.md`)
- Creator identity: **Creator Identity Mark V1** (`/memory/creator_identity_mark_v1.md`) — mandatory `CreatorSignature` (visible by 1.2s and in final frame)
- Mobile-first: hard requirement (`/memory/mobile_first_readability.md`)
- Schema: `/schemas/motion_graphic.schema.json`

## Mandatory pre-flight (in this order, BEFORE any code or even beat map)

1. **Content type** — one of 20 from `visual_content_arsenal_v1.md`.
2. **Primary visual format** — chosen from the recommended formats for that content type. **Not a chart unless the content is genuinely about change-over-time / trend / signal emergence / before-after metric movement.**
3. **Secondary supporting element.**
4. **Reason this format fits the idea** (one sentence — and why this is not just another line chart).
5. **Anti-repetition note** — what recent format(s) this avoids.
6. **Layout safety map** — canvas · safe margins · zones · bounding boxes (**including `creatorSignature`**) · motion paths · collision risks · mitigation. If `safeToRender = no`, revise before continuing. (Full format in `memory/layout_collision_protection_v1.md`.)
7. **Creator signature plan** — variant (compact default) · placement (bottomRight default, bottomLeft fallback) · bounding box · showEmail (no by default) · entrance 0.6–1.2s · idle motion · final-frame emphasis (yes) · collision-check booleans all true. (Spec: `memory/creator_identity_mark_v1.md`.)
7a. **Reading sequence** — declare the order in which the viewer should understand elements (default: headline → system context → mechanism → metric → final takeaway · creator signature continuous). For each element: `order · role · entranceStyle · readableBySec · settledBySec · staysVisible · conceptualReason`. Also declare `headlineEntranceStyle` (default `fade-y`; `typing-terminal` only with a justification — concept must be debugging / system-init / agent-execution / command-line / technical build-story; never twice in a row). Spec: `memory/motion_timing_sequence_v2.md → Sequential attention reveal`.
7b. **Color Role Plan** — three semantic accents. Primary system accent (default `systemCyan` — active path / data / mechanism). Warm contrast accent (`insightAmber` default · `frictionOrange` for friction/risk content). Differentiator accent (`strategicViolet` for abstract/reasoning/alternative · `successMint` for completion/success). For each: state what it means in THIS visual + where it appears. Distribution ~70–80% neutral · 8–12% primary · 5–8% warm · 3–6% differentiator. Confirm anti-monochrome + mobile contrast. Spec: `memory/visual_identity_v2.md → Multi-Accent Color Strategy`.
7c. **Color sequencing across beats** (motion only) — when does each accent first activate? Default ordering: cyan introduces the system in Orientation → amber highlights insight at Insight beat (or marks decision/friction at Mechanism) → violet/mint differentiates secondary layer or marks completion. Never animate all accents simultaneously.
8. **One-sentence narrative purpose** — what the animation explains.
9. **Main motion event** — exactly one.
10. **Story / motion pattern** — from `motion_quality_v2.md`.
11. **Beat map** — 3 beats (≤8s) or 5 beats (10–15s), every field filled. Each beat declares `visibleElements`, `hiddenElements`, `collisionRisk`, `overlapMitigation`. **Beat 1 must include the creator signature in `visibleElements` by 1.2s.**
12. **Eye path** — per-beat focus + what stays still.
13. **Focus lock moment** — at least one, 700–1500ms, with what dims.
14. **Stagger + pause + density curve + loop plan.**
15. **Mobile readability strategy** for this format.

Then output the JSON spec validated against `motion_graphic.schema.json` — including `canvas`, `safeMargins`, `layoutZones`, `boundingBoxes`, `motionPaths`, `collisionCheck`, `autoSimplification`, `finalFrameCheck`, `creatorSignature`, `readingSequence`, `headlineEntranceStyle` (+ `typingEntranceJustification` if applicable), `colorRolePlan`, `colorSequencing`, `accentUsage`, plus all the existing motion + arsenal fields.

## Format-by-topic routing

- Workflow / process → pipeline · swimlane · loop · control map
- Architecture → stack · hub-and-spoke · modular diagram · service map · control tower
- Decision-making → decision tree · 2×2 matrix · gate system · routing diagram · scoring card
- Bottlenecks → blocked pipeline · friction heatmap · dependency trap · broken chain · pressure gauge
- Agents → agent loop · multi-agent pipeline · tool-use map · autonomy dial · HITL gate
- Data → source→transform→store→use · context assembly · API flow · source-of-truth · validation pipeline
- Strategy → operating model · capability map · leverage layers · control loop · flywheel

Full reference: `memory/visual_content_arsenal_v1.md`.

## Anti-repetition

- Same primary visual format max 2 times in a row.
- If last was a line chart → prefer workflow pipeline · decision tree · architecture stack · comparison matrix · agent loop.
- If last was a workflow pipeline → prefer matrix · stack · control loop · case study timeline · signal radar.
- If last was an architecture stack → prefer flow diagram · before/after · tool comparison · diagnostic checklist.

## Hard rules (motion side)

### 5-beat structure (10–15s)
Hook 0.0–1.2 · Orientation 1.2–3.0 · Mechanism 3.0–8.0 · Insight 8.0–11.5 · Memory Anchor 11.5–15.0. Short-form (≤8s): Hook/Problem 0–1.5 · Mechanism 1.5–5.5 · Memory Anchor 5.5–8. Constants in `src/tokens/motion.ts → beat` / `shortBeat`.

### Sequence by meaning
Logic flow, not component position.

### Stagger
small labels 50–80ms · cards 100–160ms · workflow nodes 180–300ms · major sections 400–700ms. **Never >7 in a row** — cluster.

### Anticipation
200–500ms before any important reveal.

### Micro-pauses
After headline 300–500ms · post-problem 400–700ms · post-bottleneck 300–600ms · pre-takeaway 250–500ms · final hold 2500–3500ms.

### Priority
Only 1–2 P1 elements animate at the same time.

### Eye path
Defined before code. Per-beat focus + what stays still. No competing animations on opposite sides simultaneously.

### Focus lock
≥1 moment 700–1500ms with non-focus elements dimmed ~70%.

### Timing variation
≤3 elements share identical duration (unless intentional group).

### Easing — semantic only
card/label/panel reveal → `easeOutCubic` · node activation → `easeOutQuart` · chart growth / signal travel / metric count → `easeInOutCubic` · camera/parallax → `easeInOutSine` · final insight → `easeOutExpo` · key callout / warning → `easeOutBackSubtle` (minimal overshoot) · bottleneck / cost buildup → `easeInCubic` / `easeInQuad`. Import from `src/tokens/motion.ts`.

### Density curve
0–2s low–medium · 2–8s medium–high · 8–12s peak (controlled) · 12–15s simplified. **Ending cleaner than middle.**

### Loop plan
End in a state that loops cleanly. No hard cut, no blank frame, no mid-motion stop.

### One main event
Exactly one. Everything else subordinate.

### Final frame test
Standalone LinkedIn graphic. Topic + takeaway + visual system + brand readable on mobile, inside safe margins, not mid-transition, thumbnail-suitable.

### Effects (semantic, restrained)
Glow only on active/important elements (color = meaning) · blur only for depth · pulse 1–2× max · scan line one pass · particles follow paths · glitch forbidden on normal content · noise 2–5%.

### Camera
Still or 1.00→1.03 zoom (premium 1.06, never beyond 1.10). Pan ≤40px. No rotation.

### Layout collision rules (binding)
- P1 + P2 bounding boxes never overlap. Important text never sits over busy visuals without a dark backing panel.
- **Motion paths must not cross text zones.** If a signal dot / traveling line / entering card would intersect a label or metric, reroute · delay · fade text temporarily (only if not important at that moment) · mask the motion · clip inside a container.
- **Per-beat collision check** in the beat map: every beat declares `collisionRisk` and `overlapMitigation`.
- Density caps: major cards 3–5 · workflow nodes 5–7 · active animated elements 1–3 · annotation labels 3–5. Never 10+ labeled nodes on one mobile frame.
- Auto-simplify when crowded. Never shrink important text.

### Mobile floors apply to every frame
See `memory/mobile_first_readability.md`.

### Numbers
Illustrative metrics labeled `example model` / `conceptual` / `illustrative system model`.

## Self-check

Run `/prompts/quality_check.md`. Sections 1–4 all apply. Non-negotiable items: content-type classified · format-fits-content-type · beat map · one main event · eye path · focus lock · final frame · mobile floors.
