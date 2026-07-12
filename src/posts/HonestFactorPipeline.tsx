// Spec 3 — Pipeline Architecture (honest_factor_pipeline_v1)
// Portrait 1080×1350. Top-down dataflow with 1→3 fan-out → re-merge.
//
// Color Role Plan:
//   primary    systemCyan       → hub node (Rolling RidgeCV) + linear-chain arrows
//   warm       insightAmber     → 3 diagnostic nodes (3px top-border + lucide icon)
//   diff       strategicViolet  → reports node (3px top-border + FileText icon)

import { Activity, FileText, Gauge, Layers } from "lucide-react";
import { CreatorSignature } from "@/components/primitives/CreatorSignature";
import { colors } from "@/tokens/design";

function CanvasShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative overflow-hidden bg-bg-warm-graphite text-text-primary"
      style={{ width: 1080, height: 1350, aspectRatio: "1080 / 1350" }}
    >
      <div className="pointer-events-none absolute inset-0 bg-grid-faint bg-grid" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(89,216,230,0.08), transparent 65%), radial-gradient(ellipse 100% 100% at 50% 110%, rgba(0,0,0,0.45), transparent 60%)",
        }}
      />
      {children}
    </div>
  );
}

function NeutralNode({
  x,
  y,
  w,
  h,
  title,
  subtitle,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  subtitle: string;
}) {
  return (
    <div
      className="absolute rounded-[16px] bg-bg-soft-panel/80"
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        boxShadow:
          "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 0 0 1px rgba(244,241,234,0.10), 0 12px 28px -22px rgba(0,0,0,0.7)",
      }}
    >
      <div className="flex h-full flex-col justify-center px-6">
        <div
          className="font-display font-semibold uppercase tracking-[0.08em] text-text-primary"
          style={{ fontSize: 28, letterSpacing: "0.02em" }}
        >
          {title}
        </div>
        <div
          className="mt-1.5 font-mono text-text-secondary"
          style={{ fontSize: 18, letterSpacing: "0.06em" }}
        >
          {subtitle}
        </div>
      </div>
    </div>
  );
}

function HubNode({
  x,
  y,
  w,
  h,
  title,
  subtitle,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  subtitle: string;
}) {
  return (
    <div
      className="absolute rounded-[18px]"
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        backgroundColor: "rgba(89,216,230,0.16)",
        boxShadow:
          "0 0 0 1.5px " +
          colors.accent.cyan +
          ", 0 0 36px -6px rgba(89,216,230,0.45), 0 12px 28px -18px rgba(0,0,0,0.7)",
      }}
    >
      <div className="flex h-full flex-col justify-center px-7">
        <div
          className="font-display font-semibold uppercase text-text-primary"
          style={{ fontSize: 32, letterSpacing: "0.04em" }}
        >
          {title}
        </div>
        <div
          className="mt-1.5 font-mono text-text-secondary"
          style={{ fontSize: 20, letterSpacing: "0.08em" }}
        >
          {subtitle}
        </div>
      </div>
    </div>
  );
}

