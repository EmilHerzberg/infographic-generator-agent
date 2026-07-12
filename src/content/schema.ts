export type AccentKey = "cyan" | "amber" | "violet" | "mint" | "burnt";

export type Metric = {
  label: string;
  value: string;
  delta?: string;
  accent?: AccentKey;
  // PL-4.2 — colors the EXISTING delta text by author-stated trend (up → successMint, down →
  // frictionOrange, flat → neutral). Default absent ⇒ neutral delta, byte-identical to today.
  deltaTrend?: "up" | "down" | "flat";
};

export type VisualizationKind =
  | "diagram"
  | "flowchart"
  | "node-graph"
  | "chart"
  | "timeline"
  | "terminal"
  | "heatmap"
  | "pipeline";

export type VisualizationSpec = {
  kind: VisualizationKind;
  data: unknown;
};

export type Post = {
  id: string;
  headline: string;
  eyebrow?: string;
  visualization: VisualizationSpec;
  metrics?: Metric[];
  signal?: string;
};

export type PostBundle = {
  version: 2;
  posts: Post[];
};
