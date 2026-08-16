// Q2 — data-fidelity judge. Verifies the numbers/claims rendered in the infographic
// against the source brief (re-checks arithmetic, flags unsupported claims, ambiguous
// units). Returns severity-tagged findings. Configurable model via JUDGE_PROVIDER/JUDGE_MODEL.
import { generateObject } from "ai";
import { z } from "zod";
import { resolveModel, llmCallSignal } from "./model.mjs";

const JudgeSchema = z.object({
  dataFidelityPass: z.boolean(),
  issues: z.array(
    z.object({
      type: z.enum(["wrong_number", "unsupported_claim", "unit_ambiguity", "mislabel", "other"]),
      detail: z.string(),
      severity: z.enum(["error", "warn"]),
    })
  ),
});

const SYSTEM =
  "You are a strict fact-checker for data infographics. You are given the SOURCE BRIEF and the TEXT " +
  "STRINGS rendered in the infographic. Verify ONLY against the brief: (1) every number shown is " +
  "consistent with the brief; (2) any arithmetic shown is correct; (3) no claim is unsupported by or " +
  "contradicts the brief; (4) units/labels are unambiguous. Do NOT invent issues or critique design. " +
  "If the data is faithful, return dataFidelityPass=true with an empty issues list. Use severity 'error' " +
  "for wrong numbers / contradictions / unsupported claims, and 'warn' for genuine unit/label ambiguity.";

export async function judgeDataFidelity({ brief, texts, provider }) {
  const p = provider || process.env.JUDGE_PROVIDER || "anthropic";
  const { model } = resolveModel(p, { modelOverride: process.env.JUDGE_MODEL });

  const prompt =
    `SOURCE BRIEF:\n${brief}\n\n` +
    `RENDERED INFOGRAPHIC TEXT (one string per element):\n${(texts || []).map((t) => `- ${t}`).join("\n")}`;

  const { object } = await generateObject({ model, schema: JudgeSchema, system: SYSTEM, prompt, maxRetries: 2, abortSignal: llmCallSignal() });

  return (object.issues || []).map((i) => ({
    check: "dataFidelity",
    severity: i.severity,
    message: `${i.type}: ${i.detail}`,
    data: i,
  }));
}
