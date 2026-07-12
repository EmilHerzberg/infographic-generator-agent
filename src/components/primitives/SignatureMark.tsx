import { brand, text } from "@/tokens/design";

export function SignatureMark({ label = brand.signature }: { label?: string }) {
  return (
    <div
      className="pointer-events-none flex items-center gap-3 font-mono uppercase tracking-[0.26em] text-text-tertiary/85"
      style={{ fontSize: text.signature }}
    >
      <span className="h-px w-7 bg-text-tertiary/40" />
      {label}
    </div>
  );
}
