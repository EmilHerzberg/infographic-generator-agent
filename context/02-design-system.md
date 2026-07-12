# 02 — Design System (Warm Technical Editorial V2)

Dark-mode first · layered · premium · technical · analytical · structured · slightly futuristic · warmer than pure cyber · human and editorial. Still computational, but with visual warmth and atmospheric depth. **70% technical / 30% warm editorial.**

## Color palette (canonical hex)

### Backgrounds (dark, warm-leaning — never flat black)

| Token | Hex | Use |
|---|---|---|
| Deep Ink | `#0E1116` | Composition / video background |
| Warm Graphite | `#151A22` | Post canvas base |
| Midnight Slate | `#1A202B` | Cards |
| Soft Panel | `#202735` | Inner panels |

### Text

| Token | Hex | Use |
|---|---|---|
| Warm White | `#F4F1EA` | Primary — all essential text, headlines, body |
| Muted Stone | `#B8B2A7` | Secondary — captions, deltas |
| Cool Taupe | `#8D93A1` | Tertiary — labels / metadata only, never essential meaning |

### Accents (semantic — see `03-color-strategy.md`)

| Role | Token | Hex | Meaning |
|---|---|---|---|
| Primary | System Cyan | `#59D8E6` | system signal · data flow · active path · primary mechanism |
| Warm contrast | Insight Amber | `#E7A95A` | insight · attention · value · strategic emphasis · key takeaway |
| Warm contrast (alt) | Friction Orange | `#D9864D` | friction · bottleneck · risk · caution |
| Differentiator | Strategic Violet | `#8E7CC3` | abstraction · reasoning layer · alternative path · strategy |
| Differentiator (alt) | Success Mint | `#6ED3A3` | completion · success · resolved flow · positive outcome |

### Glows (low-opacity, accent emphasis only)

| Color | Value |
|---|---|
| Cyan | `rgba(89,216,230,0.14)` |
| Amber / Copper | `rgba(231,169,90,0.16)` |
| Violet | `rgba(142,124,195,0.14)` |
| Mint | `rgba(110,211,163,0.12)` |
| Orange | `rgba(217,134,77,0.14)` |

## Typography

| Role | Family |
|---|---|
| Display (headlines) | Space Grotesk · Sora |
| Body | Inter · Manrope |
| Mono (labels, terminal) | JetBrains Mono |
| Editorial accent (rare) | Plus Jakarta Sans · IBM Plex Sans |

**Source-pixel scale** (1080×1350 portrait; see `07-mobile-first.md` for floors):

| Role | Source size |
|---|---|
| Headline | 54–80px semibold (target 68) |
| Eyebrow / topic frame | 24–28px mono uppercase |
| Body text | 28px+ |
| Final takeaway | 38px+ |
| Labels / annotations | 22px+ mono uppercase |
| Metric value (the payoff) | 64–80px display semibold (default 72) |
| Chart end-value (the punchline) | 40–48px display semibold (default 44) |
| Signature | 18–22px mono |
| Micro labels (non-essential only) | 18px |

- **Letter spacing:** mono uppercase labels 0.18–0.24em · display headlines −0.01 to −0.02em · body 0.
- **Line height:** headlines 1.05–1.08 (tight) · body/labels 1.2–1.3.
- Headlines read as strategic insight, not slogan.

## Layout

**12-column grid.** Portrait composition zones:

- **Top ~20%** — eyebrow + headline / hook / framing.
- **Middle ~60%** — main visualization / chart / diagram / architecture.
- **Bottom ~20%** — takeaway / metric / signal / signature.

Target: **disciplined information density** — never clutter, never empty lifestyle-minimalism.

## Canvas formats

| Format | Size | Use |
|---|---|---|
| **Portrait (default)** | 1080×1350 | LinkedIn, Reddit, mobile feeds |
| Square | 1080×1080 | Diagrams (rare) |
| Landscape | 1920×1080 | Video |

(Layout ratios from tokens: headline 0.24 · viz 0.56 · summary 0.20.)

### Portrait zones (1080×1350)

| Zone | Y range | Box (x,y,w,h) | Purpose |
|---|---|---|---|
| Top | 64–300 | 64,64,952,236 | Eyebrow + headline |
| Middle | 320–1030 | 64,320,952,710 | Main visualization |
| Bottom | 1050–1280 | 64,1050,952,230 | Metric strip / takeaway / signal / signature |
| Reserve | 1280–1350 | 0,1280,1080,70 | Platform UI competes — no essential content |

### Safe margins & spacing

- Minimum outer margin: **64px** every side. Preferred: **72–96px**.
- Bottom reserve: **80px** — no important content.
- Spacing minimums: small labels **24px** · cards **32px** · text↔visual **40px** · headline↔visual **48px** · visual↔takeaway **56px**.

## Shape & surface

- Corner radius **12–20px** (cards/panels). Panel radius 1rem · card radius 0.875rem.
- Borders: 1px white at 6–10% opacity.
- Shadows: subtle dark drop-shadow + 1px inset highlight. Glows sparingly, only on active/important elements, color = meaning.
- Surfaces layered and premium — never flat.

## Background treatment (three layers)

1. **Base color:** Warm Graphite `#151A22` (avoid pure black).
2. **Grid overlay:** faint `rgba(184,178,167,0.04)` lines on a 40px grid, 1px width.
3. **Warm vignette:** radial amber glow top-right `rgba(231,169,90,0.10)` + soft black at bottom.

Optional 2–5% opacity noise texture for depth. Background should feel **alive but quiet** — never loud.

## Strokes (source px)

Chart line **5px** · signal line **3px** · grid **1.5px** · separator **1px**. (Below ~4px chart stroke disappears on phone.)

## Visual elements

Each visual includes ≥3 of: workflow pipelines · system diagrams · metric cards · architecture maps · stock-style charts · signal lines · node graphs · timeline flows · heatmaps · annotation labels · terminal snippets · structured comparison tables. Treatment: *designed intelligence layer*, not terminal-only.

**Density caps (on-screen at once):** major cards 3–5 · workflow nodes 5–7 · annotation labels 3–5 · metric cards 2–4 · chart labels 2–4 · active animated elements 1–3. **Never 10+ labeled nodes on one mobile frame.**

## Iconography

Prefer **lucide-react** icons over emojis. Set: `Workflow · Bot · BrainCircuit · Network · Activity · TrendingUp · TrendingDown · Search · Database · Layers · GitBranch · Gauge · ShieldAlert · Timer · Zap · Cpu · Route · Radar · Boxes · ChartNoAxesCombined · CircleDot · Orbit · Waypoints`. Stroke 1.5–1.75. Color = accent meaning.

## Style references

Linear · Stripe · Vercel · Notion AI editorial graphics · Bloomberg interfaces · premium strategy dashboards · modern research presentations — with added warmth and editorial elegance.
