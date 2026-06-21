import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ROOT, ensureDir, writeJson } from "./lib/paths.js";

interface SenseSide {
  source: string;
  index: number;
  meaning: string;
  sense_id?: string | null;
}

interface GoldTodoPair {
  id: string;
  category: "exact_cross_source_duplicate" | "near_duplicate" | "distant_same_headword" | string;
  word: string;
  score?: number | null;
  left: SenseSide;
  right: SenseSide;
  label_options: string[];
  resolvable?: boolean;
}

interface AiProxyGoldPair extends GoldTodoPair {
  ai_proxy_label: "same_sense" | "near_paraphrase" | "different_sense" | "encyclopedic_or_name" | "unclear";
  ai_proxy_confidence: "high" | "medium" | "low";
  ai_proxy_score: number;
  ai_proxy_rationale: string;
  ai_proxy_reviewer_id: "ai-proxy-sense-v1";
  ai_proxy_review_status: "ai-proxy-reviewed";
  promotion_allowed: false;
  counts_as_human_gold: false;
}

const AUDIT_DIR = path.join(ROOT, "data", "audit", "academic");
const INPUT_PATH = path.join(AUDIT_DIR, "gold-sense-pairs.sense-todo.jsonl");
const OUTPUT_PATH = path.join(AUDIT_DIR, "ai-proxy-gold-sense-pairs.jsonl");
const SUMMARY_PATH = path.join(AUDIT_DIR, "ai-proxy-gold-summary.json");
const REPORT_PATH = path.join(ROOT, "reports", "academic-ai-proxy-gold-0.4.0.md");

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

