// Renders a single post at its exact source size (1080×1350 portrait / 1080×1080 square / 1080×1920 vertical)
// at the top-left of the viewport so a headless browser can screenshot/measure it with screen px == source px.
// The registry is LAZY (see registry.ts): we async-load only the requested fixture, then render #post-canvas.
// #post-canvas is only mounted AFTER the load resolves, so the inspector's waitForSelector("#post-canvas")
// still means "content is ready" (and it's sized to the final format — no flash/resize).
import { useEffect, useState, type ComponentType } from "react";
import { registry, knownIds, type RegistryEntry } from "./registry";
import { formats, resolveFormat } from "@/tokens/design";
import { FormatContext } from "@/components/layout/formatContext";

export function Preview() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id") || "";
  const paramFormat = params.get("format");
  // ?t=<0..1> renders a motion post at a specific progress point (for multi-frame QA).
  const tParam = params.get("t");
  const t = tParam == null ? undefined : Math.max(0, Math.min(1, parseFloat(tParam)));

  const [entry, setEntry] = useState<RegistryEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setEntry(null);
    setError(null);
    const load = registry[id];
    if (!load) {
      setError(`Unknown post id: "${id}". Known ids: ${knownIds().join(", ") || "(none)"}`);
      return;
    }
    load().then(
      (e) => alive && setEntry(e),
      (e) => alive && setError(`Failed to load "${id}" — ${e?.message || e}`),
    );
    return () => { alive = false; };
  }, [id]);

  if (error) {
    return <div style={{ padding: 48, color: "#fff", fontFamily: "monospace" }}>{error}</div>;
  }
  if (!entry) return null; // loading — deliberately no #post-canvas yet

  // Single source of truth: the post's own format (Path A spec), else the ?format= param (the QA loop appends
  // it for Path B / non-portrait), else portrait. Provide it so a Path B PostFrame picks it up from context.
  const fmtKey = resolveFormat(entry.format ?? paramFormat);
  const { width, height } = formats[fmtKey];
  const Comp = entry.Component as ComponentType<{ t?: number }>;

  return (
    <div style={{ position: "absolute", top: 0, left: 0, background: "#000" }}>
      {/* force whatever the post's root element is to fill the canvas, so the
          post components' `h-full`/`w-full` resolve against a definite size */}
      <style>{`#post-canvas > * { width: 100%; height: 100%; }`}</style>
      <div id="post-canvas" data-post-id={id} style={{ width, height, display: "grid" }}>
        <FormatContext.Provider value={fmtKey}>
          <Comp {...(t != null ? { t } : {})} />
        </FormatContext.Provider>
      </div>
    </div>
  );
}
