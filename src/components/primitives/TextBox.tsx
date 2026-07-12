import { type CSSProperties, type ReactNode } from "react";
import { maxLines as defaultMaxLines, text as textScale } from "@/tokens/design";

type Role =
  | "headline"
  | "subtitle"
  | "body"
  | "label"
  | "annotation"
  | "metricValue"
  | "finalTakeaway";

const floorBySource: Record<Role, number> = {
  headline: textScale.headline,
  subtitle: 36,
  body: 28,
  label: 22,
  annotation: 22,
  metricValue: textScale.metricValue,
  finalTakeaway: 38,
};

const maxLinesByRole: Partial<Record<Role, number>> = {
  headline: defaultMaxLines.headline,
  subtitle: defaultMaxLines.subtitle,
  annotation: defaultMaxLines.annotation,
  finalTakeaway: defaultMaxLines.finalTakeaway,
};

type Props = {
  role: Role;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  maxLines?: number;
  fontSize?: number;
};

export function TextBox({
  role,
  children,
  className = "",
  style,
  maxLines,
  fontSize,
}: Props) {
  const size = fontSize ?? floorBySource[role];
  if (fontSize !== undefined && fontSize < floorBySource[role]) {
    console.warn(
      `TextBox: fontSize ${fontSize} for role "${role}" is below mobile floor ${floorBySource[role]} (1080 source → ~${Math.round(fontSize / 2.77)}px on phone). Either raise the size or reduce the text.`,
    );
  }
  const lines = maxLines ?? maxLinesByRole[role];
  const lineClampStyle: CSSProperties = lines
    ? {
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: lines,
        overflow: "hidden",
      }
    : {};
  return (
    <span
      className={className}
      style={{ fontSize: size, ...lineClampStyle, ...style }}
    >
      {children}
    </span>
  );
}
