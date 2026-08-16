// Path A render contract. A model emits a RenderPost (validated JSON); PostRenderer
// turns it into pixels via the fixed primitives — no AI-written code. See docs/SHIP_PLAN.md.
import type { FormatKey } from "@/tokens/design";

export type Accent = "cyan" | "amber" | "violet" | "mint" | "burnt";

// PL-4.2 `deltaTrend`: colors the EXISTING delta text by author-stated trend (up → successMint,
// down → frictionOrange, flat → neutral). Default absent ⇒ neutral, byte-identical. Ships
// OpenAI/DeepSeek + Path B; PRUNED from Anthropic (DEFERRED_FIELDS_FROM_ANTHROPIC.metrics) since the
// top-level `metrics` object is a STRICT Anthropic part at the grammar cliff.
export type RenderMetric = { label: string; value: string; delta?: string; accent?: Accent; deltaTrend?: "up" | "down" | "flat" };

export type ChartSeries = { label: string; values: number[]; color: Accent; endValueLabel?: string };

// PL-2.7 additive line-chart knobs (all OPTIONAL; every default reproduces today's plain line). Ship
// OpenAI/DeepSeek + Path B; pruned from Anthropic (DEFERRED_FIELDS_FROM_ANTHROPIC, §3 ruling 1).
export type ChartVariant = "line" | "area" | "stepped";
export type ChartAnnotation = { seriesIndex?: number; x: number | string; label: string };

export type ComparisonColumn = { title: string; tone: Accent; items: string[] };

export type ClaimItem = { date: string; source: string; claim: string; reality: string; note?: string };

export type PipelineNode = { step: number; cumulative: string };

export type StackSegment = { width: number; color: Accent; label?: string };

export type RangeEntry = { label: string; start: number; end: number; openEnd?: boolean };

export type MatrixCell = { value: string; delta?: string; accent: Accent };

export type DivergenceItem = { label: string; start: number; end: number; startText?: string; endText?: string };

export type TierItem = { label: string; note?: string };
export type Tier = { label: string; accent?: Accent; items: TierItem[] };

export type BarMode = "simple" | "grouped" | "stacked";
export type BarOrientation = "vertical" | "horizontal";
export type BarCategory = { label: string; value?: number; values?: number[]; valueText?: string; accent?: Accent };

export type ScatterPoint = { x: number; y: number; label?: string; accent?: Accent };

export type DonutSegment = { label: string; value: number; accent?: Accent };

export type AreaSeries = { label?: string; values: number[]; accent?: Accent; endValueLabel?: string };

export type HistogramBin = { x0: number; x1: number; count: number };
export type HistogramMarker = { value: number; label?: string };

export type FunnelStage = { label: string; value: number; valueText?: string; accent?: Accent };

export type CandleMode = "candles" | "ohlc";
export type Candle = { label?: string; open: number; high: number; low: number; close: number };

export type TaxMode = "curve" | "elbow";
export type TaxValuesKnob = "off" | "on";
export type TaxonomyLeaf = { label?: string; value?: number };
export type TaxonomyCategory = { label?: string; accent?: Accent; children?: TaxonomyLeaf[] };

export type DistMode = "box" | "rangeMarkers";
export type DistMeanKnob = "off" | "on";
export type DistributionGroup = {
  label?: string;
  values?: number[];
  min?: number;
  q1?: number;
  median?: number;
  q3?: number;
  max?: number;
  mean?: number;
  outliers?: number[];
};

