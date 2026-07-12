# Prompt — Remotion video composition

You are writing a Remotion composition (`src/remotion/compositions/*.tsx`).

## Inputs

- A `MotionGraphic` JSON spec validated against `/schemas/motion_graphic.schema.json` — **including its beatMap, mainMotionEvent, eyePath, focusLockMoment, finalFrameTest, AND layout safety fields (`canvas`, `safeMargins`, `layoutZones`, `boundingBoxes`, `motionPaths`, `collisionCheck`, `finalFrameCheck`)**.
- A post component from `src/posts/*` (the static layout source).

## Before writing code (mandatory order)

1. Confirm the spec's **`animationNarrative.purpose`** is a real sentence. If missing or generic, reject.
2. Confirm there is **exactly one `mainMotionEvent`**. If multiple unrelated events, reject.
3. Confirm the **`beatMap`** is present with 3 beats (≤8s) or 5 beats (10–15s). Each beat has `visualState`, `primaryFocus`, `animationPurpose`, `animatedElements`, `easing`, `holdTime`, `mobileReadabilityNote`, `finalFrameContribution`. If any field is empty, reject.
4. Confirm the **`eyePath.description`** + per-beat `focusSequence` is defined.
5. Confirm at least one **`focusLockMoment`** (700–1500ms) exists.
6. Confirm **`finalFrameTest`** booleans are all true (including the new `noOverlap` field).
7. Confirm **`collisionCheck.safeToRender = true`**. If false, reject the spec and revise.
8. Confirm every `motionPath` either has `crossesTextZone = false` OR a non-empty `mitigation` string.
9. Confirm every beat in `beatMap` declares `collisionRisk` and `overlapMitigation`.
10. Confirm **`creatorSignature`** is present with all required collision-check booleans true. Signature must be visible by 1.2s and in the final frame.
11. Confirm **`readingSequence`** is present and `headlineEntranceStyle` is declared. The implementation must match the declared order — element N's `interpolate` ranges must start at or after element N-1's `settledBySec`. Headline must be readable by ≤1.0s.
12. Confirm **`colorRolePlan`** has all three roles declared with semantic meaning + usage strings, and that `colorSequencing` (if present) doesn't activate all accents simultaneously. **Anti-monochrome check** must be true.

Only then implement.

## Hard requirements

