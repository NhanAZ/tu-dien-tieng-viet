import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PROCESSED_DIR, ROOT, ensureDir, readJson, writeJson } from "./lib/paths.js";
import { cleanText, shortHash, slugifyWord } from "./lib/text.js";

type ConflictBucket = "formatting_only" | "dialect_source_variant" | "source_attested_variant" | "unresolved";
type EntryScopeReason =
  | "normalized_form_collision"
  | "cross_pos_scope"
  | "source_entry_id_reused_across_raw_records"
  | "same_form_same_pos_distinct_source_records";
type ReviewRoute = "parser_fix" | "human_review";
type DialectGapReviewRoute =
  | "source_metadata_unavailable"
  | "not_a_dialect_label"
  | "manual_label_parsing_review"
  | "manual_label_review";
type ReviewPacketTaskType = "pronunciation_conflict_review" | "dialect_label_review";

interface PronunciationFact {
  pronunciation_id: string;
  word: string;
  headword_normalized: string;
  ipa: string;
  transcription_system: "IPA";
  dialect: string | null;
  source_entry_word: string | null;
  source_entry_pos: string | null;
  source_sound_index: number | null;
  source_tags: string[];
  source_note: string | null;
  source: string;
  confidence: number;
  review_status: string;
  provenance: {
    source_entry_id: string | null;
    raw_record_hash: string;
  };
}

interface SourceValueSummary {
  source: string;
  dialect: string | null;
  transcription_system: string;
  fact_count: number;
  raw_record_count: number;
  raw_records_with_multiple_display_values: number;
  raw_ipa_values: string[];
  display_normalized_ipa_values: string[];
  sample_fact_ids: string[];
}

interface PronunciationConflict {
  conflict_id: string;
  headword_normalized: string;
  words: string[];
  bucket: ConflictBucket;
  raw_ipa_values: string[];
  display_normalized_ipa_values: string[];
  safe_display_ipa: string | null;
  sources: string[];
  dialects: Array<string | null>;
  transcription_systems: string[];
  source_values: SourceValueSummary[];
  fact_count: number;
  metadata_gaps: {
    facts_without_dialect: number;
  };
  sample_fact_ids: string[];
  recommended_action: string;
}

interface BucketCounts {
  formatting_only: number;
  dialect_source_variant: number;
  source_attested_variant: number;
  unresolved: number;
}

interface ConflictSummary {
  generatedAt: string;
  status: "PHASE6_PRONUNCIATION_CONFLICTS_DRAFT";
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
  files: {
    conflicts: string;
    sample: string;
    sourceEntryPolicy: string;
    entryScopeTriage: string;
    unresolvedAnalysis: string;
    unresolvedAnalysisDetails: string;
    unresolvedAnalysisSample: string;
    humanReviewPacket: string;
    humanReviewPacketTasks: string;
    humanReviewPacketSample: string;
  };
  caveats: string[];
}

interface Phase6Index {
  files: Record<string, string>;
  pronunciationConflictSummary?: {
    conflictHeadwords: number;
    bucketCounts: BucketCounts;
    metadataGaps: ConflictSummary["metadataGaps"];
  };
  humanReviewPacket?: {
    totalTasks: number;
    taskCounts: Record<ReviewPacketTaskType, number>;
    reviewStatusCounts: {
      unreviewed: number;
    };
  };
}

interface UnresolvedInternalGroup {
  source: string;
  dialect: string | null;
  transcription_system: string;
  fact_count: number;
  raw_record_count: number;
  raw_records_with_multiple_display_values: number;
  display_normalized_ipa_values: string[];
  source_entry_words: string[];
  source_entry_parts_of_speech: string[];
  raw_record_scopes: RawRecordScope[];
  source_entry_id_samples: string[];
  sample_fact_ids: string[];
}

interface RawRecordScope {
  raw_record_hash: string;
  source_entry_words: string[];
  source_entry_parts_of_speech: string[];
  fact_count: number;
  display_normalized_ipa_values: string[];
  source_entry_id_samples: string[];
}

interface UnresolvedAnalysisRow {
  conflict_id: string;
  headword_normalized: string;
  words: string[];
  reason_tags: string[];
  entry_scope_reasons: EntryScopeReason[];
  review_route: ReviewRoute;
  review_status: "unreviewed";
  route_rationale: string;
  internal_groups: UnresolvedInternalGroup[];
  recommended_action: string;
}

interface DialectGapRow {
  pronunciation_id: string;
  headword_normalized: string;
  word: string;
  source: string;
  source_entry_id: string | null;
  raw_record_hash: string;
  source_tags: string[];
  source_note: string | null;
  gap_reason: string;
  review_route: DialectGapReviewRoute;
  review_status: "unreviewed";
}

interface ReviewPacketTask {
  task_id: string;
  task_type: ReviewPacketTaskType;
  headword_normalized: string;
  words: string[];
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
  evidence_links: Array<{
    label: string;
    path: string;
    key: string;
  }>;
  evidence: Record<string, unknown>;
}

const PRONUNCIATION_REVIEW_DECISIONS = [
  "keep_all_source_attested_variants",
  "select_one_display_ipa",
  "split_by_source_entry_or_pos",
  "requires_parser_followup",
  "insufficient_evidence"
] as const;
const DIALECT_LABEL_REVIEW_DECISIONS = [
  "assign_recognized_dialect",
  "split_label_and_qualifier",
  "not_a_dialect_label",
  "leave_dialect_null",
  "insufficient_evidence"
] as const;

