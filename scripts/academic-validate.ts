import { createReadStream } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { Ajv2020 } from "ajv/dist/2020.js";

import { PROCESSED_DIR, ROOT, SCHEMA_DIR, readJson, writeJson } from "./lib/paths.js";

type ClusterStatus =
  | "auto_accepted"
  | "machine_clustered"
  | "machine_retained"
  | "needs_review"
  | "quarantined"
  | "entity_or_encyclopedic"
  | "reference_non_vi";

interface CanonicalCluster {
  cluster_id: string;
  cluster_type: "exact" | "singleton";
  status: ClusterStatus;
  confidence_tier: "high" | "medium" | "low" | "quarantine" | "entity" | "reference";
  canonical_definition: { sense_id: string };
  source_definitions: Array<{ sense_id: string }>;
  evidence: {
    member_count: number;
    source_count: number;
    trusted_source_count: number;
    has_vi_definition: boolean;
  };
}

interface SenseIndex {
  headwords: number;
  definitions: number;
  clusters: number;
  statusCounts: Record<ClusterStatus, number>;
  definitionStatusCounts: Record<ClusterStatus, number>;
}

interface NearDuplicateCollection {
  totalPairs: number;
  sampledPairs: number;
  pairs: Array<{
    left_sense_id: string;
    right_sense_id: string;
  }>;
}

interface EntityLayerIndex {
  candidates: number;
  clusterCandidates: number;
  memberCandidates: number;
  definitions: number;
  clusterLayerDefinitions: number;
  memberLevelDefinitions: number;
  entityTypeCounts: Record<string, number>;
}

interface ReferenceNonViIndex {
  entries: number;
  definitions: number;
  languageCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
}

type PronunciationConflictBucket = "formatting_only" | "dialect_source_variant" | "source_attested_variant" | "unresolved";
type ReviewPacketTaskType = "pronunciation_conflict_review" | "dialect_label_review";

interface BucketCounts {
  formatting_only: number;
  dialect_source_variant: number;
  source_attested_variant: number;
  unresolved: number;
}

interface ReviewPacketTaskCounts {
  pronunciation_conflict_review: number;
  dialect_label_review: number;
}

const SENSES_DIR = path.join(PROCESSED_DIR, "senses");
const CLUSTERS_PATH = path.join(SENSES_DIR, "canonical-sense-clusters.jsonl.gz");
const REVIEW_REMAINDER_PATH = path.join(SENSES_DIR, "review-remainder.sample.jsonl");
const NEAR_CANDIDATES_PATH = path.join(SENSES_DIR, "near-duplicate-candidates.json");
const NEAR_TRIAGE_PATH = path.join(SENSES_DIR, "near-duplicate-triage.json");
const CONFIDENCE_REPORT_PATH = path.join(SENSES_DIR, "confidence-report.json");
const SAMPLE_INDEX_PATH = path.join(SENSES_DIR, "samples", "index.json");
const SILVER_BENCHMARK_PATH = path.join(ROOT, "data", "audit", "academic", "silver-sense-benchmark.jsonl");
const SILVER_REPORT_PATH = path.join(SENSES_DIR, "silver-benchmark-report.json");
const PHASE6_AUDIT_PATH = path.join(ROOT, "data", "audit", "academic", "phase6-summary.json");
const PHASE6_INDEX_PATH = path.join(PROCESSED_DIR, "phase6", "index.json");
const PRONUNCIATION_FACTS_PATH = path.join(PROCESSED_DIR, "phase6", "pronunciation-facts.jsonl");
const PRONUNCIATION_DIALECT_COVERAGE_PATH = path.join(PROCESSED_DIR, "phase6", "pronunciation-dialect-coverage.json");
const PRONUNCIATION_DIALECT_GAP_SUMMARY_PATH = path.join(PROCESSED_DIR, "phase6", "pronunciation-dialect-gaps.json");
const PRONUNCIATION_DIALECT_GAP_DETAILS_PATH = path.join(PROCESSED_DIR, "phase6", "pronunciation-dialect-gaps.jsonl");
const PRONUNCIATION_CONFLICTS_SUMMARY_PATH = path.join(PROCESSED_DIR, "phase6", "pronunciation-conflicts.json");
const PRONUNCIATION_CONFLICTS_PATH = path.join(PROCESSED_DIR, "phase6", "pronunciation-conflicts.jsonl");
const PRONUNCIATION_SOURCE_ENTRY_POLICY_PATH = path.join(
  PROCESSED_DIR,
  "phase6",
  "pronunciation-source-entry-policy.json"
);
const PRONUNCIATION_ENTRY_SCOPE_TRIAGE_PATH = path.join(
  PROCESSED_DIR,
  "phase6",
  "pronunciation-entry-scope-triage.json"
);
const PRONUNCIATION_UNRESOLVED_ANALYSIS_PATH = path.join(PROCESSED_DIR, "phase6", "pronunciation-unresolved-analysis.json");
const PRONUNCIATION_UNRESOLVED_ANALYSIS_DETAILS_PATH = path.join(
  PROCESSED_DIR,
  "phase6",
  "pronunciation-unresolved-analysis.jsonl"
);
const HUMAN_REVIEW_PACKET_PATH = path.join(PROCESSED_DIR, "phase6", "human-review-packet.json");
const HUMAN_REVIEW_PACKET_TASKS_PATH = path.join(PROCESSED_DIR, "phase6", "human-review-packet.jsonl");
const AI_REVIEW_SUMMARY_PATH = path.join(PROCESSED_DIR, "phase6", "ai-review", "ai-review-summary.json");
const AI_REVIEW_DECISIONS_PATH = path.join(PROCESSED_DIR, "phase6", "ai-review", "ai-review-decisions.jsonl");
const ORIGIN_FACTS_PATH = path.join(PROCESSED_DIR, "phase6", "origin-facts.jsonl");
const ENTITY_CANDIDATES_PATH = path.join(PROCESSED_DIR, "entities", "entity-candidates.jsonl");
const ENTITY_INDEX_PATH = path.join(PROCESSED_DIR, "entities", "index.json");
const REFERENCE_NON_VI_PATH = path.join(
  PROCESSED_DIR,
  "reference-non-vi",
  "reference-definitions.jsonl.gz"
);
const REFERENCE_NON_VI_INDEX_PATH = path.join(PROCESSED_DIR, "reference-non-vi", "index.json");
const INDEX_PATH = path.join(SENSES_DIR, "index.json");
const VALIDATION_SUMMARY_PATH = path.join(SENSES_DIR, "validation-summary.json");

const STATUS_KEYS: ClusterStatus[] = [
  "auto_accepted",
  "machine_clustered",
  "machine_retained",
  "needs_review",
  "quarantined",
  "entity_or_encyclopedic",
  "reference_non_vi"
];

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

function sameCounts(left: Record<ClusterStatus, number>, right: Record<ClusterStatus, number>): boolean {
  return STATUS_KEYS.every((key) => left[key] === right[key]);
}

function sameNumericRecord(left: Record<string, number>, right: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => left[key] === right[key]);
}

function sameBucketCounts(left: BucketCounts, right: BucketCounts): boolean {
  return (
    left.formatting_only === right.formatting_only &&
    left.dialect_source_variant === right.dialect_source_variant &&
    left.source_attested_variant === right.source_attested_variant &&
    left.unresolved === right.unresolved
  );
}

function sameReviewPacketTaskCounts(left: ReviewPacketTaskCounts, right: ReviewPacketTaskCounts): boolean {
  return (
    left.pronunciation_conflict_review === right.pronunciation_conflict_review &&
    left.dialect_label_review === right.dialect_label_review
  );
}

