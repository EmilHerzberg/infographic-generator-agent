# 09 — Quality Checklist (Pre-Ship)

Run before finalizing any infographic, carousel slide, or motion graphic. **Every relevant item must be true.** If any is false, revise — do not ship. Items 1–15 + the color and signature sections apply to all outputs; the Attention Choreography section applies to motion only.

## 1 · Content + brand (all outputs)

1. Every animation has a stated narrative reason (reveal · sequence · causality · comparison · emphasis · transformation · escalation · resolution).
2. First second is visually interesting and topic-clear.
3. Viewer understands the idea without the caption.
4. Final insight stays visible ≥2.5–3s (motion).
5. One dominant accent + one supporting + ≤1 state color per frame. Never all five lit.
6. Glow only on active/important elements; color matches meaning.
7. Calm + premium motion. No glitch / TikTok cuts / aggressive zooms / constant background motion.
8. Emojis/icons only when they clarify meaning. Max 1–3 emojis. Lucide icons preferred.
9. Readable on phone at LinkedIn feed size.
10. Matches Design System V2 — warm graphite palette, V2 accents, 12–20px corners, layered surfaces.
11. No hype copy, engagement bait, or generic LinkedIn phrasing.
12. Feels like a system coming online (motion) / reads like a dashboard (static).
13. Warm enough — not flat-black ultra-cyber.
14. Disciplined information density — neither cluttered nor empty-minimalist.
15. Illustrative metrics labeled (`example model` / `conceptual` / `illustrative system model`). No fabricated business claims.

## 2 · Mobile-first hard floors (all outputs)

16. Readable on phone at feed size without zoom.
17. All important text above the floor: headline ≥54px (target 68–80) · takeaway ≥38px · body ≥28px · labels ≥22px · metric values ≥64px · chart end-values ≥40px · chart labels ≥22px. Micro labels ≥18px and non-essential only.
18. Charts simplified: ≤2 series · direct labels · 3–5 ticks · key insight highlighted · stroke ≥4px.
19. Diagrams split or simplified, not shrunk: ≤5–7 major nodes · short labels · top-down or left-right · no spiderwebs.
20. Safe margins respected: outer ≥64px (prefer 72–96px); nothing essential in bottom 80px.
21. Motion supports reading: important text doesn't move while it should be read; no background motion behind text.
22. Core idea clear in <3s on mobile (including thumb-scroll speed).
23. Complexity solved by simplifying/splitting, not shrinking.

## 3 · Attention Choreography (motion only)

24. Beat map present and complete (3 beats ≤8s or 5 beats 10–15s; every field filled).
25. Exactly one main motion event; everything else supports.
26. Eye path defined (per-beat focus + what stays still). No competing animations on opposite sides simultaneously (unless intentional comparison).
27. Comprehension pauses used (post-headline 300–500ms · post-problem 400–700ms · post-bottleneck 300–600ms · pre-takeaway 250–500ms).
28. Important labels held ≥2s; final takeaway ≥2.5–3.5s.
29. At least one focus lock moment (700–1500ms) with others dimmed ~70%.
30. Stagger controlled; never >7 elements staggered in a row.
31. Ending works as a final frame (clean, not mid-transition, thumbnail-suitable, mobile-readable, inside margins).
32. Loop-aware ending — no hard cut, no blank frame, no mid-motion stop.
33. Ending cleaner than the middle (density curve descends).
34. Topic clear in first second.
35. Core idea clear in first 3 seconds.
36. Only 1–2 P1 elements animating at the same time.
37. Timing varied — no more than 3 elements share identical duration (unless grouped).
38. Sequencing by meaning, not arbitrary component order.
39. Final frame works as a standalone graphic (topic + takeaway + system + brand readable).
40. Final frame works as a mobile thumbnail.
41. Readable on phone without zooming for every frame.
42. Complexity split into phases instead of shrunk.
43. Motion guides attention instead of creating noise.
43a. **Layout stable under animation** — no element mounts/unmounts on a reveal prop; no sibling shifts; layout space reserved from Beat 1.
43b. **Reading sequence respected** — elements appear in declared conceptual order; element N starts at/after element N-1's settle; no "everything at once."
43c. **Headline readable by 1.0s** — `fade-y` default; `typing-terminal` only when concept fits and not twice in a row.
43d. **Per-element reveal patterns correct** — cards fade+slide (no bounce) · nodes scale-in with accent glow · signal lines travel in the direction of logic · charts grow only for trend content · metrics count only for real/labeled values · final takeaway enters calm then stays still.

## 4 · Visual diversity (all outputs)

44. Content type classified (one of the 20).
45. Primary visual format fits the content type.
46. Different enough from recent outputs (same primary format never >2 in a row).
47. No unnecessary line-chart repetition — chart only for change/trend/movement/before-after.
48. Chart justified if used (`chartJustification` explains why a chart fits and why alternatives are weaker).
49. No format-of-convenience — would a workflow / matrix / stack / loop / decision tree explain it better? If yes, switch.
50. Visual format supports the story pattern.
51. Format is mobile-readable.
52. Diagram simplified, not shrunk.
53. Still matches Design System V2.
54. Warm technical editorial preserved (not flat-black cyber, not Canva-bright).
55. Format understandable in <3s on mobile.
56. Final frame works as a standalone visual.
57. One main visual idea, not several competing.
58. Avoids generic Canva / business-template aesthetic (no clip-art people, 3D bevel, corporate deck language).

