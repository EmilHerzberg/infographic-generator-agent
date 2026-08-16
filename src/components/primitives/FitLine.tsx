import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Horizontal shrink-to-fit for a SINGLE line. Companion to FitZone (which fits HEIGHT): FitLine
 * scales a one-line value down on the WIDTH axis so it can never overflow its container into a
 * neighbor — e.g. a long metric value ("+14.3%") in a narrow 4-up card, a big hero stat, or a
 * matrix cell value. Uses CSS `zoom` (layout-true, Chromium-supported in both the Playwright
 * inspector and Remotion); a zoomed element still reports its natural offsetWidth, so the fit
 * converges in one measurement. Content that already fits is untouched (zoom 1).
 *
 * The renderer-side guarantee for the Pillar-1 hardening: no model can make a value escape its box.
 */
export function FitLine({
  children,
  className,
  fontSize,
  align = "left",
  style,
  zoneAttr,
}: {
  children: ReactNode;
  className?: string;
  fontSize: number;
  align?: "left" | "center";
  style?: CSSProperties;
  /** Optional data-* attribute name set on the (layout-true) zone div — a measurement hook for the
   *  inspector (e.g. "data-matrix-value"). Pure passthrough; does NOT change layout/paint. */
  zoneAttr?: string;
}) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [zoom, setZoom] = useState(1);
  // ANTI-FLUTTER (the delegation-matrix single-frame glitch): the old shape measured once per
  // [children] change and then let the ResizeObserver correct ASYNCHRONOUSLY — under Remotion's
  // sequential frame capture a transient mid-animation measurement (zone read while an entrance
  // was re-laying out → near-zero width) could land in state and paint for exactly one frame:
  // the value collapsed to a sliver and the layout below shifted (zoom is layout-true). Fix =
  // the FitZone architecture: settle SYNCHRONOUSLY on EVERY commit (each Remotion frame is a
  // commit, so every painted frame carries a freshly verified fit), write the zoom onto the DOM
  // pre-paint, and refuse implausible transient reads (a collapsed zone must never become a
  // painted zoom — keep the last good fit instead).
  const settle = () => {
    const zone = zoneRef.current;
    const txt = textRef.current;
    if (!zone || !txt) return;
    const zw = zone.clientWidth;
    const cw = txt.offsetWidth; // natural (pre-zoom) width
    if (zw < 8 || cw < 1) return; // transient/collapsed read — never paint it
    const z = Math.min(1, Math.floor((zw / cw) * 1000) / 1000);
    txt.style.zoom = String(z); // pre-paint DOM write — the frame being captured is already correct
    setZoom((prev) => (Math.abs(prev - z) > 0.002 ? z : prev)); // keep React's model in sync
  };
  useLayoutEffect(() => { settle(); }); // no deps: re-verify before EVERY paint
  useLayoutEffect(() => {
    const zone = zoneRef.current;
    const txt = textRef.current;
    if (!zone || !txt) return;
    // Live-preview resizes (browser window, studio panes) still converge via the observer; its
    // callback runs the same guarded settle, so it can no longer inject a bogus zoom.
    const ro = new ResizeObserver(() => settle());
    ro.observe(zone);
    ro.observe(txt);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    // Clip the x-axis ONLY (the axis FitLine guarantees via zoom). With `leading-none` the
    // font's content area (ascent+descent ≈ 1.14em) exceeds the 1em line box on EVERY value,
    // so a blanket `overflow: hidden` both crops glyph extremes vertically and trips the
    // inspector's `clipped` y-check. overflow-y stays visible — vertical fit is the parent
    // layout's concern, not FitLine's.
    <div ref={zoneRef} {...(zoneAttr ? { [zoneAttr]: "" } : {})} style={{ width: "100%", overflowX: "clip", overflowY: "visible", textAlign: align }}>
      <span ref={textRef} className={className} style={{ ...style, fontSize, whiteSpace: "nowrap", display: "inline-block", zoom }}>
        {children}
      </span>
    </div>
  );
}
