# Security

## Path B executes AI-generated code

**Path B** (`npm run agent`) has the model *write a React/Remotion component* and then renders it to
inspect and self-correct it. That means **code produced by the model runs on your machine** (in Node
and in a headless Chromium during QA, and in Remotion during render). Path A (`npm run generate`) does
**not** run model-authored code — it only emits a validated JSON spec drawn by a fixed renderer.

Implications:

- Run Path B on **briefs you control**. Treat a brief from an untrusted third party as untrusted input.
- If you build a service that lets **untrusted users** trigger Path B, run generation in a **sandbox**:
  a locked-down container (non-root, read-only rootfs, dropped capabilities, resource limits) with **no
  network egress except your LLM endpoint**, and render with **no network at all**. Do not run it
  directly on a host that holds secrets.
- The headless inspector browser should be network-restricted so model-authored markup can't fetch or
  exfiltrate. Keep provider API keys server-side; never expose them to the rendered/browser context.

## Keys

Your provider API keys live in `.env` (git-ignored). Never commit `.env` or any credential file.
Rotate a key immediately if it is ever exposed.

## Reporting a vulnerability

Please report security issues privately via a GitHub security advisory / the repository's contact,
rather than a public issue. We'll acknowledge and work on a fix.
