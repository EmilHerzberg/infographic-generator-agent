# 05 — Layout Safety (Collision Protection)

> **Every visual must be readable before it is beautiful.** No text · label · metric · card · node · annotation · icon · or moving element may overlap another meaningful element. If there's not enough space — **reduce complexity. Never shrink important text below the mobile floor.**

## Layout zones (1080×1350 portrait — default)

| Zone | Y range | Purpose |
|---|---|---|
| Top | 64–300 | Headline · eyebrow · hook |
| Middle | 320–1030 | Main visual system · chart · diagram · pipeline |
| Bottom | 1050–1280 | Takeaway · metric strip · signal · signature |
| Reserve | 1280–1350 | Platform UI competes — no essential content |

Other formats:
- **Square 1080×1080:** Top 64–220 · Middle 240–860 · Bottom 880–1000 · Reserve 1000–1080.
- **Landscape 1920×1080:** Left input 80–600 · Middle mechanism 620–1300 · Right takeaway 1320–1840.

Elements should not cross zone boundaries unless intentionally verified collision-free.

## Safe margins

- Minimum outer: **64px** every side. Preferred: **72–96px**.
- Bottom reserve: **80px** — no important text/icons.
- Animated elements must stay inside the safe frame.

## Layout safety map (MANDATORY before any code)

```
Canvas:           <width × height · format>
Safe margins:     top X · right X · bottom X · left X · bottom-reserve X
Zones:            top { x,y,w,h } · middle { ... } · bottom { ... }
Bounding boxes:
  - <id> · <type> · x · y · w · h · priority · textSize · maxLines · collisionRisk
  - creatorSignature · creatorSignature · x · y · w · h · P2 · — · — · collisionRisk
Motion paths (motion only):
  - <id> · element · from(x,y) · to(x,y) · crossesTextZone · mitigation
Collision risks:  static / animated / final-frame / mobile-readability — each assessed
Mitigation plan:  what was moved / removed / clustered / phased
Safe to render?:  yes / no
```

If `safeToRender` is **no** — revise. Do not proceed to code.

**The `creatorSignature` bounding box is mandatory in every layout safety map** and participates in all collision checks. If it overlaps content: switch corner (bottomRight ↔ bottomLeft) · switch to `minimal` variant · simplify content. **Never remove the signature.**

## Per-element bounding box fields

```
id            <unique>
elementType   headline | eyebrow | subtitle | visualization | metricCard | annotation | signal | signature | callout
x, y          top-left, source px
width, height source px
priority      P1 | P2 | P3 | P4
textSize      source px (must clear the mobile floor)
maxLines      1 | 2
collisionRisk none | low | medium | high
```

**No-overlap rule:** bounding boxes of P1 + P2 elements must NOT overlap. P3 (atmosphere) may sit behind, never on top of P1/P2 text.

## Overlap resolution (in priority order)

1. Move the lower-priority element.
2. Reduce the number of labels.
3. Split the sequence into phases.
4. Use callout lines/leaders instead of inline labels.
5. Hide secondary labels temporarily during motion.
6. Move details into a second slide / phase.
7. Simplify the chart/diagram.
8. **Last resort:** never shrink important text below the floor.

## Minimum spacing

Small labels **24px** · cards **32px** · text↔visual **40px** · headline↔visual **48px** · visual↔takeaway **56px**.

## Text-over-visual rule

Do not place important text over charts · active signal lines · node clusters · particle fields · busy grids · glowing paths · animated elements. If text MUST sit over a visual: add a dark backing panel (Soft Panel `#202735` @ 70–85%) · increase contrast · ≥16px internal padding · pause active motion behind the text during reading.

## Max line counts

Headline ≤2 · subtitle ≤2 · metric label ≤2 · annotation ≤2 · final takeaway ≤2. Every text container declares `maxWidth · maxLines · lineHeight · padding · overflow`. **Never allow text to overflow its container.** If over the limit: rewrite shorter · split into beats · move detail to caption · replace with icon.

## Density limits (visible at once)

Major cards 3–5 · workflow nodes 5–7 · annotation labels 3–5 · metric cards 2–4 · chart labels 2–4 · active animated elements 1–3. **Never 10+ labeled nodes at once on a mobile frame.**

## Auto-simplification (apply in order when crowded)

1. Shorten text. 2. Remove non-essential labels. 3. Group nodes into clusters. 4. Replace labels with icons. 5. Split into phases. 6. Move detail to caption. 7. Convert to carousel. 8. Reduce visual complexity.

**Never solve crowding by:** shrinking text below floor · reducing margins · stacking labels tightly · allowing overlap · hiding overflow of important text.

## Animated collision (motion only)

Collision must be checked **across time, not just the first frame.** Animated elements (signal dots · traveling lines · entering cards · expanding nodes · particles) must NOT pass through headline · labels · metric cards · final takeaway · chart labels · key annotations. If a motion path intersects a text zone: reroute · fade the text only if non-essential at that moment · delay the motion until the text clears · move the text to a safe zone · clip/mask the animation inside a container.

Each beat declares: `visibleElements · hiddenElements · animatedElements · primaryFocus · collisionRisk · overlapMitigation`.

## Final frame rule

The final frame must be **fully collision-free**: no element mid-transition · no text overlap · nothing covering the final takeaway · works as a standalone mobile-readable graphic.

## Dynamic layout (React / Remotion)

Use CSS grid · flexbox · fixed zones · max-width constraints · reusable wrappers. Avoid uncontrolled absolute positioning, random x/y, dense node graphs with many labels, animating cards from off-screen through other elements, letting dynamic text determine uncontrolled height. Any absolute element needs a declared bounding box checked against safe zones with ≥24px padding from neighbors.

**Primitive-internal audit:** there is no runtime collision engine. Any primitive placing ≥2 text elements inside one SVG/container must declare each element's internal bbox in a comment and prove spacing meets the floors (`40px` between an inline label and a visual; `24px` between adjacent labels). Derive padding from spacing tokens, never hardcode a value that lands short of a floor.
