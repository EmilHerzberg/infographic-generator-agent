# Prompt — Infographic generation

You are generating a single-still LinkedIn infographic.

## Active defaults

- Visual identity: **Design System V2: Warm Technical Editorial** (`/memory/visual_identity_v2.md`)
- Visual arsenal: **Visual Content Arsenal V1** (`/memory/visual_content_arsenal_v1.md`)
- Layout safety: **Layout Collision Protection V1** (`/memory/layout_collision_protection_v1.md`)
- Creator identity: **Creator Identity Mark V1** (`/memory/creator_identity_mark_v1.md`) — mandatory `CreatorSignature` on every output
- Mobile-first readability is a **hard requirement** (`/memory/mobile_first_readability.md`)
- Output schema: `/schemas/infographic.schema.json`

## Mandatory pre-flight (BEFORE any design)

Output **two blocks** in this order. If any field is empty, reject and re-plan.

### Block A — Content + format

```
Content type:           <one of the 20 enums from visual_content_arsenal_v1.md>
Primary visual format:  <e.g. Swimlane Workflow · Hub-and-Spoke · 2x2 Matrix · Agent Loop · Filtering Funnel>
Secondary supporting:   <metric strip · annotation callout · signal line · mini-stack · etc.>
Reason format fits:     <one sentence — why this format vs. alternatives>
Anti-repetition note:   <what recent format(s) this avoids>
Chart used?:            <yes/no> — if yes: <chartJustification>
Story / motion pattern: <Problem→System→Result | etc.>
Mobile readability:     <how the floors hold for this format>
```

### Block B — Layout safety map

```
Canvas:           <width × height · format>
Safe margins:     top 64+ · right 64+ · bottom 64+ · left 64+ · bottomReserve 80
Zones:            top { x,y,w,h · purpose }  ·  middle { ... }  ·  bottom { ... }
Bounding boxes:
  - <id> · <elementType> · x · y · w · h · priority(P1/P2/P3) · textSize · maxLines · collisionRisk
  - ... (every major element — INCLUDING creatorSignature)
Collision risks:
  - staticOverlapRisk:        none | low | medium | high
  - finalFrameOverlapRisk:    none | low | medium | high
  - mobileReadabilityRisk:    none | low | medium | high
Mitigation plan:  <what was moved / removed / clustered / phased>
Auto-simplification applied: <list of actions or "none needed">
Safe to render?:  yes | no  (if no — revise, do not write code)
```

### Block C — Creator signature

```
Variant:                compact | minimal | final | service     (default: compact)
Placement:              bottomRight | bottomLeft                  (default: bottomRight; switch on conflict)
Bounding box:           x · y · w · h                              (must not overlap any other bbox)
Show email:             yes | no                                   (default no; yes only for final/service when space)
Entrance timing:        0.6–1.2s                                   (entrance even on stills is fine to keep parity)
Idle motion:            none | slow-pulse | border-shimmer
Final-frame emphasis:   yes | no                                   (yes by default)
Collision check:        overlapsContent (no) · insideSafeMargins (yes) · mobileReadable (yes) · finalFrameVisible (yes) · safeToRender (yes)
```

### Block D — Color Role Plan

```
Primary system accent:    systemCyan
  · means:                <what cyan represents in THIS visual — e.g. "active automation path">
  · appears at:           <where — e.g. "workflow nodes 1–7, signal dot, header eyebrow underline">
Warm contrast accent:     insightAmber  OR  frictionOrange  (the latter when content is friction/risk)
  · means:                <what amber/orange represents — e.g. "the decision gate at step 4">
  · appears at:           <where — e.g. "signal callout, decision gate node, final takeaway emphasis">
Differentiator accent:    strategicViolet  OR  successMint
  · means:                <violet = abstraction/reasoning/alternative · mint = completion/success>
  · appears at:           <where>
Distribution:             ~70–80% neutral · 8–12% primary · 5–8% warm contrast · 3–6% differentiator
Mobile contrast check:    primary ✓ · warm ✓ · differentiator ✓
Anti-monochrome check:    ≥2 of 3 roles visibly used with semantic meaning ✓
```

Then produce a JSON object that validates against `infographic.schema.json` — including `canvas`, `safeMargins`, `layoutZones`, `boundingBoxes`, `collisionCheck`, `autoSimplification`, `finalFrameCheck`, `creatorSignature`, `colorRolePlan`, plus the existing content/format fields.

