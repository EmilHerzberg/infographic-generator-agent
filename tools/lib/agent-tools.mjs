// Tool bodies for the agent harness. Plain async functions; agent.mjs wraps them
// as AI SDK tools. All file access is scoped to the repo subtree; the agent can
// only write into src/posts/generated/. No shell access is exposed to the model.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, resolve, relative, sep, dirname } from "node:path";
import { execFile, exec } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { inspectLayout } from "./inspect.mjs";

const pexec = promisify(execFile);
const pexecShell = promisify(exec);
export const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), "..", ".."));

const READ_ROOTS = ["src", "context", "prompts", "schemas", "docs", "design-system.md", "styleguide.md", "README.md"];
const GEN_DIR = join("src", "posts", "generated");

function safeResolve(rel) {
  const p = resolve(ROOT, rel);
  if (p !== ROOT && !p.startsWith(ROOT + sep)) throw new Error(`path escapes repo: ${rel}`);
  return p;
}
function assertReadable(rel) {
  const norm = rel.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!READ_ROOTS.some((r) => norm === r || norm.startsWith(r + "/"))) {
    throw new Error(`reads restricted to: ${READ_ROOTS.join(", ")}`);
  }
}

export async function repoRead(rel) {
  assertReadable(rel);
  return readFile(safeResolve(rel), "utf8");
}

export async function repoList(rel) {
  assertReadable(rel);
  const ents = await readdir(safeResolve(rel), { withFileTypes: true });
  return ents.map((e) => (e.isDirectory() ? e.name + "/" : e.name));
}

export async function writePost(id, tsx) {
  const dir = safeResolve(GEN_DIR);
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${id}.tsx`);
  await writeFile(file, tsx);
  return relative(ROOT, file).replace(/\\/g, "/");
}

// Typecheck via the project's own TypeScript (cross-platform: invoke node + tsc).
export async function typecheckPost(id) {
  const tsc = join(ROOT, "node_modules", "typescript", "bin", "tsc");
  try {
    await pexec(process.execPath, [tsc, "--noEmit", "-p", "tsconfig.json"], {
      cwd: ROOT,
      timeout: 180000,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    });
    return { ok: true, errors: [] };
  } catch (e) {
    const out = `${e.stdout || ""}${e.stderr || ""}`;
    const lines = out.split("\n").filter((l) => l.trim());
    const mine = lines.filter((l) => l.includes(`posts/generated/${id}`) || l.includes(`posts\\generated\\${id}`));
    // Gate on errors IN our file. Unrelated project errors are surfaced as a note, not a failure.
    return {
      ok: mine.length === 0,
      errors: mine.slice(0, 40),
      ...(mine.length === 0 && lines.length ? { note: `${lines.length} unrelated project type error(s) ignored` } : {}),
    };
  }
}

export async function inspectPost(id, base = "http://localhost:5173") {
  return inspectLayout({ url: `${base}/?id=${encodeURIComponent(id)}` });
}

export async function renderPost(id, outPath, base = "http://localhost:5173") {
  return inspectLayout({ url: `${base}/?id=${encodeURIComponent(id)}`, screenshotPath: outPath });
}

// Render the post's generated component to an MP4 via the generic Remotion root.
export async function renderVideo(id, outDir = "out") {
  const safe = id.replace(/[^a-zA-Z0-9-]/g, "");
  const out = `${outDir}/${safe}.mp4`;
  await pexecShell(`npm run remotion:render:gen -- ${safe} ${out}`, {
    cwd: ROOT,
    timeout: 900000,
    maxBuffer: 32 * 1024 * 1024,
  });
  return out;
}
