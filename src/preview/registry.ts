// Maps a preview id -> a LAZY loader for its post component + declared format. Used by the /preview
// route (Playwright inspector + the agent harness) to render any post at its format by URL.
//
// LAZY on purpose: the corpus is ~170 fixtures (14 Path-B TSX + ~155 Path-A specs incl. the fuzz/density
// QA corpus). Eager-globbing them all made EVERY page load (even the user app — main.tsx statically imports
// Preview) evaluate ~170 modules, which (a) bloats the bundle and (b) accumulates enough Chromium renderer
// state that after ~20 heavy same-page QA navigations the page hangs (#post-canvas stops re-rendering) — the
// gate-suite flake. Loading only the requested fixture per page keeps each load ~30 modules, so the flake and
// the bloat both disappear. Keys are filename-derived (fuzz spec ids == their filenames — verified).
import { createElement, type ComponentType } from "react";
import PostRenderer from "@/posts/PostRenderer";
import type { RenderPost } from "@/posts/renderTypes";
import type { FormatKey } from "@/tokens/design";

// A resolved post: the component to render and (Path A) its declared output format for canvas sizing.
// `Component` is loosely typed (static posts take their own props, not `t`); Preview casts when rendering.
export type RegistryEntry = { Component: ComponentType; format?: FormatKey };

// id -> async loader. The loader pulls only that fixture's module(s) on demand.
export const registry: Record<string, () => Promise<RegistryEntry>> = {
  "ai-prediction-graveyard": async () => ({
    Component: (await import("@/posts/AIPredictionGraveyard")).AIPredictionGraveyardPost,
  }),
};

// Path B — agent-generated TSX components (default export). Lazy per id.
const generated = import.meta.glob<{ default: ComponentType }>("../posts/generated/*.tsx");
for (const [path, load] of Object.entries(generated)) {
  const id = path.split("/").pop()!.replace(/\.tsx$/, "");
  registry[id] = async () => ({ Component: (await load()).default });
}

// Path A — JSON render-specs (shipped generated set + the fuzz/density QA corpus), rendered by PostRenderer.
const specs = import.meta.glob<{ default: RenderPost }>([
  "../posts/generated/*.render.json",
  "../../planning/fixtures/renderfuzz/*.render.json",
  "../../planning/fixtures/density/*.render.json",
]);
for (const [path, load] of Object.entries(specs)) {
  const id = path.split("/").pop()!.replace(/\.render\.json$/, "");
  registry[id] = async () => {
    const post = (await load()).default;
    return { Component: (props: { t?: number }) => createElement(PostRenderer, { post, t: props?.t }), format: post.format };
  };
}

export const knownIds = () => Object.keys(registry);