const PHASE6_DIR = path.join(PROCESSED_DIR, "phase6");
const PRONUNCIATION_PATH = path.join(PHASE6_DIR, "pronunciation-facts.jsonl");
const DIALECT_GAP_DETAILS_PATH = path.join(PHASE6_DIR, "pronunciation-dialect-gaps.jsonl");
const SUMMARY_PATH = path.join(PHASE6_DIR, "pronunciation-conflicts.json");
const CONFLICTS_PATH = path.join(PHASE6_DIR, "pronunciation-conflicts.jsonl");
const SAMPLE_PATH = path.join(PHASE6_DIR, "pronunciation-conflicts.sample.jsonl");
const SOURCE_ENTRY_POLICY_PATH = path.join(PHASE6_DIR, "pronunciation-source-entry-policy.json");
const ENTRY_SCOPE_TRIAGE_PATH = path.join(PHASE6_DIR, "pronunciation-entry-scope-triage.json");
const UNRESOLVED_ANALYSIS_PATH = path.join(PHASE6_DIR, "pronunciation-unresolved-analysis.json");
const UNRESOLVED_ANALYSIS_DETAILS_PATH = path.join(PHASE6_DIR, "pronunciation-unresolved-analysis.jsonl");
const UNRESOLVED_ANALYSIS_SAMPLE_PATH = path.join(PHASE6_DIR, "pronunciation-unresolved-analysis.sample.jsonl");
const HUMAN_REVIEW_PACKET_PATH = path.join(PHASE6_DIR, "human-review-packet.json");
const HUMAN_REVIEW_PACKET_TASKS_PATH = path.join(PHASE6_DIR, "human-review-packet.jsonl");
const HUMAN_REVIEW_PACKET_SAMPLE_PATH = path.join(PHASE6_DIR, "human-review-packet.sample.jsonl");
const INDEX_PATH = path.join(PHASE6_DIR, "index.json");
const REPORT_PATH = path.join(ROOT, "reports", "academic-phase6-pronunciation-conflicts-0.4.0.md");

async function readJsonl<T>(filePath: string): Promise<T[]> {
  return (await readFile(filePath, "utf8"))
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

async function writeJsonl(filePath: string, rows: unknown[]): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
}

function uniqueNullableSorted(values: Iterable<string | null>): Array<string | null> {
  const textValues = uniqueSorted([...values].filter((value): value is string => value !== null));
  return [...(new Set(values).has(null) ? [null] : []), ...textValues];
}

function increment(target: Record<string, number>, key: string, amount = 1): void {
  target[key] = (target[key] ?? 0) + amount;
}

function normalizeIpaDisplay(value: string): string {
  let text = cleanText(value).normalize("NFC");
  let changed = true;
  while (changed) {
    changed = false;
    const pairedDelimiters =
      (text.startsWith("[") && text.endsWith("]")) ||
      (text.startsWith("/") && text.endsWith("/"));
    if (pairedDelimiters) {
      text = text.slice(1, -1).trim();
      changed = true;
    }
  }
  return text.replace(/\s+/g, " ").normalize("NFC");
}

function sourceDialectKey(fact: PronunciationFact): string {
  return `${fact.source}\u0000${fact.dialect ?? ""}\u0000${fact.transcription_system}`;
}

function classifyConflict(sourceValues: SourceValueSummary[], displayValues: string[], words: string[]): ConflictBucket {
  if (displayValues.length === 1) return "formatting_only";
  if (sourceValues.every((value) => value.display_normalized_ipa_values.length === 1)) return "dialect_source_variant";
  const internallyVariantValues = sourceValues.filter((value) => value.display_normalized_ipa_values.length > 1);
  if (
    words.length === 1 &&
    internallyVariantValues.every(
      (value) => value.raw_record_count === 1 && value.raw_records_with_multiple_display_values === 1
    )
  ) {
    return "source_attested_variant";
  }
  return "unresolved";
}

function recommendedAction(bucket: ConflictBucket): string {
  if (bucket === "formatting_only") {
    return "Use safe_display_ipa for display only; keep every raw IPA fact and provenance unchanged.";
  }
  if (bucket === "dialect_source_variant") {
    return "Keep all source/dialect variants as separate facts; do not collapse into one scalar IPA.";
  }
  if (bucket === "source_attested_variant") {
    return "Keep distinct raw sounds from the same source entry as source-attested alternatives; do not select a scalar IPA.";
  }
  return "Review source-specific parsing or add dialect/system metadata before choosing any display projection.";
}

function blankReviewFields(): ReviewPacketTask["review_fields"] {
  return {
    decision: null,
    selected_display_ipa: null,
    selected_dialect: null,
    qualifier_note: "",
    reviewer_id: "",
    reviewer_notes: "",
    reviewed_at: ""
  };
}

