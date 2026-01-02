#!/usr/bin/env node
import http from "http";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import os from "os";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || process.argv[2] || 1400);
const HOST = "0.0.0.0";

function contentType(ext) {
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    case ".txt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function safeResolve(root, requested) {
  const joined = path.join(root, requested);
  const resolved = path.resolve(joined);
  if (!resolved.startsWith(path.resolve(root)))
    throw new Error("Path outside root");
  return resolved;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const reqPath = decodeURIComponent(url.pathname);
    let filePath;
    try {
      filePath = safeResolve(ROOT, reqPath);
    } catch {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    const stat = await fsPromises.stat(filePath).catch(() => null);
    if (!stat) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    if (stat.isDirectory()) {
      const idx = path.join(filePath, "index.html");
      const idxStat = await fsPromises.stat(idx).catch(() => null);
      if (idxStat && idxStat.isFile()) {
        const stream = fs.createReadStream(idx);
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
        });
        stream.pipe(res);
        return;
      }
      const items = await fsPromises.readdir(filePath);
      const rows = items
        .map(
          (i) => `<li><a href="${path.posix.join(reqPath, i)}">${i}</a></li>`,
        )
        .join("\n");
      const html = `<!doctype html><html><body><h1>Index of ${reqPath}</h1><ul>${rows}</ul></body></html>`;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = contentType(ext);
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on("error", () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  } catch (err) {
    if (!res.headersSent)
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal server error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Serving repository root ${ROOT}`);
  console.log(`Listening on http://${HOST}:${PORT}`);
  const nets = os.networkInterfaces();
  for (const addrs of Object.values(nets)) {
    for (const a of addrs || []) {
      if (a.family === "IPv4" && !a.internal) {
        console.log(`  http://${a.address}:${PORT}/`);
      }
    }
  }
  console.log(
    "Press Ctrl+C to stop. To expose publicly, run a tunnel (ngrok/localtunnel) or configure your router.",
  );
});
