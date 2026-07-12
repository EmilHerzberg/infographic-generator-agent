import type { RangeEntry } from "@/components/primitives/RangeBars";

export const incentivizedEntries: RangeEntry[] = [
  { id: "altman", label: "Sam Altman · OpenAI", start: 2025, end: 2027 },
  { id: "amodei", label: "Dario Amodei · Anthropic", start: 2026, end: 2027 },
  { id: "hassabis", label: "Demis Hassabis · DeepMind", start: 2025, end: 2028 },
];

export const independentEntries: RangeEntry[] = [
  { id: "hinton", label: "Geoffrey Hinton · ex-Google", start: 2028, end: 2043 },
  { id: "bengio", label: "Yoshua Bengio · Mila", start: 2028, end: 2043 },
  { id: "lecun", label: "Yann LeCun · ex-Meta", start: 2040, end: 2052, openEnd: true },
];

export const yearRange = { min: 2024, max: 2052 };

export const marketConsensus = {
  year: 2030,
  label: "Aggregated markets",
};
