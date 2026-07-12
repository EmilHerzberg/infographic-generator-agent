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
    defaultModel: "gemini-2.5-pro", // frontier tier (was -flash); override with GEMINI_MODEL for cheap/fast
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
    defaultModel: "gemini-2.5-pro",
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
