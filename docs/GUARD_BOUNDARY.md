# Guard boundary — what input moderation is and isn't

The injection/abuse guard (`tools/lib/guard.mjs`, Epic 02 / Sprint 2.3) is **Layer 0**: a fast,
free, deterministic pre-filter that runs on every brief to reduce attack volume. It is
**probabilistic**. It is **not** a security boundary, and nothing downstream may assume a brief
that passed it is safe.

## What it does
- **Input scan** (`scanInput`): pattern-matches prompt-injection, secret-exfiltration, jailbreak,
  delimiter-injection, and code-execution attempts. Flagged → reject with a single generic safe
  message (we never echo which rule matched). Catch rate ≥80% on the red-team corpus
  (`planning/fixtures/redteam/inject/`, `npm run guard:eval`); misses are expected and logged.
- **Output scan** (`scanOutput`): checks generated text for leaked emails / API-key-shaped secrets
  before delivery; a flagged spec is blocked (`generatePost` → `qa_failed: output_moderation`).
- **Optional BYOK second opinion** (`guardLLM`): the user's own model classifies the brief as a
  second signal — sanctioned fallback to heavy self-hosted guards (LLM Guard / Llama Prompt Guard)
  given the single-VPS budget. Best-effort; the deterministic scanner is the always-on guarantee.

## What it is NOT — the real guarantees live elsewhere
Input filtering of natural language can always be paraphrased around. The actual safety guarantees,
which do **not** depend on detecting the attack, are:
1. **Path A never executes model-authored code.** The model emits validated JSON; a fixed renderer
   makes pixels. There is no code path for an injected instruction to run.
2. **Deterministic AST allowlist + isolated sandbox (Epic 08).** Path B (opt-in) runs only
   allowlisted syntax inside a gVisor sandbox: no network, no secrets, ephemeral, resource-capped.
3. **Keys are never in the model's reach.** BYOK keys are used in-memory by the trusted
   orchestrator; the brief/generation context never contains them, so "exfiltrate the key" has
   nothing to exfiltrate from the model side.

Treat a guard "pass" as "lower probability of an attack," never as "safe." Layers 1–3 are why the
system is safe even when the guard misses.
