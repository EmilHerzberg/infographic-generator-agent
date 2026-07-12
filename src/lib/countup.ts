// PL-1.1 — MetricCard count-up value parser + frame formatter. Pure and dependency-free
// so the deterministic check suite (tools/qa-countup.mjs) can unit-test it without a DOM
// (Node imports this .ts file directly via native type stripping).
//
// Decides whether a schema `value` string animates (counts 0 → final) and, if so, produces
// the per-frame display string. Anything non-conforming falls back to a plain fade — never
// an error, never a partial parse.
// Spec: planning/primitive-library/handoffs/PL-1.1-metriccard-countup.md §2.5.1 / §2.6.

export type FadeReason =
  | "regex" // doesn't match the strict numeric shape (covers C2 decimals, C3 prefix, C4 suffix)
  | "intDigits" // > 9 integer digits (C1)
  | "length" // > 14 chars (C5)
  | "year" // bare 4-digit integer, no affix, no comma — reads as a year, not a metric
  | "nonFinite" // NaN / Infinity / negative zero from the numeric conversion
  | "roundTrip"; // formatter can't reproduce the input byte-for-byte (leading zeros, padding, odd grouping)

export type CountUpPlan =
  | { animate: true; display: (p: number) => string }
  | { animate: false; reason: FadeReason };

// ^ prefix?  int (comma-grouped or plain)  .frac{1,2}?  suffix? $ — anchored, no heuristics (§2.5.1).
const VALUE_RE =
  /^([+\-−$€£]?)(\d{1,3}(?:,\d{3})*|\d+)(\.\d{1,2})?((?:%|k|K|M|B|x|×|pp|pt|s|ms|h)?)$/;

const MAX_INT_DIGITS = 9; // C1
const MAX_LENGTH = 14; // C5

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Comma-group an integer digit string: "1234567" → "1,234,567". */
const group = (int: string) => int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export function planCountUp(value: string): CountUpPlan {
  const fade = (reason: FadeReason): CountUpPlan => ({ animate: false, reason });

  const trimmed = value.trim();
  const m = VALUE_RE.exec(trimmed);
  if (!m) return fade("regex");
  const prefix = m[1];
  const int = m[2];
  const frac = m[3] ?? "";
  const suffix = m[4];

  const intDigits = int.replace(/,/g, "");
  if (intDigits.length > MAX_INT_DIGITS) return fade("intDigits");
  if (trimmed.length > MAX_LENGTH) return fade("length");
  // Year rule: a bare 4-digit integer (no prefix, no suffix, no comma, no decimals) reads as a
  // year — counting 0→2013 looks like a slot machine. A true count written "2,013" still animates.
  if (!prefix && !suffix && !frac && /^\d{4}$/.test(int)) return fade("year");

  const nFinal = Number(intDigits + frac);
  if (!Number.isFinite(nFinal) || Object.is(nFinal, -0)) return fade("nonFinite");
  const d = frac ? frac.length - 1 : 0; // decimal count, preserved exactly at every frame (C2)
  const grouped = int.includes(",");

  const format = (p: number): string => {
    const fixed = (nFinal * clamp01(p)).toFixed(d);
    const dot = fixed.indexOf(".");
    const i = dot === -1 ? fixed : fixed.slice(0, dot);
    const f = dot === -1 ? "" : fixed.slice(dot);
    return prefix + (grouped ? group(i) : i) + f + suffix;
  };

  // Round-trip guard (§2.6.2): the formatter at p=1 must reproduce the input byte-for-byte —
  // catches leading zeros ("007"), irregular grouping ("0,123"), and padded input. Demote to fade.
  if (format(1) !== value) return fade("roundTrip");

  // Exactness override (C11): at p ≥ 1 the ORIGINAL schema string is rendered verbatim — the
  // final frame can never be a rounding artifact.
  return { animate: true, display: (p: number) => (p >= 1 ? value : format(p)) };
}

// PL-4.2 — MetricCard `deltaTrend` knob. Maps an author-stated trend to a semantic-accent ROLE
// (Multi-Accent strategy): up → successMint, down → frictionOrange. `flat` and absent both resolve
// to `null` ⇒ the delta keeps its CURRENT neutral color (text.secondary), byte-identical to today.
// Direction is decoupled from value polarity (an author knob): "latency −20%" is intentionally a
// GOOD `down`. Pure + dependency-free (no design-token import) so qa-countup unit-tests it without a
// DOM; the renderer maps the role name → hex via design tokens (single source of truth for the hex).
export type DeltaTrend = "up" | "down" | "flat";
export function deltaTrendRole(trend?: DeltaTrend): "successMint" | "frictionOrange" | null {
  if (trend === "up") return "successMint";
  if (trend === "down") return "frictionOrange";
  return null; // "flat" | undefined ⇒ neutral (today's delta color)
}