function pronunciationReviewTask(row: UnresolvedAnalysisRow): ReviewPacketTask {
  return {
    task_id: `phase6-review-${row.conflict_id}`,
    task_type: "pronunciation_conflict_review",
    headword_normalized: row.headword_normalized,
    words: row.words,
    review_status: "unreviewed",
    allowed_decisions: [...PRONUNCIATION_REVIEW_DECISIONS],
    review_fields: blankReviewFields(),
    evidence_links: [
      {
        label: "unresolved_analysis_row",
        path: "data/processed/phase6/pronunciation-unresolved-analysis.jsonl",
        key: row.conflict_id
      },
      {
        label: "conflict_row",
        path: "data/processed/phase6/pronunciation-conflicts.jsonl",
        key: row.conflict_id
      },
      {
        label: "pronunciation_facts",
        path: "data/processed/phase6/pronunciation-facts.jsonl",
        key: row.internal_groups.flatMap((group) => group.sample_fact_ids).join(",")
      }
    ],
    evidence: {
      conflict_id: row.conflict_id,
      reason_tags: row.reason_tags,
      entry_scope_reasons: row.entry_scope_reasons,
      review_route: row.review_route,
      route_rationale: row.route_rationale,
      internal_groups: row.internal_groups,
      recommended_action: row.recommended_action
    }
  };
}

function dialectLabelReviewTask(row: DialectGapRow): ReviewPacketTask {
  return {
    task_id: `phase6-review-dialect-label-${slugifyWord(row.headword_normalized)}-${shortHash(
      `${row.pronunciation_id}:${row.review_route}:${row.source_note ?? ""}`
    )}`,
    task_type: "dialect_label_review",
    headword_normalized: row.headword_normalized,
    words: [row.word],
    review_status: "unreviewed",
    allowed_decisions: [...DIALECT_LABEL_REVIEW_DECISIONS],
    review_fields: blankReviewFields(),
    evidence_links: [
      {
        label: "dialect_gap_row",
        path: "data/processed/phase6/pronunciation-dialect-gaps.jsonl",
        key: row.pronunciation_id
      },
      {
        label: "pronunciation_fact",
        path: "data/processed/phase6/pronunciation-facts.jsonl",
        key: row.pronunciation_id
      }
    ],
    evidence: {
      pronunciation_id: row.pronunciation_id,
      source: row.source,
      source_entry_id: row.source_entry_id,
      raw_record_hash: row.raw_record_hash,
      source_tags: row.source_tags,
      source_note: row.source_note,
      gap_reason: row.gap_reason,
      review_route: row.review_route,
      recommended_action:
        "Adjudicate only the explicit source note/tag as dialect metadata; do not infer dialect from IPA, source identity or neighboring entries."
    }
  };
}

function buildHumanReviewPacket(unresolvedRows: UnresolvedAnalysisRow[], dialectGapRows: DialectGapRow[], generatedAt: string) {
  const manualDialectRows = dialectGapRows.filter(
    (row) => row.review_route === "manual_label_parsing_review" || row.review_route === "manual_label_review"
  );
  const taskOrder: Record<ReviewPacketTaskType, number> = {
    pronunciation_conflict_review: 0,
    dialect_label_review: 1
  };
  const tasks = [
    ...unresolvedRows.map((row) => pronunciationReviewTask(row)),
    ...manualDialectRows.map((row) => dialectLabelReviewTask(row))
  ].sort(
    (a, b) =>
      taskOrder[a.task_type] - taskOrder[b.task_type] ||
      a.headword_normalized.localeCompare(b.headword_normalized, "vi") ||
      a.task_id.localeCompare(b.task_id)
  );

  const taskIds = new Set<string>();
  for (const task of tasks) {
    if (taskIds.has(task.task_id)) throw new Error(`Duplicate Phase 6 review packet task_id: ${task.task_id}`);
    taskIds.add(task.task_id);
  }

  const taskCounts: Record<ReviewPacketTaskType, number> = {
    pronunciation_conflict_review: unresolvedRows.length,
    dialect_label_review: manualDialectRows.length
  };
  const summary = {
    generatedAt,
    status: "PHASE6_HUMAN_REVIEW_PACKET_DRAFT",
    packetVersion: "1.0.0",
    totalTasks: tasks.length,
    taskCounts,
    reviewStatusCounts: {
      unreviewed: tasks.length
    },
    allowedDecisions: {
      pronunciation_conflict_review: [...PRONUNCIATION_REVIEW_DECISIONS],
      dialect_label_review: [...DIALECT_LABEL_REVIEW_DECISIONS]
    },
    sourceFiles: {
      pronunciationConflicts: "data/processed/phase6/pronunciation-unresolved-analysis.jsonl",
      dialectGaps: "data/processed/phase6/pronunciation-dialect-gaps.jsonl"
    },
    files: {
      tasks: "data/processed/phase6/human-review-packet.jsonl",
      sample: "data/processed/phase6/human-review-packet.sample.jsonl"
    },
    caveats: [
      "This packet is a blank adjudication template; no reviewer decision is prefilled.",
      "Pronunciation conflict tasks preserve source facts and do not select scalar IPA values.",
      "Dialect label tasks only ask whether explicit source metadata should become dialect metadata."
    ]
  };

  return { tasks, summary, manualDialectRows };
}

