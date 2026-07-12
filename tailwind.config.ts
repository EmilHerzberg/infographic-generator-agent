import type { Config } from "tailwindcss";
import { colors, fonts, layout } from "./src/tokens/design";

const fontStack = (s: string) =>
  s.split(",").map((p) => p.trim().replace(/['"]/g, ""));

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "bg-deep-ink": colors.bg.deepInk,
        "bg-warm-graphite": colors.bg.warmGraphite,
        "bg-midnight-slate": colors.bg.midnightSlate,
        "bg-soft-panel": colors.bg.softPanel,
        "text-primary": colors.text.primary,
        "text-secondary": colors.text.secondary,
        "text-tertiary": colors.text.tertiary,
        "accent-cyan": colors.accent.cyan,
        "accent-amber": colors.accent.amber,
        "accent-violet": colors.accent.violet,
        "accent-mint": colors.accent.mint,
        "accent-burnt": colors.accent.burnt,
        "system-cyan": colors.semanticAccent.systemCyan,
        "insight-amber": colors.semanticAccent.insightAmber,
        "strategic-violet": colors.semanticAccent.strategicViolet,
        "success-mint": colors.semanticAccent.successMint,
        "friction-orange": colors.semanticAccent.frictionOrange,
      },
      fontFamily: {
        display: fontStack(fonts.display),
        body: fontStack(fonts.body),
        editorial: fontStack(fonts.editorial),
        mono: fontStack(fonts.mono),
      },
      borderRadius: {
        panel: layout.radius.panel,
        card: layout.radius.card,
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(rgba(184,178,167,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(184,178,167,0.04) 1px, transparent 1px)",
        "warm-vignette":
          "radial-gradient(ellipse 80% 60% at 85% 0%, rgba(231,169,90,0.10), transparent 60%), radial-gradient(ellipse 100% 100% at 50% 110%, rgba(0,0,0,0.45), transparent 60%)",
        "panel-sheen":
          "linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0) 40%)",
      },
      backgroundSize: {
        grid: "40px 40px",
      },
      boxShadow: {
        panel:
          "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 0 0 1px rgba(184,178,167,0.06), 0 18px 40px -28px rgba(0,0,0,0.7)",
        card: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 0 0 1px rgba(184,178,167,0.05)",
        "glow-cyan": `0 0 28px 0 ${colors.glow.cyan}`,
        "glow-copper": `0 0 28px 0 ${colors.glow.copper}`,
        "glow-amber": `0 0 28px 0 ${colors.glow.amber}`,
        "glow-violet": `0 0 28px 0 ${colors.glow.violet}`,
        "glow-mint": `0 0 28px 0 ${colors.glow.mint}`,
        "glow-orange": `0 0 28px 0 ${colors.glow.orange}`,
      },
    },
  },
  plugins: [],
} satisfies Config;
