import { createWriteStream } from "node:fs";
import { existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { createGzip } from "node:zlib";

import { PROCESSED_DIR, ROOT, ensureDir, readJson, resetDir, writeJson } from "./lib/paths.js";
import { confidenceForCluster, sourceBaseScore } from "./lib/academic-confidence.js";
import {
  ENTITY_RISK_LABELS,
  HARD_RISK_LABELS,
  STOPWORDS,
  chooseCanonical,
  hasEntityRisk,
  hasHardRisk,
  isTrustedSignal,
  statusFor
} from "./lib/academic-cluster-policy.js";
import { usedSources } from "./lib/sources.js";
import { cleanText, foldVietnamese, shortHash, slugifyWord } from "./lib/text.js";
import type { Definition, WordEntry } from "./lib/types.js";

interface DefinitionRecord {
  sense_id: string;
  definition_uid: string;
  entry_id: string;
  word: string;
  definition_index: number;
  source: string;
  source_entry_id: string | null;
  raw_record_hash: string;
  language: string;
  review_status: string;
  confidence: number;
  labels: string[];
  part_of_speech: string[];
  meaning: string;
  normalized_definition_key: string;
  tokens: string[];
  source_rights: string;
  source_quality: string;
  risk_tags: string[];
  canonical_score: number;
}

interface CanonicalCluster {
  cluster_id: string;
  cluster_type: "exact" | "singleton";
  status:
    | "auto_accepted"
    | "machine_clustered"
    | "machine_retained"
    | "needs_review"
    | "quarantined"
    | "entity_or_encyclopedic"
    | "reference_non_vi";
  confidence_tier: "high" | "medium" | "low" | "quarantine" | "entity" | "reference";
  confidence: {
    model_version: "heuristic-v1";
    source_confidence: number;
    cluster_confidence: number;
    canonical_selection_confidence: number;
  };
  word: string;
  normalized_definition_key: string;
  canonical_definition: {
    sense_id: string;
    definition_uid: string;
    entry_id: string;
    source: string;
    source_entry_id: string | null;
    raw_record_hash: string;
    language: string;
    review_status: string;
    definition_index: number;
    meaning: string;
    confidence: number;
    risk_tags: string[];
  };
  source_definitions: Array<{
    sense_id: string;
    definition_uid: string;
    entry_id: string;
    source: string;
    source_entry_id: string | null;
    raw_record_hash: string;
    language: string;
    review_status: string;
    definition_index: number;
    confidence: number;
    risk_tags: string[];
    meaning: string;
  }>;
  evidence: {
    member_count: number;
    source_count: number;
    trusted_source_count: number;
    has_vi_definition: boolean;
  };
  reasons: string[];
}

interface EntityCandidate {
  entity_id: string;
  cluster_id: string;
  candidate_scope: "cluster" | "member";
  parent_cluster_status: CanonicalCluster["status"];
  word: string;
  entity_type:
    | "proper_name"
    | "place_name"
    | "domain_or_encyclopedic"
    | "punctuation_headword"
    | "mixed_entity_or_encyclopedic";
  definition_count: number;
  sources: string[];
  risk_tags: string[];
  reasons: string[];
  canonical_definition: CanonicalCluster["canonical_definition"];
  source_definitions: CanonicalCluster["source_definitions"];
}

interface ReferenceNonViEntry {
  reference_id: string;
  cluster_id: string;
  word: string;
  definition_count: number;
  languages: string[];
  sources: string[];
  reasons: string[];
  canonical_definition: CanonicalCluster["canonical_definition"];
  source_definitions: CanonicalCluster["source_definitions"];
}

const AUDIT_DIR = path.join(ROOT, "data", "audit", "academic");
const SENSES_DIR = path.join(PROCESSED_DIR, "senses");
const ENTITIES_DIR = path.join(PROCESSED_DIR, "entities");
const REFERENCE_NON_VI_DIR = path.join(PROCESSED_DIR, "reference-non-vi");
const SUMMARY_PATH = path.join(AUDIT_DIR, "auto-cluster-summary.json");
const CLUSTERS_GZ_PATH = path.join(AUDIT_DIR, "canonical-sense-clusters.jsonl.gz");
const CLUSTERS_SAMPLE_PATH = path.join(AUDIT_DIR, "canonical-sense-clusters.sample.jsonl");
const REVIEW_REMAINDER_PATH = path.join(AUDIT_DIR, "auto-cluster-review-remainder.sample.jsonl");
const NEAR_CANDIDATES_PATH = path.join(AUDIT_DIR, "auto-cluster-near-candidates.json");
const PROCESSED_SUMMARY_PATH = path.join(SENSES_DIR, "index.json");
const PROCESSED_CLUSTERS_GZ_PATH = path.join(SENSES_DIR, "canonical-sense-clusters.jsonl.gz");
const PROCESSED_CLUSTERS_SAMPLE_PATH = path.join(SENSES_DIR, "canonical-sense-clusters.sample.jsonl");
const PROCESSED_REVIEW_REMAINDER_PATH = path.join(SENSES_DIR, "review-remainder.sample.jsonl");
const PROCESSED_NEAR_CANDIDATES_PATH = path.join(SENSES_DIR, "near-duplicate-candidates.json");
const PROCESSED_ENTITY_INDEX_PATH = path.join(ENTITIES_DIR, "index.json");
const PROCESSED_ENTITY_JSONL_PATH = path.join(ENTITIES_DIR, "entity-candidates.jsonl");
const PROCESSED_ENTITY_SAMPLE_PATH = path.join(ENTITIES_DIR, "entity-candidates.sample.jsonl");
const PROCESSED_REFERENCE_INDEX_PATH = path.join(REFERENCE_NON_VI_DIR, "index.json");
const PROCESSED_REFERENCE_GZ_PATH = path.join(REFERENCE_NON_VI_DIR, "reference-definitions.jsonl.gz");
const PROCESSED_REFERENCE_SAMPLE_PATH = path.join(REFERENCE_NON_VI_DIR, "reference-definitions.sample.jsonl");

async function readArrays<T>(dir: string): Promise<T[]> {
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).sort();
  const entries: T[] = [];
  for (const file of files) entries.push(...(await readJson<T[]>(path.join(dir, file))));
  return entries;
}

