import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { formats, layout, text, resolveFormat, type FormatKey } from "@/tokens/design";
import { FormatContext } from "@/components/layout/formatContext";
import { SignatureContext } from "@/components/layout/signatureContext";
import { CreatorSignature } from "@/components/primitives/CreatorSignature";
import { FitZone } from "@/components/primitives/FitZone";

type Props = {
  eyebrow?: string;
  headline: string;
  visualization: ReactNode;
  summary?: ReactNode;
  /**
   * Signal text content. Presence/absence is a design-time decision —
   * do NOT toggle this between `undefined` and a string for animation,
   * because mounting/unmounting reshuffles the footer flex layout and
   * squeezes the summary cards. Use `signalReveal` for the entrance.
   */
  signal?: string;
  /** 0..1 — drive the signal slot's opacity from a Remotion `interpolate`. Layout is reserved from the start. */
  signalReveal?: number;
  format?: FormatKey;
  signatureVariant?: "compact" | "minimal" | "final" | "service";
  /**
   * "bottomRight" / "bottomLeft" align the signature horizontally in its own
   * reserved footer row — no longer absolute-positioned. This prevents the
   * historical overlap with metric strip content. Default: bottomRight.
   */
  signaturePlacement?: "bottomRight" | "bottomLeft";
  signatureEntranceProgress?: number;
  signaturePulseProgress?: number;
  signatureShowEmail?: boolean;
};

