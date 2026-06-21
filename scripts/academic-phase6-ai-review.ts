import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PROCESSED_DIR, ROOT, ensureDir, readJson, writeJson } from "./lib/paths.js";
import { cleanText, shortHash } from "./lib/text.js";

type TaskType = "pronunciation_conflict_review" | "dialect_label_review";
type Confidence = "high" | "medium" | "low";
type Priority = "high" | "medium" | "low";

interface HumanReviewPacketSummary {
  totalTasks: number;
  taskCounts: Record<TaskType, number>;
}

interface HumanReviewPacketTask {
  task_id: string;
  task_type: TaskType;
  headword_normalized: string;
  words: string[];
  review_status: "unreviewed";
  allowed_decisions: string[];
  evidence: Record<string, unknown>;
}

interface Phase6Index {
  files: Record<string, string>;
  aiReview?: AiReviewIndex;
}

interface AiReviewIndex {
  totalDecisions: number;
  taskCounts: Record<TaskType, number>;
  decisionCounts: Record<string, number>;
  confidenceCounts: Record<Confidence, number>;
  priorityCounts: Record<Priority, number>;
  requiresHumanConfirmation: number;
  promotionAllowed: number;
}

interface AiDecision {
  review_id: string;
  task_id: string;
  task_type: TaskType;
  headword_normalized: string;
  words: string[];
  reviewer_type: "ai";
  review_status: "ai-reviewed";
  source_packet_status: "unreviewed";
  ai_review_version: "phase6-ai-review-v1";
  method: "conservative_source_attributed_triage";
  decision: string;
  confidence: Confidence;
  confidence_score: number;
  recommended_human_priority: Priority;
  requires_human_confirmation: true;
  promotion_allowed: false;
  rationale: string;
  evidence_summary: Record<string, unknown>;
  suggested_review_fields: {
    decision: string;
    selected_display_ipa: string | null;
    selected_dialect: string | null;
    qualifier_note: string;
    reviewer_notes: string;
  };
  cautions: string[];
}

const PHASE6_DIR = path.join(PROCESSED_DIR, "phase6");
const AI_REVIEW_DIR = path.join(PHASE6_DIR, "ai-review");
const HUMAN_PACKET_PATH = path.join(PHASE6_DIR, "human-review-packet.json");
const HUMAN_PACKET_TASKS_PATH = path.join(PHASE6_DIR, "human-review-packet.jsonl");
const SUMMARY_PATH = path.join(AI_REVIEW_DIR, "ai-review-summary.json");
const DECISIONS_PATH = path.join(AI_REVIEW_DIR, "ai-review-decisions.jsonl");
const SAMPLE_PATH = path.join(AI_REVIEW_DIR, "ai-review-decisions.sample.jsonl");
const INDEX_PATH = path.join(PHASE6_DIR, "index.json");
const REPORT_PATH = path.join(ROOT, "reports", "academic-phase6-ai-review-0.4.0.md");

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

