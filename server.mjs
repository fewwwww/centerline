import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(projectRoot, process.argv[2] || ".");
const rootFromProject = relative(projectRoot, root);
const port = Number.parseInt(process.env.PORT || "4173", 10);

if (rootFromProject.startsWith("..") || isAbsolute(rootFromProject)) {
  throw new Error("The local server root must stay inside the project");
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
};

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url || "/", "http://localhost");
  const relativePath = requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1);
  const normalizedPath = normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, normalizedPath);
  const pathFromRoot = relative(root, filePath);

  try {
    const stats = statSync(filePath);
    if (!stats.isFile() || pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
      throw new Error("Not a file");
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Card centering tool (${rootFromProject || "."}): http://127.0.0.1:${port}`);
});
