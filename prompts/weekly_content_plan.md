# Prompt — Weekly content plan

You are planning a week of LinkedIn posts for the *technical operator building intelligent systems* identity.

## Active defaults

- Visual identity: **Design System V2** (`/memory/visual_identity_v2.md`)
- Motion: **Directed System Motion V2** + **Attention Choreography V2** (`/memory/motion_*`)
- Visual arsenal: **Visual Content Arsenal V1** (`/memory/visual_content_arsenal_v1.md`)
- Creator identity: **Creator Identity Mark V1** (`/memory/creator_identity_mark_v1.md`) — every planned post includes signature variant
- Mobile-first: hard requirement (`/memory/mobile_first_readability.md`)

## Plan structure

Return a JSON array of 5 posts (Mon–Fri unless otherwise specified). Each entry:

```json
{
  "day": "Mon",
  "topicArea": "AI workflows | automation systems | software infrastructure | orchestration | technical strategy | AI-native ops",
  "angle": "<specific non-obvious take>",
  "contentType": "<one of 20 from visual_content_arsenal_v1.md>",
  "primaryVisualFormat": "<e.g. Swimlane Workflow · Agent Loop · 2x2 Matrix>",
  "format": "infographic | carousel | motion-graphic",
  "storyPattern": "problem-system-result | input-agent-decision-action | before-bottleneck-after | signal-vs-noise | layers-of-leverage",
  "dominantAccent": "cyan | amber | violet | mint | burnt",
  "headlineDraft": "<8–12 words, strategic insight not slogan>",
  "takeawayDraft": "<12–18 words>",
  "estimatedComplexity": "low | medium | high",
  "antiRepetitionNote": "<what visual format(s) this avoids vs. the prior days>"
}
```

## Visual diversity rules (binding)

Each week ships **≥4 different `primaryVisualFormat` values**. No same primary format more than 2 days in a row.

**Default weekly mix:**
- 1 workflow / process visual
- 1 architecture / system visual
- 1 decision / framework visual
- 1 conceptual / mental model visual
- 1 case study or lesson visual
- *optional* 1 chart / trend visual

**Charts ≤20–30% of weekly visuals** unless the week is explicitly data/trend-focused. A chart `primaryVisualFormat` must be justified by the content (change-over-time · trend · market movement · performance evolution · signal emergence · before-after metric movement). No defaulting to line charts because they're familiar.

**Headline entrance style variety**: across a week, vary `headlineEntranceStyle`. Default `fade-y` for most. `typing-terminal` allowed ≤1 post per week, only when the concept fits (debugging / system-init / agent execution / command-line / technical build-story). Never two consecutive posts with the same typing entrance.

**Color role variety**: every post declares a `colorRolePlan` with three semantic accents. Across a 5-post week, the **differentiator accent should vary** — at least one `strategicViolet` (abstract/reasoning content) and at least one `successMint` (completion/success content). Vary the warm contrast (`insightAmber` default; `frictionOrange` for bottleneck/risk posts). **Anti-monochrome check passes for every post.** Don't ship five cyan-only thumbnails.

## Other constraints

- Format mix: don't ship five infographics. Default for a 5-post week: 3 infographics · 1 motion graphic · 1 carousel.
- Topics: AI workflows / automation / agent orchestration / software architecture / business workflows / operational leverage / technical strategy / AI-native business. Never generic business advice.
- Each post teaches something **useful and uncommon**. Reader reaction target: *"I learned something useful and uncommon."*
- Vary dominant accent across the week — don't ship five cyan-dominant posts.
- High-complexity topics → carousel or motion (never a single static).

## Forbidden

- Motivational themes. Founder-journey storytelling. Generic productivity. Hype list-posts.
- Same content type AND same primary visual format used twice in the same week (variety required).
- Posts that depend on tiny visuals.

After listing the week, add **two short notes**:
1. Which post is the **spine** (strongest insight) and which is the **experiment** (riskier format/angle worth testing).
2. The **diversity snapshot** — which 4+ distinct visual formats are used and which content types they fit.
