import { copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const webRoot = path.resolve(path.dirname(__filename), "..");
const distPages = path.join(webRoot, "dist-pages");

await copyFile(path.join(distPages, "index.html"), path.join(distPages, "404.html"));
await writeFile(path.join(distPages, ".nojekyll"), "", "utf8");

console.log("[pages:build] Prepared GitHub Pages fallback and .nojekyll");
