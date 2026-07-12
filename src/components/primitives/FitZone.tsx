import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Structural fit guarantee (Epic 01 / Sprint 1.1). Wraps naturally-variable content
 * (a long headline, a claims ledger, the metric footer) and scales it DOWN so it always
 * fits its parent zone — never clips, never breaches the frame. Content that already fits
 * is left untouched (zoom 1, no visual change), so it's safe to wrap zones that rarely
 * overflow.
 *
 * Why CSS `zoom` and not `transform: scale()`: the structural inspector flags any
 * overflow-hidden box whose layout (`scrollHeight`) exceeds its `clientHeight`. A paint-time
 * transform shrinks the picture but NOT the layout, so transform-scaled content still reads
 * as clipped. `zoom` scales the actual layout (verified in Chromium: it shrinks the parent's
 * scrollHeight and the rendered getBoundingClientRect), so the content genuinely fits. The
 * whole render pipeline is Chromium (Playwright inspector + Remotion), where `zoom` is fully
 * supported.
 *
 * No measurement feedback loop: a zoomed element still reports its natural `offsetHeight`
 * (pre-zoom coordinate space), so the zone↔content ratio is stable and converges in one step.
 *
 * Last-resort safety net, NOT a license to over-stuff — genuinely dense briefs are reduced
 * upstream (triage / input filter). See Epic 02.
 */
type Align = "top" | "center" | "bottom";

export function FitZone({
  children,
  align = "center",
  maxScale = 1,
  reserveHeight,
}: {
  children: ReactNode;
  /** vertical anchor of the scaled content within the zone */
  align?: Align;
  /** never scale UP past this — 1 means natural size is the ceiling */
  maxScale?: number;
  /**
   * The height (px) the zone is INTENDED to have, used as the available-height reference
   * instead of the live `clientHeight`. Needed where the zone lives in a fractional CSS-grid
   * row that the layout engine COMPRESSES below its allocation when a sibling row's content
   * is tall (PostFrame's header): the original design tolerated that by letting the headline
   * overflow the compressed row upward (no clip — the header isn't an overflow box), so honoring
   * the compressed `clientHeight` would shrink content that previously fit (NON-neutral). With
   * `reserveHeight` set, the zone fits against the stable intended budget — zoom 1 / byte-neutral
   * whenever content fits THAT budget, shrinking only on a genuine over-budget breach.
   */
  reserveHeight?: number;
}) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useLayoutEffect(() => {
    const zone = zoneRef.current;
    const content = contentRef.current;
    if (!zone || !content) return;
    // Target zoom from the CURRENT DOM (one pass).
    const compute = () => {
      const zw = zone.clientWidth;
      // offsetW/H of a zoomed element are reported in its own pre-zoom space → natural size.
      const ch = content.offsetHeight;
      const cw = content.offsetWidth;
      if (!zw || !ch || !cw) return null;
      // DETERMINISM (anti-flutter): when the content fits within the STABLE intended budget
      // (ch ≤ reserveHeight), the vertical fit ratio is ≥ 1 and never binds — so the zoom is exactly
      // min(maxScale, zw/cw), the SAME value the old `(max(clientHeight,reserve)-2)/ch` term produced
      // (it was ≥1 too). Deriving that non-binding term from the LIVE clientHeight coupled the zoom to a
      // height that wobbles sub-pixel frame-to-frame (the animating viz competes for fr-grid space),
      // which Remotion captured as a ~1%/frame headline vibration. Keying off the STATIC content height
      // `ch` makes it byte-identical every frame. A genuinely OVER-BUDGET headline (ch > reserveHeight)
      // still takes the original shrink path — the grid row expands to fit it so it stays above the
      // mobile floor (the fuzz dense-overflow headlines).
      const fitsBudget = reserveHeight != null && ch <= reserveHeight - 2;
      const zh = Math.max(zone.clientHeight, reserveHeight ?? 0);
      // 2px slack keeps us inside the inspector's 3px clip tolerance after rounding.
      const next = fitsBudget
        ? Math.min(maxScale, zw / cw)
        : Math.min(maxScale, (zh - 2) / ch, zw / cw);
      if (!Number.isFinite(next) || next <= 0) return null;
      return Math.min(maxScale, Math.floor(next * 1000) / 1000);
    };
    // SETTLE SYNCHRONOUSLY before the first paint. Applying a zoom < 1 re-wraps the content (its
    // width:100% resolves wider in the zoomed coordinate space), which changes its measured height and
    // thus the target zoom — a few-pass fixed point. The old code did ONE measure on mount and let the
    // ResizeObserver converge the rest over the next renders; Remotion captured those intermediate
    // renders as the first ~3 frames, so the headline visibly SHRANK to fit at the very start. Doing the
    // convergence here (apply to the DOM + force a reflow between passes) means the first painted frame
    // already shows the final size — no on-screen shrink-to-fit.
    const settle = () => {
      let z = maxScale;
      for (let i = 0; i < 6; i++) {
        content.style.zoom = String(z);
        void content.offsetWidth; // force a synchronous reflow at this zoom
        const next = compute();
        if (next == null) break;
        if (Math.abs(next - z) <= 0.002) { z = next; break; }
        z = next;
      }
      setZoom((prev) => (Math.abs(prev - z) > 0.002 ? z : prev));
    };
    settle();
    // Re-run the FULL convergence on any genuine size change (e.g. the `font-display: swap` swap-in):
    // a single-pass correction would leave the wrap-driven fixed point a pass or two short, and Remotion
    // would capture those intermediate frames as an on-screen shrink. Converging fully each time keeps
    // every captured frame at the final size.
    const ro = new ResizeObserver(settle);
    ro.observe(zone);
    ro.observe(content);
    return () => ro.disconnect();
  }, [maxScale, reserveHeight]);

  const items = align === "top" ? "flex-start" : align === "bottom" ? "flex-end" : "center";

  // The zone is only a measuring reference for the available height — NOT a clipping
  // container (the parent grid zone already bounds + clips). Keeping it overflow-visible
  // avoids a false "clipped" finding from a flex items-end sub-pixel phantom while zoom
  // still guarantees the content actually fits its parent.
  return (
    <div
      ref={zoneRef}
      className="relative flex h-full w-full justify-center"
      style={{ alignItems: items }}
    >
      <div ref={contentRef} style={{ width: "100%", zoom }}>
        {children}
      </div>
    </div>
  );
}
