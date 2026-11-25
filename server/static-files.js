import { readFileSync, realpathSync, statSync } from "node:fs";
import { resolve, relative, extname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

export function serveStatic(path, res) {
  let decoded;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  if (
    decoded.includes("\\") ||
    decoded.includes("\0") ||
    decoded.includes(":") ||
    decoded.split("/").includes("..")
  )
    return false;
  const file = resolve(
    publicDir,
    decoded === "/" ? "index.html" : decoded.slice(1),
  );
  const type = mime[extname(file).toLowerCase()];
  if (!type) return false;
  try {
    const actual = realpathSync(file),
      rel = relative(realpathSync(publicDir), actual);
    if (rel.startsWith("..") || isAbsolute(rel) || !statSync(actual).isFile())
      return false;
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
    res.end(readFileSync(actual));
    return true;
  } catch (error) {
    if (["ENOENT", "ENOTDIR", "EINVAL", "EACCES"].includes(error.code))
      return false;
    throw error;
  }
}
