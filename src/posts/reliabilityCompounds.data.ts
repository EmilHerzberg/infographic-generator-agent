import type { LineSeries } from "@/components/primitives/LineChart";
import { colors } from "@/tokens/design";

const STEPS = 10;

function compoundCurve(perStep: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= STEPS; i++) out.push(Math.pow(perStep, i));
  return out;
}

export const reliabilitySeries: LineSeries[] = [
  {
    label: "99% / step",
    values: compoundCurve(0.99),
    color: colors.accent.mint,
    endValueLabel: "90%",
  },
  {
    label: "95% / step",
    values: compoundCurve(0.95),
    color: colors.accent.cyan,
    endValueLabel: "60%",
  },
  {
    label: "90% / step",
    values: compoundCurve(0.9),
    color: colors.accent.burnt,
    endValueLabel: "35%",
  },
];

export const reliabilityXLabels = Array.from({ length: STEPS + 1 }, (_, i) =>
  i === 0 || i === STEPS || i % 2 === 0 ? String(i) : "",
);
