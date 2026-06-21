import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

import { ROOT, readJson } from "./lib/paths.js";

interface ChecksumBaseline {
  status: "FROZEN_RAW_NORMALIZER_REGRESSION";
  profile: string;
  files: Array<{ path: string; sha256: string; bytes: number }>;
}

async function sha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

const baselinePath = path.join(ROOT, "data", "audit", "normalized-checksum-baseline.json");
const baseline = await readJson<ChecksumBaseline>(baselinePath);
const errors: string[] = [];

for (const expected of baseline.files) {
  const filePath = path.join(ROOT, ...expected.path.split("/"));
  try {
    const fileStat = await stat(filePath);
    const actualHash = await sha256(filePath);
    if (fileStat.size !== expected.bytes) {
      errors.push(`${expected.path}: bytes ${fileStat.size}, expected ${expected.bytes}`);
    }
    if (actualHash !== expected.sha256) {
      errors.push(`${expected.path}: sha256 ${actualHash}, expected ${expected.sha256}`);
    }
  } catch (error) {
    errors.push(`${expected.path}: ${(error as Error).message}`);
  }
}

if (errors.length > 0) {
  console.error(`[test:normalized-checksums] FAIL: ${errors.length} mismatches`);
  console.error(errors.slice(0, 20).join("\n"));
  process.exit(1);
}

console.log(
  `[test:normalized-checksums] PASS: ${baseline.files.length} deterministic normalized artifacts match the frozen baseline`
);
