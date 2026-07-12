// Shared data for the honest-factor-research marketing specs.
// All numbers verified against examples/03_explain_single_stock.py
// --ticker DUK --window-end 2024-06-28.

import { colors } from "@/tokens/design";

export const brandHonest = {
  eyebrowHero: "HONEST FACTOR RESEARCH · MODEL-AUDIT FRAMEWORK",
  threeLine: [
    "This project audits stock factor models.",
    "It does not try to predict the market.",
    "It asks whether a model's explanation can actually be trusted.",
  ],
  url: "github.com/EmilHerzberg/honest-factor-research",
  signature: {
    monogram: "EH",
    name: "Emil Herzberg",
    subtitle: "AI Systems · Automation · Design",
  },
};

// Trust-tier colors:
//   DIRECT      → successMint   (trustworthy, "green = safe")
//   STATISTICAL → strategicViolet (medium-trust academic factors)
//   DERIVED     → frictionOrange (mirror-suspect — actual risk)
//   unexplained → muted grey
export const trustColors = {
  direct: colors.accent.mint,
  statistical: colors.accent.violet,
  derived: colors.accent.burnt,
  unexplained: "rgba(184,178,167,0.22)",
  systemCyan: colors.accent.cyan,
};

// DUK 2024-06-28 — verified (updated 2026-05-26)
export const dukDecomp = {
  ticker: "DUK",
  name: "Duke Energy",
  windowEnd: "2024-06-28",
  standardR2: 0.658,
  segments: {
    direct: 0.173,
    statistical: 0.160,
    derived: 0.325,
    unexplained: 0.342,
  },
  derivedShare: 0.494, // 49.4% of explained R² is sector-mirror
};

// Hero decomp metaphor: shows the same R² under two views.
// Bar 1 ("standard"): cyan = 66%, grey = 34%
// Bar 2 ("honest"): mint 17%, violet 16%, orange 33%, grey 34%
