// Taxonomy — a grouped HIERARCHY (N qualitative CATEGORIES each containing named CHILDREN) drawn as a
// tidy node-link TREE: a synthetic ROOT → category nodes → leaf nodes, connected by LINKS that carry
// the belongs-to relation. PL-3.4, the LAST genuinely-new shape in the library. The links ARE the
// structure (vs tiers, which has no edges — co-located ranked buckets).
//
//   curve (default): each link is a smooth cubic-Bézier from the parent chip's bottom-center to the
//     child chip's top-center. elbow (mode knob): an orthogonal poly-line (down to the mid-rank
//     gutter → across → down). SAME node x/y + endpoints from planTaxonomy; only the link path differs.
//   showValues:"on" → a leaf carrying a finite value gets a small count chip (a COUNT annotation, NOT
//     a magnitude layout — the geometry is unchanged).
//
// All layout comes from planTaxonomy (src/lib/taxonomy.ts) — the pure brain shared with the check
// suite (using d3-hierarchy `tree()` for the Reingold–Tilford node coordinates). Geometry is a pure
// function of DATA, never `t`. A tree's parent→child LINKS are CONNECTED geometry → the build is a
// BRANCHING continuous-edge sweep (feedback_continuous_edge_growth): the root pops, then root→category
// links draw down and each category pops as its link finishes, then category→leaf links draw and each
// leaf pops as its link finishes (sibling links overlap-stagger within a rank). The node-pop scale +
// the link draw are OMITTED at settle (never scale(1) / dashoffset 0 left animated — the LC3/C12 rule)
// so t=1 is bit-identical to a static render. Props default to t=1 so Path B can import it static.
//
// PL-0.8 ROW-AWARE viewBox (the §2.10 decision + §3 binding): width is FIXED (1000); height matches
// the row's measured aspect so the SVG fills the full row WIDTH (uniform scale ⇒ the thin links stay
// width-driven ≥1px@390 and the leaf rank is never compressed). The tree is HEIGHT-HUNGRY (3 fixed
// ranks); clampViewH floors at MIN_VIEW_H 336 (the proven 3-rank vertical floor) ⇒ in a shorter
// container the SVG fits by HEIGHT and letterboxes horizontally (complete-but-smaller beats overflow).
// Spec: planning/primitive-library/handoffs/PL-3.4-taxonomy.md §2.5 / §2.7 / §2.10 / §3.

import { useId, useLayoutEffect, useRef, useState } from "react";
import type { Accent } from "@/posts/renderTypes";
import { colors } from "@/tokens/design";
import {
  planTaxonomy,
  nodeReveal,
  linkReveal,
  type TaxonomyCategoryInput,
  type TaxMode,
  type TaxValuesKnob,
  type PlannedNode,
  type PlannedLink,
  VIEW_W,
  VIEW_H,
  clampViewH,
  NODE_PAD_X,
  LINK_STROKE,
  ROOT_R,
  CAT_LABEL_PX,
  LEAF_LABEL_PX,
  ROOT_LABEL_PX,
  VALUE_PX,
} from "@/lib/taxonomy";

const accentHex = (a: string): string => colors.accent[a as Accent] ?? colors.accent.cyan;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// A leaf chip inherits a TINT of its parent's accent (§2.9): low-alpha fill + a brighter ring.
const LEAF_FILL_ALPHA = 0.14;
const LEAF_RING_ALPHA = 0.5;
const CAT_FILL_ALPHA = 0.9;

type Props = {
  categories: TaxonomyCategoryInput[];
  rootLabel?: string;
  mode?: TaxMode;
  showValues?: TaxValuesKnob;
  unit?: string;
  caption?: string;
  t?: number;
};