function AccentNode({
  x,
  y,
  w,
  h,
  accent,
  icon,
  title,
  lines,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  accent: string;
  icon: React.ReactNode;
  title: string;
  lines: string[];
}) {
  return (
    <div
      className="absolute overflow-hidden rounded-[14px] bg-bg-soft-panel/80"
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        boxShadow:
          "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 0 0 1px rgba(244,241,234,0.08), 0 12px 28px -22px rgba(0,0,0,0.7)",
      }}
    >
      {/* Accent top border */}
      <div
        className="absolute left-0 right-0 top-0"
        style={{ height: 3, backgroundColor: accent }}
      />
      <div className="flex h-full flex-col px-5 pt-5">
        <div style={{ color: accent }}>{icon}</div>
        <div
          className="mt-3 font-display font-semibold uppercase tracking-[0.06em] text-text-primary"
          style={{ fontSize: 22 }}
        >
          {title}
        </div>
        {lines.map((line, i) => (
          <div
            key={i}
            className="mt-1 font-mono text-text-secondary"
            style={{ fontSize: 16, letterSpacing: "0.04em", lineHeight: 1.35 }}
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

function VerticalArrow({
  x,
  y,
  length,
  color,
}: {
  x: number;
  y: number;
  length: number;
  color: string;
}) {
  return (
    <svg
      className="pointer-events-none absolute"
      style={{ left: x - 8, top: y, width: 16, height: length }}
      viewBox={`0 0 16 ${length}`}
    >
      <line
        x1={8}
        x2={8}
        y1={0}
        y2={length - 10}
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <polygon
        points={`8,${length} 2,${length - 12} 14,${length - 12}`}
        fill={color}
      />
    </svg>
  );
}

function BranchArrows() {
  // Hub bottom-center is at (canvas x=540, y=784). Branch arrows go to top-center
  // of each diagnostic node:
  //   Trust:  (220, 880)
  //   CI:     (540, 880)
  //   Regime: (860, 880)
  const stroke = "rgba(184,178,167,0.55)";
  return (
    <svg
      className="pointer-events-none absolute"
      style={{ left: 0, top: 0, width: 1080, height: 1350 }}
      viewBox="0 0 1080 1350"
    >
      {/* Center (straight) */}
      <line
        x1={540}
        x2={540}
        y1={784}
        y2={870}
        stroke={stroke}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <polygon points="540,880 533,866 547,866" fill={stroke} />

      {/* Left S-curve */}
      <path
        d="M 540 784 C 540 820, 220 820, 220 870"
        fill="none"
        stroke={stroke}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <polygon points="220,880 213,866 227,866" fill={stroke} />

      {/* Right S-curve */}
      <path
        d="M 540 784 C 540 820, 860 820, 860 870"
        fill="none"
        stroke={stroke}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <polygon points="860,880 853,866 867,866" fill={stroke} />
    </svg>
  );
}

function MergeArrows() {
  // 3 diagnostic node bottom-centers (220, 1020), (540, 1020), (860, 1020)
  // converge into reports node top-center (540, 1088).
  const stroke = "rgba(184,178,167,0.55)";
  return (
    <svg
      className="pointer-events-none absolute"
      style={{ left: 0, top: 0, width: 1080, height: 1350 }}
      viewBox="0 0 1080 1350"
    >
      {/* Center straight */}
      <line
        x1={540}
        x2={540}
        y1={1020}
        y2={1078}
        stroke={stroke}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <polygon points="540,1088 533,1074 547,1074" fill={stroke} />

      {/* Left S-curve */}
      <path
        d="M 220 1020 C 220 1055, 540 1055, 540 1078"
        fill="none"
        stroke={stroke}
        strokeWidth={2.5}
        strokeLinecap="round"
      />

      {/* Right S-curve */}
      <path
        d="M 860 1020 C 860 1055, 540 1055, 540 1078"
        fill="none"
        stroke={stroke}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HonestFactorPipelinePost() {
  return (
    <CanvasShell>
      {/* Title */}
      <div className="absolute" style={{ left: 80, top: 96, width: 920 }}>
        <div
          className="font-mono uppercase tracking-[0.22em] text-accent-cyan"
          style={{ fontSize: 26 }}
        >
          PIPELINE ARCHITECTURE · END-TO-END
        </div>
        <h1
          className="mt-5 font-display font-semibold text-text-primary"
          style={{ fontSize: 52, lineHeight: 1.1, letterSpacing: "-0.015em" }}
        >
          One residualized factor matrix
          <br />
          feeds three parallel diagnostics.
        </h1>
      </div>

      {/* Linear chain: 4 nodes, vertical */}
      <NeutralNode
        x={340}
        y={268}
        w={400}
        h={84}
        title="Market Data"
        subtitle="yfinance + NASDAQ screener"
      />
      <VerticalArrow x={540} y={360} length={40} color={colors.accent.cyan} />
      <NeutralNode
        x={340}
        y={408}
        w={400}
        h={84}
        title="Log Returns"
        subtitle="wide DataFrame"
      />
      <VerticalArrow x={540} y={500} length={40} color={colors.accent.cyan} />
      <NeutralNode
        x={340}
        y={548}
        w={400}
        h={84}
        title="Factor Catalog"
        subtitle="28 factors · YAML"
      />
      <VerticalArrow x={540} y={640} length={40} color={colors.accent.cyan} />

      {/* Hub node */}
      <HubNode
        x={300}
        y={688}
        w={480}
        h={96}
        title="Rolling RidgeCV"
        subtitle="252-day windows"
      />

      {/* Branch arrows from hub to 3 diagnostics */}
      <BranchArrows />

      {/* 3 diagnostic nodes — horizontal row */}
      <AccentNode
        x={80}
        y={880}
        w={280}
        h={140}
        accent={colors.accent.amber}
        icon={<Layers size={24} strokeWidth={1.75} />}
        title="Trust-Stratified R²"
        lines={["DIRECT / STAT / DERIVED", "decomposition"]}
      />
      <AccentNode
        x={400}
        y={880}
        w={280}
        h={140}
        accent={colors.accent.amber}
        icon={<Activity size={24} strokeWidth={1.75} />}
        title="Block-Bootstrap CI"
        lines={["Politis-Romano stationary", "non-parametric uncertainty"]}
      />
      <AccentNode
        x={720}
        y={880}
        w={280}
        h={140}
        accent={colors.accent.amber}
        icon={<Gauge size={24} strokeWidth={1.75} />}
        title="Regime Betas"
        lines={["VIX-stratified beta refit", "low-VIX / high-VIX"]}
      />

      {/* Merge arrows */}
      <MergeArrows />

      {/* Reports node */}
      <div
        className="absolute overflow-hidden rounded-[14px] bg-bg-soft-panel/80"
        style={{
          left: 380,
          top: 1088,
          width: 320,
          height: 84,
          boxShadow:
            "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 0 0 1px rgba(244,241,234,0.08), 0 0 28px -6px rgba(142,124,195,0.35), 0 12px 28px -22px rgba(0,0,0,0.7)",
        }}
      >
        <div
          className="absolute left-0 right-0 top-0"
          style={{ height: 3, backgroundColor: colors.accent.violet }}
        />
        <div className="flex h-full items-center gap-3 px-5">
          <div style={{ color: colors.accent.violet }}>
            <FileText size={26} strokeWidth={1.75} />
          </div>
          <div className="flex flex-col">
            <div
              className="font-display font-semibold uppercase tracking-[0.06em] text-text-primary"
              style={{ fontSize: 24 }}
            >
              Reports + CSVs
            </div>
            <div
              className="font-mono text-text-secondary"
              style={{ fontSize: 16, letterSpacing: "0.06em" }}
            >
              reproducible outputs
            </div>
          </div>
        </div>
      </div>

      {/* Caption strip */}
      <div
        className="absolute font-mono text-text-tertiary"
        style={{ left: 80, top: 1196, width: 920, fontSize: 18, letterSpacing: "0.08em" }}
      >
        Same residualized factor matrix · three parallel diagnostics · one reproducible report set.
      </div>

      {/* Signature in its own bottom row */}
      <div className="absolute flex justify-end" style={{ left: 80, right: 80, bottom: 28 }}>
        <CreatorSignature variant="compact" placement="inline" />
      </div>
    </CanvasShell>
  );
}
