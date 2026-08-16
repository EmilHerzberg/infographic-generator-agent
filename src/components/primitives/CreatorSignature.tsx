// CreatorSignature — animated creator identity mark.
// System Node Signature design: rounded-square EH monogram → short signal connector → name + subtitle.
// Visible by 1.2s, visible in the final frame, mobile-readable, inside safe margins.
//
// Internal bounding box (compact variant, source pixels):
//   total:     ~360 × ~56
//   monogram:  44 × 44 (rounded square)
//   connector: 18 × 1.5 (signal line)
//   name:      ~200 × 30
//   subtitle:  ~260 × 22
// Placement reserves: 80px from frame edge (uses layout.preferredMargin).

import { brand, colors } from "@/tokens/design";

type Variant = "compact" | "minimal" | "final" | "service";
type Placement = "bottomRight" | "bottomLeft" | "inline";

type Content = {
  name?: string;
  subtitle?: string;
  email?: string;
  monogram?: string;
};

type Props = {
  variant?: Variant;
  placement?: Placement;
  showEmail?: boolean;
  showServiceLabel?: boolean;
  animated?: boolean;
  opacity?: number;
  /** 0..1 — drive from Remotion `interpolate`. Defaults to 1 (settled). */
  entranceProgress?: number;
  /** 0..1 — optional accent pulse for final-frame emphasis. */
  pulseProgress?: number;
  content?: Content;
};

// Monogram for a user-supplied signature: initials of the first two words, uppercased (falls back to
// the first two letters of a single word). Keeps the mark on-brand without carrying Emil's "EH".
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? "").slice(0, 2).toUpperCase();
}

const placementClass: Record<Placement, string> = {
  bottomRight: "absolute right-[80px] bottom-[80px]",
  bottomLeft: "absolute left-[80px] bottom-[80px]",
  inline: "",
};

export function CreatorSignature({
  variant = "compact",
  placement = "bottomRight",
  showEmail,
  animated = true,
  opacity,
  entranceProgress = 1,
  pulseProgress = 0,
  content,
}: Props) {
  // When a `content.name` is supplied (a SaaS user's own signature) the brand tokens must NOT leak in as
  // fallbacks — otherwise a user who typed only a name would get Emil's subtitle/email/monogram. So a
  // supplied signature is authoritative: subtitle/email only appear if the user gave them, and the
  // monogram is derived from their name. With no content (CLI/personal/QA) the brand defaults stand.
  const hasContent = !!content?.name;
  const name = content?.name ?? brand.author;
  const subtitle = hasContent ? content?.subtitle : brand.subtitle;
  const email = hasContent ? content?.email : brand.email;
  const monogram = content?.monogram ?? (hasContent ? initialsOf(content!.name!) : brand.monogram);

  const includeEmail =
    (showEmail ?? (variant === "service" || (variant === "final" && true))) && !!email;
  const includeSubtitle = variant !== "minimal" && !!subtitle;

  const settledOpacity = opacity ?? (variant === "final" ? 1 : 0.9);
  const renderedOpacity = settledOpacity * entranceProgress;

  const enterTranslateY = (1 - entranceProgress) * 8;
  const pulseScale = 1 + pulseProgress * 0.04;
  const pulseGlow = pulseProgress * 0.6;

  return (
    <div
      className={`pointer-events-none ${placementClass[placement]} flex items-center gap-3`}
      style={{
        opacity: renderedOpacity,
        transform: `translateY(${enterTranslateY}px)`,
      }}
      aria-label={`Creator: ${name}`}
    >
      <Monogram
        text={monogram}
        pulseScale={pulseScale}
        pulseGlow={pulseGlow}
        animated={animated}
      />
      <Connector entranceProgress={entranceProgress} />
      <div className="flex flex-col gap-1">
        <span
          className="font-display font-semibold leading-none text-text-primary"
          style={{ fontSize: 26 }}
        >
          {name}
        </span>
        {includeSubtitle && (
          <span
            className="font-mono uppercase tracking-[0.16em] leading-none text-text-secondary"
            style={{ fontSize: 20 }}
          >
            {subtitle}
          </span>
        )}
        {includeEmail && email && (
          <span
            className="font-mono leading-none text-text-tertiary"
            style={{ fontSize: 18 }}
          >
            {email}
          </span>
        )}
      </div>
    </div>
  );
}

function Monogram({
  text,
  pulseScale,
  pulseGlow,
  animated,
}: {
  text: string;
  pulseScale: number;
  pulseGlow: number;
  animated: boolean;
}) {
  const cyanGlow = `0 0 ${10 + pulseGlow * 14}px ${colors.glow.cyan}`;
  const amberPulse =
    pulseGlow > 0
      ? `, 0 0 ${pulseGlow * 18}px rgba(231,169,90,${0.18 + pulseGlow * 0.3})`
      : "";
  return (
    <div
      className="flex items-center justify-center rounded-[14px] bg-bg-soft-panel/85"
      style={{
        width: 44,
        height: 44,
        border: "1px solid rgba(89,216,230,0.28)",
        boxShadow: animated ? `${cyanGlow}${amberPulse}` : "none",
        transform: `scale(${pulseScale})`,
      }}
    >
      <span
        className="font-mono font-semibold tracking-[0.04em] text-text-primary"
        style={{ fontSize: 18 }}
      >
        {text}
      </span>
    </div>
  );
}

function Connector({ entranceProgress }: { entranceProgress: number }) {
  const lineWidth = 18 * entranceProgress;
  return (
    <div
      className="h-px bg-accent-cyan/55"
      style={{
        width: lineWidth,
        boxShadow: "0 0 6px rgba(89,216,230,0.4)",
      }}
    />
  );
}
