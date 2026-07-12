import { type HTMLAttributes, type ReactNode } from "react";
import { text } from "@/tokens/design";

type Props = HTMLAttributes<HTMLDivElement> & {
  label?: string;
  children: ReactNode;
  /** Optional full-panel paint overlay rendered above the sheen, below the content (e.g. the
   *  PL-1.5 Rev B friction-side burnt wash). Spans the WHOLE panel incl. the label header. */
  overlay?: ReactNode;
};

export function Panel({ label, children, className = "", overlay, ...rest }: Props) {
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-panel bg-bg-soft-panel/60 shadow-panel backdrop-blur-sm ${className}`}
      {...rest}
    >
      <div className="pointer-events-none absolute inset-0 bg-panel-sheen" />
      {overlay}
      {label && (
        <div className="relative flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <span
            className="font-mono uppercase tracking-[0.22em] text-text-tertiary"
            style={{ fontSize: text.panelLabel }}
          >
            {label}
          </span>
          <span className="h-2.5 w-2.5 rounded-full bg-accent-mint shadow-glow-cyan" />
        </div>
      )}
      <div className="relative flex flex-1 flex-col justify-center px-6 py-5">
        {children}
      </div>
    </div>
  );
}
