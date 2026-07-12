// Loads the portable briefing bundle (context/) and assembles it into a single
// system prompt, substituting {{BRAND_*}} placeholders from brand.config.json.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function loadBrand(root) {
  const raw = JSON.parse(await readFile(join(root, "brand.config.json"), "utf8"));
  // strip $comment and any non-token keys are fine to keep; we only substitute {{KEY}}
  const map = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith("$")) continue;
    map[`{{${k}}}`] = String(v);
  }
  return map;
}

function substitute(text, brand) {
  let out = text;
  for (const [token, value] of Object.entries(brand)) {
    out = out.split(token).join(value);
  }
  return out;
}

// Just the brand identity/purpose (context/01-brand-identity.md, tokens substituted) — the
// concise "what this brand is about" used by triage to judge on-purpose fit, without the full
// design/motion briefing.
export async function loadBrandPurpose(root) {
  const brand = await loadBrand(root);
  const text = await readFile(join(root, "context", "01-brand-identity.md"), "utf8");
  return substitute(text, brand);
}

// motion=false -> use the `core` set (skips 08-motion.md); motion=true -> full `order`.
export async function assembleBriefing(root, { motion = false } = {}) {
  const ctxDir = join(root, "context");
  const manifest = JSON.parse(await readFile(join(ctxDir, "manifest.json"), "utf8"));
  const brand = await loadBrand(root);
  const files = motion ? manifest.order : manifest.core;

  const parts = [];
  for (const f of files) {
    const text = await readFile(join(ctxDir, f), "utf8");
    parts.push(`<<< ${f} >>>\n\n${substitute(text, brand)}`);
  }
  return parts.join("\n\n");
}
