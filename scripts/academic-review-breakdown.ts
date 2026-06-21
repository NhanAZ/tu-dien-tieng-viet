import { createReadStream } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { writeFile } from "node:fs/promises";

import { PROCESSED_DIR, ROOT, ensureDir, readJson, writeJson } from "./lib/paths.js";
import { cleanText } from "./lib/text.js";

type ClusterStatus =
  | "auto_accepted"
  | "machine_clustered"
  | "machine_retained"
  | "needs_review"
  | "quarantined"
  | "entity_or_encyclopedic"
  | "reference_non_vi";

interface SourceDefinition {
  sense_id: string;
  definition_uid: string;
  entry_id: string;
  source: string;
  language: string;
  confidence: number;
  risk_tags: string[];
  meaning: string;
}

interface CanonicalCluster {
  cluster_id: string;
  status: ClusterStatus;
  confidence_tier: string;
  word: string;
  canonical_definition: SourceDefinition;
  source_definitions: SourceDefinition[];
  evidence: { member_count: number };
  reasons: string[];
}

interface SenseIndex {
  definitions: number;
  clusters: number;
  statusCounts: Record<ClusterStatus, number>;
  definitionStatusCounts: Record<ClusterStatus, number>;
}

interface ReasonBucket {
  cluster_count: number;
  definition_count: number;
  by_status: Record<ClusterStatus, number>;
  by_source: Record<string, number>;
  samples: Array<{
    word: string;
    status: ClusterStatus;
    source: string;
    language: string;
    confidence: number;
    meaning: string;
    risk_tags: string[];
    cluster_id: string;
    sense_id: string;
  }>;
}

const SENSES_DIR = path.join(PROCESSED_DIR, "senses");
const CLUSTERS_PATH = path.join(SENSES_DIR, "canonical-sense-clusters.jsonl.gz");
const INDEX_PATH = path.join(SENSES_DIR, "index.json");
const OUTPUT_JSON = path.join(SENSES_DIR, "review-breakdown.json");
const OUTPUT_REPORT = path.join(ROOT, "reports", "academic-review-breakdown-0.4.0.md");

const REQUIRED_REASONS = [
  "documented-unclear-source",
  "low-confidence",
  "missing-pos",
  "too-short",
  "proper-name-candidate",
  "place-name-candidate",
  "domain-or-encyclopedic-candidate",
  "punctuation-headword-candidate",
  "non-vi-definition"
] as const;

const EXTRA_REASONS = ["leading-sense-marker", "raw-pos-code", "too-long", "hard-risk-label", "no-vietnamese-definition"];
const TRACKED_REASONS = [...REQUIRED_REASONS, ...EXTRA_REASONS];
const PROBLEM_STATUSES = new Set<ClusterStatus>(["needs_review", "quarantined"]);
const STATUS_KEYS: ClusterStatus[] = [
  "auto_accepted",
  "machine_clustered",
  "machine_retained",
  "needs_review",
  "quarantined",
  "entity_or_encyclopedic",
  "reference_non_vi"
];

function number(value: number): string {
  return value.toLocaleString("vi-VN");
}

function emptyStatusCounts(): Record<ClusterStatus, number> {
  return {
    auto_accepted: 0,
    machine_clustered: 0,
    machine_retained: 0,
    needs_review: 0,
    quarantined: 0,
    entity_or_encyclopedic: 0,
    reference_non_vi: 0
  };
}

function emptyBucket(): ReasonBucket {
  return {
    cluster_count: 0,
    definition_count: 0,
    by_status: emptyStatusCounts(),
    by_source: {},
    samples: []
  };
}

function topSources(sources: Record<string, number>): Array<{ source: string; definitions: number }> {
  return Object.entries(sources)
    .map(([source, definitions]) => ({ source, definitions }))
    .sort((a, b) => b.definitions - a.definitions || a.source.localeCompare(b.source))
    .slice(0, 10);
}

