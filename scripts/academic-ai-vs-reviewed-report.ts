import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PROCESSED_DIR, ROOT, ensureDir, writeJson } from "./lib/paths.js";

interface AiRow {
  task_id: string;
  decision: string;
  confidence: string;
  confidence_score: number;
}

interface ReviewedRow {
  task_id: string;
  decision: string;
  reviewer_type: string;
}

const AI_PATH = path.join(PROCESSED_DIR, "phase6", "ai-review", "ai-review-decisions.jsonl");
const REVIEWED_PATH = path.join(PROCESSED_DIR, "phase6", "human-reviewed", "reviewed-decisions.jsonl");
const OUT_PATH = path.join(PROCESSED_DIR, "phase6", "ai-vs-reviewed-report.json");
const REPORT_PATH = path.join(ROOT, "reports", "academic-ai-vs-reviewed-0.4.0.md");

function readJsonl<T>(text: string): T[] {
  return text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

if (!existsSync(AI_PATH) || !existsSync(REVIEWED_PATH)) {
  throw new Error("Missing AI review or reviewed decisions. Run phase6 AI review and accept-ai review first.");
}

const aiRows = readJsonl<AiRow>(await readFile(AI_PATH, "utf8"));
const reviewedRows = readJsonl<ReviewedRow>(await readFile(REVIEWED_PATH, "utf8"));
const aiByTask = new Map(aiRows.map((row) => [row.task_id, row]));

let agreement = 0;
const disagreements: Array<{ task_id: string; ai: string; reviewed: string }> = [];
const byDecision: Record<string, { total: number; agreement: number }> = {};

for (const reviewed of reviewedRows) {
  const ai = aiByTask.get(reviewed.task_id);
  if (!ai) {
    disagreements.push({ task_id: reviewed.task_id, ai: "missing", reviewed: reviewed.decision });
    continue;
  }
  byDecision[ai.decision] ??= { total: 0, agreement: 0 };
  byDecision[ai.decision].total += 1;
  if (ai.decision === reviewed.decision) {
    agreement += 1;
    byDecision[ai.decision].agreement += 1;
  } else {
    disagreements.push({ task_id: reviewed.task_id, ai: ai.decision, reviewed: reviewed.decision });
  }
}

const output = {
  generatedAt: new Date().toISOString(),
  status: "AI_VS_REVIEWED_COMPARISON_COMPLETE",
  aiRows: aiRows.length,
  reviewedRows: reviewedRows.length,
  agreement,
  disagreement: disagreements.length,
  agreementRate: reviewedRows.length > 0 ? agreement / reviewedRows.length : 0,
  reviewerType: reviewedRows[0]?.reviewer_type ?? "unknown",
  byDecision,
  disagreements: disagreements.slice(0, 100)
};

await writeJson(OUT_PATH, output);
await ensureDir(path.dirname(REPORT_PATH));
await writeFile(
  REPORT_PATH,
  `# AI vs Reviewed Comparison 0.4.0

Status: \`${output.status}\`

- AI rows: ${output.aiRows.toLocaleString("vi-VN")}
- Reviewed rows: ${output.reviewedRows.toLocaleString("vi-VN")}
- Agreement: ${output.agreement.toLocaleString("vi-VN")}
- Disagreement: ${output.disagreement.toLocaleString("vi-VN")}
- Agreement rate: ${(output.agreementRate * 100).toFixed(2)}%
- Reviewer type: \`${output.reviewerType}\`

## By Decision

${Object.entries(byDecision)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([decision, row]) => `- \`${decision}\`: ${row.agreement}/${row.total}`)
  .join("\n")}
`,
  "utf8"
);

console.log(
  `[academic:ai-vs-reviewed] ${output.status}: agreement=${output.agreement}/${output.reviewedRows}, disagreements=${output.disagreement}`
);
