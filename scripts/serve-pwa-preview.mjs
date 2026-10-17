import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../pwa/out");
const port = Number(process.argv[2] ?? 3313);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Choose a port between 1024 and 65535.");
await stat(path.join(root, "index.html"));
const headerText = await readFile(path.join(root, "_headers"), "utf8");
const headers = {};
let globalRule = false;
for (const line of headerText.split(/\r?\n/)) {
  if (line.startsWith("/")) globalRule = line.trim() === "/*";
  const match = /^\s+([^:]+):\s*(.+)$/.exec(line);
  if (globalRule && match) headers[match[1].trim()] = match[2];
}
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain", ".png": "image/png", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json" };
const server = http.createServer(async (request, response) => {
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.setHeader("Cache-Control", "no-cache");
  if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405).end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, `http://localhost:${port}`).pathname); }
  catch { response.writeHead(400).end(); return; }
  if (pathname.includes("\\") || pathname.includes("\0")) { response.writeHead(400).end(); return; }
  let file = path.resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    if (pathname.endsWith("/")) file = path.join(file, "index.html");
    else if (!path.extname(file)) file += ".html";
    const bytes = await readFile(file);
    response.setHeader("Content-Type", types[path.extname(file)] ?? "application/octet-stream");
    response.setHeader("Content-Length", bytes.length);
    response.writeHead(200).end(request.method === "HEAD" ? undefined : bytes);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
server.listen(port, "127.0.0.1", () => console.log(`Local static preview: http://localhost:${port}`));
