import { writeFile } from "node:fs/promises";
import path from "node:path";

import { PROCESSED_DIR, ROOT, readJson } from "./lib/paths.js";

type ClusterStatus =
  | "auto_accepted"
  | "machine_clustered"
  | "machine_retained"
  | "needs_review"
  | "quarantined"
  | "entity_or_encyclopedic"
  | "reference_non_vi";

interface SenseIndex {
  generatedAt: string;
  status: string;
  headwords: number;
  definitions: number;
  clusters: number;
  statusCounts: Record<ClusterStatus, number>;
  definitionStatusCounts: Record<ClusterStatus, number>;
  exactDuplicateDefinitionsResolved: number;
  reviewRemainderDefinitions: number;
  reviewRemainderPercent: number;
  nearDuplicatePairs: number;
  entityOrEncyclopedicDefinitions?: number;
  entityOrEncyclopedicClusters?: number;
}

interface ValidationSummary {
  generatedAt: string;
  passed: boolean;
  clusters: number;
  definitions: number;
  reviewRemainderSampleRows: number;
  errors: unknown[];
}

const SENSES_DIR = path.join(PROCESSED_DIR, "senses");
const REPORT_PATH = path.join(ROOT, "reports", "academic-layer-report-0.4.0.md");
const STATUS_PATH = path.join(SENSES_DIR, "STATUS.md");
const STATUS_KEYS: ClusterStatus[] = [
  "auto_accepted",
  "machine_clustered",
  "machine_retained",
  "needs_review",
  "quarantined",
  "entity_or_encyclopedic",
  "reference_non_vi"
];

function number(value: number): string {
  return value.toLocaleString("vi-VN");
}

function percent(value: number, total: number): string {
  return total === 0 ? "0%" : `${Number(((value / total) * 100).toFixed(2))}%`;
}

const index = await readJson<SenseIndex>(path.join(SENSES_DIR, "index.json"));
const validation = await readJson<ValidationSummary>(path.join(SENSES_DIR, "validation-summary.json"));

const statusRows = STATUS_KEYS.map(
  (status) =>
    `| \`${status}\` | ${number(index.statusCounts[status])} | ${number(index.definitionStatusCounts[status])} | ${percent(
      index.definitionStatusCounts[status],
      index.definitions
    )} |`
).join("\n");

const report = `# Academic Layer Report 0.4.0

Ngày sinh: ${new Date().toISOString()}

Trạng thái layer: **${index.status}**  
Validation: **${validation.passed ? "PASS" : "FAIL"}**

Layer này nằm ở \`data/processed/senses/\` và là canonical sense draft do máy xử lý. Nó đã có schema và validator, nhưng chưa phải bản human-reviewed.

## Tổng quan

| Chỉ tiêu | Giá trị |
| --- | ---: |
| Headword nguồn | ${number(index.headwords)} |
| Definition nguồn | ${number(index.definitions)} |
| Canonical sense clusters | ${number(index.clusters)} |
| Definition đã xử lý bằng exact/machine cluster | ${number(index.exactDuplicateDefinitionsResolved)} |
| Definition còn needs-review/quarantine | ${number(index.reviewRemainderDefinitions)} |
| Definition tách sang entity/encyclopedic | ${number(index.entityOrEncyclopedicDefinitions ?? index.definitionStatusCounts.entity_or_encyclopedic)} |
| Tỷ lệ còn needs-review/quarantine | ${index.reviewRemainderPercent}% |
| Near-duplicate pair chưa merge | ${number(index.nearDuplicatePairs)} |

## Phân tầng

| Status | Cluster | Definition | Tỷ lệ definition |
| --- | ---: | ---: | ---: |
${statusRows}

## Artifact Chính

- \`data/processed/senses/index.json\`
- \`data/processed/senses/validation-summary.json\`
- \`data/processed/senses/canonical-sense-clusters.jsonl.gz\`
- \`data/processed/senses/canonical-sense-clusters.sample.jsonl\`
- \`data/processed/senses/review-remainder.sample.jsonl\`
- \`data/processed/senses/near-duplicate-candidates.json\`

## Còn Lại

- \`auto_accepted\` và \`machine_clustered\` có thể dùng làm lớp canonical draft.
- \`machine_retained\` là singleton/nhóm giữ lại bằng máy, chưa gộp.
- \`needs_review\` và \`quarantined\` chưa nên gọi là học thuật sạch.
- \`entity_or_encyclopedic\` đã tách ra \`data/processed/entities/\`, không bị tính là lỗi quarantine của lõi học thuật.
- \`reference_non_vi\` là định nghĩa không phải tiếng Việt, hữu ích để đối chiếu nhưng không thay thế định nghĩa tiếng Việt.
`;

const status = `# Processed Sense Layer Status

- Status: **${index.status}**
- Validation: **${validation.passed ? "PASS" : "FAIL"}**
- Headwords: ${number(index.headwords)}
- Source definitions: ${number(index.definitions)}
- Canonical sense clusters: ${number(index.clusters)}
- Auto accepted definitions: ${number(index.definitionStatusCounts.auto_accepted)}
- Machine clustered definitions: ${number(index.definitionStatusCounts.machine_clustered)}
- Machine retained definitions: ${number(index.definitionStatusCounts.machine_retained)}
- Needs review definitions: ${number(index.definitionStatusCounts.needs_review)}
- Quarantined definitions: ${number(index.definitionStatusCounts.quarantined)}
- Entity/encyclopedic definitions: ${number(index.definitionStatusCounts.entity_or_encyclopedic)}
- Reference non-Vi definitions: ${number(index.definitionStatusCounts.reference_non_vi)}

This layer is machine-first and source-attributed. It is not a human-reviewed academic release.
`;

await Promise.all([writeFile(REPORT_PATH, report, "utf8"), writeFile(STATUS_PATH, status, "utf8")]);

console.log(
  `[academic:report] Wrote academic layer report: ${number(index.clusters)} clusters, validation ${
    validation.passed ? "PASS" : "FAIL"
  }`
);
