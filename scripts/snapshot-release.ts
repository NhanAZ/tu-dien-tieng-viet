import { createReadStream, existsSync } from "node:fs";
import crypto from "node:crypto";
import { copyFile, readdir, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { PROCESSED_DIR, ROOT, ensureDir, readJson } from "./lib/paths.js";

interface Manifest {
  buildId: string;
  datasetVersion: string;
  profile: "open-only" | "documented";
}

const manifestPath = path.join(PROCESSED_DIR, "source-manifest.json");
const manifest = await readJson<Manifest>(manifestPath);
const releaseDir = path.join(ROOT, "data", "releases", manifest.datasetVersion, manifest.profile);
await ensureDir(releaseDir);

for (const file of ["source-manifest.json", "quality-summary.json", "index.json", "STATUS.md"]) {
  await copyFile(path.join(PROCESSED_DIR, file), path.join(releaseDir, file));
}

const archiveName = `tu-dien-tieng-viet-${manifest.datasetVersion}-${manifest.profile}.tar.gz`;
const archivePath = path.join(releaseDir, archiveName);
const tar = spawnSync(
  "tar",
  [
    "-czf",
    archivePath,
    "-C",
    ROOT,
    "data/processed",
    "data/schema",
    "SOURCES.md",
    "reports/current/COVERAGE_REPORT.md",
    "reports/current/QUALITY_REPORT.md",
    "reports/current/DATA_CARD.md"
  ],
  { stdio: "inherit" }
);
if (tar.status !== 0) throw new Error(`tar failed with exit code ${tar.status ?? "unknown"}`);

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

async function fileManifest(root: string, prefix: string): Promise<Array<{ file: string; bytes: number; sha256: string }>> {
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
    records.push({
      file: `${prefix}/${path.relative(root, filePath).replaceAll(path.sep, "/")}`,
      bytes: (await stat(filePath)).size,
      sha256: await sha256File(filePath)
    });
  }
  return records;
}

const archiveBytes = (await stat(archivePath)).size;
const archiveSha256 = await sha256File(archivePath);
const senseLayerFiles = await fileManifest(path.join(PROCESSED_DIR, "senses"), "data/processed/senses");
const entityLayerFiles = await fileManifest(path.join(PROCESSED_DIR, "entities"), "data/processed/entities");
const referenceNonViLayerFiles = await fileManifest(
  path.join(PROCESSED_DIR, "reference-non-vi"),
  "data/processed/reference-non-vi"
);
const phase6LayerFiles = await fileManifest(path.join(PROCESSED_DIR, "phase6"), "data/processed/phase6");
await writeFile(
  path.join(releaseDir, "archive-manifest.json"),
  `${JSON.stringify(
    {
      archive: archiveName,
      bytes: archiveBytes,
      sha256: archiveSha256,
      includes: ["data/processed", "data/schema", "SOURCES.md", "reports/current"],
      senseLayerFiles,
      entityLayerFiles,
      referenceNonViLayerFiles,
      phase6LayerFiles
    },
    null,
    2
  )}\n`,
  "utf8"
);

const readme = `# Release ${manifest.datasetVersion} - ${manifest.profile}

- Build ID: \`${manifest.buildId}\`
- Archive: \`${archiveName}\`
- Archive bytes: ${archiveBytes}
- Archive SHA-256: \`${archiveSha256}\`
- Contents: processed JSON, canonical sense layer, JSON Schema, attribution, coverage, quality report and data card.
- Sense layer files checksummed in \`archive-manifest.json\`: ${senseLayerFiles.length}
- Entity/encyclopedic layer files checksummed in \`archive-manifest.json\`: ${entityLayerFiles.length}
- Reference non-Vi layer files checksummed in \`archive-manifest.json\`: ${referenceNonViLayerFiles.length}
- Phase 6 fact layer files checksummed in \`archive-manifest.json\`: ${phase6LayerFiles.length}
- Raw snapshots are not bundled; their URLs and SHA-256 hashes are in \`source-manifest.json\`.
`;
await writeFile(path.join(releaseDir, "README.md"), readme, "utf8");
console.log(`[release] ${manifest.profile}: ${archivePath}`);
