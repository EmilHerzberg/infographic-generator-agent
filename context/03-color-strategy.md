# 03 — Color Strategy (Multi-Accent Semantic System)

> Anti-monochrome. Every visual uses **three color roles** — not one cyan-on-dark monochrome, not five-color chaos. The roles are **semantic, not decorative**.

## The three roles

1. **Primary System Accent** — active data flow, main signal, primary chart line, selected system path, active node, core mechanism.
   - **Default: System Cyan `#59D8E6`**

2. **Warm Contrast Accent** — key insight, important emphasis, bottleneck, friction, final-takeaway highlight; warmth against the cool technical base.
   - **Default: Insight Amber `#E7A95A`**
   - **Friction/risk content: Friction Orange `#D9864D`**

3. **Differentiator Accent** — secondary concept, alternative path, comparison layer, strategic abstraction, success state, third category, special marker.
   - **Default: Strategic Violet `#8E7CC3`** (conceptual / strategic / reasoning / abstract)
   - **Alternative: Success Mint `#6ED3A3`** (success / completion / resolved / positive)

## Distribution (per frame)

| Layer | Coverage |
|---|---|
| Dark neutral base | **70–80%** |
| Primary accent | **8–12%** |
| Warm contrast accent | **5–8%** |
| Differentiator accent | **3–6%** |

One accent leads · one warm accent contrasts · one differentiator adds depth. **Never all three at equal weight. Hierarchy, not equality.**

## Color meaning (canonical)

| Color | Hex | Meaning |
|---|---|---|
| System Cyan | `#59D8E6` | system signal · data flow · active path · technical clarity · primary mechanism |
| Insight Amber | `#E7A95A` | insight · attention · value · strategic emphasis · important conclusion |
| Friction Orange | `#D9864D` | friction · bottleneck · risk · unresolved problem · caution |
| Strategic Violet | `#8E7CC3` | abstraction · reasoning layer · alternative path · strategy · conceptual relationship |
| Success Mint | `#6ED3A3` | completion · success · safe state · positive outcome · resolved flow |

## Default pairings by content type

| Content type | Primary | Warm contrast | Differentiator |
|---|---|---|---|
| Workflow / Automation | System Cyan | Insight Amber | Success Mint |
| Bottleneck / Failure / Risk | System Cyan | **Friction Orange** | Insight Amber or Strategic Violet |
| Strategy / Mental Model | System Cyan | Insight Amber | Strategic Violet |
| Agentic System | System Cyan | Insight Amber | Strategic Violet or Success Mint |
| Data / Signal vs Noise | System Cyan | Insight Amber | Strategic Violet |
| Business Case / ROI | System Cyan | Insight Amber | Success Mint |
| Comparison / Decision | System Cyan | Insight Amber | Strategic Violet or Success Mint |

## Mandatory pre-flight color role plan

Declare before generating ANY visual:

```
Color Role Plan:
  Primary system accent:   <color> · means <X> · appears at <where>
  Warm contrast accent:    <color> · means <X> · appears at <where>
  Differentiator accent:   <color> · means <X> · appears at <where>
  Distribution:            70–80% neutral · 8–12% primary · 5–8% warm · 3–6% differentiator
  Mobile contrast check:   primary ✓ · warm ✓ · differentiator ✓
  Anti-monochrome check:   >1 accent used with semantic meaning ✓
```

**Bad:** "Use cyan, amber, and violet because they look cool."
**Good:** "Cyan = the active automation path; amber = the decision gate at step 4; violet = the reasoning layer that routes the agent's decision."

## Anti-monochrome rule — a visual FAILS quality if:

- Only cyan is used, or only blue/cyan tones define the whole system.
- Warm contrast accent is missing.
- Differentiator accent is missing.
- Accents are used decoratively without semantic meaning.
- Accent colors are too subtle to notice on mobile.

If the design feels too cold: raise amber presence slightly · add a warm panel glow · use amber for the final insight · balance with warm-white / muted-stone text.

## Restraint rule

Multi-accent ≠ colorful chaos. **Forbidden:** rainbow palettes · equal-weight accents · random neon combinations · excessive gradients · too many glowing elements.

## Friction/risk override

For `bottleneck / failure point` and `risk / control system` content, warm contrast = **Friction Orange** (not amber). Cyan still leads as the intended-flow color.

## Motion color sequencing (motion only)

Sequence accents by meaning over time — **never animate all accents at once**: Cyan introduces the system → Amber appears at insight / decision / friction → Violet appears when revealing abstract / strategic / reasoning layers → Mint appears at resolution / completion → Friction Orange appears when a bottleneck or risk is highlighted.
