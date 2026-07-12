import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Preview } from "./preview/Preview";
// Load the SAME offline base64 woff2 the Remotion MP4 uses, so the in-browser inspector measures
// exactly what the video renders (render-truth parity) — no network dependency, no FOUT.
import "./remotion/fonts-local.css";
import "./index.css";

// Dev harness: renders the bare 1080xN post canvas. Open /?id=<post-id> to inspect a generated post
// (the QA inspector + the agent drive this same URL).
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
