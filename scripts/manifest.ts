import { createReadStream, existsSync } from "node:fs";
import crypto from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { NORMALIZED_DIR, PROCESSED_DIR, RAW_DIR, ROOT, SCHEMA_DIR, readJson, writeJson } from "./lib/paths.js";
import { COLLECTION_FROZEN, DISABLED_SOURCES, SOURCE_POLICY_PROFILE } from "./lib/source-policy.js";
import { usedSources } from "./lib/sources.js";

async function sha256File(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

async function fileManifest(root: string): Promise<Array<{ file: string; bytes: number; sha256: string }>> {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  async function visit(dir: string): Promise<void> {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const itemPath = path.join(dir, item.name);
      if (item.isDirectory()) await visit(itemPath);
      else files.push(itemPath);
    }
  }
  await visit(root);
  const records: Array<{ file: string; bytes: number; sha256: string }> = [];
  for (const filePath of files.sort()) {
    const relative = path.relative(root, filePath).replaceAll(path.sep, "/");
    if (["source-manifest.json", "quality-summary.json", "STATUS.md"].includes(relative)) continue;
    records.push({ file: relative, bytes: (await stat(filePath)).size, sha256: await sha256File(filePath) });
  }
  return records;
}

const fetchManifestPath = path.join(RAW_DIR, "fetch-manifest.json");
const fetchManifest = existsSync(fetchManifestPath)
  ? await readJson<{ results?: Array<Record<string, unknown>> }>(fetchManifestPath)
  : { results: [] };
const index = await readJson<Record<string, unknown>>(path.join(PROCESSED_DIR, "index.json"));
const schemaFiles = (await readdir(SCHEMA_DIR)).filter((file) => file.endsWith(".json")).sort();
const schemaHashes: Record<string, string> = {};
for (const file of schemaFiles) schemaHashes[file] = await sha256File(path.join(SCHEMA_DIR, file));
const normalizedFiles = await fileManifest(NORMALIZED_DIR);
const processedFiles = await fileManifest(PROCESSED_DIR);
const pipelineFiles = await fileManifest(path.join(ROOT, "scripts"));
const projectConfigFiles = (
  await Promise.all(
    ["package.json", "package-lock.json", "tsconfig.json", "data/source-policy.json"]
      .map(async (file) => {
        const filePath = path.join(ROOT, file);
        if (!existsSync(filePath)) return null;
        return { file, bytes: (await stat(filePath)).size, sha256: await sha256File(filePath) };
      })
  )
).filter((item): item is { file: string; bytes: number; sha256: string } => item !== null);

const packageJson = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8")) as { version?: string };
const selectedSources = usedSources().map((source) => source.key).sort();
const buildInput = JSON.stringify({
  version: packageJson.version,
  profile: SOURCE_POLICY_PROFILE,
  disabledSources: [...DISABLED_SOURCES].sort(),
  selectedSources,
  raw: fetchManifest.results,
  schemaHashes,
  pipelineFiles,
  projectConfigFiles
});
const buildId = crypto.createHash("sha256").update(buildInput).digest("hex").slice(0, 16);

await writeJson(path.join(PROCESSED_DIR, "source-manifest.json"), {
  buildId,
  generatedAt: new Date().toISOString(),
  datasetVersion: packageJson.version ?? "0.0.0",
  profile: SOURCE_POLICY_PROFILE,
  collectionFrozen: COLLECTION_FROZEN,
  disabledSources: [...DISABLED_SOURCES].sort(),
  selectedSources,
  rawFiles: fetchManifest.results,
  normalizedFiles,
  processedFiles,
  pipelineFiles,
  projectConfigFiles,
  schemaHashes,
  index
});

console.log(`[manifest] build ${buildId}, ${selectedSources.length} selected sources`);
