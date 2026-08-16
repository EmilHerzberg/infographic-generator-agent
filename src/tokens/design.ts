import brandConfig from "../../brand.config.json";

export const version = "v2" as const;

export const colors = {
  bg: {
    deepInk: "#0E1116",
    warmGraphite: "#151A22",
    midnightSlate: "#1A202B",
    softPanel: "#202735",
  },
  text: {
    primary: "#F4F1EA",
    secondary: "#B8B2A7",
    tertiary: "#8D93A1",
  },
  accent: {
    cyan: "#59D8E6",
    amber: "#E7A95A",
    violet: "#8E7CC3",
    mint: "#6ED3A3",
    burnt: "#D9864D",
  },
  glow: {
    copper: "rgba(231,169,90,0.16)",
    cyan: "rgba(89,216,230,0.14)",
    amber: "rgba(231,169,90,0.16)",
    violet: "rgba(142,124,195,0.14)",
    mint: "rgba(110,211,163,0.12)",
    orange: "rgba(217,134,77,0.14)",
  },
  semanticAccent: {
    systemCyan: "#59D8E6",
    insightAmber: "#E7A95A",
    strategicViolet: "#8E7CC3",
    successMint: "#6ED3A3",
    frictionOrange: "#D9864D",
  },
} as const;

export const fonts = {
  display: "'Space Grotesk', 'Sora', 'Inter', sans-serif",
  body: "'Inter', 'Manrope', system-ui, sans-serif",
  editorial: "'Plus Jakarta Sans', 'IBM Plex Sans', 'Inter', sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
} as const;

export const formats = {
  portrait: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
  vertical: { width: 1080, height: 1920 }, // 9:16 — full-screen Stories/Reels/TikTok/Shorts
  landscape: { width: 1920, height: 1080 },
} as const;

export type FormatKey = keyof typeof formats;

// The output formats a post can actually be RENDERED at (portrait = default 4:5; square = 1:1; vertical =
// 9:16). `landscape` is a layout token, not a selectable post output. A post declares its choice in
// `RenderPost.format`; every render surface — PostFrame, the Preview #post-canvas, the Remotion composition,
// and (transitively) the QA viewport — MUST resolve it through `resolveFormat` so they can never drift out of
// lockstep. That lockstep is the single invariant the render-truth parity gate depends on.
export const outputFormats = ["portrait", "square", "vertical"] as const;
export type OutputFormat = (typeof outputFormats)[number];

// Resolve an untrusted format value (from a spec/URL/job) to a known FormatKey — unknown/absent → the
// default. Pure and total, so no surface can crash on a bad value; the worst case is a portrait fallback.
export function resolveFormat(f: string | null | undefined): FormatKey {
  return f != null && f in formats ? (f as FormatKey) : layout.defaultFormat;
}

// Chart vertical-fill scale (Emil's 9:16 spacing feedback). The chart family (bar/area/line) draws into a
// fixed 1000×640-ish source viewBox with preserveAspectRatio="meet"; in the TALL vertical viz zone that box
// is width-constrained and floats in a dead band. `chartVScale` stretches ONLY the vertical geometry (viewBox
// height + all plot y-coordinates, NOT font/stroke px) by this factor so the plot fills ~20% more of the tall
// frame — bars/areas grow taller, horizontal-bar spacing opens up. Portrait/square = 1 (Emil: "1:1 is fine",
// portrait was never flagged), so their geometry — and every deterministic check, which never passes a scale —
// stays byte-identical. Applied per-primitive by threading it into the pure planners (default 1).
export const chartVScale = (f: string | null | undefined): number =>
  resolveFormat(f) === "vertical" ? 1.45 : 1;

export const layout = {
  defaultFormat: "portrait" as FormatKey,
  columns: 12,
  // Flat defaults (portrait). Kept for back-compat with anything reading them directly; PostFrame now
  // resolves per-format via `ratios` below. Portrait/square share these values, so they stay byte-identical.
  headlineRatio: 0.24,
  vizRatio: 0.56,
  summaryRatio: 0.2,
  // Per-format grid split (headline / viz / summary fractions of the frame HEIGHT). Portrait + square keep
  // the flat split above BYTE-IDENTICALLY. Vertical (9:16) is the taller frame: it keeps the chrome near its
  // portrait ABSOLUTE height (header ~0.17·1920 ≈ 326px, footer ~0.14·1920 ≈ 269px — same as portrait's
  // 324/270) and pours ALL the extra height into the viz zone (0.69·1920 ≈ 1325px). So a height-filling
  // visual (charts stretch via h-full) dominates the frame instead of a portrait-sized band marooned in
  // whitespace, while the headline/takeaway/signature keep the density they have in portrait.
  ratios: {
    portrait: { headline: 0.24, viz: 0.56, summary: 0.2 },
    square: { headline: 0.24, viz: 0.56, summary: 0.2 },
    // Vertical (9:16): Emil's feedback — give the bottom metric cards a bit more height (0.14 → 0.16 ≈
    // 307px vs the old 269px), taken from the viz zone (0.69 → 0.67); the chart still dominates because
    // it now fills its row (chartVScale). headline unchanged.
    vertical: { headline: 0.17, viz: 0.67, summary: 0.16 },
    landscape: { headline: 0.24, viz: 0.56, summary: 0.2 },
  } as Record<FormatKey, { headline: number; viz: number; summary: number }>,
  radius: {
    panel: "1rem",
    card: "0.875rem",
  },
  safeMargin: 64,
  preferredMargin: 80,
  bottomReserve: 80,
} as const;

