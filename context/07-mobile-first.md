# 07 — Mobile-First Readability (Binding)

> Outranks composition aesthetics. Every infographic, carousel slide, and motion graphic must clear these floors.

## The math

A 1080×1350 portrait renders at roughly **390–430px wide** in the LinkedIn (and Reddit) feed on a phone — a **~2.77× downscale**. Every type and stroke decision must clear legibility *after* that downscale.

11px source → ~4px rendered → invisible. **Below the floor → cut it.** If an element can't survive the downscale, it's decoration, not communication: upscale it past the floor or remove it.

## Source-pixel type floors (1080×1350)

| Role | Minimum source | Rendered (~÷2.77) |
|---|---|---|
| Main headline | **54px** (target 68–80) | 20–29px |
| Secondary headline | **36px** | 13px |
| Body text | **28px** | 10px |
| Final takeaway | **38px** | 14px |
| Labels / annotations | **22px** | 8px |
| Metric value (the payoff) | ≥**64px** | ≥23px |
| Chart end-value (the punchline) | ≥**40px** | ≥14px |
| Chart axis / tick labels | ≥**22px** | ≥8px |
| Panel label / signal callout | ≥**22px** | ≥8px |
| Signature mark | 18–22px | 6.5–8px |
| Micro labels / metadata (non-essential only) | **18px** | 6.5px |

**Never use sub-floor text for important content.**

## Stroke / line floors (source px)

- **Chart lines: 5–6px** (≈2px rendered). 2.5px is invisible on phone; V2 default 5px.
- **Signal lines: ≥3px.**
- Grid lines: 1.5px @ ~6% opacity — present but quiet.
- Borders / separators: ≥1px @ ≥6% opacity.

## Text density limits

- Headline: 8–12 words.
- Key insight: ≤18 words.
- Annotation labels: 2–5 words.
- Metric card text: 3–6 words.
- Final takeaway: 12–18 words.

Short phrases · compact labels · 1–2 line statements · strong hierarchy · fewer words per frame.

## Contrast

- Essential text: Warm White `#F4F1EA` on dark panels.
- Secondary: Muted Stone `#B8B2A7`.
- Cool Taupe `#8D93A1` only for non-essential metadata — never load important meaning onto it.
- Text over a complex visual → add a Soft Panel backing at 60–80% opacity.

## Touch-friendly visual scale

Key nodes ≥96×64px · metric cards ≥180×100px · icons 28–40px · status dots ≥12px · chart line stroke ≥4px (V2 uses 5px) · signal lines ≥3px · grid lines subtle but distinct from data.

## Chart rules (mobile)

- Max 2 main data series.
- Direct labels near each line — no separate legend.
- 3–5 tick labels max.
- One key insight point highlighted.
- Line ≥4px · label ≥22px · important values ≥28px.

**If a chart can't read on mobile, simplify it — don't shrink.**

## Diagram rules (mobile)

- Max 5–7 major nodes per frame.
- No spiderweb graphs · no tiny arrows.
- Left-to-right or top-to-bottom flows · clear signal direction · short labels.
- Group complex systems into layers, not exhaustive detail.

**If too complex → split into carousel slides or motion phases.**

## First-second clarity

Within **1 second** the viewer understands: (1) topic area, (2) visual direction, (3) why to keep watching. No slow intro · no logo opener · no abstract animation before the idea.

## Safe margins

Outer minimum **64px** (prefer 72–96px). Never place crucial info in the bottom **80px** — platform chrome competes there.

## Failure conditions (any one → reject and revise)

- Important text below the floor.
- Main idea depends on tiny labels.
- Chart axis text unreadable.
- Diagram has too many small nodes.
- Visual requires zooming.
- Final takeaway disappears too quickly (motion).
- Accent colors reduce readability.
- Background effects interfere with text.
- Mobile viewer can't get the core idea in <3 seconds.

## When in doubt

**Simplify. Remove detail before reducing text size.** When density gets high: split into a carousel, split into motion phases, drop secondary annotations, drop a data series — anything but shrinking type.