export function PostFrame({
  eyebrow,
  headline,
  visualization,
  summary,
  signal,
  signalReveal = 1,
  format,
  signatureVariant = "compact",
  signaturePlacement = "bottomRight",
  signatureEntranceProgress = 1,
  signaturePulseProgress = 0,
  signatureShowEmail,
}: Props) {
  // Resolve the format: an explicit prop wins (Path A / PostRenderer passes it); else the surrounding
  // FormatContext (Path B — the agent's component passes nothing); else the portrait default.
  const ctxFormat = useContext(FormatContext);
  // Author signature, injected at render time from the job's sidecar (see signatureContext). `hidden`
  // → no signature (SaaS blank-field default); an object → that author; null → brand default.
  const sig = useContext(SignatureContext);
  const hideSignature = !!sig && "hidden" in sig;
  const sigContent = sig && "name" in sig ? { name: sig.name, subtitle: sig.subtitle } : undefined;
  // resolveFormat validates + falls back to portrait, so a malformed format value (a typo in a
  // hand-authored spec that bypasses the server's enum) can't make formats[fmtKey] undefined and crash
  // the destructure below.
  const fmtKey = resolveFormat(format ?? ctxFormat);
  const { width, height } = formats[fmtKey];
  const ratio = layout.ratios[fmtKey]; // per-format grid split (portrait/square unchanged; vertical fills taller)
  const isVertical = fmtKey === "vertical";
  const isSquare = fmtKey === "square";
  // The header's INTENDED inner height = its grid-row allocation (headlineRatio·H) minus the
  // header's own pt-16 (64) + pb-8 (32) padding. Passed to the chrome FitZone as the stable
  // available-height reference so a grid-compressed header row (squeezed by a tall viz/footer
  // sibling) can't shrink chrome that previously fit by overflowing upward (PL-0.10b neutrality).
  const headerInnerHeight = ratio.headline * height - 64 - 32;

  // Vertical footer up-scale (the tall-frame rule) is CONTENT-AWARE: a compact summary (cards, one
  // takeaway) scales 1.15× to be more present; a tall one (the dense-overflow fixtures) keeps 1.0 so
  // the scaled block can never push past the frame and clip. offsetHeight reports the PRE-zoom
  // natural height (the FitZone lesson), so there is no measure↔zoom feedback loop.
  const SUMMARY_UP_BUDGET = 235; // scaled-height budget (px) the up-zoom must fit
  const sumRef = useRef<HTMLDivElement>(null);
  const [sumZoom, setSumZoom] = useState(1);
  useLayoutEffect(() => {
    if (!isVertical) return;
    const el = sumRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.offsetHeight;
      if (!h) return;
      const next = h * 1.15 <= SUMMARY_UP_BUDGET ? 1.15 : 1;
      setSumZoom((prev) => (prev !== next ? next : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isVertical]);

  return (
    <div
      className="relative grid h-full w-full overflow-hidden bg-bg-warm-graphite bg-grid-faint bg-grid text-text-primary"
      style={{
        aspectRatio: `${width} / ${height}`,
        // B1 (multiformat layout fix): chrome rows size to content (`auto`); the viz row takes ALL remaining
        // frame height (`minmax(0,1fr)`, min 0 so it never overflows the frame). The old `${x}fr ${y}fr ${z}fr`
        // template collapsed every track to content-min (fr only distributes FREE space, and the grid's height
        // resolved to content), so sparse posts pooled dead space below the signature — worst on tall vertical.
        // Now the footer/signature anchor to the frame bottom and the viz fills. The `ratio.*` values are only
        // used for `headerInnerHeight` (the header FitZone budget) below; viz/summary shares are informational.
        gridTemplateRows: `auto minmax(0, 1fr) auto`,
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-warm-vignette" />

      {/* PL-0.10b: FitZone is the chrome shrink-to-fit net. `align="bottom"` (items-end) + the inner
          `gap-5` reproduce the prior `justify-end gap-5` layout EXACTLY at zoom 1 (verified byte-neutral
          on fitting fixtures); a too-long eyebrow/headline now zoom-shrinks instead of clipping the row. */}
      <header className="relative flex flex-col px-16 pb-8 pt-16">
        <FitZone align="bottom" reserveHeight={headerInnerHeight}>
          <div className="flex flex-col gap-5">
            {eyebrow && (
              <span
                className="font-mono uppercase tracking-[0.24em] text-accent-amber"
                style={{ fontSize: text.eyebrow }}
              >
                {eyebrow}
              </span>
            )}
            <h1
              className="font-display font-semibold tracking-tight text-text-primary"
              // Square runs ~7% smaller headline type (Emil's 1:1 chrome-reduction): the 1080-tall frame
              // carries the same chrome as portrait, so every px the header gives back flows into the
              // squeezed viz row (`minmax(0,1fr)`). Far above the mobile floor; portrait/vertical unchanged.
              style={{ fontSize: isSquare ? Math.round(text.headline * 0.93) : text.headline, lineHeight: 1.05 }}
            >
              {headline}
            </h1>
          </div>
        </FitZone>
      </header>

      {/* min-h-0 + overflow-hidden: the viz zone CONTAINS its content. Over-tall generated content used
          to paint straight over the footer (silent text-under-card overlap the inspector can't see);
          clipping turns that breach into a finding the inspector DOES flag (scrollHeight > clientHeight),
          so the generation loop fixes it instead of shipping it. Renderer-authored charts are h-full and
          never clip. */}
      <main data-viz className="relative min-h-0 flex flex-col overflow-hidden px-16 [&>*]:flex-1">
        {visualization}
      </main>

      {/* Format-aware footer chrome (Emil's format-bench feedback): vertical gets breathing room at the
          frame bottom (the signature used to sit ~16px off the edge of a 1920-tall frame) AND a more
          PRESENT footer — the general tall-frame rule: when the hug-centered mid content leaves slack,
          the footer content scales UP (1.15) and sits higher (larger paddings/gaps), closing the dead
          band between mid and footer from below. Square scales the summary DOWN (0.85 — floor-safe
          but TIGHT: the smallest live summary token is 22px → 18.7px, only 0.7px above the 18px hard
          floor; any future ≤21px summary token would breach at square) so the short square viz row
          gets the height back. Portrait values are byte-identical. */}
      <footer
        className="relative flex flex-col border-t border-white/[0.06] px-16"
        style={{
          // Square chrome-reduction (measured: a metric-card footer ate 27% of the 1080 frame, viz down
          // to 46%): tighter paddings/gap claw back fixed pixels for the viz row. Portrait byte-identical.
          rowGap: isVertical ? 22 : isSquare ? 8 : 12,
          paddingTop: isVertical ? 28 : isSquare ? 14 : 20,
          paddingBottom: isVertical ? 48 : isSquare ? 12 : 16,
        }}
      >
        <div className="flex flex-1 items-center justify-between gap-8 min-h-0">
          <div ref={sumRef} className="flex-1" style={isSquare ? { zoom: 0.85 } : isVertical ? { zoom: sumZoom } : undefined}>{summary}</div>
          {/* Square drops the signal chip entirely (the most secondary footer chrome): it competed with
              the summary for width — every wrap it forced made the over-budget square footer TALLER.
              Radical-cut per Emil's 1:1 reduction directive; portrait/vertical keep it. */}
          {signal && !isSquare && (
            <div
              className="flex shrink-0 items-center gap-3 font-mono uppercase tracking-[0.22em] text-accent-amber/90"
              style={{ fontSize: text.panelLabel, opacity: signalReveal }}
            >
              <span
                className="h-2.5 w-2.5 rounded-full bg-accent-mint shadow-glow-cyan"
                style={{ opacity: signalReveal }}
              />
              {signal}
            </div>
          )}
        </div>
        {!hideSignature && (
          <div
            className={`flex ${
              signaturePlacement === "bottomLeft"
                ? "justify-start"
                : "justify-end"
            }`}
          >
            <CreatorSignature
              variant={signatureVariant}
              placement="inline"
              entranceProgress={signatureEntranceProgress}
              pulseProgress={signaturePulseProgress}
              showEmail={signatureShowEmail}
              content={sigContent}
            />
          </div>
        )}
      </footer>
    </div>
  );
}