export function Taxonomy({ categories, rootLabel, mode = "curve", showValues = "off", unit, caption, t = 1 }: Props) {
  const uid = useId();

  // PL-0.8 — row-aware viewBox: measure the row's px aspect so the viewBox aspect MATCHES it and the
  // SVG fills the FULL row width (uniform scale ⇒ thin links stay width-driven, no leaf-rank crush).
  // SYNCHRONOUS measure inside useLayoutEffect (applied before paint, so Remotion captures the settled
  // frame), plus a ResizeObserver. Pre-measure default = 640 ⇒ static/SSR import byte-identical.
  const boxRef = useRef<HTMLDivElement>(null);
  const [viewH, setViewH] = useState(VIEW_H);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      const w = box.clientWidth;
      const h = box.clientHeight;
      if (!w || !h) return;
      const next = clampViewH((VIEW_W * h) / w); // viewH = 1000 / aspect, clamped to [MIN_VIEW_H, 640]
      setViewH((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  const plan = planTaxonomy({ categories, rootLabel, mode, showValues, unit, viewH });
  const { viewH: vbH } = plan;

  if (plan.empty) {
    return (
      <div ref={boxRef} className="relative h-full w-full">
        <svg
          viewBox={`0 0 ${VIEW_W} ${vbH}`}
          className="block h-full w-full"
          role="img"
          aria-label={caption ?? "a grouped hierarchy"}
          data-tax
          data-tax-mode={plan.mode}
          data-tax-empty
          data-tax-viewh={vbH}
        />
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative h-full w-full">
      <svg
        viewBox={`0 0 ${VIEW_W} ${vbH}`}
        className="block h-full w-full"
        role="img"
        aria-label={caption ?? "a grouped hierarchy"}
        data-tax
        data-tax-mode={plan.mode}
        data-tax-viewh={vbH}
      >
        {/* Links first (under the chips) — draw on via strokeDashoffset, branching down the ranks. */}
        {plan.links.map((l, i) => (
          <Link key={`${uid}-l${i}`} link={l} mode={plan.mode} nodes={plan.nodes} t={t} />
        ))}
        {/* Nodes — root pops, then categories, then leaves, each as its parent link's edge arrives. */}
        {plan.nodes.map((n, i) => (
          <Node key={`${uid}-n${i}`} node={n} unit={plan.unit} t={t} />
        ))}
      </svg>
    </div>
  );
}

// ── One link: a cubic-Bézier (curve) or an orthogonal elbow, drawn on via strokeDashoffset ──────────
function Link({ link, mode, nodes, t }: { link: PlannedLink; mode: TaxMode; nodes: PlannedNode[]; t: number }) {
  const reveal = linkReveal(t, link.drawStart, link.drawDur);
  const settled = reveal >= 1;
  // The link is a low-alpha tint of the shared (parent=child) accent family — it reads as "part of
  // this branch" without competing with the chips (the feedback_neutral_connector_lines spirit).
  const stroke = accentHex(link.accentKey);
  const d = mode === "elbow" ? elbowPath(link) : curvePath(link);
  return (
    <path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={LINK_STROKE}
      strokeOpacity={0.45}
      strokeLinecap="round"
      pathLength={1}
      strokeDasharray="1"
      strokeDashoffset={settled ? undefined : 1 - reveal}
      data-tax-link
      data-tax-link-mode={mode}
      data-tax-link-parent={link.parent}
      data-tax-link-child={link.child}
      data-tax-link-reveal={reveal.toFixed(3)}
      style={settled ? undefined : { opacity: clamp01(reveal * 4) }}
    />
  );
  void nodes;
}

/** Cubic-Bézier from parent bottom-center → child top-center (vertical control handles). */
function curvePath(l: PlannedLink): string {
  const midY = (l.y1 + l.y2) / 2;
  return `M ${l.x1} ${l.y1} C ${l.x1} ${midY} ${l.x2} ${midY} ${l.x2} ${l.y2}`;
}
/** Orthogonal elbow: down to the mid-rank gutter → across → down to the child (the org-chart look). */
function elbowPath(l: PlannedLink): string {
  const midY = (l.y1 + l.y2) / 2;
  return `M ${l.x1} ${l.y1} L ${l.x1} ${midY} L ${l.x2} ${midY} L ${l.x2} ${l.y2}`;
}

// ── One node: a chip (rounded rect + FitLine-floor label inside) or the synthetic-root hub ──────────
function Node({ node, unit, t }: { node: PlannedNode; unit: string; t: number }) {
  void unit;
  const pop = nodeReveal(t, node.popStart);
  const settled = pop >= 1;
  const opacity = settled ? 1 : clamp01((t - node.popStart) / 0.05);

  // §2.5 — node pop = a small scale about the chip center (the BarChart/candlestick mechanism: an
  // explicit CSS transform in viewBox user units, OMITTED at settle so the gate's parseMatrix reads it).
  const scale = settled ? 1 : 0.72 + 0.28 * pop;
  const transform = settled ? undefined : `translate(${node.cx}px, ${node.cy}px) scale(${scale}) translate(${-node.cx}px, ${-node.cy}px)`;

  // Synthetic root drawn as a small neutral hub when there's no rootLabel.
  if (node.isRoot && node.showHub) {
    return (
      <g style={{ transform, opacity }} data-tax-node data-tax-rank={0} data-tax-accent="neutral" data-tax-root>
        <circle cx={node.cx} cy={node.cy} r={ROOT_R} fill={colors.text.tertiary} data-tax-chip />
      </g>
    );
  }

  const isCat = node.rank === 1;
  const isLeaf = node.rank === 2;
  const accent = accentHex(node.accentKey);
  const x = node.cx - node.w / 2;
  const y = node.cy - node.h / 2;
  const rx = 14;

  // Color: root chip neutral; category chip = full accent fill; leaf chip = parent accent tint + ring.
  let fill: string;
  let fillOpacity = 1;
  let stroke = "none";
  let strokeWidth = 0;
  let strokeOpacity = 1;
  let labelFill: string;
  if (node.isRoot) {
    fill = colors.bg.deepInk;
    stroke = colors.text.tertiary;
    strokeWidth = 2;
    labelFill = colors.text.primary;
  } else if (isCat) {
    fill = accent;
    fillOpacity = CAT_FILL_ALPHA;
    labelFill = colors.bg.deepInk;
  } else {
    fill = accent;
    fillOpacity = LEAF_FILL_ALPHA;
    stroke = accent;
    strokeWidth = 2;
    strokeOpacity = LEAF_RING_ALPHA;
    labelFill = colors.text.primary;
  }

  // FitLine zoom: the planner sized the chip to its label but a slightly-too-wide label is shrunk to
  // its FitLine zoom (≥ the floor — the planner guarantees it, else it'd be hidden) so the painted text
  // never exceeds the chip. labelScale 1 = it already fits.
  const labelPx = (node.isRoot ? ROOT_LABEL_PX : isCat ? CAT_LABEL_PX : LEAF_LABEL_PX) * node.labelScale;
  const labelFont = isLeaf ? "'JetBrains Mono', monospace" : "'Space Grotesk', sans-serif";

  return (
    <g
      style={{ transform, opacity }}
      data-tax-node
      data-tax-rank={node.rank}
      data-tax-cat={node.catIndex}
      data-tax-accent={node.accentKey}
      {...(node.isRoot ? { "data-tax-root": "" } : {})}
    >
      <rect x={x} y={y} width={node.w} height={node.h} rx={rx} fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth} strokeOpacity={strokeOpacity} data-tax-chip />
      {node.showLabel && (
        <text
          x={node.showValue ? x + NODE_PAD_X : node.cx}
          y={node.cy + labelPx * 0.34}
          textAnchor={node.showValue ? "start" : "middle"}
          fill={labelFill}
          fontFamily={labelFont}
          fontSize={labelPx}
          fontWeight={isCat || node.isRoot ? 600 : 500}
          data-tax-label
        >
          {node.label}
        </text>
      )}
      {isLeaf && node.showValue && node.valueText && (
        <text
          x={x + node.w - NODE_PAD_X}
          y={node.cy + VALUE_PX * 0.34}
          textAnchor="end"
          fill={accent}
          fontFamily="'JetBrains Mono', monospace"
          fontSize={VALUE_PX}
          fontWeight={600}
          data-tax-vchip
        >
          {node.valueText}
        </text>
      )}
    </g>
  );
}
