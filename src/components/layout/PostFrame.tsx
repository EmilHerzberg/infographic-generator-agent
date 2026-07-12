import { type ReactNode } from "react";
import { formats, layout, text, type FormatKey } from "@/tokens/design";
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
  format = layout.defaultFormat,
  signatureVariant = "compact",
  signaturePlacement = "bottomRight",
  signatureEntranceProgress = 1,
  signaturePulseProgress = 0,
  signatureShowEmail,
}: Props) {
  const { width, height } = formats[format];
  // The header's INTENDED inner height = its grid-row allocation (headlineRatio·H) minus the
  // header's own pt-16 (64) + pb-8 (32) padding. Passed to the chrome FitZone as the stable
  // available-height reference so a grid-compressed header row (squeezed by a tall viz/footer
  // sibling) can't shrink chrome that previously fit by overflowing upward (PL-0.10b neutrality).
  const headerInnerHeight = layout.headlineRatio * height - 64 - 32;

  return (
    <div
      className="relative grid h-full w-full overflow-hidden bg-bg-warm-graphite bg-grid-faint bg-grid text-text-primary"
      style={{
        aspectRatio: `${width} / ${height}`,
        gridTemplateRows: `${layout.headlineRatio}fr ${layout.vizRatio}fr ${layout.summaryRatio}fr`,
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
              style={{ fontSize: text.headline, lineHeight: 1.05 }}
            >
              {headline}
            </h1>
          </div>
        </FitZone>
      </header>

      <main className="relative flex flex-col px-16 [&>*]:flex-1">
        {visualization}
      </main>

      <footer className="relative flex flex-col gap-3 border-t border-white/[0.06] px-16 pt-5 pb-4">
        <div className="flex flex-1 items-center justify-between gap-8 min-h-0">
          <div className="flex-1">{summary}</div>
          {signal && (
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
          />
        </div>
      </footer>
    </div>
  );
}
