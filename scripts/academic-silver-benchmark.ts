import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PROCESSED_DIR, ROOT, ensureDir, writeJson } from "./lib/paths.js";
import { cleanText, shortHash } from "./lib/text.js";

type BenchmarkLabel = "same_sense" | "near_paraphrase" | "different_sense" | "unclear";

interface TodoSide {
  source: string;
  index: number;
  meaning: string;
  sense_id: string;
}

interface TodoPair {
  id: string;
  category: "exact_cross_source_duplicate" | "near_duplicate" | "distant_same_headword";
  word: string;
  score: number | null;
  left: TodoSide;
  right: TodoSide;
}

interface NearCandidate {
  word: string;
  score: number;
  left_sense_id: string;
  right_sense_id: string;
  left_source: string;
  right_source: string;
  left_meaning: string;
  right_meaning: string;
}

interface NearCollection {
  totalPairs: number;
  pairs: NearCandidate[];
}

interface SilverRow extends TodoPair {
  benchmark_id: string;
  label: BenchmarkLabel;
  label_origin: "silver-rule-v1";
  labeling_rule: string;
  label_confidence: number;
  threshold_eligible: boolean;
  caveat: string;
}

interface LabelDecision {
  label: BenchmarkLabel;
  rule: string;
  confidence: number;
}

const AUDIT_DIR = path.join(ROOT, "data", "audit", "academic");
const INPUT_PATH = path.join(AUDIT_DIR, "gold-sense-pairs.sense-todo.jsonl");
const NEAR_INPUT_PATH = path.join(PROCESSED_DIR, "senses", "near-duplicate-candidates.json");
const OUTPUT_JSONL_PATH = path.join(AUDIT_DIR, "silver-sense-benchmark.jsonl");
const OUTPUT_REPORT_PATH = path.join(PROCESSED_DIR, "senses", "silver-benchmark-report.json");
const REPORT_PATH = path.join(ROOT, "reports", "academic-silver-benchmark-0.4.0.md");

function number(value: number): string {
  return value.toLocaleString("vi-VN");
}