1. **Top-of-file comment** stating the one-sentence narrative purpose.
2. Map beats to frame ranges via constants from `@/tokens/motion`: `beat.HOOK_END`, `beat.ORIENTATION_END`, `beat.MECHANISM_END`, `beat.INSIGHT_END`, `beat.MEMORY_ANCHOR_END` (or `shortBeat` for ≤8s).
3. Drive every animated value through `interpolate(frame, [...], [...], { easing: easings.X, extrapolateLeft: "clamp", extrapolateRight: "clamp" })`. Easings from `@/tokens/motion`.
4. Background `#0E1116` (`bgDeepInk`). Wrap in `<AbsoluteFill>`. Import `@/index.css`.
5. **Apply mobile floors to every frame** (`/memory/mobile_first_readability.md`).
6. **Stagger limit ≤7.** Use `staggerMs` ranges from tokens. If >7 elements: cluster and reveal clusters.
7. **Only 1–2 P1 elements animate simultaneously.**
8. **Final takeaway holds ≥2.5–3.5s.** Important labels hold ≥2s. Important text never moves while it should be read.
9. **Focus lock** implemented: dim non-focus elements to ~0.7 opacity for the moment's duration.
10. **Final frame** is thumbnail-ready. Run the `finalFrameTest` mentally before declaring done.
11. **Loop-aware ending.** No hard cut, no blank frame, no mid-motion stop.
12. **Motion paths respect text bounding boxes.** Implement re-routes, delays, masks, or temporary text fades exactly as declared in `motionPaths[].mitigation`. Do not invent un-planned overlaps.
13. **No uncontrolled absolute positioning.** Match the post component's declared bounding boxes.
14. **Drive the creator signature animation.** Compute `signatureEntranceProgress` (0..1, hits 1 around fps × 1.2) and `signaturePulseProgress` (0..1, peaks during the Memory Anchor beat for final-frame emphasis). Pass them to the post component, which forwards them to `CreatorSignature`. The signature must be visible by 1.2s.
15. **No mount-based animation.** Every animated element's layout space is reserved from Beat 1. Drive its appearance via `opacity` / `transform` props derived from `interpolate`, **never** via conditional rendering (`{frame > X && <Element/>}` or `{condition ? <El/> : null}`). Pass design-time absence (no signal, no metrics, etc.) via prop = `undefined` at component construction — never via the animation timeline. Conditional rendering inside flex/grid containers reshuffles sibling widths the moment the element mounts; that's a visual jolt and a hard reject.
16. **Implement the reading sequence in order.** Each element from the spec's `readingSequence` gets a dedicated `interpolate` whose input range starts no earlier than the previous element's `settledBySec`. Per-element entrance style (`fade-y`, `word-by-word`, `typing-terminal`, `scale-in-glow`, `draw-line`, `signal-travel`, `grow`, `count-up`, `count-down`) maps to specific motion patterns — see `memory/motion_timing_sequence_v2.md → Per-element reveal rules`. Final takeaway uses `easeOutExpo` 500–900ms and then **stays still** — no motion behind or across it once it settles.
17. **Sequence accent activation by meaning, not by frame.** Cyan introduces the system in Orientation → amber highlights insight/decision/friction at Insight or Mechanism → violet/mint differentiates secondary layer or marks completion. **Never animate all accents at once.** Each color carries its semantic meaning from `colorRolePlan` — if amber represents "the decision gate," it appears with the decision gate node, not as decorative trim.

## Boilerplate skeleton (5-beat, 15s)

```tsx
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { easings, beat, durationMs, staggerMs } from "@/tokens/motion";
import "@/index.css";

// Narrative: <one sentence — what this animation explains>.
// Main motion event: <one sentence — the single event everything supports>.
// Eye path: <top → middle → bottom | etc.>
// Focus lock: <element @ Xs–Ys with what dims>.

type Props = { /* from the spec */ };

export function MyComposition(props: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Beat 1 — Hook (0–1.2s): headline reveal.
  const hookIntro = interpolate(frame, [0, fps * 0.6], [0, 1], {
    easing: easings.easeOutCubic,
    extrapolateRight: "clamp",
  });

  // Beat 2 — Orientation (1.2–3.0s): system base appears.
  // Beat 3 — Mechanism (3.0–8.0s): main motion event animates.
  // Beat 4 — Insight (8.0–11.5s): takeaway resolves with easeOutExpo.
  // Beat 5 — Memory Anchor (11.5–15.0s): final frame holds for ≥2.5s.

  // Focus lock @ ~9.5–10.5s: non-focus elements interpolate to 0.7 opacity.
  const focusLock = interpolate(
    frame,
    [fps * 9.5, fps * 10.0, fps * 10.5],
    [1, 0.7, 1],
    {
      easing: easings.easeInOutSine,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#0E1116" }}>
      {/* compose post + animated layers */}
    </AbsoluteFill>
  );
}
```

## Register the composition

In `src/remotion/Root.tsx`:

```tsx
<Composition
  id="MyComposition"
  component={MyComposition}
  durationInFrames={Math.round(spec.durationSec * spec.fps)}
  fps={spec.fps}
  width={formats[spec.format].width}
  height={formats[spec.format].height}
/>
```

## Quality check

Run `/prompts/quality_check.md`. **Non-negotiable items**: beat map · one main event · eye path defined · focus lock present · final takeaway hold · final frame readable on mobile · loop-aware ending.

If any fails: revise the spec or the code — do not ship.
