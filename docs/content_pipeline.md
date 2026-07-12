# Content pipeline

End-to-end flow for generating a LinkedIn output.

```
idea
 ▼
content type classification        (memory/visual_content_arsenal_v1.md — 20 types)
 ▼
primary visual format selection    (per-type recommended set; chart only when justified)
 ▼
anti-repetition check              (not same format >2× in a row)
 ▼
LAYOUT SAFETY MAP                  (memory/layout_collision_protection_v1.md)
  · canvas + safe margins
  · zones (top / middle / bottom)
  · bounding boxes for every major element (INCLUDING creatorSignature)
  · motion paths (motion only)
  · collision risks + mitigation
  · safeToRender? (no → revise BEFORE moving on)
 ▼
CREATOR SIGNATURE PLAN             (memory/creator_identity_mark_v1.md)
  · variant (compact default)
  · placement (bottomRight default, bottomLeft fallback)
  · bounding box
  · showEmail (default no)
  · entrance + idle + final-frame motion plan
  · collision-check booleans all true
 ▼
READING SEQUENCE                   (memory/motion_timing_sequence_v2.md — Sequential attention reveal)
  · default order: headline → context → mechanism → metric → final takeaway
  · creator signature continuous
  · per-element entranceStyle + readableBySec + settledBySec
  · headlineEntranceStyle (fade-y default; typing-terminal requires justification)
 ▼
COLOR ROLE PLAN                    (memory/visual_identity_v2.md — Multi-Accent Color Strategy)
  · Primary system accent (default systemCyan) — active path / mechanism
  · Warm contrast accent (insightAmber default · frictionOrange for friction/risk)
  · Differentiator accent (strategicViolet for abstract · successMint for completion)
  · Semantic meaning declared for each
  · Distribution: ~70–80% neutral · 8–12% primary · 5–8% warm · 3–6% differentiator
  · Anti-monochrome + mobile contrast checks pass
  · colorSequencing (motion only): cyan → amber → violet/mint
 ▼
story / motion pattern             (memory/motion_quality_v2.md — 5 patterns)
 ▼
beat map (motion only)             (memory/motion_timing_sequence_v2.md — 3 or 5 beats
                                    · each beat declares collisionRisk + overlapMitigation)
 ▼
JSON spec                          (schemas/* — all the above fields are required)
 ▼
React / Remotion implementation    (src/components/* + src/posts/* + src/remotion/*)
 ▼
final-frame overlap check          (finalFrameCheck booleans all true)
 ▼
mobile readability check           (every frame clears the floors)
 ▼
quality check                      (prompts/quality_check.md — sections 1–5)
 ▼
ship
```

## 1. Idea

Topic from `prompts/weekly_content_plan.md` or ad-hoc. Single-line angle, not a slogan.

## 2. Spec

Generate a JSON object validated against the relevant schema in `schemas/`:

- `schemas/infographic.schema.json` — single still
- `schemas/motion_graphic.schema.json` — Remotion video
- `schemas/carousel.schema.json` — multi-slide

Every spec carries:
- `contentType` (one of 20 from the arsenal)
- `primaryVisualFormat` (e.g. *Swimlane Workflow* · *2x2 Matrix* · *Agent Loop*)
- `formatSelectionReason` (why this format fits, not just another line chart)
- `chartJustification` (only if the format is a chart — required to explain why a chart and why not anything else)
- `visualDiversityTags` + `recentFormatAvoidance` / `antiRepetitionNote`
- The standard design fields (headline, visualization, metrics, accents, etc.)
- `qualityChecklist` booleans

For motion: also `animationNarrative.purpose`, `storyPattern`, `mainMotionEvent` (exactly one), `beatMap` (3 or 5 beats), `eyePath`, `focusLockMoment`, `staggerPlan`, `pausePlan`, `densityCurve`, `loopPlan`, `finalFrameTest`, `easingPlan`, `effectsPlan`.

**Classify-then-format BEFORE design. Beat map BEFORE code.** No Remotion code is written before a complete beat map exists. Each beat has `visualState · primaryFocus · animationPurpose · animatedElements · easing · holdTime · mobileReadabilityNote · finalFrameContribution`. See `memory/motion_timing_sequence_v2.md`.

## 3. React composition

Code lives in `src/posts/<topic>.tsx` and uses primitives from `src/components/`:

- `layout/PostFrame` — 20/60/20 grid, warm-graphite background, vignette, signature.
- `primitives/Panel`, `MetricCard`, `LineChart`, `SignatureMark` — V2-styled, token-driven.

All sizes from `src/tokens/design.ts → text`. All easings from `src/tokens/motion.ts`. Beat timestamps from `src/tokens/motion.ts → beat` (and `shortBeat` for ≤8s). Duration / stagger / pause ranges from `durationMs` / `staggerMs` / `pauseMs`. Never hardcode hex, font sizes, or cubic-bezier values.

## 4. Still / motion rendering

- **Still preview**: `npm run dev` → `http://localhost:5173`. The component renders at preview width via `App.tsx`.
- **Still export**: `npx remotion still src/remotion/index.ts <CompositionId> out/<name>.png --frame=<n>`.
- **Motion preview**: `npm run remotion:studio`.
- **Motion render**: `npx remotion render src/remotion/index.ts <CompositionId> out/<name>.mp4`.

Compositions register in `src/remotion/Root.tsx`. Fonts load in `src/remotion/fonts.ts` so headless Chrome doesn't fall back to serif.

## 5. Quality check

Run `prompts/quality_check.md`. Verify on mobile dimensions (the rendered PNG, viewed at ~390px wide on a phone, must remain legible). If any item fails — especially the mobile floors — simplify.

## 6. Ship

Upload the still/MP4 to LinkedIn. Caption stays in the *technical operator* voice — never hype, never engagement bait. The visual carries the insight; the caption frames the takeaway.
