# Prompt — Quality check

Run this checklist before finalizing any infographic, carousel slide, or motion graphic. **Every relevant item must be `true`.** If any item is `false`, revise — do not ship.

Items 1–15 apply to all outputs. Items 16–23 are mobile-first hard floors (all outputs). Items 24–43 apply to motion graphics only — the **Attention Choreography** layer. Items 44–58 are **Visual Diversity** — content-type-driven visual arsenal (all outputs). Items 59–78 are **Layout Collision Protection** — all outputs. Items 79–96 are **Creator Identity Mark** — all outputs. Items 97–111 are **Multi-Accent Color Strategy** — all outputs.

---

## 1 · Content + brand (all outputs)

1. **Motion purpose** — Every animation has a stated narrative reason (reveal · sequence · causality · comparison · emphasis · transformation · escalation · resolution).
2. **First-second hook** — First second is visually interesting and topic-clear.
3. **Self-contained** — Viewer understands the idea without reading the caption.
4. **Final-takeaway hold** — Final insight stays visible ≥2.5–3s.
5. **Restrained accents** — One dominant + one supporting + ≤1 state color per frame. Never all five lit.
6. **Semantic glow** — Glow only on active/important elements; color matches meaning.
7. **Calm + premium motion** — No glitch, no TikTok cuts, no aggressive zooms, no constant background motion.
8. **Symbolic clarity** — Emojis/icons only when they clarify meaning. Max 1–3 emojis. Lucide icons preferred.
9. **Mobile legibility** — Readable on phone at LinkedIn feed size. (See § 2 for floors.)
10. **Matches Design System V2** — Warm graphite palette, V2 accents, 12–20px rounded corners, layered surfaces.
11. **No hype** — No engagement bait, slogan-tone, generic LinkedIn phrasing.
12. **Feels like a system coming online** — Motion narrates a system; static reads as a dashboard.
13. **Warm enough** — Not flat-black ultra-cyber. Editorial depth.
14. **Disciplined information density** — Neither cluttered nor empty-minimalist.
15. **Illustrative metrics labeled** — Anything not real is marked `example model` / `conceptual` / `illustrative system model`.

---

## 2 · Mobile-first hard floors (all outputs)

16. **Readable on phone at LinkedIn feed size?** Without zoom.
17. **All important text above the mobile floor?** Headline ≥54px source (target 68–80); takeaway ≥38px; body ≥28px; labels ≥22px; metric values ≥64px; chart end-values ≥40px; chart labels ≥22px. Micro labels ≥18px and only if non-essential.
18. **Charts simplified for mobile?** ≤2 main data series · direct labels · 3–5 ticks · key insight highlighted · stroke ≥4px.
19. **Diagrams split or simplified, not shrunk?** ≤5–7 major nodes · short labels · top-down or left-right · no spiderwebs.
20. **Safe margins respected?** Outer ≥64px (prefer 72–96px). Nothing essential in bottom 80px.
21. **Motion supports reading?** Important text doesn't move while it should be read. No background motion behind text.
22. **Core idea clear in <3s on mobile?** Including thumb-scroll speed.
23. **Complexity solved by simplifying, not shrinking?** Split slides, split phases, drop secondary detail.

---

## 3 · Attention Choreography (motion graphics only)

