import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ROOT, ensureDir, writeJson } from "./lib/paths.js";

interface AiProxyPair {
  id: string;
  word: string;
  left: { sense_id?: string | null; source?: string; index?: number; meaning: string };
  right: { sense_id?: string | null; source?: string; index?: number; meaning: string };
  ai_proxy_label: string;
  ai_proxy_confidence: string;
  ai_proxy_score: number;
  ai_proxy_rationale: string;
}

const AUDIT_DIR = path.join(ROOT, "data", "audit", "academic");
const INPUT_PATH = path.join(AUDIT_DIR, "ai-proxy-gold-sense-pairs.jsonl");
const GOLD_PATH = path.join(AUDIT_DIR, "gold-sense-pairs.jsonl");
const SUMMARY_PATH = path.join(AUDIT_DIR, "owner-authorized-gold-summary.json");
const REPORT_PATH = path.join(ROOT, "reports", "academic-owner-authorized-gold-0.4.0.md");

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
  throw new Error(`Missing ${path.relative(ROOT, INPUT_PATH)}. Run academic:ai-proxy-gold first.`);
}

const rows = readJsonl<AiProxyPair>(await readFile(INPUT_PATH, "utf8"));
const acceptedRows = rows.map((row) => ({
  id: row.id,
  word: row.word,
  label: row.ai_proxy_label,
  left: row.left,
  right: row.right,
  reviewer_id: "codex-ai-owner-authorized",
  reviewer_type: "ai_owner_authorized_by_project_owner",
  reviewed_at: new Date().toISOString(),
  reviewer_notes: `Owner-authorized AI label. confidence=${row.ai_proxy_confidence}; score=${row.ai_proxy_score}; rationale=${row.ai_proxy_rationale}`
}));

const labelCounts: Record<string, number> = {};
for (const row of acceptedRows) labelCounts[row.label] = (labelCounts[row.label] ?? 0) + 1;

const summary = {
  generatedAt: new Date().toISOString(),
  status: "OWNER_AUTHORIZED_AI_GOLD_CREATED",
  input: "data/audit/academic/ai-proxy-gold-sense-pairs.jsonl",
  output: "data/audit/academic/gold-sense-pairs.jsonl",
  rows: acceptedRows.length,
  labelCounts,
  reviewerType: "ai_owner_authorized_by_project_owner",
  caveat: "This is project-owner-authorized AI labeling, not independent expert labeling."
};

await writeJsonl(GOLD_PATH, acceptedRows);
await writeJson(SUMMARY_PATH, summary);
await ensureDir(path.dirname(REPORT_PATH));
await writeFile(
  REPORT_PATH,
  `# Owner-Authorized Gold Labels 0.4.0

Status: \`${summary.status}\`

The project owner authorized AI to complete the 1,000-pair sense benchmark without another manual approval round.

## Counts

- Rows: ${acceptedRows.length.toLocaleString("vi-VN")}
- Labels: ${Object.entries(labelCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, count]) => `\`${label}\`=${count.toLocaleString("vi-VN")}`)
    .join(", ")}

## Files

- \`data/audit/academic/gold-sense-pairs.jsonl\`
- \`data/audit/academic/owner-authorized-gold-summary.json\`

## Caveat

This is owner-authorized AI labeling, not independent expert labeling.
`,
  "utf8"
);

console.log(
  `[academic:gold:accept-ai] ${summary.status}: rows=${acceptedRows.length.toLocaleString("vi-VN")}, ` +
    Object.entries(labelCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, count]) => `${label}=${count}`)
      .join(", ")
);