function summarizeGroup(headword: string, facts: PronunciationFact[]): PronunciationConflict | null {
  const rawValues = uniqueSorted(facts.map((fact) => fact.ipa));
  if (rawValues.length < 2) return null;

  const sourceGroups = new Map<string, PronunciationFact[]>();
  for (const fact of facts) {
    const key = sourceDialectKey(fact);
    const rows = sourceGroups.get(key) ?? [];
    rows.push(fact);
    sourceGroups.set(key, rows);
  }

  const sourceValues: SourceValueSummary[] = [...sourceGroups.values()]
    .map((rows) => {
      const rawRecordDisplays = new Map<string, Set<string>>();
      for (const fact of rows) {
        const values = rawRecordDisplays.get(fact.provenance.raw_record_hash) ?? new Set<string>();
        values.add(normalizeIpaDisplay(fact.ipa));
        rawRecordDisplays.set(fact.provenance.raw_record_hash, values);
      }
      return {
        source: rows[0]!.source,
        dialect: rows[0]!.dialect,
        transcription_system: rows[0]!.transcription_system,
        fact_count: rows.length,
        raw_record_count: rawRecordDisplays.size,
        raw_records_with_multiple_display_values: [...rawRecordDisplays.values()].filter((values) => values.size > 1).length,
        raw_ipa_values: uniqueSorted(rows.map((fact) => fact.ipa)),
        display_normalized_ipa_values: uniqueSorted(rows.map((fact) => normalizeIpaDisplay(fact.ipa))),
        sample_fact_ids: uniqueSorted(rows.map((fact) => fact.pronunciation_id)).slice(0, 10)
      };
    })
    .sort(
      (a, b) =>
        a.source.localeCompare(b.source) ||
        (a.dialect ?? "").localeCompare(b.dialect ?? "") ||
        a.transcription_system.localeCompare(b.transcription_system)
    );

  const displayValues = uniqueSorted(facts.map((fact) => normalizeIpaDisplay(fact.ipa)));
  const words = uniqueSorted(facts.map((fact) => fact.word)).slice(0, 20);
  const bucket = classifyConflict(sourceValues, displayValues, words);
  const idSeed = `${headword}:${rawValues.join("|")}:${displayValues.join("|")}`;

  return {
    conflict_id: `pronunciation-conflict-${slugifyWord(headword)}-${shortHash(idSeed)}`,
    headword_normalized: headword,
    words,
    bucket,
    raw_ipa_values: rawValues,
    display_normalized_ipa_values: displayValues,
    safe_display_ipa: bucket === "formatting_only" ? displayValues[0]! : null,
    sources: uniqueSorted(facts.map((fact) => fact.source)),
    dialects: uniqueNullableSorted(facts.map((fact) => fact.dialect)),
    transcription_systems: uniqueSorted(facts.map((fact) => fact.transcription_system)),
    source_values: sourceValues,
    fact_count: facts.length,
    metadata_gaps: {
      facts_without_dialect: facts.filter((fact) => fact.dialect === null || fact.dialect === "").length
    },
    sample_fact_ids: uniqueSorted(facts.map((fact) => fact.pronunciation_id)).slice(0, 20),
    recommended_action: recommendedAction(bucket)
  };
}