export type RenderViz =
  | {
      kind: "chart";
      series: ChartSeries[];
      xLabels?: string[];
      yMax?: number;
      caption?: string;
      // PL-2.7 additive knobs (default absent → plain line, byte-identical).
      variant?: ChartVariant;
      markers?: "off" | "on";
      yMin?: number;
      annotations?: ChartAnnotation[];
    }
  // PL-4.1: optional `revealMode` knob — "sequential" (both boxes side-by-side, left items then right
  // items) or "sequentialCentered" (cinematic moving boxes); default "paired" is byte-identical. Ships
  // OpenAI/DeepSeek + Path B; pruned from Anthropic (§3 ruling 1).
  | { kind: "comparison"; left: ComparisonColumn; right: ComparisonColumn; revealMode?: "paired" | "sequential" | "sequentialCentered"; caption?: string }
  | { kind: "stat"; big: string; sub?: string; note?: string; caption?: string; proportion?: number }
  // PL-4.1: optional `revealMode` knob — "spotlight" plays the narrative (each claim alone, then
  // assembled); default "stagger" is byte-identical. Rides the Anthropic loose object free (all 3 providers).
  | { kind: "claims"; entries: ClaimItem[]; revealMode?: "stagger" | "spotlight"; caption?: string }
  | { kind: "pipeline"; nodes: PipelineNode[]; perStepLabel: string; endLabel: string; endAccent?: Accent; caption?: string }
  | { kind: "stack"; segments: StackSegment[]; caption?: string }
  // ranges — two-lane horizontal timeline/interval bars on a shared year axis (RangeBars).
  | {
      kind: "ranges";
      topGroupLabel: string;
      bottomGroupLabel: string;
      topEntries: RangeEntry[];
      bottomEntries: RangeEntry[];
      topAccent: Accent;
      bottomAccent: Accent;
      minYear: number;
      maxYear: number;
      marketLine?: { year: number; label: string };
      caption?: string;
    }
  // matrix — 2×2 decision matrix with row/column headers (ComparisonMatrix).
  | {
      kind: "matrix";
      rowHeaders: [string, string];
      colHeaders: [string, string];
      rowAccents?: [Accent, Accent];
      tl: MatrixCell;
      tr: MatrixCell;
      bl: MatrixCell;
      br: MatrixCell;
      highlightCell?: "tl" | "tr" | "bl" | "br";
      caption?: string;
    }
  // divergence — paired-value gap on a shared axis: dumbbell (default) or slope (Divergence).
  | {
      kind: "divergence";
      items: DivergenceItem[];
      axisMin?: number;
      axisMax?: number;
      startAccent?: Accent;
      endAccent?: Accent;
      startLabel?: string;
      endLabel?: string;
      mode?: "dumbbell" | "slope";
      caption?: string;
    }
  // tiers — items sorted into ordered buckets (default) or a ranked leaderboard (TierStack).
  | {
      kind: "tiers";
      tiers: Tier[];
      mode?: "tiers" | "ranked";
      showValue?: boolean;
      caption?: string;
    }
  // bar — compare N labelled magnitudes on one 0-anchored value axis (BarChart). PL-2.1.
  | {
      kind: "bar";
      categories: BarCategory[];
      mode?: BarMode;
      orientation?: BarOrientation;
      valueLabels?: "auto" | "off";
      sort?: "none" | "desc" | "asc";
      seriesLabels?: string[];
      seriesAccents?: Accent[];
      axisMin?: number;
      axisMax?: number;
      unit?: string;
      referenceLine?: { value: number; label?: string }; // PL-4.2 — neutral threshold on the value axis
      caption?: string;
    }
  // scatter — a RELATIONSHIP between two numeric variables across N items (ScatterPlot). PL-2.2.
  // Optional auto-fit OLS trend line (supports inverse slope), quadrants, point labels. Ships
  // Path B + OpenAI/DeepSeek; deferred from Anthropic (union ceiling).
  | {
      kind: "scatter";
      points: ScatterPoint[];
      xLabel?: string;
      yLabel?: string;
      xMin?: number;
      xMax?: number;
      yMin?: number;
      yMax?: number;
      xUnit?: string;
      yUnit?: string;
      trendLine?: "off" | "fit";
      quadrants?: "off" | "on";
      xDivider?: number;
      yDivider?: number;
      quadrantLabels?: string[];
      pointLabels?: "auto" | "off";
      caption?: string;
    }
  // donut — radial composition of ONE whole into a FEW parts (Donut). PL-2.3. Normalized to 1.
  // Ships Path B + OpenAI/DeepSeek; deferred from Anthropic (union ceiling).
  | {
      kind: "donut";
      segments: DonutSegment[];
      centerLabel?: string;
      centerValue?: string;
      valueLabels?: "auto" | "off";
      centerTotal?: "on" | "off";
      unit?: string;
      // PL-4.2 emphasis: index (post-sort) of the ONE wedge to spotlight; others dim (opacity-only).
      emphasis?: number;
      caption?: string;
    }
  // area — magnitude / volume under a curve over an ordered axis (AreaChart). PL-2.4. simple (one
  // filled series) or stacked (≤3 layers summed to a total). Ships Path B + OpenAI/DeepSeek;
  // deferred from Anthropic (union ceiling).
  | {
      kind: "area";
      series: AreaSeries[];
      xLabels?: string[];
      mode?: "simple" | "stacked";
      valueLabels?: "auto" | "off";
      axisMin?: number;
      axisMax?: number;
      unit?: string;
      // PL-4.2 — ≤3 event callouts (ported LineChart resolver). Default absent → byte-identical. Ships
      // Path B + OpenAI/DeepSeek; `area` is deferred from Anthropic (whole kind), so the field is free.
      annotations?: ChartAnnotation[];
      caption?: string;
    }
  // histogram — the SHAPE / SPREAD of ONE metric across many observations (HistogramChart). PL-2.6.
  // Contiguous bins on a numeric axis + a count axis; raw `values` (planner bins) XOR pre-binned
  // `bins`; optional NEUTRAL stat markers (median/mean/p95, suppressed in bins-only mode) or author
  // `markerLines`. Ships Path B + OpenAI/DeepSeek; deferred from Anthropic (union ceiling).
  | {
      kind: "histogram";
      values?: number[];
      bins?: HistogramBin[];
      binCount?: number;
      xLabel?: string;
      yLabel?: string;
      xUnit?: string;
      markers?: "off" | "median" | "mean" | "medianMean" | "p95";
      markerLines?: HistogramMarker[];
      axisMin?: number;
      axisMax?: number;
      valueLabels?: "auto" | "off";
      accent?: Accent;
      caption?: string;
    }
  // funnel — a multi-stage process where an ABSOLUTE quantity DROPS OFF stage to stage (Funnel).
  // PL-3.3. Centered-trapezoid (default) or left-aligned `bars`. The drop-off % is DERIVED from
  // value ratios, never authored. Ships Path B + OpenAI/DeepSeek; deferred from Anthropic (union ceiling).
  | {
      kind: "funnel";
      stages: FunnelStage[];
      mode?: "funnel" | "bars";
      unit?: string;
      dropLabels?: "auto" | "off";
      accent?: Accent;
      caption?: string;
    }
  // candlestick — an OPEN/HIGH/LOW/CLOSE (OHLC) range over an ORDERED time axis (Candlestick). PL-2.5.
  // Four values per period: the range (high–low) AND the open→close move + its up/down direction. The
  // price axis is NOT 0-anchored (derived [min(low),max(high)]+8%). `candles` (body+wick) default or
  // `ohlc` (bar glyph). Ships Path B + OpenAI/DeepSeek; deferred from Anthropic (union ceiling).
  | {
      kind: "candlestick";
      candles: Candle[];
      mode?: CandleMode;
      axisMin?: number;
      axisMax?: number;
      upAccent?: Accent;
      downAccent?: Accent;
      unit?: string;
      caption?: string;
    }
  // distribution — the FIVE-NUMBER summary (min·q1·median·q3·max) + outliers of one or a few GROUPS
  // on a shared value axis (Distribution). PL-3.5. The IQR spread + median is the point. Each group
  // gives raw `values` (planner computes the summary) XOR a pre-computed five-number set. The value
  // axis is NOT 0-anchored (derived [min(all),max(all)]+8%). `box` (box+whisker) default or
  // `rangeMarkers` (range line + quartile ticks). Ships Path B + OpenAI/DeepSeek; deferred from
  // Anthropic (union ceiling).
  | {
      kind: "distribution";
      groups: DistributionGroup[];
      mode?: DistMode;
      axisMin?: number;
      axisMax?: number;
      showMean?: DistMeanKnob;
      accent?: Accent;
      groupAccents?: Accent[];
      unit?: string;
      caption?: string;
    }
  // taxonomy — a grouped HIERARCHY (N qualitative CATEGORIES each with named CHILDREN) drawn as a tidy
  // node-link TREE: root → category nodes → leaf nodes, connected by LINKS that carry the belongs-to
  // structure (PL-3.4 — the last new shape). FIXED depth 2 (no recursion). `curve` (default) or `elbow`
  // links; optional leaf value count chips (`showValues`). Ships Path B + OpenAI/DeepSeek; deferred from
  // Anthropic (union ceiling).
  | {
      kind: "taxonomy";
      categories: TaxonomyCategory[];
      rootLabel?: string;
      mode?: TaxMode;
      showValues?: TaxValuesKnob;
      unit?: string;
      caption?: string;
    };

export type RenderPost = {
  id: string;
  eyebrow?: string;
  headline: string;
  visualization: RenderViz;
  metrics?: RenderMetric[];
  takeaway?: string;
  signal?: string;
  // Output aspect. NOT model-authored — the pipeline stamps it from the user's choice AFTER generation,
  // so it never enters the (grammar-budgeted) generation schema. Absent → portrait (byte-identical to today).
  format?: FormatKey;
};
