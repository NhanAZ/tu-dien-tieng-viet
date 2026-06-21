import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";

import {
  SOURCE_QUALITY_WEIGHTS,
  SOURCE_RIGHTS_WEIGHTS
} from "./lib/academic-confidence.js";
import { PROCESSED_DIR, ROOT, ensureDir, writeJson } from "./lib/paths.js";
import { usedSources } from "./lib/sources.js";

interface CanonicalCluster {
  status: string;
  confidence: {
    model_version: string;
    source_confidence: number;
    cluster_confidence: number;
    canonical_selection_confidence: number;
  };
  canonical_definition: {
    source: string;
  };
}

interface Aggregate {
  clusters: number;
  sourceConfidenceSum: number;
  clusterConfidenceSum: number;
  canonicalSelectionConfidenceSum: number;
}

const SENSES_DIR = path.join(PROCESSED_DIR, "senses");
const CLUSTERS_PATH = path.join(SENSES_DIR, "canonical-sense-clusters.jsonl.gz");
const OUTPUT_PATH = path.join(SENSES_DIR, "confidence-report.json");
const REPORT_PATH = path.join(ROOT, "reports", "academic-confidence-model-0.4.0.md");

function aggregate(): Aggregate {
  return {
    clusters: 0,
    sourceConfidenceSum: 0,
    clusterConfidenceSum: 0,
    canonicalSelectionConfidenceSum: 0
  };
}

function add(target: Aggregate, cluster: CanonicalCluster): void {
  target.clusters += 1;
  target.sourceConfidenceSum += cluster.confidence.source_confidence;
  target.clusterConfidenceSum += cluster.confidence.cluster_confidence;
  target.canonicalSelectionConfidenceSum += cluster.confidence.canonical_selection_confidence;
}

function rounded(value: number): number {
  return Number(value.toFixed(4));
}

function finalize(value: Aggregate) {
  return {
    clusters: value.clusters,
    averageSourceConfidence: value.clusters === 0 ? 0 : rounded(value.sourceConfidenceSum / value.clusters),
    averageClusterConfidence: value.clusters === 0 ? 0 : rounded(value.clusterConfidenceSum / value.clusters),
    averageCanonicalSelectionConfidence:
      value.clusters === 0 ? 0 : rounded(value.canonicalSelectionConfidenceSum / value.clusters)
  };
}

function number(value: number): string {
  return value.toLocaleString("vi-VN");
}

const byStatus = new Map<string, Aggregate>();
const byCanonicalSource = new Map<string, Aggregate>();
const input = createReadStream(CLUSTERS_PATH).pipe(createGunzip());
const rl = createInterface({ input, crlfDelay: Infinity });
let modelVersion = "";

for await (const line of rl) {
  const text = line.trim();
  if (!text) continue;
  const cluster = JSON.parse(text) as CanonicalCluster;
  modelVersion = cluster.confidence.model_version;
  const statusAggregate = byStatus.get(cluster.status) ?? aggregate();
  add(statusAggregate, cluster);
  byStatus.set(cluster.status, statusAggregate);
  const sourceAggregate = byCanonicalSource.get(cluster.canonical_definition.source) ?? aggregate();
  add(sourceAggregate, cluster);
  byCanonicalSource.set(cluster.canonical_definition.source, sourceAggregate);
}

const sourceMetadata = new Map(usedSources().map((source) => [source.key, source]));
const statusSummary = Object.fromEntries(
  [...byStatus.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([status, value]) => [status, finalize(value)])
);
const sourceSummary = [...byCanonicalSource.entries()]
  .map(([source, value]) => {
    const metadata = sourceMetadata.get(source);
    return {
      source,
      rightsStatus: metadata?.rightsStatus ?? "unknown",
      quality: metadata?.quality ?? "unknown",
      ...finalize(value)
    };
  })
  .sort((left, right) => right.clusters - left.clusters || left.source.localeCompare(right.source));

const output = {
  generatedAt: new Date().toISOString(),
  status: "HEURISTIC_NOT_CALIBRATED",
  modelVersion,
  definitions: {
    sourceConfidence: "Confidence copied from the selected canonical source fact provenance.",
    clusterConfidence: "Heuristic confidence that definitions grouped in the cluster belong together.",
    canonicalSelectionConfidence: "Heuristic confidence that the selected canonical definition is preferable within its cluster."
  },
  weights: {
    sourceRights: SOURCE_RIGHTS_WEIGHTS,
    sourceQuality: SOURCE_QUALITY_WEIGHTS
  },
  byStatus: statusSummary,
  byCanonicalSource: sourceSummary,
  caveat: "These scores are transparent machine heuristics, not probabilities calibrated against human gold labels."
};

await writeJson(OUTPUT_PATH, output);
await ensureDir(path.dirname(REPORT_PATH));

const statusRows = Object.entries(statusSummary)
  .map(
    ([status, value]) =>
      `| \`${status}\` | ${number(value.clusters)} | ${value.averageSourceConfidence} | ` +
      `${value.averageClusterConfidence} | ${value.averageCanonicalSelectionConfidence} |`
  )
  .join("\n");
const sourceRows = sourceSummary
  .slice(0, 20)
  .map(
    (value) =>
      `| \`${value.source}\` | ${value.rightsStatus} | ${value.quality} | ${number(value.clusters)} | ` +
      `${value.averageSourceConfidence} | ${value.averageCanonicalSelectionConfidence} |`
  )
  .join("\n");

await writeFile(
  REPORT_PATH,
  `# Academic Confidence Model 0.4.0

Ngày sinh: ${output.generatedAt}

Trạng thái: **${output.status}**  
Model: \`${modelVersion}\`

Ba trường confidence có ý nghĩa riêng:

- \`source_confidence\`: confidence provenance của fact canonical.
- \`cluster_confidence\`: confidence heuristic của phép gom cụm.
- \`canonical_selection_confidence\`: confidence heuristic khi chọn bản ghi canonical trong cụm.

Không diễn giải các số này như xác suất học thuật đã hiệu chuẩn; chưa có gold labels của con người.

| Status | Clusters | Source conf. TB | Cluster conf. TB | Canonical selection TB |
| --- | ---: | ---: | ---: | ---: |
${statusRows}

## Nguồn canonical lớn nhất

| Source | Rights | Quality | Clusters | Source conf. TB | Canonical selection TB |
| --- | --- | --- | ---: | ---: | ---: |
${sourceRows}

Trọng số rights và quality được ghi nguyên vẹn trong \`data/processed/senses/confidence-report.json\`.
`,
  "utf8"
);

console.log(`[academic:confidence] ${modelVersion}: ${number(sourceSummary.reduce((sum, item) => sum + item.clusters, 0))} clusters`);
