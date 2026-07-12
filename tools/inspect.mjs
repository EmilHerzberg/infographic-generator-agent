#!/usr/bin/env node
// Standalone runner for the structural inspector.
//   1) start the dev server:  npm run dev
//   2) inspect a post:        node tools/inspect.mjs <post-id> [--screenshot out.png]
// Requires the Vite dev server (default http://localhost:5173). Override with PREVIEW_URL.
import { inspectLayout } from "./lib/inspect.mjs";

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--")) || "ai-prediction-graveyard";
const ssIdx = args.indexOf("--screenshot");
const screenshotPath = ssIdx >= 0 ? args[ssIdx + 1] : undefined;
const base = process.env.PREVIEW_URL || "http://localhost:5173";

try {
  const report = await inspectLayout({ url: `${base}/?id=${encodeURIComponent(id)}`, screenshotPath });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 2);
} catch (err) {
  console.error(`✖ inspect failed: ${err.message}`);
  console.error(`  (is the dev server running? try: npm run dev)`);
  process.exit(1);
}
