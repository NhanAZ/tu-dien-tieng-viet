import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";

import { PROCESSED_DIR, ensureDir, resetDir, writeJson } from "./lib/paths.js";

interface CanonicalCluster {
  cluster_id: string;
  status: string;
  confidence_tier: string;
  word: string;
  reasons: string[];
  confidence: {
    model_version: string;
    source_confidence: number;
    cluster_confidence: number;
    canonical_selection_confidence: number;
  };
  canonical_definition: {
    sense_id: string;
    source: string;
    language: string;
    confidence: number;
    risk_tags: string[];
    meaning: string;
  };
  evidence: {
    member_count: number;
    source_count: number;
  };
}

interface SampleRow {
  rank: string;
  cluster_id: string;
  word: string;
  status: string;
  confidence_tier: string;
  canonical_source: string;
  language: string;
  meaning_length: number;
  meaning: string;
  risk_tags: string[];
  reasons: string[];
  member_count: number;
  source_count: number;
  confidence: CanonicalCluster["confidence"];
}

const SENSES_DIR = path.join(PROCESSED_DIR, "senses");
const CLUSTERS_PATH = path.join(SENSES_DIR, "canonical-sense-clusters.jsonl.gz");
const SAMPLES_DIR = path.join(SENSES_DIR, "samples");
const SAMPLE_LIMIT = 50;

function rankFor(clusterId: string, dimension: string, bucket: string): string {
  return createHash("sha256").update(`${dimension}:${bucket}:${clusterId}`).digest("hex");
}

function fileNameFor(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function lengthBucket(length: number): string {
  if (length < 40) return "short-under-40";
  if (length < 120) return "medium-40-119";
  if (length < 300) return "long-120-299";
  return "very-long-300-plus";
}

function addSample(buckets: Map<string, SampleRow[]>, bucket: string, row: Omit<SampleRow, "rank">, dimension: string): void {
  const rows = buckets.get(bucket) ?? [];
  rows.push({ ...row, rank: rankFor(row.cluster_id, dimension, bucket) });
  rows.sort((left, right) => left.rank.localeCompare(right.rank));
  if (rows.length > SAMPLE_LIMIT) rows.length = SAMPLE_LIMIT;
  buckets.set(bucket, rows);
}

async function writeDimension(dimension: string, buckets: Map<string, SampleRow[]>): Promise<Record<string, number>> {
  const dir = path.join(SAMPLES_DIR, dimension);
  await ensureDir(dir);
  const counts: Record<string, number> = {};
  for (const [bucket, rows] of [...buckets.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const cleanRows = rows.map(({ rank: _rank, ...row }) => row);
    await writeFile(path.join(dir, `${fileNameFor(bucket)}.jsonl`), `${cleanRows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
    counts[bucket] = cleanRows.length;
  }
  return counts;
}

await resetDir(SAMPLES_DIR);
const byStatus = new Map<string, SampleRow[]>();
const bySource = new Map<string, SampleRow[]>();
const byConfidenceTier = new Map<string, SampleRow[]>();
const byLength = new Map<string, SampleRow[]>();
const populationCounts = {
  byStatus: {} as Record<string, number>,
  bySource: {} as Record<string, number>,
  byConfidenceTier: {} as Record<string, number>,
  byLength: {} as Record<string, number>
};

const input = createReadStream(CLUSTERS_PATH).pipe(createGunzip());
const rl = createInterface({ input, crlfDelay: Infinity });
let clusters = 0;

for await (const line of rl) {
  const text = line.trim();
  if (!text) continue;
  const cluster = JSON.parse(text) as CanonicalCluster;
  clusters += 1;
  const canonical = cluster.canonical_definition;
  const bucketLength = lengthBucket(canonical.meaning.length);
  const row: Omit<SampleRow, "rank"> = {
    cluster_id: cluster.cluster_id,
    word: cluster.word,
    status: cluster.status,
    confidence_tier: cluster.confidence_tier,
    canonical_source: canonical.source,
    language: canonical.language,
    meaning_length: canonical.meaning.length,
    meaning: canonical.meaning,
    risk_tags: canonical.risk_tags,
    reasons: cluster.reasons,
    member_count: cluster.evidence.member_count,
    source_count: cluster.evidence.source_count,
    confidence: cluster.confidence
  };

  addSample(byStatus, cluster.status, row, "by-status");
  addSample(bySource, canonical.source, row, "by-source");
  addSample(byConfidenceTier, cluster.confidence_tier, row, "by-confidence-tier");
  addSample(byLength, bucketLength, row, "by-length");
  populationCounts.byStatus[cluster.status] = (populationCounts.byStatus[cluster.status] ?? 0) + 1;
  populationCounts.bySource[canonical.source] = (populationCounts.bySource[canonical.source] ?? 0) + 1;
  populationCounts.byConfidenceTier[cluster.confidence_tier] =
    (populationCounts.byConfidenceTier[cluster.confidence_tier] ?? 0) + 1;
  populationCounts.byLength[bucketLength] = (populationCounts.byLength[bucketLength] ?? 0) + 1;
}

const sampleCounts = {
  byStatus: await writeDimension("by-status", byStatus),
  bySource: await writeDimension("by-source", bySource),
  byConfidenceTier: await writeDimension("by-confidence-tier", byConfidenceTier),
  byLength: await writeDimension("by-length", byLength)
};

await writeJson(path.join(SAMPLES_DIR, "index.json"), {
  generatedAt: new Date().toISOString(),
  method: "deterministic-lowest-sha256-rank",
  sampleLimitPerBucket: SAMPLE_LIMIT,
  clusters,
  dimensions: ["by-status", "by-source", "by-confidence-tier", "by-length"],
  populationCounts,
  sampleCounts,
  note: "Samples are deterministic and stratified. They are inspection aids, not human gold labels."
});

console.log(`[academic:samples] ${clusters.toLocaleString("vi-VN")} clusters sampled across 4 dimensions`);
