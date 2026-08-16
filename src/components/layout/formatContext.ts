import { createContext } from "react";
import type { FormatKey } from "@/tokens/design";

// The output format the current post is being rendered at, provided around a post by the render surface
// (Preview canvas / Remotion composition). `PostFrame` reads it as the fallback when no explicit `format`
// prop is passed — which is the Path B case: the agent composes `<PostFrame …>` with no format, and this
// context makes its internal reserve/aspect math match the real canvas anyway. `null` (no provider) ⇒
// PostFrame falls back to the portrait default, so anything rendered outside a provider is byte-identical.
export const FormatContext = createContext<FormatKey | null>(null);