function analyzeUnresolvedConflict(conflict: PronunciationConflict, facts: PronunciationFact[]): UnresolvedAnalysisRow {
  const groups = new Map<string, PronunciationFact[]>();
  for (const fact of facts) {
    const key = sourceDialectKey(fact);
    const rows = groups.get(key) ?? [];
    rows.push(fact);
    groups.set(key, rows);
  }

  const internalGroups: UnresolvedInternalGroup[] = [];
  const sourceEntryIdRawHashes = new Map<string, Set<string>>();
  for (const rows of groups.values()) {
    const displayValues = uniqueSorted(rows.map((fact) => normalizeIpaDisplay(fact.ipa)));
    if (displayValues.length < 2) continue;
    for (const fact of rows) {
      if (!fact.provenance.source_entry_id) continue;
      const hashes = sourceEntryIdRawHashes.get(fact.provenance.source_entry_id) ?? new Set<string>();
      hashes.add(fact.provenance.raw_record_hash);
      sourceEntryIdRawHashes.set(fact.provenance.source_entry_id, hashes);
    }
    const rawRecordFacts = new Map<string, PronunciationFact[]>();
    for (const fact of rows) {
      const recordFacts = rawRecordFacts.get(fact.provenance.raw_record_hash) ?? [];
      recordFacts.push(fact);
      rawRecordFacts.set(fact.provenance.raw_record_hash, recordFacts);
    }
    const rawRecordScopes: RawRecordScope[] = [...rawRecordFacts.entries()]
      .map(([rawRecordHash, recordFacts]) => ({
        raw_record_hash: rawRecordHash,
        source_entry_words: uniqueSorted(
          recordFacts.map((fact) => fact.source_entry_word ?? fact.word)
        ),
        source_entry_parts_of_speech: uniqueSorted(
          recordFacts
            .map((fact) => fact.source_entry_pos)
            .filter((value): value is string => value !== null)
        ),
        fact_count: recordFacts.length,
        display_normalized_ipa_values: uniqueSorted(
          recordFacts.map((fact) => normalizeIpaDisplay(fact.ipa))
        ),
        source_entry_id_samples: uniqueSorted(
          recordFacts
            .map((fact) => fact.provenance.source_entry_id)
            .filter((value): value is string => value !== null)
        ).slice(0, 20)
      }))
      .sort((a, b) => a.raw_record_hash.localeCompare(b.raw_record_hash));
    internalGroups.push({
      source: rows[0]!.source,
      dialect: rows[0]!.dialect,
      transcription_system: rows[0]!.transcription_system,
      fact_count: rows.length,
      raw_record_count: rawRecordScopes.length,
      raw_records_with_multiple_display_values: rawRecordScopes.filter(
        (scope) => scope.display_normalized_ipa_values.length > 1
      ).length,
      display_normalized_ipa_values: displayValues,
      source_entry_words: uniqueSorted(rawRecordScopes.flatMap((scope) => scope.source_entry_words)),
      source_entry_parts_of_speech: uniqueSorted(
        rawRecordScopes.flatMap((scope) => scope.source_entry_parts_of_speech)
      ),
      raw_record_scopes: rawRecordScopes,
      source_entry_id_samples: uniqueSorted(
        rows.map((fact) => fact.provenance.source_entry_id).filter((value): value is string => value !== null)
      ).slice(0, 20),
      sample_fact_ids: uniqueSorted(rows.map((fact) => fact.pronunciation_id)).slice(0, 20)
    });
  }

  const reasonTags = new Set<string>();
  if (conflict.words.length > 1) reasonTags.add("case_or_form_variant_present");
  if (internalGroups.some((group) => group.raw_records_with_multiple_display_values > 0)) {
    reasonTags.add("same_raw_record_multiple_ipa_same_source_dialect");
  }
  if (internalGroups.some((group) => group.raw_record_count > 1)) {
    reasonTags.add("multiple_raw_records_same_source_dialect");
  }
  if (reasonTags.size === 0) reasonTags.add("source_dialect_internal_variant");

  const entryScopeReasons = new Set<EntryScopeReason>();
  const entryPartsOfSpeech = uniqueSorted(
    internalGroups.flatMap((group) => group.source_entry_parts_of_speech)
  );
  if (conflict.words.length > 1) entryScopeReasons.add("normalized_form_collision");
  if (entryPartsOfSpeech.length > 1) entryScopeReasons.add("cross_pos_scope");
  const hasReusedSourceEntryId = [...sourceEntryIdRawHashes.values()].some((hashes) => hashes.size > 1);
  if (
    entryScopeReasons.size === 0 &&
    internalGroups.some((group) => group.raw_record_count > 1)
  ) {
    entryScopeReasons.add(
      hasReusedSourceEntryId
        ? "source_entry_id_reused_across_raw_records"
        : "same_form_same_pos_distinct_source_records"
    );
  }
  if (entryScopeReasons.size === 0) {
    throw new Error(`Unresolved pronunciation row has no entry-scope route: ${conflict.conflict_id}`);
  }
  const reviewRoute: ReviewRoute =
    entryScopeReasons.has("source_entry_id_reused_across_raw_records") ? "parser_fix" : "human_review";

  return {
    conflict_id: conflict.conflict_id,
    headword_normalized: conflict.headword_normalized,
    words: conflict.words,
    reason_tags: uniqueSorted(reasonTags),
    entry_scope_reasons: uniqueSorted(entryScopeReasons) as EntryScopeReason[],
    review_route: reviewRoute,
    review_status: "unreviewed",
    route_rationale:
      reviewRoute === "parser_fix"
        ? "The conflicting facts share one source spelling and POS but reuse the same source-entry identity across multiple raw records; disambiguate source record identity before linguistic review."
        : "The records have distinct source identities but differ across source forms, POS scopes or same-form/same-POS raw entries; human review is required before any pronunciation projection decision.",
    internal_groups: internalGroups.sort(
      (a, b) =>
        a.source.localeCompare(b.source) ||
        (a.dialect ?? "").localeCompare(b.dialect ?? "") ||
        a.transcription_system.localeCompare(b.transcription_system)
    ),
    recommended_action:
      "Keep raw IPA facts separate; require source-specific parser review or human pronunciation policy before selecting any scalar projection."
  };
}

const facts = await readJsonl<PronunciationFact>(PRONUNCIATION_PATH);
const dialectGapRows = await readJsonl<DialectGapRow>(DIALECT_GAP_DETAILS_PATH);
const factsByHeadword = new Map<string, PronunciationFact[]>();
const transcriptionSystemCounts: Record<string, number> = {};
for (const fact of facts) {
  const rows = factsByHeadword.get(fact.headword_normalized) ?? [];
  rows.push(fact);
  factsByHeadword.set(fact.headword_normalized, rows);
  increment(transcriptionSystemCounts, fact.transcription_system);
}

const bucketCounts: BucketCounts = {
  formatting_only: 0,
  dialect_source_variant: 0,
  source_attested_variant: 0,
  unresolved: 0
};
const conflicts = [...factsByHeadword.entries()]
  .map(([headword, rows]) => summarizeGroup(headword, rows))
  .filter((row): row is PronunciationConflict => row !== null)
  .sort(
    (a, b) =>
      a.bucket.localeCompare(b.bucket) ||
      a.headword_normalized.localeCompare(b.headword_normalized, "vi") ||
      a.conflict_id.localeCompare(b.conflict_id)
  );