function semanticCore(value: string): string {
  return cleanText(value)
    .replace(/^(?:[IVX]+\s+)?(?:d|dt|đt|đg|đgt|t|tt|trt|tht|lt|l|pt|pht|ph|c)\.\s*/iu, "")
    .replace(/^\([^)]{1,50}\)\s*/u, "")
    .replace(/\[[^\]]{1,100}\]/gu, "")
    .replace(/\([^)]{1,50}\)/gu, "")
    .toLocaleLowerCase("vi-VN")
    .replace(/[^\p{L}\p{N}\p{Script=Han}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function posClass(value: string): string | null {
  const match = cleanText(value).match(
    /^(?:[IVX]+\s+)?(d|dt|đt|đg|đgt|t|tt|trt|tht|lt|l|pt|pht|ph|c)\.\s/iu
  );
  const code = match?.[1]?.toLocaleLowerCase("vi-VN");
  if (!code) return null;
  if (["d", "dt"].includes(code)) return "noun";
  if (["đt", "đg", "đgt"].includes(code)) return "verb";
  if (["t", "tt"].includes(code)) return "adjective";
  if (["trt", "pht", "ph"].includes(code)) return "adverb";
  return code;
}

function sinoVietnameseTarget(value: string): string | null {
  const match = cleanText(value).match(/^Sino-Vietnamese reading of\s+([\p{Script=Han}])$/iu);
  return match?.[1] ?? null;
}

function tokenCount(value: string): number {
  return value.split(" ").filter(Boolean).length;
}

function rank(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function scoreBucket(score: number): string {
  if (score === 1) return "1.00";
  if (score >= 0.98) return "0.98-0.9999";
  if (score >= 0.94) return "0.94-0.9799";
  if (score >= 0.9) return "0.90-0.9399";
  return "0.82-0.8999";
}

function labelPair(pair: TodoPair): LabelDecision {
  if (pair.category === "exact_cross_source_duplicate") {
    return { label: "same_sense", rule: "exact-cross-source-positive-control", confidence: 1 };
  }

  const leftCore = semanticCore(pair.left.meaning);
  const rightCore = semanticCore(pair.right.meaning);
  if (leftCore.length >= 8 && leftCore === rightCore) {
    return { label: "same_sense", rule: "semantic-core-exact", confidence: 0.98 };
  }

  const leftHan = sinoVietnameseTarget(pair.left.meaning);
  const rightHan = sinoVietnameseTarget(pair.right.meaning);
  if (leftHan && rightHan && leftHan !== rightHan) {
    return { label: "different_sense", rule: "different-explicit-han-target", confidence: 0.99 };
  }

  const leftPos = posClass(pair.left.meaning);
  const rightPos = posClass(pair.right.meaning);
  if (leftPos && rightPos && leftPos !== rightPos) {
    return { label: "different_sense", rule: "different-explicit-pos", confidence: 0.9 };
  }

  const [shorter, longer] =
    leftCore.length <= rightCore.length ? [leftCore, rightCore] : [rightCore, leftCore];
  const tokenDelta = tokenCount(longer) - tokenCount(shorter);
  if (shorter.length >= 20 && longer.includes(shorter) && tokenDelta >= 1 && tokenDelta <= 3) {
    return { label: "near_paraphrase", rule: "core-contained-small-extension", confidence: 0.85 };
  }

  return { label: "unclear", rule: "insufficient-independent-silver-evidence", confidence: 0.5 };
}

function divide(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Number((numerator / denominator).toFixed(4));
}

const todoRows = (await readFile(INPUT_PATH, "utf8"))
  .split(/\r?\n/g)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => JSON.parse(line) as TodoPair);

const exactControls = todoRows
  .filter((row) => row.category === "exact_cross_source_duplicate")
  .sort((left, right) => rank(left.id).localeCompare(rank(right.id)))
  .slice(0, 200)
  .map((row) => ({
    id: row.id,
    category: row.category,
    word: row.word,
    score: row.score,
    left: row.left,
    right: row.right
  }));
const nearInput = JSON.parse(await readFile(NEAR_INPUT_PATH, "utf8")) as NearCollection;
const nearQuotas: Record<string, number> = {
  "1.00": 150,
  "0.98-0.9999": 1,
  "0.94-0.9799": 200,
  "0.90-0.9399": 200,
  "0.82-0.8999": 249
};
const nearByBucket = new Map<string, NearCandidate[]>();
for (const pair of nearInput.pairs) {
  const bucket = scoreBucket(pair.score);
  const bucketRows = nearByBucket.get(bucket) ?? [];
  bucketRows.push(pair);
  nearByBucket.set(bucket, bucketRows);
}

const selectedNear: TodoPair[] = [];
const selectedNearByBucket: Record<string, number> = {};
for (const [bucket, quota] of Object.entries(nearQuotas)) {
  const selected = (nearByBucket.get(bucket) ?? [])
    .sort((left, right) =>
      rank(`${left.left_sense_id}:${left.right_sense_id}`).localeCompare(
        rank(`${right.left_sense_id}:${right.right_sense_id}`)
      )
    )
    .slice(0, quota);
  selectedNearByBucket[bucket] = selected.length;
  selectedNear.push(
    ...selected.map((pair) => ({
      id: `silver-source-${shortHash(`${pair.left_sense_id}:${pair.right_sense_id}`)}`,
      category: "near_duplicate" as const,
      word: pair.word,
      score: pair.score,
      left: {
        source: pair.left_source,
        index: 0,
        meaning: pair.left_meaning,
        sense_id: pair.left_sense_id
      },
      right: {
        source: pair.right_source,
        index: 0,
        meaning: pair.right_meaning,
        sense_id: pair.right_sense_id
      }
    }))
  );
}

const rows = [...exactControls, ...selectedNear];

const benchmark: SilverRow[] = rows.map((pair) => {
  const decision = labelPair(pair);
  return {
    benchmark_id: `silver-${shortHash(pair.id)}`,
    ...pair,
    label: decision.label,
    label_origin: "silver-rule-v1",
    labeling_rule: decision.rule,
    label_confidence: decision.confidence,
    threshold_eligible:
      pair.score !== null && decision.label !== "unclear" && decision.confidence >= 0.85,
    caveat: "Silver rule label, not human review and not an academically calibrated gold label."
  };
});

const labels: Record<BenchmarkLabel, number> = {
  same_sense: 0,
  near_paraphrase: 0,
  different_sense: 0,
  unclear: 0
};
const rules: Record<string, number> = {};
const categoryLabels: Record<string, Record<BenchmarkLabel, number>> = {};
for (const row of benchmark) {
  labels[row.label] += 1;
  rules[row.labeling_rule] = (rules[row.labeling_rule] ?? 0) + 1;
  const counts = categoryLabels[row.category] ?? {
    same_sense: 0,
    near_paraphrase: 0,
    different_sense: 0,
    unclear: 0
  };
  counts[row.label] += 1;
  categoryLabels[row.category] = counts;
}

const eligible = benchmark.filter((row) => row.threshold_eligible && row.score !== null);
const positive = (row: SilverRow) => row.label === "same_sense" || row.label === "near_paraphrase";
const thresholds = [0.82, 0.86, 0.9, 0.94, 0.98].map((threshold) => {
  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;
  for (const row of eligible) {
    const predictedPositive = row.score! >= threshold;
    const actualPositive = positive(row);
    if (predictedPositive && actualPositive) truePositive += 1;
    else if (predictedPositive) falsePositive += 1;
    else if (actualPositive) falseNegative += 1;
    else trueNegative += 1;
  }
  const precision = divide(truePositive, truePositive + falsePositive);
  const recall = divide(truePositive, truePositive + falseNegative);
  const f1 =
    precision === null || recall === null || precision + recall === 0
      ? null
      : Number(((2 * precision * recall) / (precision + recall)).toFixed(4));
  return { threshold, truePositive, falsePositive, trueNegative, falseNegative, precision, recall, f1 };
});

const output = {
  generatedAt: new Date().toISOString(),
  status: "SILVER_BENCHMARK_NOT_GOLD",
  labelModel: "silver-rule-v1",
  inputRows: rows.length,
  benchmarkRows: benchmark.length,
  sampleComposition: {
    exactPositiveControls: exactControls.length,
    nearCandidates: selectedNear.length,
    nearByScoreBucket: selectedNearByBucket,
    sampling: "deterministic-lowest-sha256-rank-within-score-bucket"
  },
  thresholdEligibleRows: eligible.length,
  labels,
  rules,
  categoryLabels,
  thresholds,
  decision: "NO_AUTO_MERGE",
  decisionReasons: [
    "Silver labels are deterministic controls, not independent human or expert adjudication.",
    "Unclear rows remain unresolved and may hide false positives.",
    "The balanced benchmark queue is not a prevalence estimate for all candidate pairs.",
    "Confidence model calibration is not covered by pairwise silver labels."
  ],
  artifacts: {
    benchmark: "data/audit/academic/silver-sense-benchmark.jsonl",
    sourceQueue: "data/audit/academic/gold-sense-pairs.sense-todo.jsonl",
    nearCandidates: "data/processed/senses/near-duplicate-candidates.json"
  }
};

await ensureDir(path.dirname(OUTPUT_JSONL_PATH));
await writeFile(OUTPUT_JSONL_PATH, `${benchmark.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
await writeJson(OUTPUT_REPORT_PATH, output);
await ensureDir(path.dirname(REPORT_PATH));

const thresholdRows = thresholds
  .map(
    (row) =>
      `| ${row.threshold.toFixed(2)} | ${row.truePositive} | ${row.falsePositive} | ${row.trueNegative} | ` +
      `${row.falseNegative} | ${row.precision ?? "n/a"} | ${row.recall ?? "n/a"} | ${row.f1 ?? "n/a"} |`
  )
  .join("\n");

await writeFile(
  REPORT_PATH,
  `# Silver Sense Benchmark 0.4.0

Ngày sinh: ${output.generatedAt}

Trạng thái: **${output.status}**  
Quyết định: **${output.decision}**

Benchmark dùng ${number(output.benchmarkRows)} cặp: ${number(exactControls.length)} positive controls và ${number(selectedNear.length)} near candidates lấy phân tầng trên toàn bộ ${number(nearInput.totalPairs)} cặp. Labeler không đọc score khi gán nhãn; score chỉ dùng sau đó để tính metric theo threshold.

| Nhãn | Số cặp |
| --- | ---: |
| same_sense | ${number(labels.same_sense)} |
| near_paraphrase | ${number(labels.near_paraphrase)} |
| different_sense | ${number(labels.different_sense)} |
| unclear | ${number(labels.unclear)} |
| đủ điều kiện đo threshold | ${number(eligible.length)} |

| Threshold | TP | FP | TN | FN | Precision | Recall | F1 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${thresholdRows}

Không threshold nào được cấp quyền auto-merge từ benchmark này. Đây là silver control set, không phải human gold; các hàng unclear chưa được giải quyết và queue cân bằng không phản ánh prevalence thực tế.

Artifact máy đọc: \`data/processed/senses/silver-benchmark-report.json\`.  
Benchmark rows: \`data/audit/academic/silver-sense-benchmark.jsonl\`.
`,
  "utf8"
);

console.log(
  `[academic:silver-benchmark] ${output.status}: ${number(benchmark.length)} rows, ` +
    `${number(eligible.length)} threshold-eligible, decision=${output.decision}`
);
