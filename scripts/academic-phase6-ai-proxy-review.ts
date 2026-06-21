import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PROCESSED_DIR, ROOT, ensureDir, readJson, writeJson } from "./lib/paths.js";

interface AiDecision {
  review_id: string;
  task_id: string;
  task_type: "pronunciation_conflict_review" | "dialect_label_review";
  headword_normalized: string;
  words: string[];
  decision: string;
  confidence: "high" | "medium" | "low";
  confidence_score: number;
  recommended_human_priority: "high" | "medium" | "low";
  requires_human_confirmation: boolean;
  promotion_allowed: boolean;
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

interface Phase6Index {
  files?: Record<string, string>;
  aiProxyReview?: {
    status: string;
    totalRows: number;
    importEligible: number;
    countsAsHumanReview: boolean;
    files: {
      summary: string;
      rows: string;
      sample: string;
    };
  };
}

interface AiProxyReviewRow {
  proxy_review_id: string;
  source_ai_review_id: string;
  task_id: string;
  task_type: string;
  headword_normalized: string;
  words: string[];
  ai_proxy_review_status: "ai-proxy-reviewed";
  reviewer_type: "ai";
  ai_proxy_reviewer_id: "ai-proxy-phase6-v1";
  ai_proxy_review_fields: {
    decision: string;
    selected_display_ipa: string | null;
    selected_dialect: string | null;
    qualifier_note: string;
    reviewer_notes: string;
  };
  ai_confidence: "high" | "medium" | "low";
  ai_confidence_score: number;
  ai_priority: "high" | "medium" | "low";
  ai_rationale: string;
  evidence_summary: Record<string, unknown>;
  import_eligible: false;
  counts_as_human_review: false;
  requires_human_confirmation: true;
  promotion_allowed: false;
  cautions: string[];
}

const PHASE6_DIR = path.join(PROCESSED_DIR, "phase6");
const AI_REVIEW_PATH = path.join(PHASE6_DIR, "ai-review", "ai-review-decisions.jsonl");
const OUTPUT_DIR = path.join(PHASE6_DIR, "ai-proxy-review");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "ai-proxy-review-packet.jsonl");
const SAMPLE_PATH = path.join(OUTPUT_DIR, "ai-proxy-review-packet.sample.jsonl");
const SUMMARY_PATH = path.join(OUTPUT_DIR, "ai-proxy-review-summary.json");
const INDEX_PATH = path.join(PHASE6_DIR, "index.json");
const REPORT_PATH = path.join(ROOT, "reports", "academic-phase6-ai-proxy-review-0.4.0.md");

