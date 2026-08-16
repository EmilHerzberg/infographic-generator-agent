import { createContext } from "react";

// The author signature the current post is rendered with, provided around a post by the render surface
// (Remotion composition) from the job's <id>.meta.json sidecar — NOT from the model-authored component,
// and NOT from the brief text, so a malicious brief can neither forge someone else's name nor strip a
// marker. `PostFrame` reads it to decide the footer signature:
//   • { name, subtitle? } → render THAT author (monogram derived from the name; no brand fallback).
//   • { hidden: true }    → render NO signature at all (the SaaS default when the user left it blank).
//   • null (no provider)  → fall back to the brand default (Emil's own CLI/personal pipeline + the QA
//                           inspector), so existing baselines are byte-identical.
export type SignatureConfig = { name: string; subtitle?: string } | { hidden: true };

export const SignatureContext = createContext<SignatureConfig | null>(null);
