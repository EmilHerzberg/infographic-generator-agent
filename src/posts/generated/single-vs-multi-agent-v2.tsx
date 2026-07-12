import { PostFrame } from "@/components/layout/PostFrame";
import { Panel } from "@/components/primitives/Panel";
import { MetricCard } from "@/components/primitives/MetricCard";
import { Network, GitBranch, AlertTriangle, Check } from "lucide-react";
import { colors, text as textScale } from "@/tokens/design";

// ───────────────────────────────────────────────────────────────
// Content type: Decision Framework / Comparison (#5 / #10)
// Format: Two-column condition contrast + decisive metric strip.
// No chart — this is decision logic, not change-over-time.
//
// Color roles:
//   System Cyan   = legitimate decomposition → ADD AGENTS column
//   Friction Orange = coordination overhead / failure surface → STAY SINGLE column
//   Insight Amber  = decisive takeaway metric
//   Success Mint   = positive outcome metric
//
// Layout (middle zone 64..1030):
//   grid 2 cols, gap 24px → each panel ~440px wide, full height.
//   Row text: 28px body (floor 28) · mono header 24px (floor 22).
//   Panels are grid-managed → no overlap. Bottom metric strip in summary.
// ───────────────────────────────────────────────────────────────

type Condition = { text: string };

const ADD_WHEN: Condition[] = [
  { text: "Tasks split into independent, parallel subgoals" },
  { text: "Each role needs a distinct toolset or context window" },
  { text: "You can verify each agent's output in isolation" },
];

const STAY_WHEN: Condition[] = [
  { text: "Steps are sequential and share one context" },
  { text: "Hand-offs cost more than the work they pass" },
  { text: "Failures compound silently across agents" },
];

function ConditionRow({
  text,
  tone,
}: {
  text: string;
  tone: "cyan" | "burnt";
}) {
  const Icon = tone === "cyan" ? Check : AlertTriangle;
  const color = tone === "cyan" ? colors.accent.cyan : colors.accent.burnt;
  return (
    <div className="flex items-start gap-3">
      <Icon
        size={28}
        strokeWidth={1.75}
        color={color}
        style={{ flexShrink: 0, marginTop: 2 }}
      />
      <span
        className="font-body text-text-primary"
        style={{ fontSize: 28, lineHeight: 1.22 }}
      >
        {text}
      </span>
    </div>
  );
}

function DecisionColumn({
  label,
  Icon,
  tone,
  conditions,
}: {
  label: string;
  Icon: typeof Network;
  tone: "cyan" | "burnt";
  conditions: Condition[];
}) {
  const color = tone === "cyan" ? colors.accent.cyan : colors.accent.burnt;
  return (
    <Panel className="h-full">
      <div className="flex h-full flex-col gap-6">
        <div className="flex items-center gap-3">
          <Icon size={34} strokeWidth={1.75} color={color} />
          <span
            className="font-mono uppercase tracking-[0.20em]"
            style={{ fontSize: textScale.panelLabel, color }}
          >
            {label}
          </span>
        </div>
        <div className="flex flex-col gap-5">
          {conditions.map((c) => (
            <ConditionRow key={c.text} text={c.text} tone={tone} />
          ))}
        </div>
      </div>
    </Panel>
  );
}

export default function Post() {
  return (
    <PostFrame
      eyebrow="AGENT ARCHITECTURE · DECISION"
      headline="More agents only help when the work actually splits"
      signal="DEFAULT TO ONE"
      visualization={
        <div className="grid h-full grid-cols-2 items-stretch gap-6 py-2">
          <DecisionColumn
            label="ADD AGENTS WHEN"
            Icon={Network}
            tone="cyan"
            conditions={ADD_WHEN}
          />
          <DecisionColumn
            label="STAY SINGLE WHEN"
            Icon={GitBranch}
            tone="burnt"
            conditions={STAY_WHEN}
          />
        </div>
      }
      summary={
        <div className="flex items-stretch gap-4">
          <MetricCard
            label="Each new agent"
            value="+1"
            delta="coordination edge"
            accent="burnt"
          />
          <MetricCard
            label="Failure surface"
            value="×N"
            delta="grows with agents"
            accent="amber"
          />
          <MetricCard
            label="Right scope"
            value="1"
            delta="agent, until it breaks"
            accent="mint"
          />
        </div>
      }
    />
  );
}
