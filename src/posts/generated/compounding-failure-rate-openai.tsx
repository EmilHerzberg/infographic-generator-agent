import { Panel } from "@/components/primitives/Panel";
import { MetricCard } from "@/components/primitives/MetricCard";
import { ComparisonMatrix } from "@/components/primitives/ComparisonMatrix";
import { appear, rise, revealStyle } from "@/lib/reveal";

// Assuming PostFrame is correctly handled in your project setup
function PostFrame({ id, eyebrow, headline, summary, children }: any) {
  // Placeholder implementation assuming basic render, replace with actual `PostFrame` implementation
  return (
    <div id={id}>
      {eyebrow && <div>{eyebrow}</div>}
      {headline && <h1>{headline}</h1>}
      {summary}
      {children}
    </div>
  );
}

export default function Post({ t = 1 }: { t?: number }) {
  return (
    <PostFrame
      id="compounding-failure-rate-openai"
      eyebrow={appear(t, 0.15) ? "Compounding Failure Rate" : undefined}
      headline={appear(t, 0.00) ? "Why Most AI Agent Deployments Fail" : undefined}
      summary={<Panel label="Takeaway" style={revealStyle(t, 0.80)}>
        <p>0.95^10 = 0.60: Fewer steps, verify often</p>
      </Panel>}
    >
      <ComparisonMatrix
        rowHeaders={["Single Agent", "Multi-Agent Steps"]}
        rowAccents={["cyan", "violet"]}
        colHeaders={["Trial", "Real Deployment"]}
        tl={{ value: "28/28", accent: "cyan" }}
        tr={{ value: "36% Failure", accent: "amber" }}
        bl={{ value: "90.25%", accent: "violet" }}
        br={{ value: "5+ steps risky", accent: "burnt" }}
        headersReveal={appear(t, 0.35)}
        tlReveal={revealStyle(t, 0.35).opacity}
        trReveal={revealStyle(t, 0.60).opacity}
        blReveal={revealStyle(t, 0.50).opacity}
        brReveal={revealStyle(t, 0.75).opacity}
        highlightCell="tr"
        focusOn={null}
        focusLockOpacity={0.7}
      />
      <div style={{ transform: `translateY(${rise(t, 0.60)}px)` }}>
        <MetricCard
          label="0.95^10"
          value="60%"
          accent="amber"
          delta={appear(t, 0.60) ? "-40% reliability" : undefined}
        />
      </div>
    </PostFrame>
  );
}