for (const conflict of conflicts) bucketCounts[conflict.bucket] += 1;
const unresolvedAnalysisRows = conflicts
  .filter((conflict) => conflict.bucket === "unresolved")
  .map((conflict) => analyzeUnresolvedConflict(conflict, factsByHeadword.get(conflict.headword_normalized) ?? []));
const unresolvedReasonCounts: Record<string, number> = {};
const entryScopeReasonCounts: Record<string, number> = {};
const reviewRouteCounts: Record<ReviewRoute, number> = { parser_fix: 0, human_review: 0 };
let unresolvedInternalGroups = 0;
let unresolvedRawRecordInternalGroups = 0;
for (const row of unresolvedAnalysisRows) {
  for (const reason of row.reason_tags) increment(unresolvedReasonCounts, reason);
  for (const reason of row.entry_scope_reasons) increment(entryScopeReasonCounts, reason);
  reviewRouteCounts[row.review_route] += 1;
  unresolvedInternalGroups += row.internal_groups.length;
  unresolvedRawRecordInternalGroups += row.internal_groups.filter(
    (group) => group.raw_records_with_multiple_display_values > 0
  ).length;
}

const summary: ConflictSummary = {
  generatedAt: new Date().toISOString(),
  status: "PHASE6_PRONUNCIATION_CONFLICTS_DRAFT",
  inputFacts: facts.length,
  uniqueHeadwords: factsByHeadword.size,
  conflictHeadwords: conflicts.length,
  bucketCounts,
  metadataGaps: {
    factsWithoutDialect: facts.filter((fact) => fact.dialect === null || fact.dialect === "").length,
    conflictFactsWithoutDialect: conflicts.reduce((sum, conflict) => sum + conflict.metadata_gaps.facts_without_dialect, 0),
    conflictHeadwordsWithoutDialect: conflicts.filter((conflict) => conflict.dialects.includes(null)).length,
    transcriptionSystemCounts
  },
  files: {
    conflicts: "data/processed/phase6/pronunciation-conflicts.jsonl",
    sample: "data/processed/phase6/pronunciation-conflicts.sample.jsonl",
    sourceEntryPolicy: "data/processed/phase6/pronunciation-source-entry-policy.json",
    entryScopeTriage: "data/processed/phase6/pronunciation-entry-scope-triage.json",
    unresolvedAnalysis: "data/processed/phase6/pronunciation-unresolved-analysis.json",
    unresolvedAnalysisDetails: "data/processed/phase6/pronunciation-unresolved-analysis.jsonl",
    unresolvedAnalysisSample: "data/processed/phase6/pronunciation-unresolved-analysis.sample.jsonl",
    humanReviewPacket: "data/processed/phase6/human-review-packet.json",
    humanReviewPacketTasks: "data/processed/phase6/human-review-packet.jsonl",
    humanReviewPacketSample: "data/processed/phase6/human-review-packet.sample.jsonl"
  },
  caveats: [
    "Formatting-only normalization strips paired IPA display delimiters such as brackets or slashes; it does not rewrite phones, tones or source values.",
    "Dialect remains null unless a source explicitly provides dialect metadata.",
    "Source/dialect, source-attested and unresolved buckets are audit classifications, not automatic merge decisions."
  ]
};

