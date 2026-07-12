# 06 — Creator Signature (Mandatory Identity Mark)

> On **every** infographic, carousel slide, and motion graphic. **Never omitted.** It is part of the composition — never pasted on top.

The signature is creator attribution · visual brand anchor · subtle anti-theft marker · final-frame ownership cue.

**Forbidden look:** giant watermark · cinematic logo reveal · "subscribe" lower-third · paranoid stock-photo watermark · diagonal corner stamp · "© DO NOT STEAL" energy.

## Identity content

```
name:     {{BRAND_NAME}}
subtitle: {{BRAND_SUBTITLE}}
email:    {{BRAND_EMAIL}}   (hidden by default)
monogram: {{BRAND_MONOGRAM}}
short:    {{BRAND_SIGNATURE}}
```

- Default (educational / thought-leadership): **name + subtitle, no email.**
- Email shown only in `service` content or `final`-frame when space allows.
- No long URL or handle embedded in normal visuals.

## Visual design (System Node Signature — default)

```
┌────┐
│ {{BRAND_MONOGRAM}} │ ─── {{BRAND_NAME}}
└────┘     {{BRAND_SUBTITLE}}
```

- Monogram `{{BRAND_MONOGRAM}}` in a **rounded square** (40–44px container, 14–16px radius), Soft Panel `#202735` fill, 1px cyan border `rgba(89,216,230,0.25)`, optional subtle inner glow.
- Monogram text: 18–20px source, mono, Warm White `#F4F1EA`.
- Connector: short signal line OR small glowing cyan dot (6–8px, soft glow).
- Name: 22–28px source, display semibold, Warm White `#F4F1EA`.
- Subtitle: 18–22px source, mono uppercase tracking 0.16em, Muted Stone `#B8B2A7`.
- Email (when shown): 16–18px source, mono, Cool Taupe `#8D93A1`.

## Variants

| Variant | Contents | Use when |
|---|---|---|
| `compact` | monogram · name · subtitle | **Default** for most outputs |
| `minimal` | monogram · name (single line) | Very dense layouts |
| `final` | monogram · name · subtitle · optional email | Final-frame emphasis if space |
| `service` | monogram · name · subtitle · email | Service/freelance content only |

## Placement & sizing (1080×1350 portrait)

- **Placement:** bottomRight (default) → bottomLeft (fallback). If both conflict → `minimal` + safer corner. If no corner works → **simplify the layout, never remove the signature.**
- Container height 42–64px · width 280–460px.
- Inside **72–96px** of the edge (use 80px). Vertical y 1210–1260 — above the 80px platform reserve.
- Border `rgba(244,241,234,0.10)` 1px · radius 14–18px · padding 12–18px horizontal, 10–14px vertical · gap monogram↔text 10–14px.
- Idle opacity 0.85–0.95 · final-frame 0.95–1.0.

The signature must NOT overlap: final takeaway · metric cards · chart labels · active signal lines · workflow nodes · captions · annotations · the 80px bottom platform reserve.

## Animation (motion outputs)

1. **Entrance (0.6–1.2s):** monogram fades in (`easeOutQuart`) · optional signal line draws (`easeInOutCubic`) · text fades + 6–8px Y (`easeOutCubic`). Settles at 85–95% opacity.
2. **Idle:** nearly static. Optional 1 tiny pulse on signal dot every 4–6s, or very subtle border shimmer. **No constant motion.**
3. **Final-frame emphasis (last 1.5–2.5s):** opacity lifts to 95–100% · single slow **amber** pulse on the monogram. No large movement.

**Forbidden:** bouncing · spinning · aggressive glow · large movement · glitch · blinking text · motion over important content · cinematic intro/outro.

## Anti-theft requirements

- Visible by **1.2s** of the video.
- Visible in the **final frame**.
- Mobile-readable (name + subtitle render ≥8px at LinkedIn-feed scale).
- Inside safe margins · not cropped · not hidden by motion · not covered.
- Included in **every** exported PNG and MP4.

Optional micro-signature for longer videos: a tiny `{{BRAND_SIGNATURE}}` mark in the background grid at 4–8% opacity — only if it improves anti-theft without looking cheap.

## Pre-flight (before code)

```
Signature variant:    compact | minimal | final | service   (default compact)
Placement:            bottomRight | bottomLeft               (after layout safety map)
Bounding box:         x · y · w · h                          (no overlap with any other bbox)
Show email:           yes | no                               (default no)
Entrance:             0.6–1.2s · easeOutQuart + easeOutCubic
Idle motion:          none | slow pulse every 4–6s | shimmer
Final-frame emphasis: amber pulse + opacity lift (yes/no)
Collision check:      overlapsContent (no) · insideSafeMargins (yes) · mobileReadable (yes) · finalFrameVisible (yes) · safeToRender (yes)
```

**Reddit note:** keep the signature `compact`/`minimal`, never `service` — Reddit users tolerate watermarks less.
