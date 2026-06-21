import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ROOT, ensureDir, writeJson } from "./lib/paths.js";

interface GoldPair {
  id: string;
  category?: string;
  score?: number | null;
  label: string;
}

const GOLD_PATH = path.join(ROOT, "data", "audit", "academic", "gold-sense-pairs.jsonl");
const OUT_PATH = path.join(ROOT, "data", "audit", "academic", "confidence-calibration.json");
const REPORT_PATH = path.join(ROOT, "reports", "academic-confidence-calibration-0.4.0.md");

function readJsonl<T>(text: string): T[] {
  return text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

if (!existsSync(GOLD_PATH)) {
  throw new Error(`Missing ${path.relative(ROOT, GOLD_PATH)}. Run academic:gold:accept-ai or provide labels first.`);
}

const rows = readJsonl<GoldPair>(await readFile(GOLD_PATH, "utf8"));
const labelCounts: Record<string, number> = {};
const categoryCounts: Record<string, number> = {};
const scored = rows.filter((row) => typeof row.score === "number") as Array<GoldPair & { score: number }>;
for (const row of rows) {
  labelCounts[row.label] = (labelCounts[row.label] ?? 0) + 1;
  categoryCounts[row.category ?? "missing"] = (categoryCounts[row.category ?? "missing"] ?? 0) + 1;
}

const positiveLabels = new Set(["same_sense", "near_paraphrase"]);
const thresholds = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0];
const thresholdRows = thresholds.map((threshold) => {
  const predicted = scored.filter((row) => row.score >= threshold);
  const truePositive = predicted.filter((row) => positiveLabels.has(row.label)).length;
  const falsePositive = predicted.length - truePositive;
  const positives = scored.filter((row) => positiveLabels.has(row.label)).length;
  return {
    threshold,
    predicted: predicted.length,
    truePositive,
    falsePositive,
    precision: predicted.length > 0 ? truePositive / predicted.length : null,
    recall: positives > 0 ? truePositive / positives : null
  };
});

const recommended = thresholdRows
  .filter((row) => row.predicted > 0 && row.precision !== null && row.precision >= 0.98)
  .sort((a, b) => (b.recall ?? 0) - (a.recall ?? 0))[0] ?? null;

const output = {
  generatedAt: new Date().toISOString(),
  status: "CONFIDENCE_CALIBRATION_FROM_OWNER_AUTHORIZED_AI_GOLD",
  rows: rows.length,
  scoredRows: scored.length,
  labelCounts,
  categoryCounts,
  thresholds: thresholdRows,
  recommendedNearDuplicateAutoMergeThreshold: recommended?.threshold ?? null,
  caveat: "Calibration is based on owner-authorized AI gold labels, not independent expert gold."
};

await writeJson(OUT_PATH, output);
await ensureDir(path.dirname(REPORT_PATH));
await writeFile(
  REPORT_PATH,
  `# Confidence Calibration 0.4.0

Status: \`${output.status}\`

- Rows: ${rows.length.toLocaleString("vi-VN")}
- Scored rows: ${scored.length.toLocaleString("vi-VN")}
- Recommended near-duplicate threshold: ${
    output.recommendedNearDuplicateAutoMergeThreshold === null ? "none" : `\`${output.recommendedNearDuplicateAutoMergeThreshold}\``
  }

## Labels

${Object.entries(labelCounts)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([label, count]) => `- \`${label}\`: ${count.toLocaleString("vi-VN")}`)
  .join("\n")}

## Thresholds

| Threshold | Predicted | TP | FP | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: |
${thresholdRows
  .map(
    (row) =>
      `| ${row.threshold} | ${row.predicted} | ${row.truePositive} | ${row.falsePositive} | ${
        row.precision === null ? "-" : row.precision.toFixed(3)
      } | ${row.recall === null ? "-" : row.recall.toFixed(3)} |`
  )
  .join("\n")}

## Caveat

${output.caveat}
`,
  "utf8"
);

console.log(
  `[academic:confidence-calibration] ${output.status}: rows=${rows.length.toLocaleString("vi-VN")}, recommended=${
    output.recommendedNearDuplicateAutoMergeThreshold ?? "none"
  }`
);
