// Renders a single post at exact source size (1080x1350) at the top-left of the
// viewport so a headless browser can screenshot/measure it with screen px == source px.
import type { ComponentType } from "react";
import { registry } from "./registry";
import { formats, layout } from "@/tokens/design";

export function Preview() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id") || "";
  const entry = registry[id];
  const { width, height } = formats[layout.defaultFormat];

  // ?t=<0..1> renders a motion post at a specific progress point (for multi-frame QA).
  const tParam = params.get("t");
  const t = tParam == null ? undefined : Math.max(0, Math.min(1, parseFloat(tParam)));
  const Comp = entry?.Component as ComponentType<{ t?: number }> | undefined;

  return (
    <div style={{ position: "absolute", top: 0, left: 0, background: "#000" }}>
      {/* force whatever the post's root element is to fill the canvas, so the
          post components' `h-full`/`w-full` resolve against a definite size */}
      <style>{`#post-canvas > * { width: 100%; height: 100%; }`}</style>
      <div id="post-canvas" data-post-id={id} style={{ width, height, display: "grid" }}>
        {Comp ? (
          <Comp {...(t != null ? { t } : {})} />
        ) : (
          <div style={{ padding: 48, color: "#fff", fontFamily: "monospace" }}>
            Unknown post id: "{id}". Known ids: {Object.keys(registry).join(", ") || "(none)"}
          </div>
        )}
      </div>
    </div>
  );
}
