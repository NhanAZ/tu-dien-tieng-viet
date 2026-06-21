import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { ROOT } from "./lib/paths.js";

const strict = process.argv.includes("--strict");
const briefPath = path.join(ROOT, "docs", "Xây dựng Website Từ Điển Tiếng Việt Chuyên Sâu.md");

function fail(message: string): void {
  console.error(`[website:gate] ${message}`);
  process.exit(1);
}

if (!existsSync(briefPath)) {
  fail("Missing website brief. Data schema cannot be declared website-ready.");
}

const text = (await readFile(briefPath, "utf8")).trim();
const hasPlaceholder = /WEBSITE_BRIEF_STATUS:\s*PENDING/i.test(text);
const usefulLines = text
  .split(/\r?\n/g)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#") && !line.startsWith(">") && !line.startsWith("- [ ]"));

if (!text || hasPlaceholder || usefulLines.length < 20) {
  const message =
    "Website brief is not filled. Current dataset is valid for research/data QA, but schema is not website-ready.";
  if (strict) fail(message);
  console.warn(`[website:gate] WARN: ${message}`);
  process.exit(0);
}

console.log("[website:gate] PASS: website brief has enough content for schema compatibility review.");
