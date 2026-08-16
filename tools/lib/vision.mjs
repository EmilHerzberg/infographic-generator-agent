// Q3 — vision backstop. Sends the rendered screenshot to a vision model to catch
// readability/clarity issues geometry can't measure (unlabeled chart lines, misreadable
// units, weak headline, crowding). Configurable via VISION_PROVIDER/VISION_MODEL.
import { generateObject } from "ai";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { resolveModel, llmCallSignal } from "./model.mjs";

const VisionSchema = z.object({
  readable: z.boolean(),
  chartLinesLabeled: z.union([z.boolean(), z.null()]),
  issues: z.array(
    z.object({
      kind: z.string(),
      detail: z.string(),
      severity: z.enum(["error", "warn", "info"]),
    })
  ),
  verdict: z.enum(["ship", "revise"]),
});

const SYSTEM =
  "You are a senior visual designer reviewing ONE LinkedIn infographic (1080x1350, dark warm-technical " +
  "brand). Judge readability and clarity, NOT personal taste. Check specifically: are chart lines/series " +
  "DIRECTLY labeled with the variable they represent (not just an endpoint value)? could any value or unit " +
  "be misread or confused with another? does the headline carry the message? does it look crowded or " +
  "unbalanced? Return concrete, specific issues. Use verdict 'revise' only for real readability/clarity " +
  "problems; aesthetic nitpicks are severity 'info'. Set chartLinesLabeled=null if there is no chart.";

export async function visionReview({ screenshotPath, provider }) {
  const p = provider || process.env.VISION_PROVIDER || "anthropic";
  const { model } = resolveModel(p, { modelOverride: process.env.VISION_MODEL });
  const image = await readFile(screenshotPath);

  const { object } = await generateObject({
    model,
    schema: VisionSchema,
    system: SYSTEM,
    abortSignal: llmCallSignal(),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Review this infographic for readability and clarity." },
          { type: "image", image },
        ],
      },
    ],
    maxRetries: 2,
  });

  const findings = (object.issues || []).map((i) => ({
    check: "vision",
    severity: i.severity,
    message: `${i.kind}: ${i.detail}`,
    data: i,
  }));

  // A "revise" verdict on a readability problem should block, even if the model
  // only tagged its issues as warn.
  if (object.verdict === "revise" && object.readable === false && !findings.some((x) => x.severity === "error")) {
    findings.push({ check: "vision", severity: "error", message: "not readable — revise (vision verdict)", data: { verdict: object.verdict } });
  }
  if (object.chartLinesLabeled === false) {
    findings.push({ check: "vision", severity: "warn", message: "chart lines are not directly labeled with their variable", data: {} });
  }
  return findings;
}