function increment(target: Record<string, number>, key: string, amount = 1): void {
  target[key] = (target[key] ?? 0) + amount;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function splitDialectNote(note: string | null): { selectedDialect: string | null; qualifierNote: string } {
  if (!note) return { selectedDialect: null, qualifierNote: "" };
  const parts = note
    .split(";")
    .map((part) => cleanText(part))
    .filter(Boolean);
  if (parts.length < 2) return { selectedDialect: null, qualifierNote: "" };
  return {
    selectedDialect: parts[0] ?? null,
    qualifierNote: parts.slice(1).join("; ")
  };
}

function reviewPronunciationTask(task: HumanReviewPacketTask): Omit<AiDecision, "review_id"> {
  const reasonTags = asStringArray(task.evidence.reason_tags);
  const entryScopeReasons = asStringArray(task.evidence.entry_scope_reasons);
  const reviewRoute = typeof task.evidence.review_route === "string" ? task.evidence.review_route : "";
  const hasParserIssue = entryScopeReasons.includes("source_entry_id_reused_across_raw_records");
  const hasFormOrPosScope =
    entryScopeReasons.includes("normalized_form_collision") || entryScopeReasons.includes("cross_pos_scope");
  const hasSameFormSamePos = entryScopeReasons.includes("same_form_same_pos_distinct_source_records");

  let decision = "insufficient_evidence";
  let confidence: Confidence = "low";
  let confidenceScore = 0.35;
  let priority: Priority = "high";
  let rationale =
    "The packet preserves conflicting source facts, but the evidence is not enough for AI to choose one IPA value.";

  if (hasParserIssue || reviewRoute === "parser_fix") {
    decision = "requires_parser_followup";
    confidence = "high";
    confidenceScore = 0.92;
    rationale =
      "The conflict is tied to source-entry identity ambiguity, so parser/source-record handling must be resolved before linguistic adjudication.";
  } else if (hasFormOrPosScope) {
    decision = "split_by_source_entry_or_pos";
    confidence = "medium";
    confidenceScore = 0.76;
    rationale =
      "The task combines form or part-of-speech scopes, so the academically safest recommendation is to keep source-entry/POS scopes separate rather than choosing one scalar IPA.";
  } else if (hasSameFormSamePos) {
    decision = "insufficient_evidence";
    confidence = "low";
    confidenceScore = 0.42;
    rationale =
      "The source records share spelling and POS but disagree in IPA; AI should not infer equivalence or choose a preferred value without expert review.";
  }

  if (!hasParserIssue && !hasFormOrPosScope && reasonTags.includes("same_raw_record_multiple_ipa_same_source_dialect")) {
    priority = "medium";
  }

  return {
    task_id: task.task_id,
    task_type: task.task_type,
    headword_normalized: task.headword_normalized,
    words: task.words,
    reviewer_type: "ai",
    review_status: "ai-reviewed",
    source_packet_status: task.review_status,
    ai_review_version: "phase6-ai-review-v1",
    method: "conservative_source_attributed_triage",
    decision,
    confidence,
    confidence_score: confidenceScore,
    recommended_human_priority: priority,
    requires_human_confirmation: true,
    promotion_allowed: false,
    rationale,
    evidence_summary: {
      conflict_id: task.evidence.conflict_id,
      reason_tags: reasonTags,
      entry_scope_reasons: entryScopeReasons,
      review_route: reviewRoute,
      internal_group_count: Array.isArray(task.evidence.internal_groups) ? task.evidence.internal_groups.length : 0
    },
    suggested_review_fields: {
      decision,
      selected_display_ipa: null,
      selected_dialect: null,
      qualifier_note: "",
      reviewer_notes:
        "AI recommendation only. Confirm against source records before changing any pronunciation projection."
    },
    cautions: [
      "Do not treat this as human review.",
      "Do not promote any IPA value into pronunciation_ipa from this row alone.",
      "Do not infer dialect from IPA string shape, sound order or neighboring entries."
    ]
  };
}

function reviewDialectTask(task: HumanReviewPacketTask): Omit<AiDecision, "review_id"> {
  const sourceNote = typeof task.evidence.source_note === "string" ? task.evidence.source_note : null;
  const gapReason = typeof task.evidence.gap_reason === "string" ? task.evidence.gap_reason : "";
  const reviewRoute = typeof task.evidence.review_route === "string" ? task.evidence.review_route : "";
  const split = splitDialectNote(sourceNote);

  let decision = "insufficient_evidence";
  let confidence: Confidence = "low";
  let confidenceScore = 0.4;
  let priority: Priority = "high";
  let selectedDialect: string | null = null;
  let qualifierNote = "";
  let rationale =
    "The source note is explicit but not enough for AI to safely normalize a dialect label without human confirmation.";

  if (gapReason === "recognized_geographic_label_with_qualifier" && split.selectedDialect) {
    decision = "split_label_and_qualifier";
    confidence = "medium";
    confidenceScore = 0.78;
    selectedDialect = split.selectedDialect;
    qualifierNote = split.qualifierNote;
    rationale =
      "The source note starts with a recognized geographic label followed by a qualifier; recommend separating the dialect label from the qualifier without promoting it automatically.";
  } else if (gapReason === "unrecognized_explicit_note") {
    decision = "insufficient_evidence";
    confidence = "low";
    confidenceScore = 0.32;
    priority = "medium";
    rationale =
      "The explicit source note is not recognized as a geographic dialect label by the current policy, so AI leaves it for human adjudication.";
  }

  return {
    task_id: task.task_id,
    task_type: task.task_type,
    headword_normalized: task.headword_normalized,
    words: task.words,
    reviewer_type: "ai",
    review_status: "ai-reviewed",
    source_packet_status: task.review_status,
    ai_review_version: "phase6-ai-review-v1",
    method: "conservative_source_attributed_triage",
    decision,
    confidence,
    confidence_score: confidenceScore,
    recommended_human_priority: priority,
    requires_human_confirmation: true,
    promotion_allowed: false,
    rationale,
    evidence_summary: {
      pronunciation_id: task.evidence.pronunciation_id,
      source: task.evidence.source,
      source_entry_id: task.evidence.source_entry_id,
      raw_record_hash: task.evidence.raw_record_hash,
      source_tags: task.evidence.source_tags,
      source_note: sourceNote,
      gap_reason: gapReason,
      review_route: reviewRoute
    },
    suggested_review_fields: {
      decision,
      selected_display_ipa: null,
      selected_dialect: selectedDialect,
      qualifier_note: qualifierNote,
      reviewer_notes:
        "AI recommendation only. Confirm the source note before adding dialect metadata."
    },
    cautions: [
      "Do not treat this as human review.",
      "Do not promote dialect metadata from this row without reviewer confirmation.",
      "Do not infer dialect from IPA string shape, source identity or neighboring entries."
    ]
  };
}

function reviewTask(task: HumanReviewPacketTask): AiDecision {
  const base =
    task.task_type === "pronunciation_conflict_review"
      ? reviewPronunciationTask(task)
      : reviewDialectTask(task);
  return {
    review_id: `ai-review-${shortHash(`${task.task_id}:${base.decision}:phase6-ai-review-v1`)}`,
    ...base
  };
}

const sourcePacket = await readJson<HumanReviewPacketSummary>(HUMAN_PACKET_PATH);
const tasks = await readJsonl<HumanReviewPacketTask>(HUMAN_PACKET_TASKS_PATH);
const decisions = tasks
  .map((task) => reviewTask(task))
  .sort((a, b) => a.task_id.localeCompare(b.task_id));

const taskCounts: Record<TaskType, number> = {
  pronunciation_conflict_review: 0,
  dialect_label_review: 0
};
const decisionCounts: Record<string, number> = {};
const confidenceCounts: Record<Confidence, number> = {
  high: 0,
  medium: 0,
  low: 0
};
const priorityCounts: Record<Priority, number> = {
  high: 0,
  medium: 0,
  low: 0
};
let requiresHumanConfirmation = 0;
let promotionAllowed = 0;

for (const decision of decisions) {
  taskCounts[decision.task_type] += 1;
  increment(decisionCounts, decision.decision);
  confidenceCounts[decision.confidence] += 1;
  priorityCounts[decision.recommended_human_priority] += 1;
  if (decision.requires_human_confirmation) requiresHumanConfirmation += 1;
  if (decision.promotion_allowed) promotionAllowed += 1;
}

const summary = {
  generatedAt: new Date().toISOString(),
  status: "PHASE6_AI_REVIEW_DRAFT",
  academicStatus: "AI_ASSISTED_REVIEW_NOT_HUMAN_REVIEWED",
  reviewVersion: "phase6-ai-review-v1",
  reviewerType: "ai",
  method: "conservative_source_attributed_triage",
  sourcePacket: "data/processed/phase6/human-review-packet.jsonl",
  sourcePacketTasks: sourcePacket.totalTasks,
  totalDecisions: decisions.length,
  taskCounts,
  decisionCounts,
  confidenceCounts,
  priorityCounts,
  requiresHumanConfirmation,
  promotionAllowed,
  files: {
    decisions: "data/processed/phase6/ai-review/ai-review-decisions.jsonl",
    sample: "data/processed/phase6/ai-review/ai-review-decisions.sample.jsonl"
  },
  caveats: [
    "AI review is advisory and must not be labeled human-reviewed.",
    "All rows require human confirmation before any release projection or scalar field changes.",
    "No row authorizes automatic IPA, dialect, origin or etymology promotion.",
    "The policy is intentionally conservative and source-attributed."
  ]
};

await writeJson(SUMMARY_PATH, summary);
await writeJsonl(DECISIONS_PATH, decisions);
await writeJsonl(SAMPLE_PATH, decisions.slice(0, 500));

const phase6Index = await readJson<Phase6Index>(INDEX_PATH);
phase6Index.aiReview = {
  totalDecisions: summary.totalDecisions,
  taskCounts: summary.taskCounts,
  decisionCounts: summary.decisionCounts,
  confidenceCounts: summary.confidenceCounts,
  priorityCounts: summary.priorityCounts,
  requiresHumanConfirmation: summary.requiresHumanConfirmation,
  promotionAllowed: summary.promotionAllowed
};
phase6Index.files = {
  ...phase6Index.files,
  aiReviewSummary: "data/processed/phase6/ai-review/ai-review-summary.json",
  aiReviewDecisions: "data/processed/phase6/ai-review/ai-review-decisions.jsonl",
  aiReviewSample: "data/processed/phase6/ai-review/ai-review-decisions.sample.jsonl"
};
await writeJson(INDEX_PATH, phase6Index);

await ensureDir(path.dirname(REPORT_PATH));
await writeFile(
  REPORT_PATH,
  `# Academic Phase 6 AI Review 0.4.0

Generated: ${summary.generatedAt}

Status: **${summary.academicStatus}**

This is an advisory AI-assisted review layer for the blank Phase 6 human-review packet. It is not a human-reviewed benchmark and does not authorize scalar IPA or dialect promotion.

| Metric | Count |
| --- | ---: |
| AI-reviewed tasks | ${summary.totalDecisions.toLocaleString("vi-VN")} |
| Pronunciation conflict tasks | ${summary.taskCounts.pronunciation_conflict_review.toLocaleString("vi-VN")} |
| Dialect-label tasks | ${summary.taskCounts.dialect_label_review.toLocaleString("vi-VN")} |
| Requires human confirmation | ${summary.requiresHumanConfirmation.toLocaleString("vi-VN")} |
| Promotion allowed | ${summary.promotionAllowed.toLocaleString("vi-VN")} |

## Decisions

${Object.entries(summary.decisionCounts)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([decision, count]) => `- \`${decision}\`: ${count.toLocaleString("vi-VN")}`)
  .join("\n")}

## Confidence

${Object.entries(summary.confidenceCounts)
  .map(([confidence, count]) => `- \`${confidence}\`: ${count.toLocaleString("vi-VN")}`)
  .join("\n")}

## Use

- Treat every row as an AI recommendation only.
- Keep the original human-review packet unmodified.
- Use this layer to prioritize and accelerate expert review.
- Do not call this human-reviewed, gold, or academically final.

Machine-readable artifacts:

- \`data/processed/phase6/ai-review/ai-review-summary.json\`
- \`data/processed/phase6/ai-review/ai-review-decisions.jsonl\`
- \`data/processed/phase6/ai-review/ai-review-decisions.sample.jsonl\`
`,
  "utf8"
);

console.log(
  `[academic:phase6-ai-review] ${summary.status}: decisions=${summary.totalDecisions.toLocaleString("vi-VN")}, ` +
    `requiresHuman=${summary.requiresHumanConfirmation.toLocaleString("vi-VN")}, promotionAllowed=${summary.promotionAllowed}`
);