await writeJson(SUMMARY_PATH, summary);
await writeJsonl(CONFLICTS_PATH, conflicts);
await writeJsonl(SAMPLE_PATH, conflicts.slice(0, 500));
await writeJson(SOURCE_ENTRY_POLICY_PATH, {
  generatedAt: summary.generatedAt,
  status: "PHASE6_PRONUNCIATION_SOURCE_ENTRY_POLICY_DRAFT",
  policyVersion: "1.2.0",
  rules: [
    {
      rule_id: "preserve-distinct-raw-sounds",
      classification: "source_attested_variant",
      criteria:
        "A source/dialect/system group has multiple IPA display values, all variant values come from distinct sounds in one raw record, and the normalized headword has one source spelling.",
      action: "Preserve every fact and provenance record as a source-attested alternative; do not choose a scalar IPA."
    },
    {
      rule_id: "review-cross-entry-scope",
      classification: "unresolved",
      criteria:
        "A source/dialect/system group has differing IPA values across more than one raw record or the normalized headword combines source spellings.",
      action: "Keep in the review queue for entry/POS/form scope adjudication; do not auto-collapse."
    },
    {
      rule_id: "dialect-from-explicit-labels-only",
      classification: "metadata_policy",
      criteria: "Dialect labels must be present in raw sounds.tags or a recognized geographic sounds.note value.",
      action: "Leave dialect null when the source has no recognized explicit label; never infer it from IPA or sound order."
    },
    {
      rule_id: "route-entry-scope-review",
      classification: "entry_scope_policy",
      criteria:
        "A source-entry ID reused across raw hashes requires parser repair; distinct record IDs with form, POS or same-form/same-POS source variation require human review.",
      action: "Assign parser_fix only to ambiguous source-entry identities; otherwise assign human_review while preserving every pronunciation fact."
    }
  ],
  results: {
    conflictHeadwords: summary.conflictHeadwords,
    sourceAttestedVariantHeadwords: summary.bucketCounts.source_attested_variant,
    reviewQueueHeadwords: summary.bucketCounts.unresolved,
    reviewReasonCounts: unresolvedReasonCounts,
    entryScopeReasonCounts,
    reviewRouteCounts
  },
  files: {
    facts: "data/processed/phase6/pronunciation-facts.jsonl",
    conflicts: "data/processed/phase6/pronunciation-conflicts.jsonl",
    entryScopeTriage: "data/processed/phase6/pronunciation-entry-scope-triage.json",
    reviewQueue: "data/processed/phase6/pronunciation-unresolved-analysis.jsonl",
    reviewQueueSample: "data/processed/phase6/pronunciation-unresolved-analysis.sample.jsonl"
  },
  caveats: [
    "Source-attested means the source publishes separate raw sound elements; it is not a human judgment that every pronunciation is academically preferred.",
    "No policy rule selects or rewrites the compatibility scalar pronunciation_ipa.",
    "The unresolved analysis details file is the machine-readable review queue."
  ]
});
await writeJson(ENTRY_SCOPE_TRIAGE_PATH, {
  generatedAt: summary.generatedAt,
  status: "PHASE6_PRONUNCIATION_ENTRY_SCOPE_TRIAGE_DRAFT",
  queueRows: unresolvedAnalysisRows.length,
  reasonCounts: entryScopeReasonCounts,
  routeCounts: reviewRouteCounts,
  files: {
    details: "data/processed/phase6/pronunciation-unresolved-analysis.jsonl",
    sample: "data/processed/phase6/pronunciation-unresolved-analysis.sample.jsonl"
  },
  caveats: [
    "parser_fix is reserved for one source-entry ID reused across raw hashes; it does not authorize pronunciation merging.",
    "human_review covers distinct source records with normalized form, POS or same-form/same-POS variation.",
    "Every queue row remains unreviewed and preserves all raw IPA facts."
  ]
});
await writeJson(UNRESOLVED_ANALYSIS_PATH, {
  generatedAt: summary.generatedAt,
  status: "PHASE6_PRONUNCIATION_UNRESOLVED_ANALYSIS_DRAFT",
  unresolvedHeadwords: unresolvedAnalysisRows.length,
  internalConflictGroups: unresolvedInternalGroups,
  rawRecordInternalConflictGroups: unresolvedRawRecordInternalGroups,
  reasonCounts: unresolvedReasonCounts,
  entryScopeReasonCounts,
  reviewRouteCounts,
  files: {
    details: "data/processed/phase6/pronunciation-unresolved-analysis.jsonl",
    sample: "data/processed/phase6/pronunciation-unresolved-analysis.sample.jsonl"
  },
  caveats: [
    "Reason tags explain why the unresolved bucket remains open; they are not merge decisions.",
    "A same-raw-record internal conflict means one raw source record provides more than one IPA for the same source/dialect/system bucket.",
    "Pure same-record alternatives are classified as source_attested_variant and excluded from this review queue.",
    "No scalar IPA is selected from unresolved rows."
  ]
});
await writeJsonl(UNRESOLVED_ANALYSIS_DETAILS_PATH, unresolvedAnalysisRows);
await writeJsonl(UNRESOLVED_ANALYSIS_SAMPLE_PATH, unresolvedAnalysisRows.slice(0, 500));

const humanReviewPacket = buildHumanReviewPacket(unresolvedAnalysisRows, dialectGapRows, summary.generatedAt);
await writeJson(HUMAN_REVIEW_PACKET_PATH, humanReviewPacket.summary);
await writeJsonl(HUMAN_REVIEW_PACKET_TASKS_PATH, humanReviewPacket.tasks);
await writeJsonl(HUMAN_REVIEW_PACKET_SAMPLE_PATH, humanReviewPacket.tasks.slice(0, 500));

const phase6Index = await readJson<Phase6Index>(INDEX_PATH);
phase6Index.pronunciationConflictSummary = {
  conflictHeadwords: summary.conflictHeadwords,
  bucketCounts: summary.bucketCounts,
  metadataGaps: summary.metadataGaps
};
phase6Index.humanReviewPacket = {
  totalTasks: humanReviewPacket.summary.totalTasks,
  taskCounts: humanReviewPacket.summary.taskCounts,
  reviewStatusCounts: humanReviewPacket.summary.reviewStatusCounts
};
phase6Index.files = {
  ...phase6Index.files,
  pronunciationConflicts: "data/processed/phase6/pronunciation-conflicts.jsonl",
  pronunciationConflictSummary: "data/processed/phase6/pronunciation-conflicts.json",
  pronunciationSourceEntryPolicy: "data/processed/phase6/pronunciation-source-entry-policy.json",
  pronunciationEntryScopeTriage: "data/processed/phase6/pronunciation-entry-scope-triage.json",
  pronunciationUnresolvedAnalysis: "data/processed/phase6/pronunciation-unresolved-analysis.json",
  pronunciationUnresolvedAnalysisDetails: "data/processed/phase6/pronunciation-unresolved-analysis.jsonl",
  pronunciationUnresolvedAnalysisSample: "data/processed/phase6/pronunciation-unresolved-analysis.sample.jsonl",
  humanReviewPacket: "data/processed/phase6/human-review-packet.json",
  humanReviewPacketTasks: "data/processed/phase6/human-review-packet.jsonl",
  humanReviewPacketSample: "data/processed/phase6/human-review-packet.sample.jsonl"
};
await writeJson(INDEX_PATH, phase6Index);