function number(value: number): string {
  return value.toLocaleString("vi-VN");
}

function percent(value: number, total: number): number {
  return total === 0 ? 0 : Number(((value / total) * 100).toFixed(2));
}

function normalizeDefinitionKey(value: string): string {
  return foldVietnamese(cleanText(value))
    .replace(/^\s*\d+[\).]?\s*/g, "")
    .replace(/^(d|dt|tt|t|dong tu|danh tu|tinh tu|ph|pht|trt|l|c|id)\.\s+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensFor(value: string): string[] {
  return normalizeDefinitionKey(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function jaccard(a: string[], b: string[]): number {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

function senseIdFor(entry: WordEntry, definition: Definition, index: number): string {
  const raw =
    `${entry.headword_normalized}:${definition.source}:${definition.provenance.source_entry_id ?? ""}:` +
    `${definition.provenance.raw_record_hash}:${index}:${normalizeDefinitionKey(definition.meaning)}`;
  return `sense-${slugifyWord(entry.word)}-${shortHash(raw)}`;
}

function definitionUidFor(entry: WordEntry, definition: Definition, index: number): string {
  return `def-${shortHash(`${entry.id}:${index}:${definition.source}:${definition.provenance.raw_record_hash}`)}`;
}

function exactClusterIdFor(word: string, key: string): string {
  return `cluster-exact-${slugifyWord(word)}-${shortHash(`${word}:${key}`)}`;
}

function singletonClusterIdFor(record: DefinitionRecord): string {
  return `cluster-single-${slugifyWord(record.word)}-${shortHash(record.sense_id)}`;
}

function riskTagsFor(entry: WordEntry, definition: Definition, sourceRights: string): string[] {
  const tags: string[] = [];
  const meaning = cleanText(definition.meaning);
  const normalized = normalizeDefinitionKey(meaning);
  if (sourceRights === "documented-unclear" || definition.labels.includes("documented-unclear")) {
    tags.push("documented-unclear-source");
  }
  if (definition.provenance.confidence < 0.75) tags.push("low-confidence");
  if (entry.part_of_speech.length === 0) tags.push("missing-pos");
  if (entry.part_of_speech.some((pos) => /^[A-Z]$/.test(pos))) tags.push("raw-pos-code");
  if (definition.language !== "vi") tags.push("non-vi-definition");
  if (meaning.length < 12 || normalized.split(" ").filter(Boolean).length < 2) tags.push("too-short");
  if (meaning.length > 500) tags.push("too-long");
  if (/^\s*\d+[.)]\s+/u.test(meaning) || /^\s*\d+[.)]?\s*$/u.test(meaning)) {
    tags.push("leading-sense-marker");
  }
  for (const label of definition.labels) {
    if (HARD_RISK_LABELS.has(label)) tags.push(label);
  }
  return [...new Set(tags)];
}

function canonicalScore(record: Omit<DefinitionRecord, "canonical_score">): number {
  let score = sourceBaseScore(record.source_rights, record.source_quality);
  score += record.language === "vi" ? 18 : -20;
  score += record.confidence * 25;
  if (record.review_status === "human-reviewed") score += 20;
  if (record.review_status === "machine-checked") score += 6;
  if (record.labels.length > 0) score += 2;
  for (const tag of record.risk_tags) {
    if (HARD_RISK_LABELS.has(tag)) score -= 45;
    else if (tag === "documented-unclear-source") score -= 25;
    else if (tag === "low-confidence") score -= 12;
    else if (tag === "non-vi-definition") score -= 15;
    else score -= 4;
  }
  return Number(score.toFixed(4));
}

async function writeJsonl(filePath: string, rows: unknown[]): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

async function writeGzipJsonlStream(filePath: string, rows: Iterable<unknown>): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const gzip = createGzip();
  const out = createWriteStream(filePath);
  gzip.pipe(out);
  for (const row of rows) {
    if (!gzip.write(`${JSON.stringify(row)}\n`)) await once(gzip, "drain");
  }
  gzip.end();
  await once(out, "finish");
}

const sourceMap = new Map(usedSources().map((source) => [source.key, source]));
const words = await readArrays<WordEntry>(path.join(PROCESSED_DIR, "words"));
const records: DefinitionRecord[] = [];
const recordsByExactCluster = new Map<string, DefinitionRecord[]>();
const recordsByWord = new Map<string, DefinitionRecord[]>();

for (const entry of words) {
  for (const [index, definition] of entry.definitions.entries()) {
    const source = sourceMap.get(definition.source);
    const partial = {
      sense_id: senseIdFor(entry, definition, index),
      definition_uid: definitionUidFor(entry, definition, index),
      entry_id: entry.id,
      word: entry.word,
      definition_index: index,
      source: definition.source,
      source_entry_id: definition.provenance.source_entry_id,
      raw_record_hash: definition.provenance.raw_record_hash,
      language: definition.language,
      review_status: definition.provenance.review_status,
      confidence: definition.provenance.confidence,
      labels: definition.labels,
      part_of_speech: entry.part_of_speech,
      meaning: definition.meaning,
      normalized_definition_key: normalizeDefinitionKey(definition.meaning),
      tokens: tokensFor(definition.meaning),
      source_rights: source?.rightsStatus ?? "unknown",
      source_quality: source?.quality ?? "unknown",
      risk_tags: riskTagsFor(entry, definition, source?.rightsStatus ?? "unknown")
    };
    const record: DefinitionRecord = { ...partial, canonical_score: canonicalScore(partial) };
    records.push(record);

    const exactId = exactClusterIdFor(record.word, record.normalized_definition_key);
    const exact = recordsByExactCluster.get(exactId) ?? [];
    exact.push(record);
    recordsByExactCluster.set(exactId, exact);

    const byWord = recordsByWord.get(record.word) ?? [];
    byWord.push(record);
    recordsByWord.set(record.word, byWord);
  }
}

const assigned = new Set<string>();
const clusters: CanonicalCluster[] = [];

function buildCluster(clusterId: string, clusterType: "exact" | "singleton", members: DefinitionRecord[]): CanonicalCluster {
  const canonical = chooseCanonical(members);
  const status = statusFor(members, clusterType, canonical);
  const trustedSourceCount = new Set(members.filter(isTrustedSignal).map((record) => record.source)).size;
  return {
    cluster_id: clusterId,
    cluster_type: clusterType,
    status: status.status,
    confidence_tier: status.confidence_tier,
    confidence: confidenceForCluster(members, canonical, clusterType, trustedSourceCount),
    word: canonical.word,
    normalized_definition_key: canonical.normalized_definition_key,
    canonical_definition: {
      sense_id: canonical.sense_id,
      definition_uid: canonical.definition_uid,
      entry_id: canonical.entry_id,
      source: canonical.source,
      source_entry_id: canonical.source_entry_id,
      raw_record_hash: canonical.raw_record_hash,
      language: canonical.language,
      review_status: canonical.review_status,
      definition_index: canonical.definition_index,
      meaning: canonical.meaning,
      confidence: canonical.confidence,
      risk_tags: canonical.risk_tags
    },
    source_definitions: members
      .sort((a, b) => b.canonical_score - a.canonical_score || a.source.localeCompare(b.source))
      .map((record) => ({
        sense_id: record.sense_id,
        definition_uid: record.definition_uid,
        entry_id: record.entry_id,
        source: record.source,
        source_entry_id: record.source_entry_id,
        raw_record_hash: record.raw_record_hash,
        language: record.language,
        review_status: record.review_status,
        definition_index: record.definition_index,
        confidence: record.confidence,
        risk_tags: record.risk_tags,
        meaning: record.meaning
      })),
    evidence: {
      member_count: members.length,
      source_count: new Set(members.map((record) => record.source)).size,
      trusted_source_count: trustedSourceCount,
      has_vi_definition: members.some((record) => record.language === "vi")
    },
    reasons: status.reasons
  };
}

for (const [clusterId, members] of recordsByExactCluster.entries()) {
  const sourceCount = new Set(members.map((record) => record.source)).size;
  if (members.length > 1 && sourceCount > 1 && members[0]?.normalized_definition_key) {
    const cluster = buildCluster(clusterId, "exact", members);
    clusters.push(cluster);
    for (const member of members) assigned.add(member.sense_id);
  }
}

for (const record of records) {
  if (assigned.has(record.sense_id)) continue;
  clusters.push(buildCluster(singletonClusterIdFor(record), "singleton", [record]));
}

clusters.sort(
  (a, b) =>
    a.word.localeCompare(b.word, "vi") ||
    a.normalized_definition_key.localeCompare(b.normalized_definition_key, "vi") ||
    a.cluster_id.localeCompare(b.cluster_id)
);

const nearCandidates: Array<{
  word: string;
  score: number;
  left_sense_id: string;
  right_sense_id: string;
  left_source: string;
  right_source: string;
  left_meaning: string;
  right_meaning: string;
  recommended_action: "machine_cluster_candidate" | "review_only";
}> = [];
let nearPairCount = 0;

for (const group of recordsByWord.values()) {
  for (let i = 0; i < group.length; i += 1) {
    for (let j = i + 1; j < group.length; j += 1) {
      const left = group[i]!;
      const right = group[j]!;
      if (left.normalized_definition_key === right.normalized_definition_key) continue;
      if (left.tokens.length < 4 || right.tokens.length < 4) continue;
      const score = jaccard(left.tokens, right.tokens);
      if (score < 0.82) continue;
      nearPairCount += 1;
      const trustedPair = isTrustedSignal(left) && isTrustedSignal(right);
      nearCandidates.push({
        word: left.word,
        score: Number(score.toFixed(4)),
        left_sense_id: left.sense_id,
        right_sense_id: right.sense_id,
        left_source: left.source,
        right_source: right.source,
        left_meaning: cleanText(left.meaning).slice(0, 220),
        right_meaning: cleanText(right.meaning).slice(0, 220),
        recommended_action: score >= 0.94 && trustedPair ? "machine_cluster_candidate" : "review_only"
      });
    }
  }
}

nearCandidates.sort((a, b) => b.score - a.score || a.word.localeCompare(b.word, "vi"));

const statusCounts: Record<CanonicalCluster["status"], number> = {
  auto_accepted: 0,
  machine_clustered: 0,
  machine_retained: 0,
  needs_review: 0,
  quarantined: 0,
  entity_or_encyclopedic: 0,
  reference_non_vi: 0
};
const definitionStatusCounts: Record<CanonicalCluster["status"], number> = {
  auto_accepted: 0,
  machine_clustered: 0,
  machine_retained: 0,
  needs_review: 0,
  quarantined: 0,
  entity_or_encyclopedic: 0,
  reference_non_vi: 0
};
for (const cluster of clusters) {
  statusCounts[cluster.status] += 1;
  definitionStatusCounts[cluster.status] += cluster.evidence.member_count;
}

const reviewRemainder = clusters
  .filter((cluster) => cluster.status === "needs_review" || cluster.status === "quarantined")
  .sort(
    (a, b) =>
      b.evidence.member_count - a.evidence.member_count ||
      a.status.localeCompare(b.status) ||
      a.word.localeCompare(b.word, "vi")
  )
  .slice(0, 5000)
  .map((cluster) => ({
    status: cluster.status,
    confidence_tier: cluster.confidence_tier,
    word: cluster.word,
    cluster_id: cluster.cluster_id,
    member_count: cluster.evidence.member_count,
    reasons: cluster.reasons,
    canonical_definition: cluster.canonical_definition
  }));

function entityTypeForDefinitions(
  definitions: CanonicalCluster["source_definitions"]
): EntityCandidate["entity_type"] {
  const tags = new Set(definitions.flatMap((definition) => definition.risk_tags));
  const matches = [
    tags.has("proper-name-candidate") ? "proper_name" : null,
    tags.has("place-name-candidate") ? "place_name" : null,
    tags.has("domain-or-encyclopedic-candidate") ? "domain_or_encyclopedic" : null,
    tags.has("punctuation-headword-candidate") ? "punctuation_headword" : null
  ].filter((item): item is Exclude<EntityCandidate["entity_type"], "mixed_entity_or_encyclopedic"> => item !== null);
  return matches.length === 1 ? matches[0]! : "mixed_entity_or_encyclopedic";
}

const clusterEntityCandidates: EntityCandidate[] = clusters
  .filter((cluster) => cluster.status === "entity_or_encyclopedic")
  .map((cluster) => ({
    entity_id: `entity-${shortHash(cluster.cluster_id)}`,
    cluster_id: cluster.cluster_id,
    candidate_scope: "cluster",
    parent_cluster_status: cluster.status,
    word: cluster.word,
    entity_type: entityTypeForDefinitions(cluster.source_definitions),
    definition_count: cluster.evidence.member_count,
    sources: [...new Set(cluster.source_definitions.map((definition) => definition.source))].sort(),
    risk_tags: [...new Set(cluster.source_definitions.flatMap((definition) => definition.risk_tags))].sort(),
    reasons: cluster.reasons,
    canonical_definition: cluster.canonical_definition,
    source_definitions: cluster.source_definitions
  }));

const memberEntityCandidates: EntityCandidate[] = clusters.flatMap((cluster) => {
  if (cluster.status === "entity_or_encyclopedic" || cluster.status === "reference_non_vi") return [];
  const riskyDefinitions = cluster.source_definitions.filter((definition) =>
    definition.risk_tags.some((tag) => ENTITY_RISK_LABELS.has(tag))
  );
  if (riskyDefinitions.length === 0) return [];
  const representative = [...riskyDefinitions].sort(
    (a, b) => b.confidence - a.confidence || a.source.localeCompare(b.source) || a.sense_id.localeCompare(b.sense_id)
  )[0]!;
  return [
    {
      entity_id: `entity-member-${shortHash(
        `${cluster.cluster_id}:${riskyDefinitions.map((definition) => definition.sense_id).sort().join(":")}`
      )}`,
      cluster_id: cluster.cluster_id,
      candidate_scope: "member",
      parent_cluster_status: cluster.status,
      word: cluster.word,
      entity_type: entityTypeForDefinitions(riskyDefinitions),
      definition_count: riskyDefinitions.length,
      sources: [...new Set(riskyDefinitions.map((definition) => definition.source))].sort(),
      risk_tags: [...new Set(riskyDefinitions.flatMap((definition) => definition.risk_tags))].sort(),
      reasons: ["member-level-entity-risk", "parent-cluster-retained-with-non-entity-canonical"],
      canonical_definition: representative,
      source_definitions: riskyDefinitions
    }
  ];
});

const entityCandidates = [...clusterEntityCandidates, ...memberEntityCandidates].sort(
  (a, b) => a.word.localeCompare(b.word, "vi") || a.entity_id.localeCompare(b.entity_id)
);

const entityTypeCounts: Record<EntityCandidate["entity_type"], number> = {
  proper_name: 0,
  place_name: 0,
  domain_or_encyclopedic: 0,
  punctuation_headword: 0,
  mixed_entity_or_encyclopedic: 0
};
for (const candidate of entityCandidates) entityTypeCounts[candidate.entity_type] += 1;
const memberLevelEntityDefinitions = memberEntityCandidates.reduce(
  (total, candidate) => total + candidate.definition_count,
  0
);
const entityReviewDefinitions = entityCandidates.reduce((total, candidate) => total + candidate.definition_count, 0);

const referenceEntries: ReferenceNonViEntry[] = clusters
  .filter((cluster) => cluster.status === "reference_non_vi")
  .map((cluster) => ({
    reference_id: `reference-${shortHash(cluster.cluster_id)}`,
    cluster_id: cluster.cluster_id,
    word: cluster.word,
    definition_count: cluster.evidence.member_count,
    languages: [...new Set(cluster.source_definitions.map((definition) => definition.language))].sort(),
    sources: [...new Set(cluster.source_definitions.map((definition) => definition.source))].sort(),
    reasons: cluster.reasons,
    canonical_definition: cluster.canonical_definition,
    source_definitions: cluster.source_definitions
  }));
const referenceLanguageCounts: Record<string, number> = {};
const referenceSourceCounts: Record<string, number> = {};
for (const entry of referenceEntries) {
  for (const definition of entry.source_definitions) {
    referenceLanguageCounts[definition.language] = (referenceLanguageCounts[definition.language] ?? 0) + 1;
    referenceSourceCounts[definition.source] = (referenceSourceCounts[definition.source] ?? 0) + 1;
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  status: "MACHINE_FIRST_DRAFT",
  headwords: words.length,
  definitions: records.length,
  clusters: clusters.length,
  statusCounts,
  definitionStatusCounts,
  exactDuplicateDefinitionsResolved:
    definitionStatusCounts.auto_accepted + definitionStatusCounts.machine_clustered,
  reviewRemainderDefinitions: definitionStatusCounts.needs_review + definitionStatusCounts.quarantined,
  reviewRemainderPercent: percent(
    definitionStatusCounts.needs_review + definitionStatusCounts.quarantined,
    records.length
  ),
  nearDuplicatePairs: nearPairCount,
  nearDuplicatePairsSampled: nearCandidates.length,
  entityOrEncyclopedicDefinitions: definitionStatusCounts.entity_or_encyclopedic,
  entityOrEncyclopedicClusters: statusCounts.entity_or_encyclopedic,
  entityReviewDefinitions,
  memberLevelEntityReviewDefinitions: memberLevelEntityDefinitions,
  note:
    "Machine-first draft. auto_accepted is conservative exact-source agreement, not human review. Do not call this academically final."
};

await ensureDir(AUDIT_DIR);
await resetDir(SENSES_DIR);
await resetDir(ENTITIES_DIR);
await resetDir(REFERENCE_NON_VI_DIR);
await writeJson(SUMMARY_PATH, summary);
await writeGzipJsonlStream(CLUSTERS_GZ_PATH, clusters);
await writeJsonl(CLUSTERS_SAMPLE_PATH, clusters.slice(0, 5000));
await writeJsonl(REVIEW_REMAINDER_PATH, reviewRemainder);
await writeJson(NEAR_CANDIDATES_PATH, {
  totalPairs: nearPairCount,
  sampledPairs: nearCandidates.length,
  pairs: nearCandidates
});
await writeJson(PROCESSED_SUMMARY_PATH, summary);
await writeGzipJsonlStream(PROCESSED_CLUSTERS_GZ_PATH, clusters);
await writeJsonl(PROCESSED_CLUSTERS_SAMPLE_PATH, clusters.slice(0, 5000));
await writeJsonl(PROCESSED_REVIEW_REMAINDER_PATH, reviewRemainder);
await writeJson(PROCESSED_NEAR_CANDIDATES_PATH, {
  totalPairs: nearPairCount,
  sampledPairs: nearCandidates.length,
  pairs: nearCandidates
});
await writeJson(PROCESSED_ENTITY_INDEX_PATH, {
  generatedAt: summary.generatedAt,
  status: "MACHINE_EXTRACTED",
  candidates: entityCandidates.length,
  clusterCandidates: clusterEntityCandidates.length,
  memberCandidates: memberEntityCandidates.length,
  definitions: entityReviewDefinitions,
  clusterLayerDefinitions: definitionStatusCounts.entity_or_encyclopedic,
  memberLevelDefinitions: memberLevelEntityDefinitions,
  entityTypeCounts,
  sourceLayer: "data/processed/senses",
  note:
    "Machine-extracted proper-name, place-name, domain and encyclopedic candidates. Member-level candidates do not change the trusted canonical status; no source evidence is deleted."
});
await writeJsonl(PROCESSED_ENTITY_JSONL_PATH, entityCandidates);
await writeJsonl(PROCESSED_ENTITY_SAMPLE_PATH, entityCandidates.slice(0, 5000));
await writeJson(PROCESSED_REFERENCE_INDEX_PATH, {
  generatedAt: summary.generatedAt,
  status: "REFERENCE_ONLY",
  entries: referenceEntries.length,
  definitions: definitionStatusCounts.reference_non_vi,
  languageCounts: referenceLanguageCounts,
  sourceCounts: referenceSourceCounts,
  sourceLayer: "data/processed/senses",
  consumerGuidance:
    "Hide by default for Vietnamese-only dictionary coverage. Enable only for bilingual, etymological or cross-language reference views.",
  note: "Source-attributed non-Vietnamese definitions. They do not count as Vietnamese definition coverage."
});
await writeGzipJsonlStream(PROCESSED_REFERENCE_GZ_PATH, referenceEntries);
await writeJsonl(PROCESSED_REFERENCE_SAMPLE_PATH, referenceEntries.slice(0, 5000));

console.log(
  `[academic:auto-cluster] MACHINE_FIRST_DRAFT: ${number(records.length)} definitions -> ` +
    `${number(clusters.length)} clusters; auto=${number(definitionStatusCounts.auto_accepted)}, ` +
    `machine=${number(definitionStatusCounts.machine_clustered + definitionStatusCounts.machine_retained)}, ` +
    `review=${number(summary.reviewRemainderDefinitions)}, entity=${number(definitionStatusCounts.entity_or_encyclopedic)}, ` +
    `near=${number(nearPairCount)}`
);
