import { writeFile } from "node:fs/promises";
import path from "node:path";

import { PROCESSED_DIR, ROOT, ensureDir, readJson, writeJson } from "./lib/paths.js";

type TriageGroup = "auto_safe_candidate" | "machine_cluster_candidate" | "blocked_review_only";

interface NearDuplicatePair {
  word: string;
  score: number;
  left_sense_id: string;
  right_sense_id: string;
  left_source: string;
  right_source: string;
  left_meaning: string;
  right_meaning: string;
  recommended_action: "machine_cluster_candidate" | "review_only";
}

interface NearDuplicateCollection {
  totalPairs: number;
  sampledPairs: number;
  pairs: NearDuplicatePair[];
}

interface TriagedPair extends NearDuplicatePair {
  triage_group: TriageGroup;
  triage_reasons: string[];
}

const SENSES_DIR = path.join(PROCESSED_DIR, "senses");
const INPUT_PATH = path.join(SENSES_DIR, "near-duplicate-candidates.json");
const OUTPUT_PATH = path.join(SENSES_DIR, "near-duplicate-triage.json");
const REPORT_PATH = path.join(ROOT, "reports", "academic-near-duplicate-triage-0.4.0.md");

function number(value: number): string {
  return value.toLocaleString("vi-VN");
}

function groupFor(pair: NearDuplicatePair): Pick<TriagedPair, "triage_group" | "triage_reasons"> {
  if (
    pair.recommended_action === "machine_cluster_candidate" &&
    pair.score >= 0.98 &&
    pair.left_source !== pair.right_source
  ) {
    return {
      triage_group: "auto_safe_candidate",
      triage_reasons: ["score-at-least-0.98", "trusted-pair-from-generator", "cross-source"]
    };
  }
  if (pair.recommended_action === "machine_cluster_candidate") {
    return {
      triage_group: "machine_cluster_candidate",
      triage_reasons: ["score-at-least-0.94", "trusted-pair-from-generator"]
    };
  }
  return {
    triage_group: "blocked_review_only",
    triage_reasons: ["insufficient-trusted-agreement-or-score"]
  };
}

const input = await readJson<NearDuplicateCollection>(INPUT_PATH);
const pairs: TriagedPair[] = input.pairs.map((pair) => ({ ...pair, ...groupFor(pair) }));
const counts: Record<TriageGroup, number> = {
  auto_safe_candidate: 0,
  machine_cluster_candidate: 0,
  blocked_review_only: 0
};
const scoreBuckets = {
  "1.00": 0,
  "0.98-0.9999": 0,
  "0.94-0.9799": 0,
  "0.90-0.9399": 0,
  "0.82-0.8999": 0
};

for (const pair of pairs) {
  counts[pair.triage_group] += 1;
  if (pair.score === 1) scoreBuckets["1.00"] += 1;
  else if (pair.score >= 0.98) scoreBuckets["0.98-0.9999"] += 1;
  else if (pair.score >= 0.94) scoreBuckets["0.94-0.9799"] += 1;
  else if (pair.score >= 0.9) scoreBuckets["0.90-0.9399"] += 1;
  else scoreBuckets["0.82-0.8999"] += 1;
}

const summary = {
  generatedAt: new Date().toISOString(),
  status: "TRIAGED_NOT_MERGED",
  inputPairs: input.totalPairs,
  storedPairs: pairs.length,
  counts,
  scoreBuckets,
  policy: {
    auto_safe_candidate:
      "Cross-source trusted candidates with score >= 0.98. Still not merged until a benchmark demonstrates acceptable precision.",
    machine_cluster_candidate:
      "Trusted candidates with score >= 0.94 that do not meet the stricter auto-safe threshold.",
    blocked_review_only: "All other pairs remain review-only."
  },
  samples: {
    auto_safe_candidate: pairs.filter((pair) => pair.triage_group === "auto_safe_candidate").slice(0, 100),
    machine_cluster_candidate: pairs.filter((pair) => pair.triage_group === "machine_cluster_candidate").slice(0, 100),
    blocked_review_only: pairs.filter((pair) => pair.triage_group === "blocked_review_only").slice(0, 100)
  },
  note: "No near-duplicate pair is automatically merged by this triage step."
};

await writeJson(OUTPUT_PATH, summary);
await ensureDir(path.dirname(REPORT_PATH));
await writeFile(
  REPORT_PATH,
  `# Near-Duplicate Triage 0.4.0

Ngày sinh: ${summary.generatedAt}

Trạng thái: **${summary.status}**

Không có cặp nào bị tự động gộp. Báo cáo này chỉ chia hàng đợi theo mức an toàn máy ước lượng.

| Nhóm | Số cặp | Xử lý |
| --- | ---: | --- |
| \`auto_safe_candidate\` | ${number(counts.auto_safe_candidate)} | Ứng viên liên nguồn, nguồn tin cậy, score >= 0,98; vẫn chờ benchmark trước khi auto-merge. |
| \`machine_cluster_candidate\` | ${number(counts.machine_cluster_candidate)} | Ứng viên máy score >= 0,94; không auto-merge. |
| \`blocked_review_only\` | ${number(counts.blocked_review_only)} | Thiếu đồng thuận nguồn tin cậy hoặc score; chỉ review. |

Tổng phát hiện: ${number(input.totalPairs)}. Tổng cặp được lưu và phân loại: ${number(pairs.length)}.

Artifact máy đọc: \`data/processed/senses/near-duplicate-triage.json\`.
`,
  "utf8"
);

console.log(
  `[academic:near-duplicates] TRIAGED_NOT_MERGED: safe=${number(counts.auto_safe_candidate)}, ` +
    `candidate=${number(counts.machine_cluster_candidate)}, blocked=${number(counts.blocked_review_only)}`
);