## Visual format selection (binding)

The system **must not default to stock-style line charts.**

Charts are allowed **only** when the post is about: change over time · trend development · market movement · performance evolution · signal emergence · before/after metric movement. Any other case → pick a non-chart format.

Format-by-topic routing:
- **Workflow / process** → pipeline · swimlane · loop · control map
- **Architecture** → stack · hub-and-spoke · modular diagram · service map · control tower
- **Decision-making** → decision tree · 2×2 matrix · gate system · routing diagram · scoring card
- **Bottlenecks** → blocked pipeline · friction heatmap · dependency trap · broken chain · pressure gauge
- **Agents** → agent loop · multi-agent pipeline · tool-use map · autonomy dial · HITL gate
- **Data** → source→transform→store→use · context assembly · API flow · source-of-truth diagram · validation pipeline
- **Strategy** → operating model · capability map · leverage layers · control loop · flywheel

Full per-type format set + best motion + avoid rules: `memory/visual_content_arsenal_v1.md`.

## Anti-repetition rules

- **Never repeat the same primary visual format more than 2 times in a row.**
- Use `recentFormatAvoidance` to record what the previous 1–2 outputs used, and `antiRepetitionNote` to explain how this output differs.
- Weekly mix target: 1 workflow · 1 architecture · 1 decision/framework · 1 conceptual/mental model · 1 case study/lesson · optional 1 chart/trend. Charts ≤20–30% of weekly visuals (unless data/trend week).

## Hard rules

- Default format `portrait` (1080×1350).
- Headline: 8–12 words max. Reads as strategic insight, not slogan. Source ≥54px (target 68–80).
- Eyebrow: ≤6 words, mono uppercase, `textTaupe` or `accentAmber`. ≥24px source.
- Body / annotations ≥22px source; metric values ≥64px; chart end-values ≥40px.
- One dominant accent + one supporting + ≤1 state per frame. Cyan=data, Amber=insight, Violet=strategic, Mint=success, Burnt=caution.
- Outer margin ≥64px (prefer 72–96). Nothing essential in bottom 80px.
- Background: warm graphite + grid + warm vignette + 2–5% noise. Never flat black.
- Charts (if justified): max 2 series · direct labels · stroke ≥4px.
- Diagrams: ≤5–7 major nodes. Top-down or left-right. Short labels.
- Signature: `EH / AI SYSTEMS`, bottom-right, ≥18px, `textTaupe @ 80%`.

## Layout collision rules (binding)

- Bounding boxes of P1 + P2 elements **must not overlap**.
- Important text **never sits over busy visuals** without a dark backing panel + ≥16px internal padding.
- **Spacing minimums:** 24px between small labels · 32px between cards · 40px between text and visual elements · 48px between headline and main visual · 56px between main visual and final takeaway.
- **Max lines:** headline ≤2 · subtitle ≤2 · metric label ≤2 · annotation ≤2 · final takeaway ≤2.
- **Density caps (simultaneous on-screen):** major cards 3–5 · workflow nodes 5–7 · annotation labels 3–5 · metric cards 2–4 · chart labels 2–4. Never 10+ labeled nodes at once.
- If crowding is expected → **auto-simplify** (in order): shorten text · remove non-essential labels · cluster nodes · replace labels with icons · split into phases · move to caption · convert to carousel.
- **Never solve crowding by shrinking text below the mobile floor.**

## Forbidden

- Hype copy · generic LinkedIn phrasing · engagement bait · fake stats unless labeled illustrative.
- Cold cyberpunk · neon overload · crypto/gamer aesthetics · AI-robot imagery · Canva templates.
- More than 2 accents heavy in one frame.
- Important text below the mobile floor.
- Solving overcrowding by shrinking. If too dense → simplify or split.
- **Defaulting to a line chart when the content type isn't change-over-time / trend / signal / before-after metric movement.**
- **Uncontrolled absolute positioning** without a declared bounding box.
- **Text overflowing its container** or running into another bounding box.

## Icons + emojis

Prefer `lucide-react` icons. Emojis only when they clarify faster than text or replace a longer label. Max 1–3 per graphic. Never as decoration. Never in main headline unless topic is intentionally light.

## Self-check

Run `/prompts/quality_check.md`. Sections 1, 2, and 4 (visual diversity) all apply.