await ensureDir(path.dirname(REPORT_PATH));
await writeFile(
  REPORT_PATH,
  `# Academic Phase 6 Pronunciation Conflicts 0.4.0

Generated: ${summary.generatedAt}

Status: **${summary.status}**

| Metric | Count |
| --- | ---: |
| Pronunciation facts | ${summary.inputFacts.toLocaleString("vi-VN")} |
| Headwords with pronunciation facts | ${summary.uniqueHeadwords.toLocaleString("vi-VN")} |
| Headwords with multiple raw IPA values | ${summary.conflictHeadwords.toLocaleString("vi-VN")} |
| Formatting-only conflicts | ${summary.bucketCounts.formatting_only.toLocaleString("vi-VN")} |
| Dialect/source variants | ${summary.bucketCounts.dialect_source_variant.toLocaleString("vi-VN")} |
| Source-attested same-entry variants | ${summary.bucketCounts.source_attested_variant.toLocaleString("vi-VN")} |
| Unresolved conflicts | ${summary.bucketCounts.unresolved.toLocaleString("vi-VN")} |
| Unresolved internal groups | ${unresolvedInternalGroups.toLocaleString("vi-VN")} |
| Unresolved same-raw-record groups | ${unresolvedRawRecordInternalGroups.toLocaleString("vi-VN")} |
| Review rows routed to parser fix | ${reviewRouteCounts.parser_fix.toLocaleString("vi-VN")} |
| Review rows routed to human review | ${reviewRouteCounts.human_review.toLocaleString("vi-VN")} |
| Human-review packet tasks | ${humanReviewPacket.summary.totalTasks.toLocaleString("vi-VN")} |
| Packet pronunciation conflict tasks | ${humanReviewPacket.summary.taskCounts.pronunciation_conflict_review.toLocaleString("vi-VN")} |
| Packet dialect-label tasks | ${humanReviewPacket.summary.taskCounts.dialect_label_review.toLocaleString("vi-VN")} |
| Facts without dialect metadata | ${summary.metadataGaps.factsWithoutDialect.toLocaleString("vi-VN")} |
| Conflict headwords without dialect metadata | ${summary.metadataGaps.conflictHeadwordsWithoutDialect.toLocaleString("vi-VN")} |

## Interpretation

- \`formatting_only\`: raw values differ only by paired display delimiters such as brackets or slashes. \`safe_display_ipa\` may be used for display, while all source facts remain unchanged.
- \`dialect_source_variant\`: each source/dialect/system bucket has one normalized display value, but buckets disagree. Keep variants separate until dialect/system metadata is stronger.
- \`source_attested_variant\`: one raw source entry publishes distinct sound elements in an internally variant source/dialect/system bucket. Preserve all of them as source-attested alternatives without selecting a scalar.
- \`unresolved\`: at least one source/dialect/system bucket has multiple normalized display values; do not select a scalar IPA without deeper review.
- Unresolved analysis explains whether the remaining issue comes from same raw records, multiple raw records in the same source/dialect bucket, or case/form variants.
- Entry-scope triage routes only reused source-entry IDs to parser repair. Distinct source records, including same-form/same-POS variants, require human review; neither route authorizes an IPA merge.
- The human-review packet combines ${humanReviewPacket.summary.taskCounts.pronunciation_conflict_review.toLocaleString("vi-VN")} unresolved pronunciation rows and ${humanReviewPacket.summary.taskCounts.dialect_label_review.toLocaleString("vi-VN")} manual dialect-label rows. Reviewer decision fields are blank by design.

Machine-readable artifacts:

- \`data/processed/phase6/pronunciation-conflicts.json\`
- \`data/processed/phase6/pronunciation-conflicts.jsonl\`
- \`data/processed/phase6/pronunciation-conflicts.sample.jsonl\`
- \`data/processed/phase6/pronunciation-source-entry-policy.json\`
- \`data/processed/phase6/pronunciation-entry-scope-triage.json\`
- \`data/processed/phase6/pronunciation-unresolved-analysis.json\`
- \`data/processed/phase6/pronunciation-unresolved-analysis.jsonl\`
- \`data/processed/phase6/pronunciation-unresolved-analysis.sample.jsonl\`
- \`data/processed/phase6/human-review-packet.json\`
- \`data/processed/phase6/human-review-packet.jsonl\`
- \`data/processed/phase6/human-review-packet.sample.jsonl\`
`,
  "utf8"
);

console.log(
  `[academic:phase6-conflicts] ${summary.status}: conflicts=${summary.conflictHeadwords.toLocaleString("vi-VN")}, ` +
    `formatting=${summary.bucketCounts.formatting_only.toLocaleString("vi-VN")}, ` +
    `sourceVariant=${summary.bucketCounts.dialect_source_variant.toLocaleString("vi-VN")}, ` +
    `sourceAttested=${summary.bucketCounts.source_attested_variant.toLocaleString("vi-VN")}, ` +
    `unresolved=${summary.bucketCounts.unresolved.toLocaleString("vi-VN")}, ` +
    `reviewPacket=${humanReviewPacket.summary.totalTasks.toLocaleString("vi-VN")}`
);