function normalizeMeaning(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[“”"'.:;!?()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(
    normalizeMeaning(value)
      .split(/\s+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
  );
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 1;
  const union = new Set([...left, ...right]);
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / union.size;
}

function isEntityLike(left: string, right: string): boolean {
  const text = `${left}\n${right}`.toLowerCase();
  return /\b(tên|họ|hiệu|niên hiệu|địa danh|nhân danh|tước hiệu|chức tước)\b/u.test(text);
}

function labelPair(row: GoldTodoPair): Pick<
  AiProxyGoldPair,
  "ai_proxy_label" | "ai_proxy_confidence" | "ai_proxy_score" | "ai_proxy_rationale"
> {
  const left = normalizeMeaning(row.left.meaning);
  const right = normalizeMeaning(row.right.meaning);
  const overlap = jaccard(tokens(row.left.meaning), tokens(row.right.meaning));
  const contains = left.includes(right) || right.includes(left);
  const entityLike = isEntityLike(row.left.meaning, row.right.meaning);

  if (left === right) {
    return {
      ai_proxy_label: entityLike ? "encyclopedic_or_name" : "same_sense",
      ai_proxy_confidence: "high",
      ai_proxy_score: 0.96,
      ai_proxy_rationale: "Two normalized meanings are text-identical across sources."
    };
  }

  if (entityLike && overlap >= 0.5) {
    return {
      ai_proxy_label: "encyclopedic_or_name",
      ai_proxy_confidence: "medium",
      ai_proxy_score: 0.72,
      ai_proxy_rationale: "Meanings share entity/name-like wording; keep as entity/name candidate until human adjudication."
    };
  }

  if (row.category === "exact_cross_source_duplicate" && overlap >= 0.82) {
    return {
      ai_proxy_label: "same_sense",
      ai_proxy_confidence: "medium",
      ai_proxy_score: 0.84,
      ai_proxy_rationale: "Exact-duplicate queue item with very high lexical overlap after normalization."
    };
  }

  if (contains || overlap >= 0.62) {
    return {
      ai_proxy_label: "near_paraphrase",
      ai_proxy_confidence: overlap >= 0.78 ? "medium" : "low",
      ai_proxy_score: Number(Math.max(0.58, Math.min(0.82, overlap)).toFixed(2)),
      ai_proxy_rationale: "Meanings substantially overlap but are not text-identical, so AI keeps a conservative near-paraphrase label."
    };
  }

  if (row.category === "distant_same_headword" && overlap <= 0.18) {
    return {
      ai_proxy_label: "different_sense",
      ai_proxy_confidence: "medium",
      ai_proxy_score: 0.74,
      ai_proxy_rationale: "Same headword but low definition-token overlap in a distant-pair control queue."
    };
  }

  if (row.category === "near_duplicate" && overlap <= 0.24) {
    return {
      ai_proxy_label: "different_sense",
      ai_proxy_confidence: "low",
      ai_proxy_score: 0.58,
      ai_proxy_rationale: "Near-duplicate candidate has low lexical overlap, so AI flags it as likely different but low-confidence."
    };
  }

  return {
    ai_proxy_label: "unclear",
    ai_proxy_confidence: "low",
    ai_proxy_score: 0.5,
    ai_proxy_rationale: "Heuristic evidence is not strong enough for a proxy label beyond unclear."
  };
}

if (!existsSync(INPUT_PATH)) {
  throw new Error(`Missing ${path.relative(ROOT, INPUT_PATH)}. Run academic:sense-draft first.`);
}

const rows = readJsonl<GoldTodoPair>(await readFile(INPUT_PATH, "utf8"));
const proxyRows: AiProxyGoldPair[] = rows.map((row) => ({
  ...row,
  ...labelPair(row),
  ai_proxy_reviewer_id: "ai-proxy-sense-v1",
  ai_proxy_review_status: "ai-proxy-reviewed",
  promotion_allowed: false,
  counts_as_human_gold: false
}));

const labelCounts: Record<string, number> = {};
const confidenceCounts: Record<string, number> = {};
const categoryCounts: Record<string, number> = {};
for (const row of proxyRows) {
  labelCounts[row.ai_proxy_label] = (labelCounts[row.ai_proxy_label] ?? 0) + 1;
  confidenceCounts[row.ai_proxy_confidence] = (confidenceCounts[row.ai_proxy_confidence] ?? 0) + 1;
  categoryCounts[row.category] = (categoryCounts[row.category] ?? 0) + 1;
}

const summary = {
  generatedAt: new Date().toISOString(),
  status: "AI_PROXY_GOLD_LABELS_NOT_HUMAN_GOLD",
  reviewerType: "ai",
  sourceQueue: "data/audit/academic/gold-sense-pairs.sense-todo.jsonl",
  output: "data/audit/academic/ai-proxy-gold-sense-pairs.jsonl",
  rows: proxyRows.length,
  labelCounts,
  confidenceCounts,
  categoryCounts,
  promotionAllowed: 0,
  countsAsHumanGold: false,
  caveats: [
    "AI proxy labels are review accelerators only.",
    "Do not copy this file to gold-sense-pairs.jsonl.",
    "academic:gold:check must remain blocked until human labels exist."
  ]
};

await writeJsonl(OUTPUT_PATH, proxyRows);
await writeJson(SUMMARY_PATH, summary);
await ensureDir(path.dirname(REPORT_PATH));
await writeFile(
  REPORT_PATH,
  `# AI Proxy Gold Sense Labels 0.4.0

Status: \`${summary.status}\`

This file assigns conservative AI proxy labels to the 1,000 sense-pair queue rows. It is not a human gold benchmark and must not be used to pass \`academic:gold:check\`.

## Counts

- Rows: ${proxyRows.length.toLocaleString("vi-VN")}
- Labels: ${Object.entries(labelCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, count]) => `\`${label}\`=${count.toLocaleString("vi-VN")}`)
    .join(", ")}
- Confidence: ${Object.entries(confidenceCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, count]) => `\`${label}\`=${count.toLocaleString("vi-VN")}`)
    .join(", ")}

## Files

- \`data/audit/academic/ai-proxy-gold-sense-pairs.jsonl\`
- \`data/audit/academic/ai-proxy-gold-summary.json\`

## Rule

Use this only to prioritize or prefill human review. Do not rename it to \`gold-sense-pairs.jsonl\`, do not call it human-reviewed, and do not auto-merge senses from it.
`,
  "utf8"
);

console.log(
  `[academic:ai-proxy-gold] ${summary.status}: rows=${proxyRows.length.toLocaleString("vi-VN")}, ` +
    Object.entries(labelCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, count]) => `${label}=${count}`)
      .join(", ")
);
