// Generic Remotion root for agent/Path-B generated posts. Auto-discovers every
// src/posts/generated/*.tsx default export and registers it as a composition that
// drives the post's single `t` (0..1) progress prop from the current frame.
// Motion posts animate via `t`; non-`t` stills render static. Render with:
//   npx remotion render src/remotion/generated-index.ts <id> out/<id>.mp4
import {
  Composition,
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  delayRender,
  continueRender,
} from "remotion";
import { useState, useEffect } from "react";
import { easings } from "@/tokens/motion";
import { formats, layout, resolveFormat } from "@/tokens/design";
import { FormatContext } from "@/components/layout/formatContext";
import { SignatureContext, type SignatureConfig } from "@/components/layout/signatureContext";
import { postDurationSeconds, isNarrativePost, narrativeProgressT } from "@/lib/narrative";
import PostRenderer from "@/posts/PostRenderer";
import "@/remotion/fonts";
import "@/index.css";

const FPS = 30;
const DEFAULT_DURATION_S = 14;
const fmt = formats[layout.defaultFormat];

// webpack-only (Remotion bundler). Typed loosely; never imported by Vite/tsc paths.
const ctx = (require as any).context("../posts/generated", false, /\.tsx$/); // Path B (TSX)
const renderCtx = (require as any).context("../posts/generated", false, /\.render\.json$/); // Path A (JSON)
// Path B carries no format IN the TSX (it's a job choice, not model-authored); renderSpec writes a
// <id>.meta.json sidecar so the render is sized to the chosen format. Absent ⇒ portrait (byte-identical).
const metaCtx = (require as any).context("../posts/generated", false, /\.meta\.json$/);
// The <id>.meta.json sidecar carries render-time job choices that are NOT in the model-authored TSX:
// the output `format` and the author `signature` (see signatureContext). Absent ⇒ {} (portrait, brand
// default), so anything without a sidecar is byte-identical to before.
function tsxMeta(id: string): { format?: string; signature?: SignatureConfig } {
  const key = `./${id}.meta.json`;
  if (!metaCtx.keys().includes(key)) return {};
  const m = metaCtx(key);
  return m.default ?? m;
}

function useProgressT(linear = false) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  // Narrative posts (PL-4.1): a LINEAR frame→t so each plan window gets its designed real seconds
  // and the plan's reserved tail (t ∈ [0.92, 1]) is a clean ~0.08·DUR hold. The shared
  // narrativeProgressT is the one mapping the render-truth check also asserts. See its doc-comment.
  if (linear) return narrativeProgressT(frame, durationInFrames);
  // Default: global progress settles to 1 at ~85% of the timeline (final frame holds clean).
  return interpolate(frame, [0, durationInFrames * 0.85], [0, 1], {
    easing: easings.easeOutCubic,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

// Block the render until the (locally-bundled, `font-display: swap`) brand fonts are actually applied.
// Otherwise frame 0 renders with the FALLBACK font, layout-measuring components (FitZone) fit to that,
// then the real font swaps in a frame later and everything re-fits — the headline visibly "settles"
// (shrinks-to-fit) at the very start. The Playwright inspector already awaits `document.fonts.ready`;
// this gives the Remotion render the same guarantee. Remotion's own delayRender timeout is the backstop.
function useFontsReady() {
  const [handle] = useState(() => delayRender("fonts-ready"));
  useEffect(() => {
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => continueRender(handle));
    } else {
      continueRender(handle);
    }
  }, [handle]);
}

function wrap(Comp: any, format = layout.defaultFormat, signature: SignatureConfig | null = null) {
  return function GeneratedComposition() {
    useFontsReady();
    return (
      <AbsoluteFill style={{ backgroundColor: "#0E1116" }}>
        <FormatContext.Provider value={format}>
          <SignatureContext.Provider value={signature}>
            <Comp t={useProgressT()} />
          </SignatureContext.Provider>
        </FormatContext.Provider>
      </AbsoluteFill>
    );
  };
}

function wrapJson(post: any, signature: SignatureConfig | null = null) {
  const linear = isNarrativePost(post); // PL-4.1: narrative posts get a linear frame→t (see useProgressT)
  const format = resolveFormat(post.format);
  return function GeneratedJsonComposition() {
    useFontsReady();
    return (
      <AbsoluteFill style={{ backgroundColor: "#0E1116" }}>
        <FormatContext.Provider value={format}>
          <SignatureContext.Provider value={signature}>
            <PostRenderer post={post} t={useProgressT(linear)} />
          </SignatureContext.Provider>
        </FormatContext.Provider>
      </AbsoluteFill>
    );
  };
}

function comp(id: string, component: any, durS = DEFAULT_DURATION_S, dims = fmt) {
  return (
    <Composition
      key={id}
      id={id}
      component={component}
      durationInFrames={Math.round(durS * FPS)}
      fps={FPS}
      width={dims.width}
      height={dims.height}
    />
  );
}

export function GeneratedRoot() {
  return (
    <>
      {(ctx.keys() as string[]).map((key) => {
        const id = key.replace(/^\.\//, "").replace(/\.tsx$/, "");
        const mod = ctx(key);
        if (!mod.default) return null;
        // Path B format + author signature: from the <id>.meta.json sidecar (absent ⇒ portrait, brand
        // default). The component fills the composition; sizing here + FormatContext/SignatureContext
        // (in wrap) make it render at the chosen aspect with the chosen (or no) signature.
        const m = tsxMeta(id);
        const f = resolveFormat(m.format);
        return comp(id, wrap(mod.default, f, m.signature ?? null), mod.durationInSeconds, formats[f]);
      })}
      {(renderCtx.keys() as string[]).map((key) => {
        const id = key.replace(/^\.\//, "").replace(/\.render\.json$/, "");
        const post = renderCtx(key);
        const spec = post.default ?? post;
        // PL-4.1: a narrative-mode Path-A post LENGTHENS (content-aware duration); default-mode
        // posts return DEFAULT_DURATION_S byte-identically (postDurationSeconds is a pure no-op
        // on them — same 14s). useProgressT is unchanged; a longer durationInFrames just stretches
        // the same 0..1 `t`, and the narrative plan lives entirely in `t`-space.
        // Per-post output format: the composition is sized to spec.format (absent → portrait), the
        // SAME value the Preview canvas + PostFrame resolve — Preview↔Remotion stay in lockstep.
        return comp(id, wrapJson(spec, tsxMeta(id).signature ?? null), postDurationSeconds(spec, DEFAULT_DURATION_S), formats[resolveFormat(spec.format)]);
      })}
    </>
  );
}