## 5 · Layout collision protection (all outputs)

59. All important text collision-free (no P1/P2 bbox overlap).
60. All cards/labels inside safe margins; nothing essential in the bottom 80px.
61. Text large enough for mobile (clears the floors).
62. No labels overlapping nodes / charts / signal lines (even partial → reject).
63. No animated elements moving through text zones (motion paths re-routed / delayed / masked / clipped).
64. Final frame has zero overlap.
65. Layout uses clear zones (top / middle / bottom).
66. Every major element has enough spacing (24/32/40/48/56px minimums).
67. No important text over busy visuals without a dark backing panel + ≥16px padding.
68. Charts/diagrams simplified, not overcrowded.
69. Complexity reduced instead of shrinking text.
70. Max line counts respected (headline ≤2 · subtitle ≤2 · metric label ≤2 · annotation ≤2 · takeaway ≤2).
71. No text overflows its container.
72. Motion paths routed around text.
73. Readable on phone without zooming.
74. Final takeaway unobstructed.
75. Only one main focus at a time; ≤1–2 P1 elements animate simultaneously.
76. Absolute-positioned elements controlled by declared bounding boxes.
77. Final-frame check passes (`noOverlap · readableOnMobile · insideSafeMargins · notMidTransition · takeawayVisible`).
78. `collisionCheck.safeToRender = true`.

## 6 · Creator identity mark (all outputs)

79. Creator signature present — never omitted.
80. Default text correct (name = `{{BRAND_NAME}}` · subtitle = `{{BRAND_SUBTITLE}}` · monogram = `{{BRAND_MONOGRAM}}`).
81. Visible by 1.2s (motion).
82. Visible in the final frame at 95–100% opacity.
83. Mobile-readable (name ≥22px · subtitle ≥18px · email if shown ≥16px source).
84. Inside safe margins; never inside the 80px platform reserve.
85. No overlap with any major content bbox.
86. V2 warm technical editorial style (Soft Panel/Warm Graphite surface, V2 colors, 14–18px radius, subtle border, glow on monogram only).
87. Subtle, not distracting (idle motion = slow pulse/shimmer only).
88. Correct variant for context (compact default · minimal if dense · final/service only when appropriate).
89. Email hidden by default.
90. Email only used in service / final-frame content.
91. Final frame clearly attributes content.
92. Included in every exported PNG/MP4.
93. Feels integrated, not pasted on. No cinematic logo reveal.
94. Avoids cheap watermark aesthetics (no diagonal stamp, no overlay, no "DO NOT STEAL").
95. Not cropped by platform-safe margins.
96. Does not cover the final takeaway.

## 7 · Multi-accent color strategy (all outputs)

97. Primary system accent used on the active data flow / main path / mechanism.
98. At least one warm contrast accent (amber, or friction orange for friction/risk content) at the insight / decision / friction / takeaway highlight.
99. At least one differentiator accent (violet abstract/reasoning, or mint completion/success) visibly present.
100. Accents have semantic meaning (`colorRolePlan` states what each represents — never "looks cool").
101. Avoids monochrome (not only cyan; warm contrast + differentiator both visibly present).
102. Warm contrast visible but restrained (~5–8% of pixels).
103. Differentiator adds hierarchy, not decoration.
104. Accent colors mobile-readable against the background.
105. Accents not at equal weight (one leads · one contrasts · one differentiates).
106. Matches V2 distribution (~70–80% neutral · 8–12% primary · 5–8% warm · 3–6% differentiator).
107. Final frame includes the required color roles.
108. Motion uses color sequencing intentionally — never all accents at once (motion).
109. Premium, not colorful chaos — three accents only, no rainbow / neon stacking / excessive gradients.
110. Cold-feeling design corrected (raise amber / warm glow / warm-white balance if too cold).
111. Friction/risk content uses the friction palette (warm contrast = friction orange; cyan still leads).

## Failure conditions (any one → reject)

Important text below the floor · main idea depends on tiny labels · chart axis unreadable on phone · diagram requires zooming · final takeaway disappears too quickly · accent colors hurt readability · background effects interfere with text · core idea not clear in <3s · beat map missing (motion) · multiple unrelated main motion events (motion) · no focus lock (motion) · final frame mid-transition / not thumbnail-suitable (motion) · content type not classified before format · line chart outside its allowlist without justification · same primary format >2 in a row · multiple unrelated visuals competing · important text overlaps another element · animated element through a text zone without mitigation · `safeToRender = false` · creator signature missing/disabled/omitted · signature overlaps content or sits in the bottom reserve · signature not visible by 1.2s or in final frame · sibling layout shift when an animated element appears · reading sequence missing/violated · headline not readable by 1.0s · signal lines in arbitrary direction · chart growth on non-trend content · metric count on fabricated values · monochrome accent usage · color role plan missing · all accents activate simultaneously (motion) · accents used decoratively.

**When in doubt: simplify. Remove detail before reducing size.**