24. **Beat map present and complete?** 3 beats (≤8s) or 5 beats (10–15s). Every beat has `visualState · primaryFocus · animationPurpose · animatedElements · easing · holdTime · mobileReadabilityNote · finalFrameContribution`.
25. **One main motion event?** Exactly one. Everything else supports it. No multiple unrelated animation moments.
26. **Eye path defined?** Per-beat primary focus + what stays still. No competing animations on opposite sides simultaneously (unless intentional comparison).
27. **Pauses used for comprehension?** Headline pause 300–500ms · post-problem 400–700ms · post-bottleneck 300–600ms · pre-takeaway 250–500ms.
28. **Important moments held long enough?** Important labels ≥2s. Final takeaway ≥2.5–3.5s.
29. **At least one focus lock moment (700–1500ms)?** One element dominates while others dim ~70%.
30. **Stagger controlled?** Delays: small labels 50–80ms · cards 100–160ms · workflow nodes 180–300ms · major sections 400–700ms. **Never >7 elements staggered in a row** — cluster them.
31. **Ending works as a final frame?** Final frame is readable, clean, not mid-transition, thumbnail-suitable, mobile-readable, inside safe margins.
32. **Loop-aware ending?** No hard cut, no blank frame, no ending in mid-motion. Final state reads on replay.
33. **Ending cleaner than the middle?** Density curve descends from peak (8–12s) to simplified (12–15s).
34. **Topic clear in first second?**
35. **Core idea clear in first 3 seconds?**
36. **Only 1–2 P1 elements animating at the same time?** P1 = headline · main system path · key chart line · final takeaway · key metric · main bottleneck.
37. **Timing varied naturally?** No more than 3 different elements share identical duration (unless intentionally grouped).
38. **Sequencing by meaning, not arbitrary component order?** Logic flow: problem → cause → mechanism → result → takeaway.
39. **Final frame works as standalone LinkedIn graphic?** Topic + takeaway + visual system + brand all readable.
40. **Final frame works as mobile thumbnail?** Inside safe margins, no tiny text.
41. **Readable on phone without zooming?** Mobile-first holds for every frame, not just stills.
42. **Complexity split into phases instead of shrunk?** When dense → split, never shrink.
43. **Motion guides attention instead of creating noise?** Subordinate animations stay quiet.
43a. **Layout stable under animation?** No element mounts/unmounts based on a reveal prop. No sibling shifts when an animated element appears. Animations drive opacity/transform only — layout space is reserved from Beat 1 for everything that ever appears.
43b. **Reading sequence respected?** Elements appear in the conceptual order declared in `readingSequence` (default: headline → system context → mechanism → metric → final takeaway; signature continuous). Element N's `interpolate` starts at or after element N-1's `settledBySec`. No "everything fades in at once."
43c. **Headline readable by 1.0s?** Default `fade-y` (or `word-by-word` / `fade-only`). `typing-terminal` allowed ONLY when concept fits (debugging / system-init / agent-execution / command-line / technical build-story) AND not used twice in a row. Long headlines never get slow character-by-character typing.
43d. **Per-element reveal patterns match the rules?** Cards fade+slide (never bounce) · nodes scale-in with subtle accent glow · signal lines draw/travel in the **direction of logic** (input→output, cause→effect — not arbitrary) · charts grow ONLY for change/trend/progression content · metrics count up/down ONLY for real or labeled-illustrative values · annotations appear only when needed without overlap · final takeaway enters with calm emphasis and **stays still**.

---

## 4 · Visual Diversity (all outputs)

