# Prompt library

Generation prompts for the LinkedIn content system. Each prompt assumes:

- Visual identity → `../memory/visual_identity_v2.md` (Design System V2)
- Motion system → `../memory/motion_quality_v2.md` (Motion V2 / Directed System Motion)
- Mobile-first → `../memory/mobile_first_readability.md` (hard requirement)

| File | When to use |
|---|---|
| `infographic.md` | Single-still LinkedIn graphic (portrait 1080×1350). |
| `motion_graphic.md` | Remotion-rendered video (8–15s typical, 20s max). |
| `carousel.md` *(use infographic prompt per slide + carousel.schema.json)* | Multi-slide breakdown. |
| `react_component.md` | New primitive or post composition in `src/components` or `src/posts`. |
| `remotion_video.md` | Implementing a motion graphic spec as Remotion code. |
| `quality_check.md` | Pre-ship checklist. **Run on every output before finalizing.** |
| `weekly_content_plan.md` | Planning ahead — 5 post angles for the week. |

If any prompt conflicts with a `/memory/*.md` file, the memory file wins.
