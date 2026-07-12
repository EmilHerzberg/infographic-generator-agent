#!/usr/bin/env node
// Tiny static server for the A/B testbench gallery (out/bench). No deps. Serves index.html + the
// MP4s with HTTP Range support (so video seeking works), binds 0.0.0.0 so the server is
// reachable. For the box, put it behind Caddy or open the port to yourself only.
//   node tools/bench-serve.mjs            # http://localhost:8090
//   BENCH_PORT=8090 BENCH_HOST=0.0.0.0 node tools/bench-serve.mjs
import { createReadStream, statSync, existsSync } from "node:fs";
import { join, normalize, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "out", "bench");
const PORT = Number(process.env.BENCH_PORT || 8090);
const HOST = process.env.BENCH_HOST || "0.0.0.0";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".mp4": "video/mp4",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
};

if (!existsSync(join(DIR, "index.html"))) {
  console.error(`✖ ${join(DIR, "index.html")} not found. Run the benchmark first: node tools/benchmark.mjs`);
  process.exit(1);
}

const server = createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = normalize(join(DIR, urlPath));
  if (!filePath.startsWith(DIR)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    res.writeHead(404).end("not found");
    return;
  }
  const { size } = statSync(filePath);
  const type = TYPES[extname(filePath).toLowerCase()] || "application/octet-stream";
  const range = req.headers.range;
  if (range && type === "video/mp4") {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m && m[1] ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? parseInt(m[2], 10) : size - 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Content-Type": type,
    });
    createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
    createReadStream(filePath).pipe(res);
  }
});

server.listen(PORT, HOST, () => {
  console.error(`▶ A/B gallery at http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}/  (serving ${DIR})`);
  if (HOST === "0.0.0.0") console.error(`  on the box: http://<server-ip>:${PORT}/  (open the port to yourself only)`);
});