44. **Content type classified?** Pre-flight produced one of the 20 enums from `memory/visual_content_arsenal_v1.md`.
45. **Primary visual format fits the content type?** Drawn from the recommended format set for that type.
46. **Different enough from recent outputs?** Same primary format never used more than 2 times in a row. `recentFormatAvoidance` / `antiRepetitionNote` filled when relevant.
47. **No unnecessary line-chart repetition?** A chart is used only when the post is genuinely about change-over-time / trend / market movement / performance evolution / signal emergence / before-after metric movement.
48. **Chart justified if used?** `chartJustification` explains why a chart fits AND why every non-chart alternative is weaker.
49. **No format-of-convenience?** Not picking a chart/pipeline because it's familiar — would a workflow / matrix / stack / loop / decision tree / agent loop / signal radar explain the idea better? If yes, switch.
50. **Visual format supports the story pattern?** Workflow + signal-travel · stack + bottom-up layered reveal · matrix + cell-by-cell · loop + circular activation, etc.
51. **Format is mobile-readable?** The chosen format clears the mobile floors at LinkedIn-feed scale.
52. **Diagram simplified, not shrunk?** ≤5–7 major nodes · short labels · top-down or left-right · no spiderwebs. If dense → split.
53. **Still matches Design System V2?** Warm graphite palette, V2 accents, 12–20px corners, layered surfaces, restrained accents.
54. **Warm technical editorial preserved?** Not flat-black cyber. Not Canva-bright. Premium-dashboard feel.
55. **Format understandable in <3s on mobile?** Including thumb-scroll.
56. **Final frame works as a standalone visual?** (Reinforces motion item #39.) Topic + takeaway + brand all readable.
57. **One main visual idea, not several competing?** Multiple unrelated visuals in one frame → reject.
58. **Avoids generic Canva/business-template aesthetic?** No stock infographic conventions. No clip-art people. No 3D bevel. No corporate-strategy-deck visual language.

---

## 5 · Layout Collision Protection (all outputs)

59. **All important text collision-free?** No P1/P2 bounding boxes overlap.
60. **All cards and labels inside safe margins?** Outer ≥64px (preferred 72–96px); nothing essential in the bottom 80px.
61. **Text large enough for mobile?** All essential type clears the floors (headline ≥54px, body ≥28px, labels ≥22px, takeaway ≥38px). See § 2.
62. **No labels overlapping nodes / charts / signal lines?** Even partial overlap with active visuals → reject.
63. **No animated elements moving through text zones?** Motion paths re-routed, delayed, masked, or clipped per the spec's `motionPaths[].mitigation`.
64. **Final frame has zero overlap?** `finalFrameCheck.noOverlap = true`.
65. **Layout uses clear zones?** `layoutZones` declared (top / middle / bottom or equivalent).
66. **Every major element has enough spacing?** ≥24px small labels · ≥32px cards · ≥40px text↔visual · ≥48px headline↔visual · ≥56px visual↔takeaway.
67. **No important text over busy visuals without backing?** If text sits over a chart/diagram/particle field, it has a dark backing panel + ≥16px padding.
68. **Charts/diagrams simplified, not overcrowded?** ≤2 main chart series · ≤7 workflow nodes · ≤5 annotation labels · ≤4 metric cards.
69. **Complexity reduced instead of shrinking text?** If crowded, the spec's `autoSimplification.actionsApplied` lists what was simplified.
70. **Max line counts respected?** Headline ≤2 · subtitle ≤2 · metric label ≤2 · annotation ≤2 · takeaway ≤2.
71. **No text overflows its container?** No clipped essentials, no ellipsis on critical text, no text running outside its bounding box.
72. **Motion paths routed around text?** `motionPaths[].crossesTextZone` is false, OR the mitigation is implemented.
73. **Readable on phone without zooming?** (Reinforces § 2 — also reject if a single label requires zoom.)
74. **Final takeaway unobstructed?** No animated element covers it in the Memory Anchor beat.
75. **Only one main focus at a time?** Per beat, one P1 element holds the eye. ≤1–2 P1 elements animate simultaneously.
76. **Absolute-positioned elements controlled by bounding boxes?** Each declared in code or schema with x/y/w/h.
77. **Final-frame check passes?** All booleans in `finalFrameCheck` are true: `noOverlap · readableOnMobile · insideSafeMargins · notMidTransition · takeawayVisible`.
78. **`collisionCheck.safeToRender = true`?** If false, do not render — revise.

---

## 6 · Creator Identity Mark (all outputs)

79. **`CreatorSignature` present?** Every output renders the component. Never omitted.
80. **Default text correct?** Name = `Emil Herzberg`. Subtitle = `AI Systems · Automation · Design`. Monogram = `EH`.
81. **Visible by 1.2s (motion)?** Signature is in `visibleElements` of Beat 1; `signatureEntranceProgress` reaches 1 by ~`fps * 1.2`.
82. **Visible in the final frame?** Both stills and final-frame of motion show the signature at 95–100% opacity.
83. **Mobile-readable?** Name ≥22px source, subtitle ≥18px source, email (if shown) ≥16px source — all clear the phone-scale floor.
84. **Inside safe margins?** Bounding box ≥64–80px from any edge; never inside the 80px platform reserve.
85. **No overlap with content?** Signature bbox does not intersect headline, takeaway, metric cards, chart labels, signal lines, workflow nodes, or any other major bounding box.
86. **V2 warm technical editorial style?** Soft Panel / Warm Graphite surface, V2 colors, 14–18px radius, subtle border, restrained glow on monogram only.
87. **Subtle, not distracting?** Idle motion limited to a slow pulse / shimmer. No bouncing / spinning / flashing / large movement.
88. **Correct variant for context?** `compact` default · `minimal` if dense · `final`/`service` only when explicitly appropriate.
89. **Email hidden by default?** `showEmail` is false unless variant is `service` or `final`-with-space.
90. **Email only used appropriately?** Service-oriented or final-frame content only — never on every educational post.
91. **Final frame clearly attributes content?** Signature is unambiguous at the final hold (≥2.5s).
92. **Included in every exported PNG/MP4?** Stills and videos both carry it.
93. **Feels integrated, not pasted on?** Treatment matches the rest of the V2 interface (panels, type, accents). No cinematic logo reveal.
94. **Avoids cheap watermark aesthetics?** No corner-stamp diagonal text, no semi-opaque overlay across the image, no "© [name] DO NOT STEAL" energy.
95. **Not cropped by platform-safe margins?** Stays inside the 64–80px frame; never near the 80px bottom platform reserve.
96. **Does not cover the final takeaway?** Placement in bottomRight or bottomLeft is always non-overlapping with the bottom-zone takeaway / metric strip / signal.

---

## 7 · Multi-Accent Color Strategy (all outputs)

97. **Primary system accent used?** `systemCyan` (or declared override) appears on the active data flow / main signal / primary path / mechanism.
98. **At least one warm contrast accent used?** `insightAmber` (or `frictionOrange` for friction/risk content) appears at the key insight / decision / friction / final-takeaway highlight.
99. **At least one differentiator accent used?** `strategicViolet` (abstract/reasoning/alternative) OR `successMint` (completion/success) — visibly present, not buried.
100. **Accents have semantic meaning?** `colorRolePlan` states what each color represents in THIS visual — never just "looks cool." Code/JSX uses semantic Tailwind classes (`text-system-cyan`, `bg-insight-amber`, `text-strategic-violet`, `text-success-mint`, `text-friction-orange`) in new components.
101. **Avoids monochrome?** Not only cyan-on-dark · not only blue/cyan tones · warm contrast and differentiator are both visibly present.
102. **Warm contrast clearly visible but restrained?** 5–8% of pixels approximately. Not buried, not dominant.
103. **Differentiator adds hierarchy, not decoration?** It marks the abstract/alternative/success role — it's not a third "look pretty" color.
104. **Accent colors mobile-readable?** Each accent passes contrast against the warm-graphite/soft-panel background at LinkedIn-feed scale.
105. **Accents not used at equal weight?** One leads (primary), one contrasts (warm), one differentiates. Never all three equal.
106. **Matches V2 distribution?** ~70–80% neutral · 8–12% primary · 5–8% warm contrast · 3–6% differentiator.
107. **Final frame includes all required color roles?** The thumbnail-frame shows primary + warm contrast + differentiator (or a clear subset where the differentiator's job is done).
108. **Motion uses color sequencing intentionally?** (motion only) Cyan introduces system → amber highlights insight → violet/mint differentiates. `colorSequencing` doesn't activate all accents simultaneously.
109. **Visual is premium and not colorful chaos?** Three accents only. No rainbow palette, no equal-weight neon stacking, no excessive gradients.
110. **Cold-feeling design corrected?** If too cold: amber presence raised, warm panel glow added, warm-white text balanced. If too busy: one accent reduced or made clearer.
111. **Friction/risk content uses the friction palette?** When the content is `bottleneck_failure_point` / `risk_control_system`, warm contrast = `frictionOrange` (not amber by default). Cyan still leads as the intended-flow color.

---

## Failure conditions (any one → reject)

- Important text below the floor.
- Main idea depends on tiny labels.
- Chart axis unreadable on phone.
- Diagram requires zooming.
- Final takeaway disappears too quickly.
- Accent colors hurt readability.
- Background effects interfere with text.
- Mobile viewer can't get the core idea in <3 seconds.
- **Beat map missing (motion only).**
- **Multiple unrelated main motion events (motion only).**
- **No focus lock moment (motion only).**
- **Final frame mid-transition or not thumbnail-suitable (motion only).**
- **Content type not classified before format selection.**
- **Line chart used outside its allowlist without a `chartJustification`.**
- **Same primary visual format used >2 times in a row across recent outputs.**
- **Multiple unrelated visuals competing in one frame.**
- **Important text overlaps another element.**
- **Animated element passes through a text zone without a declared mitigation.**
- **`collisionCheck.safeToRender = false`.**
- **Important text below the mobile floor used to fit more content.**
- **Bounding boxes not declared for major elements.**
- **`CreatorSignature` missing, disabled, or omitted from the rendered output.**
- **Signature overlaps content** or sits inside the bottom platform reserve.
- **Signature not visible by 1.2s** in a motion output, or not visible in the final frame.
- **Sibling layout shifts when an animated element appears** (caused by conditional rendering of a flex/grid child mid-animation).
- **Reading sequence missing or violated** — `readingSequence` absent from spec, or animation order in code doesn't match it, or elements animate simultaneously without conceptual basis.
- **Headline not readable by 1.0s**, or `typing-terminal` used without a fitting concept, or used twice consecutively.
- **Signal lines traveling in arbitrary direction** (not matching the logical flow).
- **Chart growth animation on non-trend content** (chart used outside the allowlist).
- **Metric count animation on fabricated values** without illustrative labeling.
- **Monochrome accent usage** — only one accent color appears across the visual.
- **Color role plan missing** or all three accents share the same meaning.
- **All accent colors activate simultaneously** in motion (no sequencing).
- **Accents used decoratively** without semantic meaning attached.

When in doubt: **simplify**. Remove detail before reducing size.
