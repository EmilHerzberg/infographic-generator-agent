// Browser-free font metrics via fontkit (MIT — FRAMEWORKS.md §D/§E adoption, PL-0.3 deliverable C).
// Reads the SHIPPED offline woff2 (src/remotion/fonts-local.css — the exact faces the Remotion MP4
// and the now-parity Preview render with) and exposes real glyph advance widths + OpenType feature
// shaping (tnum!). This lets the tabular-figures check (and, optionally, the estW char-class tables)
// run as pure Node units with REAL font metrics — no dev server, no browser, no fallback risk.
//
// The faces are base64 data-URIs inside fonts-local.css (no .woff2 on disk), so we decode the right
// block straight from the CSS. fontkit decompresses woff2 (brotli) internally.
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as fontkit from "fontkit";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FONTS_CSS = join(ROOT, "src", "remotion", "fonts-local.css");

// Decode the woff2 buffer for (family, weight, subset) out of the offline CSS. `subset` "latin"
// (the U+0-FF / U+0000-00FF face, which carries the ASCII digits) or "latin-ext".
export async function loadFace(family, weight, subset = "latin") {
  const css = await readFile(FONTS_CSS, "utf8");
  // @font-face blocks are emitted one per /* <subset> */ comment; split on the at-rule keyword.
  for (const blk of css.split("@font-face")) {
    if (!new RegExp(`font-family:\\s*'${family}'`).test(blk)) continue;
    if (!new RegExp(`font-weight:\\s*${weight}\\b`).test(blk)) continue;
    const isLatin = /U\+0000-00FF|U\+0-FF/.test(blk);
    if (subset === "latin" ? !isLatin : isLatin) continue;
    const b64 = blk.match(/base64,([A-Za-z0-9+/=]+)\)/)?.[1];
    if (!b64) continue;
    return fontkit.create(Buffer.from(b64, "base64"));
  }
  throw new Error(`offline face not found: ${family} ${weight} (${subset}) in ${FONTS_CSS}`);
}

// Advance width (in px at `sizePx`) of `text` through `font`, optionally with OpenType features
// (e.g. ["tnum"]). Returns the sum of glyph advances. Browser-free — the true shaped advance.
export function advancePx(font, text, sizePx, features = []) {
  const run = font.layout(text, features);
  const units = run.glyphs.reduce((sum, g) => sum + g.advanceWidth, 0);
  return (units * sizePx) / font.unitsPerEm;
}

// Per-digit advances (px) for 0–9 with the given features — the tabular-figures unit check input.
export function digitAdvances(font, sizePx, features = []) {
  return Array.from({ length: 10 }, (_, d) => advancePx(font, String(d), sizePx, features));
}