export const spacing = {
  betweenSmallLabels: 24,
  betweenCards: 32,
  betweenTextAndVisual: 40,
  betweenHeadlineAndVisual: 48,
  betweenVisualAndTakeaway: 56,
} as const;

export const zones = {
  portrait: {
    top: { x: 64, y: 64, width: 952, height: 236, purpose: "headline / hook" },
    middle: { x: 64, y: 320, width: 952, height: 710, purpose: "main visual system" },
    bottom: { x: 64, y: 1050, width: 952, height: 230, purpose: "takeaway / metrics / signal / signature" },
    bottomReserve: { x: 0, y: 1280, width: 1080, height: 70, purpose: "platform UI reserve — no essential content" },
  },
  square: {
    top: { x: 64, y: 64, width: 952, height: 156, purpose: "headline / hook" },
    middle: { x: 64, y: 240, width: 952, height: 620, purpose: "main visual system" },
    bottom: { x: 64, y: 880, width: 952, height: 120, purpose: "takeaway / metrics / signal / signature" },
    bottomReserve: { x: 0, y: 1000, width: 1080, height: 80, purpose: "platform UI reserve" },
  },
  landscape: {
    left: { x: 80, y: 80, width: 520, height: 920, purpose: "input / context" },
    middle: { x: 620, y: 80, width: 680, height: 920, purpose: "main mechanism" },
    right: { x: 1320, y: 80, width: 520, height: 920, purpose: "takeaway" },
    bottomReserve: { x: 0, y: 1000, width: 1920, height: 80, purpose: "platform UI reserve" },
  },
} as const;

export const maxLines = {
  headline: 2,
  subtitle: 2,
  metricLabel: 2,
  annotation: 2,
  finalTakeaway: 2,
} as const;

export const density = {
  majorCards: { max: 5 },
  workflowNodes: { max: 7 },
  annotationLabels: { max: 5 },
  metricCards: { max: 4 },
  chartLabels: { max: 4 },
  activeAnimatedElements: { max: 3 },
} as const;

export const motion = {
  defaultDurationSec: 12,
  easing: [0.22, 1, 0.36, 1] as const,
} as const;

export const text = {
  signature: 20,
  axisLabel: 24,
  panelLabel: 24,
  eyebrow: 26,
  metricLabel: 24,
  metricDelta: 24,
  caption: 24,
  chartSeriesSubtitle: 22,
  chartEndValue: 44,
  metricValue: 72,
  headline: 68,
} as const;

export const stroke = {
  chartLine: 5,
  signal: 3,
  grid: 1.5,
  separator: 1,
} as const;

// Brand identity for the on-video creator signature — driven by brand.config.json so a fork re-skins
// every output by editing one file (no code change). The BRAND_* keys also feed the AI briefing.
export const brand = {
  signature: brandConfig.BRAND_SIGNATURE,
  author: brandConfig.BRAND_NAME,
  monogram: brandConfig.BRAND_MONOGRAM,
  subtitle: brandConfig.BRAND_SUBTITLE,
  email: brandConfig.BRAND_EMAIL,
};

export type AccentKey = keyof typeof colors.accent;
export type SemanticAccentKey = keyof typeof colors.semanticAccent;

export const colorRole = {
  systemCyan: "primary-system-accent",
  insightAmber: "warm-contrast-accent",
  strategicViolet: "differentiator-accent",
  successMint: "differentiator-accent",
  frictionOrange: "warm-contrast-accent",
} as const satisfies Record<SemanticAccentKey, string>;

export const colorMeaning = {
  systemCyan: "system signal · data flow · active path · primary mechanism",
  insightAmber: "insight · attention · value · strategic emphasis",
  strategicViolet: "abstraction · reasoning layer · alternative path",
  successMint: "completion · success · resolved flow · positive outcome",
  frictionOrange: "friction · bottleneck · risk · caution",
} as const;
