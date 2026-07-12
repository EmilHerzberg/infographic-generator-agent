# 08 — Motion (Directed System Motion + Attention Choreography)

> Motion outputs only. **Motion does not decorate — it explains the idea.** Before writing any animation, state its narrative purpose in one sentence. If you can't, the animation shouldn't exist.

**Feel:** premium · calm · technical · warm · editorial · like *a strategic system coming online*. The viewer should never wonder *"what am I looking at?"*

**Forbidden feel:** random/decorative movement · TikTok cuts · aggressive zooms · glitch overload · constant bouncing · template animation · text that moves while it should be read.

## Beat map is mandatory — no code without one

### 5-beat structure (10–15s default, 20s max)

| # | Beat | Time | Job |
|---|---|---|---|
| 1 | **Hook** | 0.0–1.2s | Core tension/insight immediately. Headline visible by 0.5–1.0s. No logo/cinematic intro. |
| 2 | **Orientation** | 1.2–3.0s | Establish the system / problem space. |
| 3 | **Mechanism** | 3.0–8.0s | The actual transformation / causal chain — the main motion event. |
| 4 | **Insight** | 8.0–11.5s | Reveal what it means. Key metric / comparison / takeaway resolves. |
| 5 | **Memory Anchor** | 11.5–15.0s | Final state holds **≥2.5–3s**. Works as a thumbnail. |

### Short-form (≤8s) — 3 beats

Hook/Problem 0–1.5s · Mechanism/Transformation 1.5–5.5s · Takeaway/Memory Anchor 5.5–8s. One idea only.

### Each beat declares

`beatNumber · beatName · timestampStart/End · visualState · primaryFocus · animationPurpose · animatedElements · easing · holdTime · mobileReadabilityNote · finalFrameContribution`. Plus for collision: `visibleElements · hiddenElements · collisionRisk · overlapMitigation`.

## One main motion event

Every video has **exactly one** main motion event (chart line grows · workflow activates input→output · messy nodes collapse into a clean system · bottleneck highlighted and resolved · layers stack into an operating model · noisy data filters into one insight · agent routes input into action). Everything else supports it.

## Story patterns (pick one before scripting)

- **A — Problem → System → Result**
- **B — Input → Agent → Decision → Action**
- **C — Before → Bottleneck → After**
- **D — Signal vs Noise**
- **E — Layers of Leverage**

## Sequence by meaning (not by position)

Animate in the order the **logic** flows, not top-to-bottom unless that matches the logic.

| Topic | Sequence |
|---|---|
| Workflow | input → friction → routing → automation → outcome |
| AI agent | data → model → decision → action → feedback loop |
| Business process | manual handoff → delay → automation layer → faster response |
| Market / data | noise → filter → signal → interpretation → decision |
| Architecture | fragmented tools → shared data layer → orchestration → output |

### Default reading sequence

1. Headline / hook (readable ≤1.0s) → 2. Main system context → 3. Core mechanism → 4. Key metric / insight → 5. Final takeaway (holds ≥2.5–3s). **Creator signature is continuous** — visible by 1.2s, stays throughout. Override the order only when the post's logic dictates it (declare it explicitly).

**Headline entrance styles:** `fade-y` (default, 400–700ms, easeOutCubic) · `word-by-word` (stagger 80–140ms/word, sparingly) · `typing-terminal` (rare — only for debugging / system-init / agent-execution / command-line / build-story; never twice in a row) · `fade-only`.

## Easing — semantic only (import constants; never inline cubic-beziers)

| Use | Easing |
|---|---|
| card / label / panel reveal | `easeOutCubic` (default) |
| node / system module activation | `easeOutQuart` |
| chart growth · signal travel · metric count-up | `easeInOutCubic` |
| camera drift · parallax | `easeInOutSine` |
| final insight / resolution | `easeOutExpo` |
| key callout / warning marker | `easeOutBackSubtle` (minimal overshoot, never bouncy) |
| bottleneck / cost buildup | `easeInCubic` / `easeInQuad` |

## Motion priority levels

- **P1 — Core idea:** headline · main system path · key chart line · final takeaway · key metric · main bottleneck. Strongest motion.
- **P2 — Supporting:** cards · labels · secondary nodes · comparison values. Subtle reveal.
- **P3 — Atmosphere:** grid · ambient glow · texture. Extremely subtle.
- **P4 — Static context:** captions · metadata · separators. Usually no motion.

**Only 1–2 P1 elements animate at the same time.**

## Eye path & focus lock

Define the intended eye path before writing animation (per-beat primary focus + what stays still). Never animate competing elements in opposite areas simultaneously (unless showing a comparison).

**At least one focus lock moment (700–1500ms):** background motion quiets · secondary elements dim ~70% · one element dominates (bottleneck / metric / decision / chart inflection).

## Staggering & pauses

- Stagger: small labels 50–80ms · cards 100–160ms · workflow nodes 180–300ms · major sections 400–700ms. **Never stagger >7 elements in a row** — cluster them.
- Micro-pauses: after headline 300–500ms · after problem 400–700ms · after bottleneck 300–600ms · before final takeaway 250–500ms · final hold 2.5–3.5s.
- Anticipation: 200–500ms before any important reveal.
- Timing variation: no more than 3 different elements share identical duration (unless an intentional group).

## Density curve

0–2s low–medium · 2–8s medium–high · 8–12s peak (controlled) · 12–15s simplified. **The ending is cleaner than the middle.** If dense → split into phases / carousel, never shrink.

## Effects (restrained, semantic)

- **Glow:** only active signals / selected nodes / important chart points / final markers. Color = meaning. Never on everything.
- **Blur:** depth separation only. Never on text.
- **Pulse:** max 1–2 per element, slow + subtle. No constant breathing.
- **Scan line:** one pass, analysis/processing only.
- **Particles:** follow paths, never random floating.
- **Glitch:** forbidden on normal AI content (corruption / before-after contrast only).
- **Noise texture:** 2–5% opacity.

## Camera & parallax

Still or 1.00→1.03 zoom (premium 1.06, never beyond 1.10). Pan ≤40px. No rotation, no spinning, no shake. Parallax: background 1–3px · midground 3–8px · foreground 8–16px (easeInOutSine).

## Layout stability under animation (hard rule)

Animations drive **visual properties only** (opacity · transform · scale · color · filter), **never layout structure** (no mounting/unmounting siblings, no toggling conditional flex children, no growing/shrinking containers that shift siblings).

**The rule:** if an element appears later, its **layout space is reserved from Beat 1** — only its opacity/transform animates in. If it leaves, fade it without removing it from the layout tree. In `beatMap`, "hidden" means opacity 0 (reserved), not unmounted. Conditional rendering inside a flex/grid container reshuffles sibling widths the instant the element mounts — that visual jolt is a hard reject.

## Loop & final-frame

LinkedIn autoplays + loops. End in a state that loops cleanly: final state holds · subtle ambient motion may continue · never end mid-transition. **Forbidden endings:** hard cut · blank frame · ending mid-motion · excessive outro · logo-only ending.

**Final frame test:** someone seeing only the final frame understands the topic, the key takeaway, the visual system, and the brand style. It must be readable · clean · not mid-transition · thumbnail-suitable · mobile-readable · inside safe margins.

## Before writing code (in order)

1. Story pattern. 2. Main motion event (one sentence). 3. Beat map. 4. Eye path. 5. Focus lock moment. 6. Timing + easing plan. 7. Mobile readability check. 8. Implement.