function markdownTable(rows: string[][]): string {
  return rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function reasonSetFor(cluster: CanonicalCluster, definition: SourceDefinition): Set<string> {
  const reasons = new Set([...definition.risk_tags, ...cluster.reasons]);
  if (cluster.status === "reference_non_vi" && definition.language !== "vi") reasons.add("non-vi-definition");
  if (cluster.reasons.includes("hard-risk-label")) {
    for (const tag of definition.risk_tags) {
      if (
        tag === "proper-name-candidate" ||
        tag === "place-name-candidate" ||
        tag === "domain-or-encyclopedic-candidate" ||
        tag === "punctuation-headword-candidate"
      ) {
        reasons.add(tag);
      }
    }
  }
  return reasons;
}

const index = await readJson<SenseIndex>(INDEX_PATH);
const buckets = new Map<string, ReasonBucket>(TRACKED_REASONS.map((reason) => [reason, emptyBucket()]));
const clustersSeenByReason = new Map<string, Set<string>>(TRACKED_REASONS.map((reason) => [reason, new Set<string>()]));
const statusCounts = emptyStatusCounts();
const definitionStatusCounts = emptyStatusCounts();
let clusters = 0;
let definitions = 0;
let reviewRemainderClusters = 0;
let reviewRemainderDefinitions = 0;
let entityOrEncyclopedicClusters = 0;
let entityOrEncyclopedicDefinitions = 0;
let referenceNonViClusters = 0;
let referenceNonViDefinitions = 0;

const input = createReadStream(CLUSTERS_PATH).pipe(createGunzip());
const rl = createInterface({ input, crlfDelay: Infinity });

for await (const line of rl) {
  const text = line.trim();
  if (!text) continue;
  const cluster = JSON.parse(text) as CanonicalCluster;
  clusters += 1;
  definitions += cluster.source_definitions.length;
  statusCounts[cluster.status] += 1;
  definitionStatusCounts[cluster.status] += cluster.source_definitions.length;

  if (PROBLEM_STATUSES.has(cluster.status)) {
    reviewRemainderClusters += 1;
    reviewRemainderDefinitions += cluster.source_definitions.length;
  }
  if (cluster.status === "entity_or_encyclopedic") {
    entityOrEncyclopedicClusters += 1;
    entityOrEncyclopedicDefinitions += cluster.source_definitions.length;
  }
  if (cluster.status === "reference_non_vi") {
    referenceNonViClusters += 1;
    referenceNonViDefinitions += cluster.source_definitions.length;
  }

  for (const definition of cluster.source_definitions) {
    const reasons = reasonSetFor(cluster, definition);
    for (const reason of TRACKED_REASONS) {
      if (!reasons.has(reason)) continue;
      const bucket = buckets.get(reason)!;
      const seen = clustersSeenByReason.get(reason)!;
      if (!seen.has(cluster.cluster_id)) {
        bucket.cluster_count += 1;
        seen.add(cluster.cluster_id);
      }
      bucket.definition_count += 1;
      bucket.by_status[cluster.status] += 1;
      bucket.by_source[definition.source] = (bucket.by_source[definition.source] ?? 0) + 1;
      if (bucket.samples.length < 8) {
        bucket.samples.push({
          word: cluster.word,
          status: cluster.status,
          source: definition.source,
          language: definition.language,
          confidence: definition.confidence,
          meaning: cleanText(definition.meaning).slice(0, 180),
          risk_tags: definition.risk_tags,
          cluster_id: cluster.cluster_id,
          sense_id: definition.sense_id
        });
      }
    }
  }
}

const requiredBreakdown = Object.fromEntries(REQUIRED_REASONS.map((reason) => [reason, buckets.get(reason)!]));
const additionalBreakdown = Object.fromEntries(EXTRA_REASONS.map((reason) => [reason, buckets.get(reason)!]));
const autoFixPlan = [
  {
    bucket: "leading-sense-marker",
    definitions: buckets.get("leading-sense-marker")!.definition_count,
    recommendation:
      "Auto-normalize display text and/or POS only with source-preserving original text; verify by rerunning normalize, merge, academic:auto-cluster and academic:validate."
  },
  {
    bucket: "raw-pos-code",
    definitions: buckets.get("raw-pos-code")!.definition_count,
    recommendation:
      "Map raw POS codes to canonical Vietnamese POS labels before clustering; this is low risk if provenance keeps raw source record."
  },
  {
    bucket: "missing-pos",
    definitions: buckets.get("missing-pos")!.definition_count,
    recommendation:
      "Auto-fill only when a trusted parser exposes explicit POS. Otherwise keep as needs_review."
  },
  {
    bucket: "proper/place/domain/punctuation candidates",
    definitions:
      buckets.get("proper-name-candidate")!.definition_count +
      buckets.get("place-name-candidate")!.definition_count +
      buckets.get("domain-or-encyclopedic-candidate")!.definition_count +
      buckets.get("punctuation-headword-candidate")!.definition_count,
    recommendation: "Do not delete. Re-layer into entities or encyclopedic output with provenance."
  },
  {
    bucket: "non-vi-definition",
    definitions: buckets.get("non-vi-definition")!.definition_count,
    recommendation: "Keep separate as reference/bilingual layer; do not count as Vietnamese definition coverage."
  }
];

const summary = {
  generatedAt: new Date().toISOString(),
  input: {
    clustersPath: "data/processed/senses/canonical-sense-clusters.jsonl.gz",
    indexPath: "data/processed/senses/index.json"
  },
  totals: {
    clusters,
    definitions,
    reviewRemainderClusters,
    reviewRemainderDefinitions,
    entityOrEncyclopedicClusters,
    entityOrEncyclopedicDefinitions,
    referenceNonViClusters,
    referenceNonViDefinitions
  },
  indexComparison: {
    clustersMatch: clusters === index.clusters,
    definitionsMatch: definitions === index.definitions,
    statusCountsMatch: STATUS_KEYS.every((status) => statusCounts[status] === index.statusCounts[status]),
    definitionStatusCountsMatch: STATUS_KEYS.every(
      (status) => definitionStatusCounts[status] === index.definitionStatusCounts[status]
    )
  },
  byStatus: {
    clusters: statusCounts,
    definitions: definitionStatusCounts
  },
  requiredBreakdown,
  additionalBreakdown,
  autoFixPlan,
  topSourcesByReason: Object.fromEntries(TRACKED_REASONS.map((reason) => [reason, topSources(buckets.get(reason)!.by_source)])),
  notes: [
    "Counts are machine-derived from canonical sense risk_tags and cluster reasons.",
    "A definition can appear in multiple reason buckets.",
    "This report does not mark anything human-reviewed."
  ]
};

await writeJson(OUTPUT_JSON, summary);

await ensureDir(path.dirname(OUTPUT_REPORT));
const rows = [
  ["Reason", "Clusters", "Definitions", "Needs review", "Quarantine", "Entity/encyclopedic", "Reference non-Vi", "Top source"],
  ["---", "---:", "---:", "---:", "---:", "---:", "---:", "---"],
  ...TRACKED_REASONS.map((reason) => {
    const bucket = buckets.get(reason)!;
    const [top] = topSources(bucket.by_source);
    return [
      `\`${reason}\``,
      number(bucket.cluster_count),
      number(bucket.definition_count),
      number(bucket.by_status.needs_review),
      number(bucket.by_status.quarantined),
      number(bucket.by_status.entity_or_encyclopedic),
      number(bucket.by_status.reference_non_vi),
      top ? `\`${top.source}\` (${number(top.definitions)})` : "-"
    ];
  })
];

const planRows = [
  ["Bucket", "Definitions", "Recommendation"],
  ["---", "---:", "---"],
  ...autoFixPlan.map((item) => [`\`${item.bucket}\``, number(item.definitions), item.recommendation])
];

const report = `# Academic Review Breakdown 0.4.0

Generated at: ${summary.generatedAt}

This report splits machine-first sense-layer risk into actionable buckets. It is not a human-reviewed academic benchmark.

## Totals

| Metric | Value |
| --- | ---: |
| Sense clusters scanned | ${number(clusters)} |
| Source definitions scanned | ${number(definitions)} |
| Needs-review/quarantine clusters | ${number(reviewRemainderClusters)} |
| Needs-review/quarantine definitions | ${number(reviewRemainderDefinitions)} |
| Entity/encyclopedic clusters | ${number(entityOrEncyclopedicClusters)} |
| Entity/encyclopedic definitions | ${number(entityOrEncyclopedicDefinitions)} |
| Reference non-Vi clusters | ${number(referenceNonViClusters)} |
| Reference non-Vi definitions | ${number(referenceNonViDefinitions)} |

## Reason Breakdown

${markdownTable(rows)}

## Suggested Actions

${markdownTable(planRows)}

## Notes

- Buckets overlap; one definition can have multiple risk tags.
- \`reference_non_vi\` is useful for bilingual/reference inspection, but it is not Vietnamese definition coverage.
- Proper names, place names and encyclopedic candidates are exported to \`data/processed/entities/\`, not deleted.

Machine-readable output: \`data/processed/senses/review-breakdown.json\`.
`;

await writeFile(OUTPUT_REPORT, report, "utf8");

console.log(
  `[academic:review-breakdown] Wrote ${path.relative(ROOT, OUTPUT_JSON)} and ${path.relative(ROOT, OUTPUT_REPORT)}`
);