async function readJsonl(filePath: string): Promise<unknown[]> {
  if (!existsSync(filePath)) return [];
  const text = await import("node:fs/promises").then((fs) => fs.readFile(filePath, "utf8"));
  return text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

if (!existsSync(CLUSTERS_PATH)) {
  console.error("[academic:validate] Missing data/processed/senses/canonical-sense-clusters.jsonl.gz");
  process.exit(1);
}

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
const clusterSchema = await readJson<Record<string, unknown>>(path.join(SCHEMA_DIR, "canonical-sense-cluster.schema.json"));
const reviewSchema = await readJson<Record<string, unknown>>(path.join(SCHEMA_DIR, "review-remainder.schema.json"));
const entitySchema = await readJson<Record<string, unknown>>(path.join(SCHEMA_DIR, "entity-candidate.schema.json"));
const nearCandidateSchema = await readJson<Record<string, unknown>>(
  path.join(SCHEMA_DIR, "near-duplicate-candidate.schema.json")
);
const senseIndexSchema = await readJson<Record<string, unknown>>(path.join(SCHEMA_DIR, "sense-layer-index.schema.json"));
const referenceNonViSchema = await readJson<Record<string, unknown>>(path.join(SCHEMA_DIR, "reference-non-vi.schema.json"));
const entityIndexSchema = await readJson<Record<string, unknown>>(path.join(SCHEMA_DIR, "entity-layer-index.schema.json"));
const referenceNonViIndexSchema = await readJson<Record<string, unknown>>(
  path.join(SCHEMA_DIR, "reference-non-vi-index.schema.json")
);
const nearTriageSchema = await readJson<Record<string, unknown>>(path.join(SCHEMA_DIR, "near-duplicate-triage.schema.json"));
const confidenceReportSchema = await readJson<Record<string, unknown>>(path.join(SCHEMA_DIR, "confidence-report.schema.json"));
const sampleIndexSchema = await readJson<Record<string, unknown>>(path.join(SCHEMA_DIR, "stratified-sample-index.schema.json"));
const silverBenchmarkSchema = await readJson<Record<string, unknown>>(path.join(SCHEMA_DIR, "silver-sense-benchmark.schema.json"));
const silverReportSchema = await readJson<Record<string, unknown>>(path.join(SCHEMA_DIR, "silver-benchmark-report.schema.json"));
const phase6AuditSchema = await readJson<Record<string, unknown>>(path.join(SCHEMA_DIR, "phase6-audit.schema.json"));
const phase6IndexSchema = await readJson<Record<string, unknown>>(path.join(SCHEMA_DIR, "phase6-index.schema.json"));
const pronunciationFactSchema = await readJson<Record<string, unknown>>(path.join(SCHEMA_DIR, "pronunciation-fact.schema.json"));
const pronunciationDialectCoverageSchema = await readJson<Record<string, unknown>>(
  path.join(SCHEMA_DIR, "phase6-pronunciation-dialect-coverage.schema.json")
);
const pronunciationDialectGapSchema = await readJson<Record<string, unknown>>(
  path.join(SCHEMA_DIR, "phase6-pronunciation-dialect-gap.schema.json")
);
const pronunciationDialectGapSummarySchema = await readJson<Record<string, unknown>>(
  path.join(SCHEMA_DIR, "phase6-pronunciation-dialect-gaps.schema.json")
);
const pronunciationConflictSchema = await readJson<Record<string, unknown>>(
  path.join(SCHEMA_DIR, "phase6-pronunciation-conflict.schema.json")
);
const pronunciationConflictSummarySchema = await readJson<Record<string, unknown>>(
  path.join(SCHEMA_DIR, "phase6-pronunciation-conflicts.schema.json")
);
const pronunciationUnresolvedAnalysisSchema = await readJson<Record<string, unknown>>(
  path.join(SCHEMA_DIR, "phase6-pronunciation-unresolved-analysis.schema.json")
);
const pronunciationSourceEntryPolicySchema = await readJson<Record<string, unknown>>(
  path.join(SCHEMA_DIR, "phase6-pronunciation-source-entry-policy.schema.json")
);
const pronunciationEntryScopeTriageSchema = await readJson<Record<string, unknown>>(
  path.join(SCHEMA_DIR, "phase6-pronunciation-entry-scope-triage.schema.json")
);
const pronunciationReviewQueueRowSchema = await readJson<Record<string, unknown>>(
  path.join(SCHEMA_DIR, "phase6-pronunciation-review-queue-row.schema.json")
);
const humanReviewPacketSchema = await readJson<Record<string, unknown>>(
  path.join(SCHEMA_DIR, "phase6-human-review-packet.schema.json")
);
const humanReviewPacketTaskSchema = await readJson<Record<string, unknown>>(
  path.join(SCHEMA_DIR, "phase6-human-review-packet-task.schema.json")
);
const aiReviewSummarySchema = await readJson<Record<string, unknown>>(
  path.join(SCHEMA_DIR, "phase6-ai-review-summary.schema.json")
);
const aiReviewDecisionSchema = await readJson<Record<string, unknown>>(
  path.join(SCHEMA_DIR, "phase6-ai-review-decision.schema.json")
);
const originFactSchema = await readJson<Record<string, unknown>>(path.join(SCHEMA_DIR, "origin-fact.schema.json"));
const validateCluster = ajv.compile(clusterSchema);
const validateReview = ajv.compile(reviewSchema);
const validateEntity = ajv.compile(entitySchema);
const validateNearCandidates = ajv.compile(nearCandidateSchema);
const validateSenseIndex = ajv.compile(senseIndexSchema);
const validateReferenceNonVi = ajv.compile(referenceNonViSchema);
const validateEntityIndex = ajv.compile(entityIndexSchema);
const validateReferenceNonViIndex = ajv.compile(referenceNonViIndexSchema);
const validateNearTriage = ajv.compile(nearTriageSchema);
const validateConfidenceReport = ajv.compile(confidenceReportSchema);
const validateSampleIndex = ajv.compile(sampleIndexSchema);
const validateSilverBenchmark = ajv.compile(silverBenchmarkSchema);
const validateSilverReport = ajv.compile(silverReportSchema);
const validatePhase6Audit = ajv.compile(phase6AuditSchema);
const validatePhase6Index = ajv.compile(phase6IndexSchema);
const validatePronunciationFact = ajv.compile(pronunciationFactSchema);
const validatePronunciationDialectCoverage = ajv.compile(pronunciationDialectCoverageSchema);
const validatePronunciationDialectGap = ajv.compile(pronunciationDialectGapSchema);
const validatePronunciationDialectGapSummary = ajv.compile(pronunciationDialectGapSummarySchema);
const validatePronunciationConflict = ajv.compile(pronunciationConflictSchema);
const validatePronunciationConflictSummary = ajv.compile(pronunciationConflictSummarySchema);
const validatePronunciationUnresolvedAnalysis = ajv.compile(pronunciationUnresolvedAnalysisSchema);
const validatePronunciationSourceEntryPolicy = ajv.compile(pronunciationSourceEntryPolicySchema);
const validatePronunciationEntryScopeTriage = ajv.compile(pronunciationEntryScopeTriageSchema);
const validatePronunciationReviewQueueRow = ajv.compile(pronunciationReviewQueueRowSchema);
const validateHumanReviewPacket = ajv.compile(humanReviewPacketSchema);
const validateHumanReviewPacketTask = ajv.compile(humanReviewPacketTaskSchema);
const validateAiReviewSummary = ajv.compile(aiReviewSummarySchema);
const validateAiReviewDecision = ajv.compile(aiReviewDecisionSchema);
const validateOriginFact = ajv.compile(originFactSchema);
const indexValue = await readJson<unknown>(INDEX_PATH);
const index = indexValue as SenseIndex;
const nearCandidateValue = await readJson<unknown>(NEAR_CANDIDATES_PATH);
const nearCandidates = nearCandidateValue as NearDuplicateCollection;
const entityIndexValue = await readJson<unknown>(ENTITY_INDEX_PATH);
const entityIndex = entityIndexValue as EntityLayerIndex;
const referenceIndexValue = await readJson<unknown>(REFERENCE_NON_VI_INDEX_PATH);
const referenceIndex = referenceIndexValue as ReferenceNonViIndex;
const nearTriageValue = await readJson<unknown>(NEAR_TRIAGE_PATH);
const confidenceReportValue = await readJson<unknown>(CONFIDENCE_REPORT_PATH);
const sampleIndexValue = await readJson<unknown>(SAMPLE_INDEX_PATH);
const silverReportValue = await readJson<unknown>(SILVER_REPORT_PATH);
const phase6AuditValue = await readJson<unknown>(PHASE6_AUDIT_PATH);
const phase6IndexValue = await readJson<unknown>(PHASE6_INDEX_PATH);
const pronunciationDialectCoverageValue = await readJson<unknown>(PRONUNCIATION_DIALECT_COVERAGE_PATH);
const pronunciationDialectGapSummaryValue = await readJson<unknown>(PRONUNCIATION_DIALECT_GAP_SUMMARY_PATH);
const pronunciationConflictSummaryValue = await readJson<unknown>(PRONUNCIATION_CONFLICTS_SUMMARY_PATH);
const pronunciationUnresolvedAnalysisValue = await readJson<unknown>(PRONUNCIATION_UNRESOLVED_ANALYSIS_PATH);
const pronunciationSourceEntryPolicyValue = await readJson<unknown>(PRONUNCIATION_SOURCE_ENTRY_POLICY_PATH);
const pronunciationEntryScopeTriageValue = await readJson<unknown>(PRONUNCIATION_ENTRY_SCOPE_TRIAGE_PATH);
const humanReviewPacketValue = await readJson<unknown>(HUMAN_REVIEW_PACKET_PATH);
const aiReviewSummaryValue = await readJson<unknown>(AI_REVIEW_SUMMARY_PATH);

const clusterIds = new Set<string>();
const clusterStatuses = new Map<string, ClusterStatus>();
const sourceSenseIds = new Set<string>();
const statusCounts = emptyStatusCounts();
const definitionStatusCounts = emptyStatusCounts();
const errors: Array<{ row: number; kind: string; detail: unknown }> = [];
let clusterCount = 0;
let definitionCount = 0;

if (!validateSenseIndex(indexValue)) {
  errors.push({ row: 0, kind: "sense-index-schema", detail: validateSenseIndex.errors });
}
if (!validateNearCandidates(nearCandidateValue)) {
  errors.push({ row: 0, kind: "near-duplicate-candidates-schema", detail: validateNearCandidates.errors });
}
if (!validateEntityIndex(entityIndexValue)) {
  errors.push({ row: 0, kind: "entity-index-schema", detail: validateEntityIndex.errors });
}
if (!validateReferenceNonViIndex(referenceIndexValue)) {
  errors.push({ row: 0, kind: "reference-non-vi-index-schema", detail: validateReferenceNonViIndex.errors });
}
if (!validateNearTriage(nearTriageValue)) {
  errors.push({ row: 0, kind: "near-duplicate-triage-schema", detail: validateNearTriage.errors });
}
if (!validateConfidenceReport(confidenceReportValue)) {
  errors.push({ row: 0, kind: "confidence-report-schema", detail: validateConfidenceReport.errors });
}
if (!validateSampleIndex(sampleIndexValue)) {
  errors.push({ row: 0, kind: "stratified-sample-index-schema", detail: validateSampleIndex.errors });
}
if (!validateSilverReport(silverReportValue)) {
  errors.push({ row: 0, kind: "silver-benchmark-report-schema", detail: validateSilverReport.errors });
}
if (!validatePhase6Audit(phase6AuditValue)) {
  errors.push({ row: 0, kind: "phase6-audit-schema", detail: validatePhase6Audit.errors });
}
if (!validatePhase6Index(phase6IndexValue)) {
  errors.push({ row: 0, kind: "phase6-index-schema", detail: validatePhase6Index.errors });
}
if (!validatePronunciationDialectCoverage(pronunciationDialectCoverageValue)) {
  errors.push({
    row: 0,
    kind: "phase6-pronunciation-dialect-coverage-schema",
    detail: validatePronunciationDialectCoverage.errors
  });
}
if (!validatePronunciationDialectGapSummary(pronunciationDialectGapSummaryValue)) {
  errors.push({
    row: 0,
    kind: "phase6-pronunciation-dialect-gap-summary-schema",
    detail: validatePronunciationDialectGapSummary.errors
  });
}
if (!validatePronunciationConflictSummary(pronunciationConflictSummaryValue)) {
  errors.push({
    row: 0,
    kind: "phase6-pronunciation-conflict-summary-schema",
    detail: validatePronunciationConflictSummary.errors
  });
}
if (!validatePronunciationUnresolvedAnalysis(pronunciationUnresolvedAnalysisValue)) {
  errors.push({
    row: 0,
    kind: "phase6-pronunciation-unresolved-analysis-schema",
    detail: validatePronunciationUnresolvedAnalysis.errors
  });
}
if (!validatePronunciationSourceEntryPolicy(pronunciationSourceEntryPolicyValue)) {
  errors.push({
    row: 0,
    kind: "phase6-pronunciation-source-entry-policy-schema",
    detail: validatePronunciationSourceEntryPolicy.errors
  });
}
if (!validatePronunciationEntryScopeTriage(pronunciationEntryScopeTriageValue)) {
  errors.push({
    row: 0,
    kind: "phase6-pronunciation-entry-scope-triage-schema",
    detail: validatePronunciationEntryScopeTriage.errors
  });
}
if (!validateHumanReviewPacket(humanReviewPacketValue)) {
  errors.push({
    row: 0,
    kind: "phase6-human-review-packet-schema",
    detail: validateHumanReviewPacket.errors
  });
}
if (!validateAiReviewSummary(aiReviewSummaryValue)) {
  errors.push({
    row: 0,
    kind: "phase6-ai-review-summary-schema",
    detail: validateAiReviewSummary.errors
  });
}

const phase6Audit = phase6AuditValue as {
  headwords: number;
  pronunciation: {
    conflictHeadwords: number;
    conflictBucketCounts: BucketCounts;
    conflictMetadataGaps: {
      factsWithoutDialect: number;
      conflictFactsWithoutDialect: number;
      conflictHeadwordsWithoutDialect: number;
      transcriptionSystemCounts: Record<string, number>;
    };
    conflictSamples: unknown[];
    aiReview: {
      totalDecisions: number;
      taskCounts: Record<string, number>;
      decisionCounts: Record<string, number>;
      confidenceCounts: Record<string, number>;
      requiresHumanConfirmation: number;
      promotionAllowed: number;
    } | null;
  };
  etymology: { facts: number; sourceCounts: Record<string, number>; languageCounts: Record<string, number>; invalidProvenance: number };
  origin: { counts: Record<string, number> };
  variants: { invalidProvenance: number };
};
const phase6Index = phase6IndexValue as {
  headwords: number;
  pronunciationFacts: number;
  pronunciationHeadwords: number;
  originFacts: number;
  originHeadwords: number;
  pronunciationSourceCounts: Record<string, number>;
  pronunciationDialectCoverage: Array<{
    source: string;
    facts: number;
    facts_with_dialect: number;
    facts_without_dialect: number;
    dialect_counts: Record<string, number>;
  }>;
  pronunciationDialectGapSummary: {
    facts: number;
    reasonCounts: Record<string, number>;
    routeCounts: Record<string, number>;
    sourceCounts: Record<string, number>;
  };
  originSourceCounts: Record<string, number>;
  originValueCounts: Record<string, number>;
  projectionCompatibility: {
    processedIpaHeadwords: number;
    processedIpaWithMatchingFact: number;
    processedOriginHeadwords: number;
    processedOriginWithMatchingFact: number;
  };
  pronunciationConflictSummary: {
    conflictHeadwords: number;
    bucketCounts: BucketCounts;
    metadataGaps: {
      factsWithoutDialect: number;
      conflictFactsWithoutDialect: number;
      conflictHeadwordsWithoutDialect: number;
      transcriptionSystemCounts: Record<string, number>;
    };
  };
  humanReviewPacket: {
    totalTasks: number;
    taskCounts: ReviewPacketTaskCounts;
    reviewStatusCounts: {
      unreviewed: number;
    };
  };
  aiReview: {
    totalDecisions: number;
    taskCounts: ReviewPacketTaskCounts;
    decisionCounts: Record<string, number>;
    confidenceCounts: Record<"high" | "medium" | "low", number>;
    priorityCounts: Record<"high" | "medium" | "low", number>;
    requiresHumanConfirmation: number;
    promotionAllowed: number;
  };
};
const pronunciationConflictSummary = pronunciationConflictSummaryValue as {
  inputFacts: number;
  uniqueHeadwords: number;
  conflictHeadwords: number;
  bucketCounts: BucketCounts;
  metadataGaps: {
    factsWithoutDialect: number;
    conflictFactsWithoutDialect: number;
    conflictHeadwordsWithoutDialect: number;
    transcriptionSystemCounts: Record<string, number>;
  };
};
const pronunciationDialectCoverage = pronunciationDialectCoverageValue as {
  facts: number;
  factsWithDialect: number;
  factsWithoutDialect: number;
  sources: Array<{
    source: string;
    facts: number;
    facts_with_dialect: number;
    facts_without_dialect: number;
    dialect_counts: Record<string, number>;
  }>;
};
const pronunciationDialectGapSummary = pronunciationDialectGapSummaryValue as {
  factsWithoutDialect: number;
  reasonCounts: Record<string, number>;
  routeCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  sourceReasonCounts: Record<string, Record<string, number>>;
};
const pronunciationUnresolvedAnalysis = pronunciationUnresolvedAnalysisValue as {
  unresolvedHeadwords: number;
  internalConflictGroups: number;
  rawRecordInternalConflictGroups: number;
  reasonCounts: Record<string, number>;
  entryScopeReasonCounts: Record<string, number>;
  reviewRouteCounts: Record<"parser_fix" | "human_review", number>;
};
const pronunciationSourceEntryPolicy = pronunciationSourceEntryPolicyValue as {
  results: {
    conflictHeadwords: number;
    sourceAttestedVariantHeadwords: number;
    reviewQueueHeadwords: number;
    reviewReasonCounts: Record<string, number>;
    entryScopeReasonCounts: Record<string, number>;
    reviewRouteCounts: Record<"parser_fix" | "human_review", number>;
  };
};
const pronunciationEntryScopeTriage = pronunciationEntryScopeTriageValue as {
  queueRows: number;
  reasonCounts: Record<string, number>;
  routeCounts: Record<"parser_fix" | "human_review", number>;
};
const humanReviewPacket = humanReviewPacketValue as {
  totalTasks: number;
  taskCounts: ReviewPacketTaskCounts;
  reviewStatusCounts: {
    unreviewed: number;
  };
};
const aiReviewSummary = aiReviewSummaryValue as {
  sourcePacketTasks: number;
  totalDecisions: number;
  taskCounts: ReviewPacketTaskCounts;
  decisionCounts: Record<string, number>;
  confidenceCounts: Record<"high" | "medium" | "low", number>;
  priorityCounts: Record<"high" | "medium" | "low", number>;
  requiresHumanConfirmation: number;
  promotionAllowed: number;
};
if (
  phase6Audit.headwords !== index.headwords ||
  Object.values(phase6Audit.etymology.sourceCounts).reduce((sum, count) => sum + count, 0) !== phase6Audit.etymology.facts ||
  Object.values(phase6Audit.etymology.languageCounts).reduce((sum, count) => sum + count, 0) !== phase6Audit.etymology.facts ||
  Object.values(phase6Audit.origin.counts).reduce((sum, count) => sum + count, 0) !== index.headwords ||
  phase6Audit.pronunciation.conflictSamples.length > phase6Audit.pronunciation.conflictHeadwords ||
  phase6Audit.pronunciation.conflictHeadwords !== pronunciationConflictSummary.conflictHeadwords ||
  !sameBucketCounts(phase6Audit.pronunciation.conflictBucketCounts, pronunciationConflictSummary.bucketCounts) ||
  phase6Audit.pronunciation.conflictMetadataGaps.factsWithoutDialect !== pronunciationConflictSummary.metadataGaps.factsWithoutDialect ||
  phase6Audit.pronunciation.conflictMetadataGaps.conflictFactsWithoutDialect !==
    pronunciationConflictSummary.metadataGaps.conflictFactsWithoutDialect ||
  phase6Audit.pronunciation.conflictMetadataGaps.conflictHeadwordsWithoutDialect !==
    pronunciationConflictSummary.metadataGaps.conflictHeadwordsWithoutDialect ||
  !sameNumericRecord(
    phase6Audit.pronunciation.conflictMetadataGaps.transcriptionSystemCounts,
    pronunciationConflictSummary.metadataGaps.transcriptionSystemCounts
  ) ||
  phase6Audit.pronunciation.aiReview?.totalDecisions !== aiReviewSummary.totalDecisions ||
  phase6Audit.pronunciation.aiReview?.requiresHumanConfirmation !== aiReviewSummary.requiresHumanConfirmation ||
  phase6Audit.pronunciation.aiReview?.promotionAllowed !== aiReviewSummary.promotionAllowed ||
  phase6Audit.etymology.invalidProvenance !== 0 ||
  phase6Audit.variants.invalidProvenance !== 0
) {
  errors.push({ row: 0, kind: "phase6-audit-count-or-provenance-mismatch", detail: phase6Audit });
}
if (
  phase6Index.headwords !== index.headwords ||
  phase6Index.projectionCompatibility.processedIpaHeadwords !==
    phase6Index.projectionCompatibility.processedIpaWithMatchingFact ||
  phase6Index.projectionCompatibility.processedOriginHeadwords !==
    phase6Index.projectionCompatibility.processedOriginWithMatchingFact ||
  phase6Index.pronunciationConflictSummary.conflictHeadwords !== pronunciationConflictSummary.conflictHeadwords ||
  !sameBucketCounts(phase6Index.pronunciationConflictSummary.bucketCounts, pronunciationConflictSummary.bucketCounts) ||
  phase6Index.pronunciationConflictSummary.metadataGaps.factsWithoutDialect !==
    pronunciationConflictSummary.metadataGaps.factsWithoutDialect ||
  phase6Index.pronunciationConflictSummary.metadataGaps.conflictFactsWithoutDialect !==
    pronunciationConflictSummary.metadataGaps.conflictFactsWithoutDialect ||
  phase6Index.pronunciationConflictSummary.metadataGaps.conflictHeadwordsWithoutDialect !==
    pronunciationConflictSummary.metadataGaps.conflictHeadwordsWithoutDialect ||
  !sameNumericRecord(
    phase6Index.pronunciationConflictSummary.metadataGaps.transcriptionSystemCounts,
    pronunciationConflictSummary.metadataGaps.transcriptionSystemCounts
  )
) {
  errors.push({ row: 0, kind: "phase6-projection-compatibility-mismatch", detail: phase6Index });
}

const nearTriage = nearTriageValue as {
  inputPairs: number;
  storedPairs: number;
  counts: Record<string, number>;
  scoreBuckets: Record<string, number>;
  samples: Record<string, Array<{ triage_group: string }>>;
};
const triageCount = Object.values(nearTriage.counts).reduce((sum, count) => sum + count, 0);
const scoreBucketCount = Object.values(nearTriage.scoreBuckets).reduce((sum, count) => sum + count, 0);
if (
  nearTriage.inputPairs !== nearCandidates.totalPairs ||
  nearTriage.storedPairs !== nearCandidates.pairs.length ||
  triageCount !== nearTriage.storedPairs ||
  scoreBucketCount !== nearTriage.storedPairs
) {
  errors.push({
    row: 0,
    kind: "near-duplicate-triage-count-mismatch",
    detail: { inputPairs: nearTriage.inputPairs, storedPairs: nearTriage.storedPairs, triageCount, scoreBucketCount }
  });
}
for (const [group, samples] of Object.entries(nearTriage.samples)) {
  if (samples.some((sample) => sample.triage_group !== group)) {
    errors.push({ row: 0, kind: "near-duplicate-triage-sample-group-mismatch", detail: group });
  }
}

const confidenceReport = confidenceReportValue as {
  byStatus: Record<string, { clusters: number }>;
  byCanonicalSource: Array<{ clusters: number }>;
};
const confidenceStatusClusters = Object.values(confidenceReport.byStatus).reduce(
  (sum, item) => sum + item.clusters,
  0
);
const confidenceSourceClusters = confidenceReport.byCanonicalSource.reduce((sum, item) => sum + item.clusters, 0);
if (confidenceStatusClusters !== index.clusters || confidenceSourceClusters !== index.clusters) {
  errors.push({
    row: 0,
    kind: "confidence-report-cluster-count-mismatch",
    detail: { confidenceStatusClusters, confidenceSourceClusters, expected: index.clusters }
  });
}

const sampleIndex = sampleIndexValue as {
  sampleLimitPerBucket: number;
  clusters: number;
  populationCounts: Record<string, Record<string, number>>;
  sampleCounts: Record<string, Record<string, number>>;
};
if (sampleIndex.clusters !== index.clusters) {
  errors.push({ row: 0, kind: "sample-index-cluster-count-mismatch", detail: sampleIndex.clusters });
}
for (const [dimension, populations] of Object.entries(sampleIndex.populationCounts)) {
  const populationTotal = Object.values(populations).reduce((sum, count) => sum + count, 0);
  if (populationTotal !== index.clusters) {
    errors.push({ row: 0, kind: "sample-population-count-mismatch", detail: { dimension, populationTotal } });
  }
  const samples = sampleIndex.sampleCounts[dimension] ?? {};
  for (const [bucket, count] of Object.entries(samples)) {
    if (count > sampleIndex.sampleLimitPerBucket || count > (populations[bucket] ?? 0)) {
      errors.push({ row: 0, kind: "sample-bucket-count-invalid", detail: { dimension, bucket, count } });
    }
  }
}
if (nearCandidates.sampledPairs !== nearCandidates.pairs.length) {
  errors.push({
    row: 0,
    kind: "near-duplicate-stored-count-mismatch",
    detail: { actual: nearCandidates.pairs.length, expected: nearCandidates.sampledPairs }
  });
}
if (nearCandidates.totalPairs < nearCandidates.sampledPairs) {
  errors.push({
    row: 0,
    kind: "near-duplicate-total-less-than-stored",
    detail: { totalPairs: nearCandidates.totalPairs, storedPairs: nearCandidates.sampledPairs }
  });
}
const nearPairIds = new Set<string>();
for (const [candidateIndex, pair] of nearCandidates.pairs.entries()) {
  if (pair.left_sense_id === pair.right_sense_id) {
    errors.push({ row: candidateIndex + 1, kind: "near-duplicate-self-pair", detail: pair.left_sense_id });
  }
  const pairId = [pair.left_sense_id, pair.right_sense_id].sort().join(":");
  if (nearPairIds.has(pairId)) {
    errors.push({ row: candidateIndex + 1, kind: "duplicate-near-pair", detail: pairId });
  }
  nearPairIds.add(pairId);
}

const input = createReadStream(CLUSTERS_PATH).pipe(createGunzip());
const rl = createInterface({ input, crlfDelay: Infinity });

for await (const line of rl) {
  const text = line.trim();
  if (!text) continue;
  clusterCount += 1;
  let cluster: CanonicalCluster;
  try {
    cluster = JSON.parse(text) as CanonicalCluster;
  } catch (error) {
    errors.push({ row: clusterCount, kind: "json", detail: (error as Error).message });
    continue;
  }
  if (!validateCluster(cluster)) {
    errors.push({ row: clusterCount, kind: "schema", detail: validateCluster.errors });
    continue;
  }
  if (clusterIds.has(cluster.cluster_id)) {
    errors.push({ row: clusterCount, kind: "duplicate-cluster-id", detail: cluster.cluster_id });
  }
  clusterIds.add(cluster.cluster_id);
  clusterStatuses.set(cluster.cluster_id, cluster.status);
  statusCounts[cluster.status] += 1;
  definitionStatusCounts[cluster.status] += cluster.source_definitions.length;
  definitionCount += cluster.source_definitions.length;

  if (!cluster.source_definitions.some((definition) => definition.sense_id === cluster.canonical_definition.sense_id)) {
    errors.push({
      row: clusterCount,
      kind: "canonical-not-in-source-definitions",
      detail: cluster.cluster_id
    });
  }
  for (const definition of cluster.source_definitions) {
    if (sourceSenseIds.has(definition.sense_id)) {
      errors.push({ row: clusterCount, kind: "duplicate-source-sense-id", detail: definition.sense_id });
    }
    sourceSenseIds.add(definition.sense_id);
  }

  if (cluster.status === "auto_accepted" && (cluster.cluster_type !== "exact" || cluster.confidence_tier !== "high")) {
    errors.push({ row: clusterCount, kind: "invalid-auto-accepted-shape", detail: cluster.cluster_id });
  }
  if (cluster.status === "reference_non_vi" && cluster.evidence.has_vi_definition) {
    errors.push({ row: clusterCount, kind: "reference-non-vi-has-vi-definition", detail: cluster.cluster_id });
  }
}

const reviewRows = await readJsonl(REVIEW_REMAINDER_PATH);
for (const [index, row] of reviewRows.entries()) {
  if (!validateReview(row)) {
    errors.push({ row: index + 1, kind: "review-remainder-schema", detail: validateReview.errors });
  }
}

const pronunciationRows = await readJsonl(PRONUNCIATION_FACTS_PATH);
const pronunciationIds = new Set<string>();
const pronunciationNullDialectIds = new Set<string>();
const pronunciationFactsById = new Map<
  string,
  {
    word: string;
    headword_normalized: string;
    source: string;
    dialect: string | null;
    source_tags: string[];
    source_note: string | null;
    provenance: { source_entry_id: string | null; raw_record_hash: string };
  }
>();
const pronunciationHeadwords = new Set<string>();
const pronunciationSourceCounts: Record<string, number> = {};
const pronunciationDialectCountsBySource: Record<string, Record<string, number>> = {};
const pronunciationTranscriptionSystemCounts: Record<string, number> = {};
const pronunciationSourceEntryRawHashes = new Map<string, string>();
let pronunciationFactsWithoutDialect = 0;
for (const [index, row] of pronunciationRows.entries()) {
  if (!validatePronunciationFact(row)) {
    errors.push({ row: index + 1, kind: "pronunciation-fact-schema", detail: validatePronunciationFact.errors });
    continue;
  }
  const fact = row as {
    pronunciation_id: string;
    word: string;
    headword_normalized: string;
    source: string;
    dialect: string | null;
    transcription_system: string;
    source_entry_word: string | null;
    source_entry_pos: string | null;
    source_sound_index: number | null;
    source_tags: string[];
    source_note: string | null;
    confidence: number;
    review_status: string;
    provenance: {
      source_id: string;
      source_entry_id: string | null;
      raw_record_hash: string;
      confidence: number;
      review_status: string;
    };
  };
  if (pronunciationIds.has(fact.pronunciation_id)) {
    errors.push({ row: index + 1, kind: "duplicate-pronunciation-fact-id", detail: fact.pronunciation_id });
  }
  pronunciationIds.add(fact.pronunciation_id);
  pronunciationFactsById.set(fact.pronunciation_id, fact);
  pronunciationHeadwords.add(fact.headword_normalized);
  pronunciationSourceCounts[fact.source] = (pronunciationSourceCounts[fact.source] ?? 0) + 1;
  pronunciationTranscriptionSystemCounts[fact.transcription_system] =
    (pronunciationTranscriptionSystemCounts[fact.transcription_system] ?? 0) + 1;
  if (fact.dialect === null || fact.dialect === "") {
    pronunciationFactsWithoutDialect += 1;
    pronunciationNullDialectIds.add(fact.pronunciation_id);
  } else {
    const sourceDialectCounts = pronunciationDialectCountsBySource[fact.source] ?? {};
    sourceDialectCounts[fact.dialect] = (sourceDialectCounts[fact.dialect] ?? 0) + 1;
    pronunciationDialectCountsBySource[fact.source] = sourceDialectCounts;
  }
  if (
    fact.source !== fact.provenance.source_id ||
    fact.confidence !== fact.provenance.confidence ||
    fact.review_status !== fact.provenance.review_status
  ) {
    errors.push({ row: index + 1, kind: "pronunciation-fact-provenance-mismatch", detail: fact.pronunciation_id });
  }
  if (
    fact.source.startsWith("kaikki_") &&
    (fact.source_sound_index === null || fact.source_entry_word === null || fact.source_entry_pos === null)
  ) {
    errors.push({ row: index + 1, kind: "kaikki-pronunciation-entry-scope-missing", detail: fact.pronunciation_id });
  }
  if (fact.provenance.source_entry_id) {
    const entryKey = `${fact.source}\u0000${fact.provenance.source_entry_id}`;
    const existingHash = pronunciationSourceEntryRawHashes.get(entryKey);
    if (existingHash && existingHash !== fact.provenance.raw_record_hash) {
      errors.push({
        row: index + 1,
        kind: "pronunciation-source-entry-id-reused-across-raw-records",
        detail: fact.provenance.source_entry_id
      });
    }
    pronunciationSourceEntryRawHashes.set(entryKey, fact.provenance.raw_record_hash);
  }
  if (
    fact.source.startsWith("kaikki_") &&
    fact.source_sound_index !== null &&
    !fact.provenance.source_entry_id?.endsWith(
      `:record:${fact.provenance.raw_record_hash.slice(0, 12)}:pronunciation:${fact.source_sound_index}`
    )
  ) {
    errors.push({ row: index + 1, kind: "kaikki-pronunciation-entry-id-format", detail: fact.pronunciation_id });
  }
}

const pronunciationDialectGapRows = await readJsonl(PRONUNCIATION_DIALECT_GAP_DETAILS_PATH);
const pronunciationDialectGapIds = new Set<string>();
const actualDialectGapReasonCounts: Record<string, number> = {};
const actualDialectGapRouteCounts: Record<string, number> = {};
const actualDialectGapSourceCounts: Record<string, number> = {};
const actualDialectGapSourceReasonCounts: Record<string, Record<string, number>> = {};
const expectedGapRouteByReason: Record<string, string> = {
  no_explicit_source_label: "source_metadata_unavailable",
  non_geographic_note_qualifier: "not_a_dialect_label",
  recognized_geographic_label_with_qualifier: "manual_label_parsing_review",
  unrecognized_explicit_note: "manual_label_review",
  unrecognized_explicit_tag: "manual_label_review"
};
const manualDialectReviewIds = new Set<string>();
for (const [index, row] of pronunciationDialectGapRows.entries()) {
  if (!validatePronunciationDialectGap(row)) {
    errors.push({ row: index + 1, kind: "pronunciation-dialect-gap-schema", detail: validatePronunciationDialectGap.errors });
    continue;
  }
  const gap = row as {
    pronunciation_id: string;
    headword_normalized: string;
    word: string;
    source: string;
    source_entry_id: string | null;
    raw_record_hash: string;
    source_tags: string[];
    source_note: string | null;
    gap_reason: string;
    review_route: string;
  };
  if (pronunciationDialectGapIds.has(gap.pronunciation_id)) {
    errors.push({ row: index + 1, kind: "duplicate-pronunciation-dialect-gap", detail: gap.pronunciation_id });
  }
  pronunciationDialectGapIds.add(gap.pronunciation_id);
  const fact = pronunciationFactsById.get(gap.pronunciation_id);
  if (
    !fact ||
    fact.dialect !== null ||
    fact.word !== gap.word ||
    fact.headword_normalized !== gap.headword_normalized ||
    fact.source !== gap.source ||
    fact.provenance.source_entry_id !== gap.source_entry_id ||
    fact.provenance.raw_record_hash !== gap.raw_record_hash ||
    JSON.stringify(fact.source_tags) !== JSON.stringify(gap.source_tags) ||
    fact.source_note !== gap.source_note
  ) {
    errors.push({ row: index + 1, kind: "pronunciation-dialect-gap-fact-mismatch", detail: gap.pronunciation_id });
  }
  if (expectedGapRouteByReason[gap.gap_reason] !== gap.review_route) {
    errors.push({ row: index + 1, kind: "pronunciation-dialect-gap-route-mismatch", detail: gap.pronunciation_id });
  }
  const evidenceMismatch =
    (gap.gap_reason === "no_explicit_source_label" && (gap.source_tags.length > 0 || gap.source_note !== null)) ||
    (gap.gap_reason === "unrecognized_explicit_tag" && gap.source_tags.length === 0) ||
    (["non_geographic_note_qualifier", "recognized_geographic_label_with_qualifier", "unrecognized_explicit_note"].includes(
      gap.gap_reason
    ) && gap.source_note === null);
  if (evidenceMismatch) {
    errors.push({ row: index + 1, kind: "pronunciation-dialect-gap-evidence-mismatch", detail: gap.pronunciation_id });
  }
  actualDialectGapReasonCounts[gap.gap_reason] = (actualDialectGapReasonCounts[gap.gap_reason] ?? 0) + 1;
  actualDialectGapRouteCounts[gap.review_route] = (actualDialectGapRouteCounts[gap.review_route] ?? 0) + 1;
  actualDialectGapSourceCounts[gap.source] = (actualDialectGapSourceCounts[gap.source] ?? 0) + 1;
  const sourceReasons = actualDialectGapSourceReasonCounts[gap.source] ?? {};
  sourceReasons[gap.gap_reason] = (sourceReasons[gap.gap_reason] ?? 0) + 1;
  actualDialectGapSourceReasonCounts[gap.source] = sourceReasons;
  if (gap.review_route === "manual_label_parsing_review" || gap.review_route === "manual_label_review") {
    manualDialectReviewIds.add(gap.pronunciation_id);
  }
}

const dialectGapSourceReasonsMatch = new Set([
  ...Object.keys(pronunciationDialectGapSummary.sourceReasonCounts),
  ...Object.keys(actualDialectGapSourceReasonCounts)
]);
if (
  pronunciationDialectGapRows.length !== pronunciationFactsWithoutDialect ||
  pronunciationDialectGapIds.size !== pronunciationNullDialectIds.size ||
  [...pronunciationNullDialectIds].some((id) => !pronunciationDialectGapIds.has(id)) ||
  pronunciationDialectGapSummary.factsWithoutDialect !== pronunciationDialectGapRows.length ||
  !sameNumericRecord(pronunciationDialectGapSummary.reasonCounts, actualDialectGapReasonCounts) ||
  !sameNumericRecord(pronunciationDialectGapSummary.routeCounts, actualDialectGapRouteCounts) ||
  !sameNumericRecord(pronunciationDialectGapSummary.sourceCounts, actualDialectGapSourceCounts) ||
  [...dialectGapSourceReasonsMatch].some(
    (source) =>
      !sameNumericRecord(
        pronunciationDialectGapSummary.sourceReasonCounts[source] ?? {},
        actualDialectGapSourceReasonCounts[source] ?? {}
      )
  ) ||
  phase6Index.pronunciationDialectGapSummary.facts !== pronunciationDialectGapRows.length ||
  !sameNumericRecord(phase6Index.pronunciationDialectGapSummary.reasonCounts, actualDialectGapReasonCounts) ||
  !sameNumericRecord(phase6Index.pronunciationDialectGapSummary.routeCounts, actualDialectGapRouteCounts) ||
  !sameNumericRecord(phase6Index.pronunciationDialectGapSummary.sourceCounts, actualDialectGapSourceCounts)
) {
  errors.push({
    row: 0,
    kind: "phase6-pronunciation-dialect-gap-count-mismatch",
    detail: { summary: pronunciationDialectGapSummary, rows: pronunciationDialectGapRows.length }
  });
}

const pronunciationConflictRows = await readJsonl(PRONUNCIATION_CONFLICTS_PATH);
const pronunciationConflictIds = new Set<string>();
const pronunciationConflictHeadwords = new Set<string>();
const pronunciationConflictBucketCounts: BucketCounts = {
  formatting_only: 0,
  dialect_source_variant: 0,
  source_attested_variant: 0,
  unresolved: 0
};
let pronunciationConflictFactsWithoutDialect = 0;
for (const [index, row] of pronunciationConflictRows.entries()) {
  if (!validatePronunciationConflict(row)) {
    errors.push({ row: index + 1, kind: "phase6-pronunciation-conflict-schema", detail: validatePronunciationConflict.errors });
    continue;
  }
  const conflict = row as {
    conflict_id: string;
    headword_normalized: string;
    words: string[];
    bucket: PronunciationConflictBucket;
    display_normalized_ipa_values: string[];
    safe_display_ipa: string | null;
    fact_count: number;
    metadata_gaps: { facts_without_dialect: number };
    source_values: Array<{
      fact_count: number;
      raw_record_count: number;
      raw_records_with_multiple_display_values: number;
      display_normalized_ipa_values: string[];
      sample_fact_ids: string[];
    }>;
    sample_fact_ids: string[];
  };
  if (pronunciationConflictIds.has(conflict.conflict_id)) {
    errors.push({ row: index + 1, kind: "duplicate-pronunciation-conflict-id", detail: conflict.conflict_id });
  }
  pronunciationConflictIds.add(conflict.conflict_id);
  if (pronunciationConflictHeadwords.has(conflict.headword_normalized)) {
    errors.push({ row: index + 1, kind: "duplicate-pronunciation-conflict-headword", detail: conflict.headword_normalized });
  }
  pronunciationConflictHeadwords.add(conflict.headword_normalized);
  pronunciationConflictBucketCounts[conflict.bucket] += 1;
  pronunciationConflictFactsWithoutDialect += conflict.metadata_gaps.facts_without_dialect;

  if (conflict.bucket === "formatting_only") {
    if (conflict.display_normalized_ipa_values.length !== 1 || conflict.safe_display_ipa !== conflict.display_normalized_ipa_values[0]) {
      errors.push({ row: index + 1, kind: "formatting-only-safe-display-mismatch", detail: conflict.conflict_id });
    }
  } else if (conflict.safe_display_ipa !== null || conflict.display_normalized_ipa_values.length < 2) {
    errors.push({ row: index + 1, kind: "non-formatting-safe-display-invalid", detail: conflict.conflict_id });
  }

  const sourceValueFactCount = conflict.source_values.reduce((sum, value) => sum + value.fact_count, 0);
  if (sourceValueFactCount !== conflict.fact_count || conflict.metadata_gaps.facts_without_dialect > conflict.fact_count) {
    errors.push({ row: index + 1, kind: "pronunciation-conflict-fact-count-mismatch", detail: conflict.conflict_id });
  }
  if (
    conflict.bucket === "dialect_source_variant" &&
    conflict.source_values.some((value) => value.display_normalized_ipa_values.length !== 1)
  ) {
    errors.push({ row: index + 1, kind: "source-variant-has-internal-conflict", detail: conflict.conflict_id });
  }
  if (
    conflict.bucket === "source_attested_variant" &&
    (conflict.words.length !== 1 ||
      !conflict.source_values.some((value) => value.display_normalized_ipa_values.length > 1) ||
      conflict.source_values.some(
        (value) =>
          value.display_normalized_ipa_values.length > 1 &&
          (value.raw_record_count !== 1 || value.raw_records_with_multiple_display_values !== 1)
      ))
  ) {
    errors.push({ row: index + 1, kind: "source-attested-variant-policy-mismatch", detail: conflict.conflict_id });
  }
  if (
    conflict.bucket === "unresolved" &&
    !conflict.source_values.some((value) => value.display_normalized_ipa_values.length > 1)
  ) {
    errors.push({ row: index + 1, kind: "unresolved-without-internal-conflict", detail: conflict.conflict_id });
  }

  for (const factId of [
    ...conflict.sample_fact_ids,
    ...conflict.source_values.flatMap((value) => value.sample_fact_ids)
  ]) {
    if (!pronunciationIds.has(factId)) {
      errors.push({ row: index + 1, kind: "pronunciation-conflict-sample-fact-missing", detail: factId });
    }
  }
}

if (
  pronunciationConflictRows.length !== pronunciationConflictSummary.conflictHeadwords ||
  pronunciationConflictHeadwords.size !== pronunciationConflictSummary.conflictHeadwords ||
  !sameBucketCounts(pronunciationConflictBucketCounts, pronunciationConflictSummary.bucketCounts) ||
  pronunciationConflictSummary.inputFacts !== pronunciationRows.length ||
  pronunciationConflictSummary.uniqueHeadwords !== pronunciationHeadwords.size ||
  pronunciationConflictSummary.metadataGaps.factsWithoutDialect !== pronunciationFactsWithoutDialect ||
  pronunciationConflictSummary.metadataGaps.conflictFactsWithoutDialect !== pronunciationConflictFactsWithoutDialect ||
  pronunciationConflictSummary.metadataGaps.conflictHeadwordsWithoutDialect > pronunciationConflictSummary.conflictHeadwords ||
  !sameNumericRecord(pronunciationConflictSummary.metadataGaps.transcriptionSystemCounts, pronunciationTranscriptionSystemCounts)
) {
  errors.push({
    row: 0,
    kind: "phase6-pronunciation-conflict-count-mismatch",
    detail: {
      rows: pronunciationConflictRows.length,
      headwords: pronunciationConflictHeadwords.size,
      bucketCounts: pronunciationConflictBucketCounts,
      summary: pronunciationConflictSummary
    }
  });
}

const pronunciationUnresolvedRows = await readJsonl(PRONUNCIATION_UNRESOLVED_ANALYSIS_DETAILS_PATH);
const actualEntryScopeReasonCounts: Record<string, number> = {};
const actualReviewRouteCounts: Record<"parser_fix" | "human_review", number> = {
  parser_fix: 0,
  human_review: 0
};
const unresolvedReviewConflictIds = new Set<string>();
for (const [index, row] of pronunciationUnresolvedRows.entries()) {
  if (!validatePronunciationReviewQueueRow(row)) {
    errors.push({
      row: index + 1,
      kind: "phase6-pronunciation-review-queue-row-schema",
      detail: validatePronunciationReviewQueueRow.errors
    });
    continue;
  }
  const queueRow = row as {
    conflict_id: string;
    entry_scope_reasons: string[];
    review_route: "parser_fix" | "human_review";
    internal_groups: Array<{
      fact_count: number;
      raw_record_count: number;
      raw_records_with_multiple_display_values: number;
      raw_record_scopes: Array<{
        fact_count: number;
        display_normalized_ipa_values: string[];
      }>;
      sample_fact_ids: string[];
    }>;
  };
  for (const reason of queueRow.entry_scope_reasons) {
    actualEntryScopeReasonCounts[reason] = (actualEntryScopeReasonCounts[reason] ?? 0) + 1;
  }
  unresolvedReviewConflictIds.add(queueRow.conflict_id);
  actualReviewRouteCounts[queueRow.review_route] += 1;

  const hasParserIdentityIssue = queueRow.entry_scope_reasons.includes(
    "source_entry_id_reused_across_raw_records"
  );
  const hasHumanScope =
    queueRow.entry_scope_reasons.includes("normalized_form_collision") ||
    queueRow.entry_scope_reasons.includes("cross_pos_scope") ||
    queueRow.entry_scope_reasons.includes("same_form_same_pos_distinct_source_records");
  if (
    (queueRow.review_route === "parser_fix" && !hasParserIdentityIssue) ||
    (queueRow.review_route === "human_review" && (hasParserIdentityIssue || !hasHumanScope))
  ) {
    errors.push({ row: index + 1, kind: "pronunciation-review-route-policy-mismatch", detail: queueRow.conflict_id });
  }
  for (const group of queueRow.internal_groups) {
    const scopedFactCount = group.raw_record_scopes.reduce((sum, scope) => sum + scope.fact_count, 0);
    const scopedMultiValueRecords = group.raw_record_scopes.filter(
      (scope) => scope.display_normalized_ipa_values.length > 1
    ).length;
    if (
      group.raw_record_count !== group.raw_record_scopes.length ||
      group.fact_count !== scopedFactCount ||
      group.raw_records_with_multiple_display_values !== scopedMultiValueRecords
    ) {
      errors.push({ row: index + 1, kind: "pronunciation-review-raw-scope-count-mismatch", detail: queueRow.conflict_id });
    }
    for (const factId of group.sample_fact_ids) {
      if (!pronunciationIds.has(factId)) {
        errors.push({ row: index + 1, kind: "pronunciation-review-fact-missing", detail: factId });
      }
    }
  }
}
if (
  pronunciationUnresolvedRows.length !== pronunciationConflictBucketCounts.unresolved ||
  pronunciationUnresolvedAnalysis.unresolvedHeadwords !== pronunciationConflictBucketCounts.unresolved ||
  pronunciationUnresolvedAnalysis.unresolvedHeadwords !== pronunciationUnresolvedRows.length ||
  pronunciationUnresolvedAnalysis.rawRecordInternalConflictGroups > pronunciationUnresolvedAnalysis.internalConflictGroups ||
  Object.values(pronunciationUnresolvedAnalysis.reasonCounts).some((count) => count > pronunciationUnresolvedRows.length) ||
  Object.values(pronunciationUnresolvedAnalysis.entryScopeReasonCounts).some(
    (count) => count > pronunciationUnresolvedRows.length
  ) ||
  Object.values(pronunciationUnresolvedAnalysis.reviewRouteCounts).reduce((sum, count) => sum + count, 0) !==
    pronunciationUnresolvedRows.length ||
  !sameNumericRecord(pronunciationUnresolvedAnalysis.entryScopeReasonCounts, actualEntryScopeReasonCounts) ||
  !sameNumericRecord(pronunciationUnresolvedAnalysis.reviewRouteCounts, actualReviewRouteCounts)
) {
  errors.push({
    row: 0,
    kind: "phase6-pronunciation-unresolved-analysis-count-mismatch",
    detail: {
      unresolvedRows: pronunciationUnresolvedRows.length,
      bucketCounts: pronunciationConflictBucketCounts,
      analysis: pronunciationUnresolvedAnalysis
    }
  });
}
if (
  pronunciationSourceEntryPolicy.results.conflictHeadwords !== pronunciationConflictRows.length ||
  pronunciationSourceEntryPolicy.results.sourceAttestedVariantHeadwords !==
    pronunciationConflictBucketCounts.source_attested_variant ||
  pronunciationSourceEntryPolicy.results.reviewQueueHeadwords !== pronunciationUnresolvedRows.length ||
  !sameNumericRecord(
    pronunciationSourceEntryPolicy.results.reviewReasonCounts,
    pronunciationUnresolvedAnalysis.reasonCounts
  ) ||
  !sameNumericRecord(
    pronunciationSourceEntryPolicy.results.entryScopeReasonCounts,
    actualEntryScopeReasonCounts
  ) ||
  !sameNumericRecord(pronunciationSourceEntryPolicy.results.reviewRouteCounts, actualReviewRouteCounts) ||
  pronunciationEntryScopeTriage.queueRows !== pronunciationUnresolvedRows.length ||
  !sameNumericRecord(pronunciationEntryScopeTriage.reasonCounts, actualEntryScopeReasonCounts) ||
  !sameNumericRecord(pronunciationEntryScopeTriage.routeCounts, actualReviewRouteCounts)
) {
  errors.push({
    row: 0,
    kind: "phase6-pronunciation-source-entry-policy-count-mismatch",
    detail: {
      policy: pronunciationSourceEntryPolicy,
      bucketCounts: pronunciationConflictBucketCounts,
      reviewQueueRows: pronunciationUnresolvedRows.length
    }
  });
}

const humanReviewPacketRows = await readJsonl(HUMAN_REVIEW_PACKET_TASKS_PATH);
const reviewPacketTaskIds = new Set<string>();
const reviewPacketAllowedDecisions = new Map<string, string[]>();
const reviewPacketTaskTypes = new Map<string, ReviewPacketTaskType>();
const actualReviewPacketTaskCounts: ReviewPacketTaskCounts = {
  pronunciation_conflict_review: 0,
  dialect_label_review: 0
};
let reviewPacketUnreviewed = 0;
const reviewPacketPronunciationConflictIds = new Set<string>();
const reviewPacketDialectPronunciationIds = new Set<string>();
for (const [index, row] of humanReviewPacketRows.entries()) {
  if (!validateHumanReviewPacketTask(row)) {
    errors.push({
      row: index + 1,
      kind: "phase6-human-review-packet-task-schema",
      detail: validateHumanReviewPacketTask.errors
    });
    continue;
  }
  const task = row as {
    task_id: string;
    task_type: ReviewPacketTaskType;
    review_status: "unreviewed";
    allowed_decisions: string[];
    review_fields: {
      decision: null;
      selected_display_ipa: null;
      selected_dialect: null;
      qualifier_note: "";
      reviewer_id: "";
      reviewer_notes: "";
      reviewed_at: "";
    };
    evidence: {
      conflict_id?: string;
      pronunciation_id?: string;
    };
  };
  if (reviewPacketTaskIds.has(task.task_id)) {
    errors.push({ row: index + 1, kind: "duplicate-phase6-human-review-packet-task", detail: task.task_id });
  }
  reviewPacketTaskIds.add(task.task_id);
  reviewPacketAllowedDecisions.set(task.task_id, task.allowed_decisions);
  reviewPacketTaskTypes.set(task.task_id, task.task_type);
  actualReviewPacketTaskCounts[task.task_type] += 1;
  if (task.review_status === "unreviewed") reviewPacketUnreviewed += 1;
  if (task.task_type === "pronunciation_conflict_review") {
    const conflictId = task.evidence.conflict_id;
    if (!conflictId || !unresolvedReviewConflictIds.has(conflictId)) {
      errors.push({ row: index + 1, kind: "phase6-review-packet-conflict-missing", detail: task.task_id });
    } else {
      reviewPacketPronunciationConflictIds.add(conflictId);
    }
  }
  if (task.task_type === "dialect_label_review") {
    const pronunciationId = task.evidence.pronunciation_id;
    if (!pronunciationId || !manualDialectReviewIds.has(pronunciationId)) {
      errors.push({ row: index + 1, kind: "phase6-review-packet-dialect-gap-missing", detail: task.task_id });
    } else {
      reviewPacketDialectPronunciationIds.add(pronunciationId);
    }
  }
}
const expectedReviewPacketTaskCounts: ReviewPacketTaskCounts = {
  pronunciation_conflict_review: pronunciationUnresolvedRows.length,
  dialect_label_review: manualDialectReviewIds.size
};
if (
  humanReviewPacketRows.length !== humanReviewPacket.totalTasks ||
  humanReviewPacketRows.length !== reviewPacketTaskIds.size ||
  humanReviewPacket.reviewStatusCounts.unreviewed !== reviewPacketUnreviewed ||
  humanReviewPacket.reviewStatusCounts.unreviewed !== humanReviewPacketRows.length ||
  !sameReviewPacketTaskCounts(humanReviewPacket.taskCounts, actualReviewPacketTaskCounts) ||
  !sameReviewPacketTaskCounts(actualReviewPacketTaskCounts, expectedReviewPacketTaskCounts) ||
  reviewPacketPronunciationConflictIds.size !== unresolvedReviewConflictIds.size ||
  [...unresolvedReviewConflictIds].some((id) => !reviewPacketPronunciationConflictIds.has(id)) ||
  reviewPacketDialectPronunciationIds.size !== manualDialectReviewIds.size ||
  [...manualDialectReviewIds].some((id) => !reviewPacketDialectPronunciationIds.has(id)) ||
  phase6Index.humanReviewPacket.totalTasks !== humanReviewPacket.totalTasks ||
  phase6Index.humanReviewPacket.reviewStatusCounts.unreviewed !== humanReviewPacket.reviewStatusCounts.unreviewed ||
  !sameReviewPacketTaskCounts(phase6Index.humanReviewPacket.taskCounts, humanReviewPacket.taskCounts)
) {
  errors.push({
    row: 0,
    kind: "phase6-human-review-packet-count-mismatch",
    detail: {
      packet: humanReviewPacket,
      actualTaskCounts: actualReviewPacketTaskCounts,
      expectedTaskCounts: expectedReviewPacketTaskCounts
    }
  });
}

const aiReviewRows = await readJsonl(AI_REVIEW_DECISIONS_PATH);
const aiReviewIds = new Set<string>();
const aiReviewTaskIds = new Set<string>();
const actualAiReviewTaskCounts: ReviewPacketTaskCounts = {
  pronunciation_conflict_review: 0,
  dialect_label_review: 0
};
const actualAiDecisionCounts: Record<string, number> = {};
const actualAiConfidenceCounts: Record<"high" | "medium" | "low", number> = {
  high: 0,
  medium: 0,
  low: 0
};
const actualAiPriorityCounts: Record<"high" | "medium" | "low", number> = {
  high: 0,
  medium: 0,
  low: 0
};
let actualAiRequiresHumanConfirmation = 0;
let actualAiPromotionAllowed = 0;
for (const [index, row] of aiReviewRows.entries()) {
  if (!validateAiReviewDecision(row)) {
    errors.push({
      row: index + 1,
      kind: "phase6-ai-review-decision-schema",
      detail: validateAiReviewDecision.errors
    });
    continue;
  }
  const decision = row as {
    review_id: string;
    task_id: string;
    task_type: ReviewPacketTaskType;
    decision: string;
    confidence: "high" | "medium" | "low";
    recommended_human_priority: "high" | "medium" | "low";
    requires_human_confirmation: true;
    promotion_allowed: false;
    suggested_review_fields: {
      decision: string;
      selected_display_ipa: null;
    };
  };
  if (aiReviewIds.has(decision.review_id)) {
    errors.push({ row: index + 1, kind: "duplicate-phase6-ai-review-id", detail: decision.review_id });
  }
  aiReviewIds.add(decision.review_id);
  if (aiReviewTaskIds.has(decision.task_id)) {
    errors.push({ row: index + 1, kind: "duplicate-phase6-ai-review-task-id", detail: decision.task_id });
  }
  aiReviewTaskIds.add(decision.task_id);

  const allowedDecisions = reviewPacketAllowedDecisions.get(decision.task_id);
  const sourceTaskType = reviewPacketTaskTypes.get(decision.task_id);
  if (!allowedDecisions || !sourceTaskType) {
    errors.push({ row: index + 1, kind: "phase6-ai-review-source-task-missing", detail: decision.task_id });
  } else {
    if (!allowedDecisions.includes(decision.decision)) {
      errors.push({ row: index + 1, kind: "phase6-ai-review-decision-not-allowed", detail: decision.task_id });
    }
    if (sourceTaskType !== decision.task_type) {
      errors.push({ row: index + 1, kind: "phase6-ai-review-task-type-mismatch", detail: decision.task_id });
    }
  }
  if (
    decision.suggested_review_fields.decision !== decision.decision ||
    decision.suggested_review_fields.selected_display_ipa !== null
  ) {
    errors.push({ row: index + 1, kind: "phase6-ai-review-suggestion-mismatch", detail: decision.task_id });
  }

  actualAiReviewTaskCounts[decision.task_type] += 1;
  actualAiDecisionCounts[decision.decision] = (actualAiDecisionCounts[decision.decision] ?? 0) + 1;
  actualAiConfidenceCounts[decision.confidence] += 1;
  actualAiPriorityCounts[decision.recommended_human_priority] += 1;
  if (decision.requires_human_confirmation) actualAiRequiresHumanConfirmation += 1;
  if (decision.promotion_allowed) actualAiPromotionAllowed += 1;
}
if (
  aiReviewRows.length !== aiReviewSummary.totalDecisions ||
  aiReviewRows.length !== aiReviewIds.size ||
  aiReviewRows.length !== aiReviewTaskIds.size ||
  aiReviewRows.length !== humanReviewPacketRows.length ||
  aiReviewSummary.sourcePacketTasks !== humanReviewPacketRows.length ||
  !sameReviewPacketTaskCounts(actualAiReviewTaskCounts, humanReviewPacket.taskCounts) ||
  !sameReviewPacketTaskCounts(aiReviewSummary.taskCounts, actualAiReviewTaskCounts) ||
  !sameNumericRecord(aiReviewSummary.decisionCounts, actualAiDecisionCounts) ||
  !sameNumericRecord(aiReviewSummary.confidenceCounts, actualAiConfidenceCounts) ||
  !sameNumericRecord(aiReviewSummary.priorityCounts, actualAiPriorityCounts) ||
  aiReviewSummary.requiresHumanConfirmation !== actualAiRequiresHumanConfirmation ||
  aiReviewSummary.requiresHumanConfirmation !== aiReviewRows.length ||
  aiReviewSummary.promotionAllowed !== actualAiPromotionAllowed ||
  actualAiPromotionAllowed !== 0 ||
  [...reviewPacketTaskIds].some((taskId) => !aiReviewTaskIds.has(taskId)) ||
  phase6Index.aiReview.totalDecisions !== aiReviewSummary.totalDecisions ||
  phase6Index.aiReview.requiresHumanConfirmation !== aiReviewSummary.requiresHumanConfirmation ||
  phase6Index.aiReview.promotionAllowed !== aiReviewSummary.promotionAllowed ||
  !sameReviewPacketTaskCounts(phase6Index.aiReview.taskCounts, aiReviewSummary.taskCounts) ||
  !sameNumericRecord(phase6Index.aiReview.decisionCounts, aiReviewSummary.decisionCounts) ||
  !sameNumericRecord(phase6Index.aiReview.confidenceCounts, aiReviewSummary.confidenceCounts) ||
  !sameNumericRecord(phase6Index.aiReview.priorityCounts, aiReviewSummary.priorityCounts)
) {
  errors.push({
    row: 0,
    kind: "phase6-ai-review-count-mismatch",
    detail: {
      summary: aiReviewSummary,
      actualTaskCounts: actualAiReviewTaskCounts,
      actualDecisionCounts: actualAiDecisionCounts,
      rows: aiReviewRows.length
    }
  });
}

const coverageSourceCounts: Record<string, number> = {};
const coverageFactsWithDialectBySource: Record<string, number> = {};
const coverageFactsWithoutDialectBySource: Record<string, number> = {};
const coverageDialectCountsBySource: Record<string, Record<string, number>> = {};
for (const row of pronunciationDialectCoverage.sources) {
  coverageSourceCounts[row.source] = row.facts;
  coverageFactsWithDialectBySource[row.source] = row.facts_with_dialect;
  coverageFactsWithoutDialectBySource[row.source] = row.facts_without_dialect;
  coverageDialectCountsBySource[row.source] = row.dialect_counts;
}
const actualFactsWithDialect = pronunciationRows.length - pronunciationFactsWithoutDialect;
if (
  pronunciationDialectCoverage.facts !== pronunciationRows.length ||
  pronunciationDialectCoverage.factsWithDialect !== actualFactsWithDialect ||
  pronunciationDialectCoverage.factsWithoutDialect !== pronunciationFactsWithoutDialect ||
  pronunciationDialectGapSummary.factsWithoutDialect !== pronunciationDialectCoverage.factsWithoutDialect ||
  !sameNumericRecord(coverageFactsWithoutDialectBySource, actualDialectGapSourceCounts) ||
  !sameNumericRecord(coverageSourceCounts, pronunciationSourceCounts) ||
  !sameNumericRecord(
    coverageFactsWithDialectBySource,
    Object.fromEntries(
      Object.entries(pronunciationSourceCounts).map(([source, count]) => [
        source,
        count - (coverageFactsWithoutDialectBySource[source] ?? 0)
      ])
    )
  ) ||
  Object.entries(pronunciationDialectCountsBySource).some(
    ([source, dialectCounts]) => !sameNumericRecord(dialectCounts, coverageDialectCountsBySource[source] ?? {})
  ) ||
  phase6Index.pronunciationDialectCoverage.length !== pronunciationDialectCoverage.sources.length ||
  phase6Index.pronunciationDialectCoverage.some((row) => {
    const coverageRow = pronunciationDialectCoverage.sources.find((candidate) => candidate.source === row.source);
    return (
      !coverageRow ||
      row.facts !== coverageRow.facts ||
      row.facts_with_dialect !== coverageRow.facts_with_dialect ||
      row.facts_without_dialect !== coverageRow.facts_without_dialect ||
      !sameNumericRecord(row.dialect_counts, coverageRow.dialect_counts)
    );
  })
) {
  errors.push({
    row: 0,
    kind: "phase6-pronunciation-dialect-coverage-count-mismatch",
    detail: { coverage: pronunciationDialectCoverage, sourceCounts: pronunciationSourceCounts }
  });
}

const originRows = await readJsonl(ORIGIN_FACTS_PATH);
const originIds = new Set<string>();
const originHeadwords = new Set<string>();
const originSourceCounts: Record<string, number> = {};
const originValueCounts: Record<string, number> = {};
for (const [index, row] of originRows.entries()) {
  if (!validateOriginFact(row)) {
    errors.push({ row: index + 1, kind: "origin-fact-schema", detail: validateOriginFact.errors });
    continue;
  }
  const fact = row as {
    origin_id: string;
    headword_normalized: string;
    origin: string;
    source: string;
    confidence: number;
    review_status: string;
    provenance: { source_id: string; confidence: number; review_status: string };
  };
  if (originIds.has(fact.origin_id)) {
    errors.push({ row: index + 1, kind: "duplicate-origin-fact-id", detail: fact.origin_id });
  }
  originIds.add(fact.origin_id);
  originHeadwords.add(fact.headword_normalized);
  originSourceCounts[fact.source] = (originSourceCounts[fact.source] ?? 0) + 1;
  originValueCounts[fact.origin] = (originValueCounts[fact.origin] ?? 0) + 1;
  if (
    fact.source !== fact.provenance.source_id ||
    fact.confidence !== fact.provenance.confidence ||
    fact.review_status !== fact.provenance.review_status
  ) {
    errors.push({ row: index + 1, kind: "origin-fact-provenance-mismatch", detail: fact.origin_id });
  }
}

if (
  pronunciationRows.length !== phase6Index.pronunciationFacts ||
  pronunciationHeadwords.size !== phase6Index.pronunciationHeadwords ||
  !sameNumericRecord(pronunciationSourceCounts, phase6Index.pronunciationSourceCounts) ||
  phase6Index.pronunciationConflictSummary.conflictHeadwords !== pronunciationConflictRows.length ||
  !sameBucketCounts(phase6Index.pronunciationConflictSummary.bucketCounts, pronunciationConflictBucketCounts) ||
  phase6Index.pronunciationConflictSummary.metadataGaps.factsWithoutDialect !== pronunciationFactsWithoutDialect ||
  phase6Index.pronunciationConflictSummary.metadataGaps.conflictFactsWithoutDialect !== pronunciationConflictFactsWithoutDialect ||
  phase6Index.pronunciationConflictSummary.metadataGaps.conflictHeadwordsWithoutDialect !==
    pronunciationConflictSummary.metadataGaps.conflictHeadwordsWithoutDialect ||
  !sameNumericRecord(
    phase6Index.pronunciationConflictSummary.metadataGaps.transcriptionSystemCounts,
    pronunciationTranscriptionSystemCounts
  ) ||
  originRows.length !== phase6Index.originFacts ||
  originHeadwords.size !== phase6Index.originHeadwords ||
  !sameNumericRecord(originSourceCounts, phase6Index.originSourceCounts) ||
  !sameNumericRecord(originValueCounts, phase6Index.originValueCounts)
) {
  errors.push({
    row: 0,
    kind: "phase6-fact-index-count-mismatch",
    detail: {
      pronunciationFacts: pronunciationRows.length,
      pronunciationHeadwords: pronunciationHeadwords.size,
      pronunciationSourceCounts,
      originFacts: originRows.length,
      originHeadwords: originHeadwords.size,
      originSourceCounts,
      originValueCounts,
      expected: phase6Index
    }
  });
}

const silverRows = await readJsonl(SILVER_BENCHMARK_PATH);
const silverIds = new Set<string>();
let silverEligibleRows = 0;
const silverLabelCounts: Record<string, number> = {};
for (const [index, row] of silverRows.entries()) {
  if (!validateSilverBenchmark(row)) {
    errors.push({ row: index + 1, kind: "silver-benchmark-row-schema", detail: validateSilverBenchmark.errors });
    continue;
  }
  const silver = row as {
    benchmark_id: string;
    label: string;
    threshold_eligible: boolean;
    left: { sense_id: string };
    right: { sense_id: string };
  };
  if (silverIds.has(silver.benchmark_id)) {
    errors.push({ row: index + 1, kind: "duplicate-silver-benchmark-id", detail: silver.benchmark_id });
  }
  silverIds.add(silver.benchmark_id);
  silverLabelCounts[silver.label] = (silverLabelCounts[silver.label] ?? 0) + 1;
  if (silver.threshold_eligible) silverEligibleRows += 1;
  for (const senseId of [silver.left.sense_id, silver.right.sense_id]) {
    if (!sourceSenseIds.has(senseId)) {
      errors.push({ row: index + 1, kind: "silver-sense-not-in-sense-layer", detail: senseId });
    }
  }
}

const silverReport = silverReportValue as {
  inputRows: number;
  benchmarkRows: number;
  thresholdEligibleRows: number;
  labels: Record<string, number>;
  thresholds: Array<{
    threshold: number;
    truePositive: number;
    falsePositive: number;
    trueNegative: number;
    falseNegative: number;
  }>;
};
if (
  silverReport.inputRows !== silverRows.length ||
  silverReport.benchmarkRows !== silverRows.length ||
  silverReport.thresholdEligibleRows !== silverEligibleRows ||
  !sameNumericRecord(silverReport.labels, silverLabelCounts)
) {
  errors.push({
    row: 0,
    kind: "silver-benchmark-report-count-mismatch",
    detail: {
      rows: silverRows.length,
      eligible: silverEligibleRows,
      labels: silverLabelCounts,
      report: silverReport
    }
  });
}

const typedSilverRows = silverRows as Array<{
  score: number | null;
  label: string;
  threshold_eligible: boolean;
}>;
for (const metric of silverReport.thresholds) {
  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;
  for (const row of typedSilverRows.filter((item) => item.threshold_eligible && item.score !== null)) {
    const predictedPositive = row.score! >= metric.threshold;
    const actualPositive = row.label === "same_sense" || row.label === "near_paraphrase";
    if (predictedPositive && actualPositive) truePositive += 1;
    else if (predictedPositive) falsePositive += 1;
    else if (actualPositive) falseNegative += 1;
    else trueNegative += 1;
  }
  if (
    metric.truePositive !== truePositive ||
    metric.falsePositive !== falsePositive ||
    metric.trueNegative !== trueNegative ||
    metric.falseNegative !== falseNegative
  ) {
    errors.push({ row: 0, kind: "silver-threshold-confusion-matrix-mismatch", detail: metric.threshold });
  }
}

const entityRows = await readJsonl(ENTITY_CANDIDATES_PATH);
const entityIds = new Set<string>();
const entityDefinitionIds = new Set<string>();
const entityTypeCounts: Record<string, number> = {};
let entityDefinitions = 0;
let clusterEntityCandidates = 0;
let memberEntityCandidates = 0;
let clusterLayerEntityDefinitions = 0;
let memberLevelEntityDefinitions = 0;
for (const [index, row] of entityRows.entries()) {
  if (!validateEntity(row)) {
    errors.push({ row: index + 1, kind: "entity-candidate-schema", detail: validateEntity.errors });
    continue;
  }
  const entity = row as {
    entity_id: string;
    cluster_id: string;
    candidate_scope: "cluster" | "member";
    parent_cluster_status: ClusterStatus;
    entity_type: string;
    definition_count: number;
    canonical_definition: { sense_id: string };
    source_definitions: Array<{ sense_id: string; risk_tags: string[] }>;
  };
  if (entityIds.has(entity.entity_id)) {
    errors.push({ row: index + 1, kind: "duplicate-entity-id", detail: entity.entity_id });
  }
  entityIds.add(entity.entity_id);
  entityDefinitions += entity.source_definitions.length;
  entityTypeCounts[entity.entity_type] = (entityTypeCounts[entity.entity_type] ?? 0) + 1;
  if (entity.definition_count !== entity.source_definitions.length) {
    errors.push({ row: index + 1, kind: "entity-definition-count-mismatch", detail: entity.entity_id });
  }
  if (!clusterIds.has(entity.cluster_id)) {
    errors.push({ row: index + 1, kind: "entity-parent-cluster-missing", detail: entity.cluster_id });
  }
  if (clusterStatuses.get(entity.cluster_id) !== entity.parent_cluster_status) {
    errors.push({ row: index + 1, kind: "entity-parent-status-mismatch", detail: entity.entity_id });
  }
  if (!entity.source_definitions.some((definition) => definition.sense_id === entity.canonical_definition.sense_id)) {
    errors.push({ row: index + 1, kind: "entity-canonical-not-in-definitions", detail: entity.entity_id });
  }
  if (entity.candidate_scope === "cluster") {
    clusterEntityCandidates += 1;
    clusterLayerEntityDefinitions += entity.source_definitions.length;
    if (entity.parent_cluster_status !== "entity_or_encyclopedic") {
      errors.push({ row: index + 1, kind: "cluster-entity-status-invalid", detail: entity.entity_id });
    }
  } else {
    memberEntityCandidates += 1;
    memberLevelEntityDefinitions += entity.source_definitions.length;
    if (entity.parent_cluster_status === "entity_or_encyclopedic") {
      errors.push({ row: index + 1, kind: "member-entity-status-invalid", detail: entity.entity_id });
    }
  }
  for (const definition of entity.source_definitions) {
    if (!sourceSenseIds.has(definition.sense_id)) {
      errors.push({ row: index + 1, kind: "entity-definition-not-in-sense-layer", detail: definition.sense_id });
    }
    if (entityDefinitionIds.has(definition.sense_id)) {
      errors.push({ row: index + 1, kind: "duplicate-entity-definition", detail: definition.sense_id });
    }
    entityDefinitionIds.add(definition.sense_id);
    if (entity.candidate_scope === "member" && !definition.risk_tags.some((tag) => [
        "proper-name-candidate",
        "place-name-candidate",
        "domain-or-encyclopedic-candidate",
        "punctuation-headword-candidate"
      ].includes(tag))) {
      errors.push({ row: index + 1, kind: "entity-definition-without-entity-risk", detail: definition.sense_id });
    }
  }
}

if (
  entityIndex.candidates !== entityRows.length ||
  entityIndex.clusterCandidates !== clusterEntityCandidates ||
  entityIndex.memberCandidates !== memberEntityCandidates ||
  entityIndex.definitions !== entityDefinitions ||
  entityIndex.clusterLayerDefinitions !== clusterLayerEntityDefinitions ||
  entityIndex.memberLevelDefinitions !== memberLevelEntityDefinitions
) {
  errors.push({
    row: 0,
    kind: "entity-index-count-mismatch",
    detail: {
      actual: {
        candidates: entityRows.length,
        clusterCandidates: clusterEntityCandidates,
        memberCandidates: memberEntityCandidates,
        definitions: entityDefinitions,
        clusterLayerDefinitions: clusterLayerEntityDefinitions,
        memberLevelDefinitions: memberLevelEntityDefinitions
      },
      expected: entityIndex
    }
  });
}
if (!sameNumericRecord(entityTypeCounts, entityIndex.entityTypeCounts)) {
  errors.push({ row: 0, kind: "entity-type-counts-mismatch", detail: { actual: entityTypeCounts, expected: entityIndex.entityTypeCounts } });
}

const referenceIds = new Set<string>();
let referenceRows = 0;
let referenceDefinitions = 0;
const referenceLanguageCounts: Record<string, number> = {};
const referenceSourceCounts: Record<string, number> = {};
const referenceInput = createReadStream(REFERENCE_NON_VI_PATH).pipe(createGunzip());
const referenceRl = createInterface({ input: referenceInput, crlfDelay: Infinity });
for await (const line of referenceRl) {
  const text = line.trim();
  if (!text) continue;
  referenceRows += 1;
  let reference: {
    reference_id: string;
    definition_count: number;
    canonical_definition: { sense_id: string };
    source_definitions: Array<{ sense_id: string; language: string; source: string }>;
  };
  try {
    reference = JSON.parse(text) as typeof reference;
  } catch (error) {
    errors.push({ row: referenceRows, kind: "reference-non-vi-json", detail: (error as Error).message });
    continue;
  }
  if (!validateReferenceNonVi(reference)) {
    errors.push({ row: referenceRows, kind: "reference-non-vi-schema", detail: validateReferenceNonVi.errors });
    continue;
  }
  if (referenceIds.has(reference.reference_id)) {
    errors.push({ row: referenceRows, kind: "duplicate-reference-id", detail: reference.reference_id });
  }
  referenceIds.add(reference.reference_id);
  referenceDefinitions += reference.source_definitions.length;
  for (const definition of reference.source_definitions) {
    referenceLanguageCounts[definition.language] = (referenceLanguageCounts[definition.language] ?? 0) + 1;
    referenceSourceCounts[definition.source] = (referenceSourceCounts[definition.source] ?? 0) + 1;
  }
  if (reference.definition_count !== reference.source_definitions.length) {
    errors.push({
      row: referenceRows,
      kind: "reference-definition-count-mismatch",
      detail: reference.reference_id
    });
  }
  if (reference.source_definitions.some((definition) => definition.language === "vi")) {
    errors.push({ row: referenceRows, kind: "reference-non-vi-contains-vi", detail: reference.reference_id });
  }
  if (
    !reference.source_definitions.some(
      (definition) => definition.sense_id === reference.canonical_definition.sense_id
    )
  ) {
    errors.push({ row: referenceRows, kind: "reference-canonical-not-in-definitions", detail: reference.reference_id });
  }
}

if (
  referenceIndex.entries !== referenceRows ||
  referenceIndex.definitions !== referenceDefinitions ||
  !sameNumericRecord(referenceIndex.languageCounts, referenceLanguageCounts) ||
  !sameNumericRecord(referenceIndex.sourceCounts, referenceSourceCounts)
) {
  errors.push({
    row: 0,
    kind: "reference-index-count-mismatch",
    detail: {
      actual: {
        entries: referenceRows,
        definitions: referenceDefinitions,
        languageCounts: referenceLanguageCounts,
        sourceCounts: referenceSourceCounts
      },
      expected: referenceIndex
    }
  });
}

if (clusterCount !== index.clusters) {
  errors.push({ row: 0, kind: "cluster-count-mismatch", detail: { actual: clusterCount, expected: index.clusters } });
}
if (definitionCount !== index.definitions) {
  errors.push({
    row: 0,
    kind: "definition-count-mismatch",
    detail: { actual: definitionCount, expected: index.definitions }
  });
}
if (!sameCounts(statusCounts, index.statusCounts)) {
  errors.push({ row: 0, kind: "status-counts-mismatch", detail: { actual: statusCounts, expected: index.statusCounts } });
}
if (!sameCounts(definitionStatusCounts, index.definitionStatusCounts)) {
  errors.push({
    row: 0,
    kind: "definition-status-counts-mismatch",
    detail: { actual: definitionStatusCounts, expected: index.definitionStatusCounts }
  });
}

const summary = {
  generatedAt: new Date().toISOString(),
  passed: errors.length === 0,
  clusters: clusterCount,
  definitions: definitionCount,
  uniqueClusterIds: clusterIds.size,
  uniqueSourceSenseIds: sourceSenseIds.size,
  reviewRemainderSampleRows: reviewRows.length,
  entityCandidateRows: entityRows.length,
  referenceNonViRows: referenceRows,
  referenceNonViDefinitions: referenceDefinitions,
  nearDuplicateCandidateRows: nearCandidates.pairs.length,
  silverBenchmarkRows: silverRows.length,
  silverThresholdEligibleRows: silverEligibleRows,
  pronunciationFactRows: pronunciationRows.length,
  pronunciationConflictRows: pronunciationConflictRows.length,
  phase6HumanReviewPacketRows: humanReviewPacketRows.length,
  phase6AiReviewRows: aiReviewRows.length,
  originFactRows: originRows.length,
  statusCounts,
  definitionStatusCounts,
  errors: errors.slice(0, 50)
};

await writeJson(VALIDATION_SUMMARY_PATH, summary);

if (errors.length > 0) {
  console.error(`[academic:validate] FAIL: ${errors.length} errors`);
  console.error(JSON.stringify(errors.slice(0, 10), null, 2));
  process.exit(1);
}

console.log(
  `[academic:validate] PASS: ${clusterCount.toLocaleString("vi-VN")} clusters; ` +
    `${definitionCount.toLocaleString("vi-VN")} definitions; ${reviewRows.length.toLocaleString("vi-VN")} review sample rows`
);