function readJsonl<T>(text: string): T[] {
  return text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

async function writeJsonl(filePath: string, rows: unknown[]): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

if (!existsSync(AI_REVIEW_PATH)) {
  throw new Error(`Missing ${path.relative(ROOT, AI_REVIEW_PATH)}. Run academic:phase6-ai-review first.`);
}

const decisions = readJsonl<AiDecision>(await readFile(AI_REVIEW_PATH, "utf8"));
const rows: AiProxyReviewRow[] = decisions.map((decision) => ({
  proxy_review_id: `ai-proxy-${decision.review_id.replace(/^ai-review-/, "")}`,
  source_ai_review_id: decision.review_id,
  task_id: decision.task_id,
  task_type: decision.task_type,
  headword_normalized: decision.headword_normalized,
  words: decision.words,
  ai_proxy_review_status: "ai-proxy-reviewed",
  reviewer_type: "ai",
  ai_proxy_reviewer_id: "ai-proxy-phase6-v1",
  ai_proxy_review_fields: {
    decision: decision.suggested_review_fields.decision,
    selected_display_ipa: decision.suggested_review_fields.selected_display_ipa,
    selected_dialect: decision.suggested_review_fields.selected_dialect,
    qualifier_note: decision.suggested_review_fields.qualifier_note,
    reviewer_notes: `${decision.suggested_review_fields.reviewer_notes} This is an AI proxy review, not a human decision.`
  },
  ai_confidence: decision.confidence,
  ai_confidence_score: decision.confidence_score,
  ai_priority: decision.recommended_human_priority,
  ai_rationale: decision.rationale,
  evidence_summary: decision.evidence_summary,
  import_eligible: false,
  counts_as_human_review: false,
  requires_human_confirmation: true,
  promotion_allowed: false,
  cautions: [
    ...decision.cautions,
    "Do not import this packet as human-reviewed data.",
    "Use it only to accelerate a real reviewer filling the official human fields."
  ]
}));

const decisionCounts: Record<string, number> = {};
const confidenceCounts: Record<string, number> = {};
const priorityCounts: Record<string, number> = {};
for (const row of rows) {
  decisionCounts[row.ai_proxy_review_fields.decision] = (decisionCounts[row.ai_proxy_review_fields.decision] ?? 0) + 1;
  confidenceCounts[row.ai_confidence] = (confidenceCounts[row.ai_confidence] ?? 0) + 1;
  priorityCounts[row.ai_priority] = (priorityCounts[row.ai_priority] ?? 0) + 1;
}

const summary = {
  generatedAt: new Date().toISOString(),
  status: "PHASE6_AI_PROXY_REVIEW_NOT_HUMAN_REVIEWED",
  reviewerType: "ai",
  sourceAiReview: "data/processed/phase6/ai-review/ai-review-decisions.jsonl",
  totalRows: rows.length,
  decisionCounts,
  confidenceCounts,
  priorityCounts,
  importEligible: 0,
  countsAsHumanReview: false,
  requiresHumanConfirmation: rows.length,
  promotionAllowed: 0,
  files: {
    rows: "data/processed/phase6/ai-proxy-review/ai-proxy-review-packet.jsonl",
    sample: "data/processed/phase6/ai-proxy-review/ai-proxy-review-packet.sample.jsonl"
  },
  caveats: [
    "AI proxy review is a prefill aid only.",
    "It must not be renamed, imported, or reported as human-reviewed.",
    "All rows still require human/expert confirmation before projection."
  ]
};

await writeJsonl(OUTPUT_PATH, rows);
await writeJsonl(SAMPLE_PATH, rows.slice(0, 500));
await writeJson(SUMMARY_PATH, summary);

const phase6Index = await readJson<Phase6Index>(INDEX_PATH);
phase6Index.aiProxyReview = {
  status: summary.status,
  totalRows: summary.totalRows,
  importEligible: summary.importEligible,
  countsAsHumanReview: summary.countsAsHumanReview,
  files: {
    summary: "data/processed/phase6/ai-proxy-review/ai-proxy-review-summary.json",
    rows: "data/processed/phase6/ai-proxy-review/ai-proxy-review-packet.jsonl",
    sample: "data/processed/phase6/ai-proxy-review/ai-proxy-review-packet.sample.jsonl"
  }
};
phase6Index.files = {
  ...phase6Index.files,
  aiProxyReviewSummary: "data/processed/phase6/ai-proxy-review/ai-proxy-review-summary.json",
  aiProxyReviewRows: "data/processed/phase6/ai-proxy-review/ai-proxy-review-packet.jsonl",
  aiProxyReviewSample: "data/processed/phase6/ai-proxy-review/ai-proxy-review-packet.sample.jsonl"
};
await writeJson(INDEX_PATH, phase6Index);

await ensureDir(path.dirname(REPORT_PATH));
await writeFile(
  REPORT_PATH,
  `# Phase 6 AI Proxy Review 0.4.0

Status: \`${summary.status}\`

This packet fills reviewer-like fields from the existing AI advisory layer, but every row is explicitly blocked from import as human review.

## Counts

- Rows: ${rows.length.toLocaleString("vi-VN")}
- Import eligible: 0
- Counts as human review: false
- Requires human confirmation: ${rows.length.toLocaleString("vi-VN")}
- Promotion allowed: 0

## Decision Counts

${Object.entries(decisionCounts)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([decision, count]) => `- \`${decision}\`: ${count.toLocaleString("vi-VN")}`)
  .join("\n")}

## Files

- \`data/processed/phase6/ai-proxy-review/ai-proxy-review-summary.json\`
- \`data/processed/phase6/ai-proxy-review/ai-proxy-review-packet.jsonl\`
- \`data/processed/phase6/ai-proxy-review/ai-proxy-review-packet.sample.jsonl\`

## Rule

Use this as a reviewer prefill aid only. It is not a human-reviewed layer and must not authorize scalar IPA, dialect, origin, etymology, or sense projection.
`,
  "utf8"
);

console.log(
  `[academic:phase6-ai-proxy-review] ${summary.status}: rows=${rows.length.toLocaleString("vi-VN")}, importEligible=0`
);
