// Maps a preview id -> a still-renderable post component. Used by the /preview
// route so Playwright (the structural inspector) and the agent harness can render
// any post at 1080x1350 by URL.
//
// Static posts are registered explicitly. Agent/Path-B generated posts in
// src/posts/generated/*.tsx (default export) are auto-discovered via Vite glob.
import { createElement, type ComponentType } from "react";
import { AIPredictionGraveyardPost } from "@/posts/AIPredictionGraveyard";
import PostRenderer from "@/posts/PostRenderer";
import type { RenderPost } from "@/posts/renderTypes";

export const registry: Record<string, { Component: ComponentType }> = {
  "ai-prediction-graveyard": { Component: AIPredictionGraveyardPost },
};

// Path B — agent-generated TSX components.
const generated = import.meta.glob<{ default: ComponentType }>("../posts/generated/*.tsx", {
  eager: true,
});
for (const [path, mod] of Object.entries(generated)) {
  const id = path.split("/").pop()!.replace(/\.tsx$/, "");
  if (mod.default) registry[id] = { Component: mod.default };
}

// Path A — JSON render-specs rendered by the fixed PostRenderer.
const renderSpecs = import.meta.glob<{ default: RenderPost }>("../posts/generated/*.render.json", {
  eager: true,
});
for (const [path, mod] of Object.entries(renderSpecs)) {
  const id = path.split("/").pop()!.replace(/\.render\.json$/, "");
  const post = mod.default;
  registry[id] = { Component: (props: { t?: number }) => createElement(PostRenderer, { post, t: props?.t }) };
}

// Renderer fuzz corpus (Epic 01 / Sprint 1.1) — coverage specs that stress the
// no-overflow guarantee. Registered under each spec's own `id` ("fuzz-..."), so
// `npm run qa:fuzz` can inspect every one by URL. Not part of the shipped post set.
// PL-1.3 also registers the density set (planning/fixtures/density/) — density-06
// is part of the DecompBar t=1 regression corpus (tools/qa-decompbar.mjs).
const fuzzSpecs = import.meta.glob<{ default: RenderPost }>(
  ["../../planning/fixtures/renderfuzz/*.render.json", "../../planning/fixtures/density/*.render.json"],
  { eager: true },
);
for (const mod of Object.values(fuzzSpecs)) {
  const post = mod.default;
  registry[post.id] = { Component: (props: { t?: number }) => createElement(PostRenderer, { post, t: props?.t }) };
}
