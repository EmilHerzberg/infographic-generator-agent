// Resolves a --provider name to a Vercel AI SDK model instance.
// One unified interface across Anthropic, Google (Gemini), DeepSeek, and any
// OpenAI-compatible endpoint (OpenAI, OpenRouter, Ollama, LM Studio, ...).
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const REGISTRY = {
  anthropic: {
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-opus-4-8",
    make: ({ apiKey, baseURL }) => createAnthropic({ apiKey, ...(baseURL ? { baseURL } : {}) }),
  },
  gemini: {
    envKey: "GEMINI_API_KEY",
    defaultModel: "gemini-3.1-pro-preview", // 2.5-pro removed: writes crash-grade component code (see models-catalog); override with GEMINI_MODEL
    make: ({ apiKey, baseURL }) => createGoogleGenerativeAI({ apiKey, ...(baseURL ? { baseURL } : {}) }),
  },
  deepseek: {
    envKey: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-v4-pro", // frontier tier (was deepseek-chat); override with DEEPSEEK_MODEL
    make: ({ apiKey, baseURL }) => createDeepSeek({ apiKey, ...(baseURL ? { baseURL } : {}) }),
  },
  // OpenAI (official) — handles gpt-5.5 / o-series reasoning models correctly.
  openai: {
    envKey: "OPENAI_API_KEY",
    defaultModel: "gpt-5.5",
    make: ({ apiKey, baseURL }) => createOpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) }),
  },
  // Generic OpenAI-compatible endpoint (OpenRouter, Ollama, LM Studio, vLLM, ...).
  compatible: {
    envKey: "COMPATIBLE_API_KEY",
    defaultModel: "openrouter/auto",
    make: ({ apiKey, baseURL }) =>
      createOpenAICompatible({ name: "compatible", apiKey, baseURL: baseURL || "https://openrouter.ai/api/v1" }),
  },
  // Google Vertex AI — supports express-mode API key OR service-account/ADC.
  // envKey omitted: the make() validates its own (two-mode) credentials.
  vertex: {
    envKey: null,
    defaultModel: "gemini-3.1-pro-preview",
    make: () => {
      if (process.env.GOOGLE_VERTEX_API_KEY) {
        return createVertex({ apiKey: process.env.GOOGLE_VERTEX_API_KEY });
      }
      const project = process.env.GOOGLE_VERTEX_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
      if (project) {
        return createVertex({
          project,
          location:
            process.env.GOOGLE_VERTEX_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
        });
      }
      throw new Error(
        "Vertex needs either GOOGLE_VERTEX_API_KEY (express mode) or GOOGLE_CLOUD_PROJECT + GOOGLE_APPLICATION_CREDENTIALS (service account). See .env.example."
      );
    },
  },
};

// ── Client-side LLM timeouts (2026-07 timeout audit) ─────────────────────────────────────────────
// No provider client configures a timeout, so every call used to ride Node/undici defaults — 300s to
// headers, and a TRICKLING stream could extend forever (the body timeout resets per chunk). The
// server's isolated-gen container cap (480s) backstopped the studio, but local CLI/bench calls were
// unbounded: one wedged provider call could hang a gen slot indefinitely. Every generateText /
// generateObject call now passes an AbortSignal:
//   • single-shot structured calls (concierge / judge / triage / guard / Path A spec) →
//     LLM_TIMEOUT_MS, default 300s — generous for reasoning models, finite always.
//   • the multi-step Path B agent loop (generateText, up to 32 steps) → GEN_LOOP_TIMEOUT_MS,
//     default 25 min for the WHOLE loop (legit funnel cells have run 11 min; the signal spans
//     retries too, so it must dominate the slowest honest run).
export const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 300000;
export const GEN_LOOP_TIMEOUT_MS = Number(process.env.GEN_LOOP_TIMEOUT_MS) || 1500000;

/** AbortSignal for a single-shot LLM call. */
export function llmCallSignal(ms = LLM_TIMEOUT_MS) {
  return AbortSignal.timeout(ms);
}

/** AbortSignal for a whole multi-step agent loop. */
export function genLoopSignal(ms = GEN_LOOP_TIMEOUT_MS) {
  return AbortSignal.timeout(ms);
}

/** True when an error came from OUR timeout signal (AI SDK surfaces AbortError/TimeoutError).
 *  Deliberately identity-based, NOT message-based: a provider's own "504 gateway timeout" at t=30s
 *  must not be relabeled as our whole-loop cap (wrong duration + wrong debugging direction). */
export function isLlmTimeout(e) {
  return !!e && (e.name === "TimeoutError" || e.name === "AbortError");
}

export function providerNames() {
  return Object.keys(REGISTRY);
}

// Resolve the model id that WILL be used for a provider (override → env → registry default),
// without constructing a client or needing a key. For display/labeling (e.g. the A/B gallery).
export function modelIdFor(providerName, modelOverride) {
  const entry = REGISTRY[providerName];
  if (!entry) return modelOverride || providerName;
  const prefix = providerName.toUpperCase();
  return modelOverride || process.env[`${prefix}_MODEL`] || entry.defaultModel;
}

export function resolveModel(providerName, { modelOverride, apiKey: apiKeyOverride } = {}) {
  const entry = REGISTRY[providerName];
  if (!entry) {
    throw new Error(`Unknown provider "${providerName}". Available: ${providerNames().join(", ")}`);
  }
  // BYOK: an explicit apiKey (from the orchestrator, per-user) takes precedence and is never
  // read from or written to the environment. Falls back to env only for local CLI use.
  let apiKey = apiKeyOverride;
  if (!apiKey && entry.envKey) {
    apiKey = process.env[entry.envKey];
    if (!apiKey) throw new Error(`Missing ${entry.envKey}. Add it to .env (see .env.example).`);
  }

  const prefix = providerName.toUpperCase();
  const modelId = modelOverride || process.env[`${prefix}_MODEL`] || entry.defaultModel;
  const baseURL = process.env[`${prefix}_BASE_URL`];

  const provider = entry.make({ apiKey, baseURL });
  return { model: provider(modelId), modelId, providerName };
}
