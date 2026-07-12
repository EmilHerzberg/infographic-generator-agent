# 04 — Visual Arsenal (Content-Type-Driven Format Selection)

> Prevents visual monotony. The brand identity is unchanged; this layer governs **which format** the idea gets.

## Core rule

**Do not default to stock-style line charts.** Classify the content type first, then pick the visual format that fits the *idea*, not the format used last time.

## Pre-flight (before any design or code)

```
Content type:           <one of the 20 below>
Primary visual format:  <chosen from that type's recommended set>
Secondary supporting:   <metric strip · annotation callout · signal line · etc.>
Reason format fits:     <one sentence>
Anti-repetition note:   <what recent format this avoids>
Chart used?:            <yes/no> · if yes: <chartJustification>
Story / motion pattern: <Problem→System→Result | etc.>
Mobile readability:     <how the floors are met for this format>
```

If any line is empty: reject and re-plan.

## Chart justification (the allowlist)

A line chart is allowed **only** when the post is about: change over time · trend development · market movement · performance evolution · signal emergence · before/after metric movement.

In every other case, pick a non-chart format. If a chart is used outside this allowlist, `chartJustification` must explain (a) why a chart fits, and (b) why every alternative (workflow / matrix / stack / loop / diagram) would be weaker.

## Anti-repetition rules

- **Never repeat the same primary visual format more than 2 times in a row.**
- If last was a line chart → prefer workflow pipeline · decision tree · architecture stack · comparison matrix · agent loop.
- If last was a workflow pipeline → prefer matrix · stack · control loop · case-study timeline · signal radar.
- If last was an architecture stack → prefer flow diagram · before/after · tool comparison · diagnostic checklist.
- Each week ships **≥4 different visual formats.**
- Charts ≤ **20–30%** of weekly visuals (unless a data/trend week).

**Preferred weekly mix (5 posts):** 1 workflow/process · 1 architecture/system · 1 decision/framework · 1 conceptual/mental-model · 1 case-study/lesson · optional 1 chart/trend.

## The 20 content types → formats

1. **Workflow / Process** — Horizontal Pipeline · Vertical Workflow Stack · Swimlane (Human/AI/System/Customer) · Circular Feedback Loop · Branching Workflow. *Avoid:* too many nodes, tiny labels, spiderweb connections.
2. **Architecture / System Design** — Layered Architecture Stack · Hub-and-Spoke · Modular Block Diagram · Service Map · Control Tower. *Avoid:* every microservice, over-technical for business audiences.
3. **Before vs After** — Split Screen · Transformation Bridge · Collapse Animation · Comparison Table · Friction Reduction Map. *Avoid:* fake exaggerated claims, childish good-vs-bad.
4. **Bottleneck / Failure Point** — Pipeline with Blocked Node · Pressure Gauge · Friction Heatmap · Broken Chain · Dependency Trap. *Avoid:* alarmist red overload.
5. **Decision Framework** — Decision Tree · 2×2 Matrix · Scoring Card · Routing Diagram · Gate System. *Avoid:* too many branches, tiny labels.
6. **Myth vs Reality** — Two-Column Contrast · False Model → Correct Model · Assumption Breakdown · Reality Stack · Claim vs System Diagram. *Avoid:* smug tone, ❌/✅ overuse. (Glitch allowed *only here*.)
7. **Layers / Stack** — Vertical Layer Stack · Maturity Ladder · Capability Stack · Pyramid · Nested Layers. *Avoid:* corporate pyramid feel.
8. **Signal vs Noise** — Noise Cloud → Signal Line · Filtering Funnel · Signal Radar · Highlighted Pattern · Multi-Source Scanner. *Avoid:* too many particles, unreadable clouds.
9. **Business Case / ROI Logic** — Value Equation · Cost Leakage Map · Metric Card Cluster · Leverage Bar · Unit Economics Diagram. *Avoid:* fake/exaggerated revenue claims. Label illustrative metrics.
10. **Tool Comparison** — Comparison Matrix · Tradeoff Slider · Fit Map · Capability Radar · Decision Routing. *Avoid:* declaring one tool universally best, cluttered matrices.
11. **Agentic System** — Agent Loop (Observe→Reason→Act→Evaluate→Update) · Multi-Agent Pipeline · Tool-Use Map · Autonomy Dial · Human-in-the-Loop Gate. *Avoid:* magical agent / humanoid robot imagery.
12. **Data Flow** — Source→Transform→Store→Use · Data Lake / Source-of-Truth · Context Assembly Map · API Flow · Validation Pipeline. *Avoid:* too many fields, dense schemas.
13. **Operating Model** — Operating System Map · Control Loop · Team+AI Responsibility Map · Capability Map · Strategic Flywheel. *Avoid:* generic consulting visuals, meaningless flywheels.
14. **Timeline / Evolution** — Horizontal Timeline · Maturity Curve · Phase Cards · Technology Evolution Map · Adoption Curve. *Avoid:* too many dates, tiny milestones.
15. **Mental Model** — Simple Model Diagram · Metaphor Diagram · Framing Shift · Concept Map · Lens Diagram. *Avoid:* abstract visuals that say nothing.
16. **Checklist / Audit** — Diagnostic Checklist · Audit Panel · Readiness Meter · Risk Checklist · Priority Board (Now/Later/Avoid). *Avoid:* too many items, tiny checkmarks.
17. **Market / Trend Insight** — Trend Wave (no detailed axes) · Shift Map · Pressure Map · Adoption Layer Map · Strategic Inflection Point. *Avoid:* faking precise data, stock-market axes on conceptual content.
18. **Risk / Control System** — Gate System · Control Panel · Safety Layer Stack · Failure Mode Map · Red Team / Green Team Board. *Avoid:* fearmongering, red overload.
19. **Case Study / Build Story** — Build Timeline (Problem→Prototype→Friction→Fix→Lesson) · Debug Trace · Project Anatomy · Lesson Card System · Build vs Learn Map. *Avoid:* bragging, vague storytelling without a concrete lesson.
20. **Conceptual Metaphor** (sparingly) — Control Room · Nervous System · Traffic System · Factory Line · Plumbing/Pipes · Map/Territory. *Avoid:* literal/cartoonish/childish illustrations.

## Content-to-visual routing matrix

| Post idea sounds like | Recommended formats |
|---|---|
| "Most companies misunderstand AI agents" | Myth vs Reality · False Model → Correct Model · Agent Loop · HITL Gate |
| "AI automation removes coordination drag" | Before vs After · Bottleneck Pipeline · Swimlane Workflow · Friction Reduction Map |
| "Small teams can now build more" | Leverage Stack · Capability Stack · Operating Model · Trend Shift Map |
| "Prompts are not the product" | Layers/Stack · Architecture Map · Mental Model Shift · Tool-Use Map |
| "Agents need boundaries" | Gate System · Risk/Control Stack · HITL Flow · Failure Mode Map |
| "Data quality matters" | Data Flow · Validation Pipeline · Source-of-Truth · Context Assembly Map |
| "Build vs buy depends on context" | Decision Tree · 2×2 Matrix · Comparison Matrix · Fit Map |
| "AI changes software economics" | Market Shift Map · Capability Curve · Value Equation · Leverage Bar |
| "I built something and learned something" | Build Timeline · Debug Trace · Project Anatomy · Lesson Card System |
| "Signal matters more than noise" | Filtering Funnel · Signal Radar · Noise Cloud → Signal · Multi-Source Scanner |

**No format-of-convenience:** if a workflow / matrix / stack / loop / decision tree / agent loop / signal radar would explain the idea better than your first pick, switch.
