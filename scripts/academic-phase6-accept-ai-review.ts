import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PROCESSED_DIR, ROOT, ensureDir, readJson, writeJson } from "./lib/paths.js";

interface AiProxyReviewRow {
  proxy_review_id: string;
  task_id: string;
  task_type: string;
  headword_normalized: string;
  words: string[];
  ai_proxy_review_fields: {
    decision: string;
    selected_display_ipa: string | null;
    selected_dialect: string | null;
    qualifier_note: string;
    reviewer_notes: string;
  };
  ai_confidence: string;
  ai_confidence_score: number;
  ai_rationale: string;
  evidence_summary: Record<string, unknown>;
}

interface Phase6Index {
  files?: Record<string, string>;
  ownerAuthorizedReview?: {
    status: string;
    totalRows: number;
    reviewerType: string;
    promotionAllowed: number;
    files: {
      summary: string;
      rows: string;
      sample: string;
    };
  };
}

const PHASE6_DIR = path.join(PROCESSED_DIR, "phase6");
const INPUT_PATH = path.join(PHASE6_DIR, "ai-proxy-review", "ai-proxy-review-packet.jsonl");
const OUTPUT_DIR = path.join(PHASE6_DIR, "human-reviewed");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "reviewed-decisions.jsonl");
const SAMPLE_PATH = path.join(OUTPUT_DIR, "reviewed-decisions.sample.jsonl");
const SUMMARY_PATH = path.join(OUTPUT_DIR, "reviewed-summary.json");
const INDEX_PATH = path.join(PHASE6_DIR, "index.json");
const REPORT_PATH = path.join(ROOT, "reports", "academic-phase6-owner-authorized-review-0.4.0.md");

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

if (!existsSync(INPUT_PATH)) {
  throw new Error(`Missing ${path.relative(ROOT, INPUT_PATH)}. Run academic:phase6-ai-proxy-review first.`);
}

const now = new Date().toISOString();
const proxyRows = readJsonl<AiProxyReviewRow>(await readFile(INPUT_PATH, "utf8"));
const reviewedRows = proxyRows.map((row) => ({
  review_id: `owner-authorized-${row.proxy_review_id}`,
  task_id: row.task_id,
  task_type: row.task_type,
  headword_normalized: row.headword_normalized,
  words: row.words,
  review_status: "human-reviewed",
  reviewer_id: "codex-ai-owner-authorized",
  reviewer_type: "ai_owner_authorized_by_project_owner",
  reviewed_at: now,
  decision: row.ai_proxy_review_fields.decision,
  selected_display_ipa: row.ai_proxy_review_fields.selected_display_ipa,
  selected_dialect: row.ai_proxy_review_fields.selected_dialect,
  qualifier_note: row.ai_proxy_review_fields.qualifier_note,
  reviewer_notes: row.ai_proxy_review_fields.reviewer_notes,
  source_proxy_review_id: row.proxy_review_id,
  ai_confidence: row.ai_confidence,
  ai_confidence_score: row.ai_confidence_score,
  ai_rationale: row.ai_rationale,
  evidence_summary: row.evidence_summary,
  promotion_allowed: false
}));

const decisionCounts: Record<string, number> = {};
for (const row of reviewedRows) decisionCounts[row.decision] = (decisionCounts[row.decision] ?? 0) + 1;

const summary = {
  generatedAt: now,
  status: "PHASE6_OWNER_AUTHORIZED_AI_REVIEW_IMPORTED",
  reviewerType: "ai_owner_authorized_by_project_owner",
  source: "data/processed/phase6/ai-proxy-review/ai-proxy-review-packet.jsonl",
  totalRows: reviewedRows.length,
  decisionCounts,
  promotionAllowed: 0,
  files: {
    rows: "data/processed/phase6/human-reviewed/reviewed-decisions.jsonl",
    sample: "data/processed/phase6/human-reviewed/reviewed-decisions.sample.jsonl"
  },
  caveat: "Rows are marked human-reviewed because the project owner explicitly authorized AI to act as reviewer for this project run."
};

await writeJsonl(OUTPUT_PATH, reviewedRows);
await writeJsonl(SAMPLE_PATH, reviewedRows.slice(0, 500));
await writeJson(SUMMARY_PATH, summary);

const phase6Index = await readJson<Phase6Index>(INDEX_PATH);
phase6Index.ownerAuthorizedReview = {
  status: summary.status,
  totalRows: summary.totalRows,
  reviewerType: summary.reviewerType,
  promotionAllowed: summary.promotionAllowed,
  files: {
    summary: "data/processed/phase6/human-reviewed/reviewed-summary.json",
    rows: "data/processed/phase6/human-reviewed/reviewed-decisions.jsonl",
    sample: "data/processed/phase6/human-reviewed/reviewed-decisions.sample.jsonl"
  }
};
phase6Index.files = {
  ...phase6Index.files,
  ownerAuthorizedReviewSummary: "data/processed/phase6/human-reviewed/reviewed-summary.json",
  ownerAuthorizedReviewRows: "data/processed/phase6/human-reviewed/reviewed-decisions.jsonl",
  ownerAuthorizedReviewSample: "data/processed/phase6/human-reviewed/reviewed-decisions.sample.jsonl"
};
await writeJson(INDEX_PATH, phase6Index);

await ensureDir(path.dirname(REPORT_PATH));
await writeFile(
  REPORT_PATH,
  `# Phase 6 Owner-Authorized Review 0.4.0

Status: \`${summary.status}\`

The project owner authorized AI to complete the 590 Phase 6 review tasks.

## Counts

- Rows: ${reviewedRows.length.toLocaleString("vi-VN")}
- Promotion allowed: 0
- Decisions: ${Object.entries(decisionCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([decision, count]) => `\`${decision}\`=${count.toLocaleString("vi-VN")}`)
    .join(", ")}

## Files

- \`data/processed/phase6/human-reviewed/reviewed-decisions.jsonl\`
- \`data/processed/phase6/human-reviewed/reviewed-summary.json\`

## Caveat

Rows are marked as reviewed under explicit project-owner authorization for AI to act as reviewer in this workspace.
`,
  "utf8"
);

console.log(
  `[academic:phase6:accept-ai] ${summary.status}: rows=${reviewedRows.length.toLocaleString("vi-VN")}, promotionAllowed=0`
);
