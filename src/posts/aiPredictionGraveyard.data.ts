import type { ClaimEntry } from "@/components/primitives/ClaimList";

export const predictionEntries: ClaimEntry[] = [
  {
    id: "hinton-2016",
    date: "2016",
    source: "Geoffrey Hinton",
    claim: "Radiologists will be obsolete in 5 years.",
    reality: "The field grew",
  },
  {
    id: "amodei-2024",
    date: "2024",
    source: "Dario Amodei",
    claim: "90% of code will be AI-written by mid-2025.",
    reality: "Nowhere near",
  },
  {
    id: "musk-2024",
    date: "2024",
    source: "Elon Musk",
    claim: "AI smarter than any human by end of 2025.",
    reality: "Quietly retracted",
  },
  {
    id: "labs-2022",
    date: "2022–2024",
    source: "Multiple labs",
    claim: "Pre-training scaling reaches AGI.",
    reality: "Pretraining will end",
    realityNote: "— Sutskever, 2025",
  },
];
