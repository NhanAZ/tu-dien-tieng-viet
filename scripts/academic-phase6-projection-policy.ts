import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PROCESSED_DIR, ROOT, ensureDir, writeJson } from "./lib/paths.js";

const REVIEW_SUMMARY_PATH = path.join(PROCESSED_DIR, "phase6", "human-reviewed", "reviewed-summary.json");
const POLICY_PATH = path.join(PROCESSED_DIR, "phase6", "projection-policy.json");
const REPORT_PATH = path.join(ROOT, "reports", "academic-phase6-projection-policy-0.4.0.md");

const reviewedSummary = existsSync(REVIEW_SUMMARY_PATH)
  ? JSON.parse(await readFile(REVIEW_SUMMARY_PATH, "utf8")) as { totalRows?: number; reviewerType?: string }
  : null;

const policy = {
  generatedAt: new Date().toISOString(),
  status: "PHASE6_PROJECTION_POLICY_DEFINED",
  reviewerBasis: reviewedSummary?.reviewerType ?? "none",
  reviewedRows: reviewedSummary?.totalRows ?? 0,
  scalarProjectionAllowed: false,
  rules: [
    {
      id: "keep-source-entry-pos-splits",
      decision: "split_by_source_entry_or_pos",
      action: "do_not_project_scalar_ipa",
      rationale: "The reviewed decision preserves source-entry/POS separation."
    },
    {
      id: "keep-insufficient-evidence-open",
      decision: "insufficient_evidence",
      action: "leave_projection_unchanged",
      rationale: "The reviewed decision does not provide enough evidence for scalar projection."
    },
    {
      id: "split-label-qualifier-only",
      decision: "split_label_and_qualifier",
      action: "record_label_split_candidate_without_scalar_promotion",
      rationale: "Dialect label parsing can be recorded, but not promoted to a display scalar without a later schema decision."
    }
  ],
  rollback: {
    method: "disable or remove the reviewed/projection layer and rebuild from source facts",
    directProcessedMutationAllowed: false
  },
  caveat: "This policy intentionally keeps scalar IPA/dialect projection disabled for the current owner-authorized AI review run."
};

await writeJson(POLICY_PATH, policy);
await ensureDir(path.dirname(REPORT_PATH));
await writeFile(
  REPORT_PATH,
  `# Phase 6 Projection Policy 0.4.0

Status: \`${policy.status}\`

Reviewed rows available: ${policy.reviewedRows.toLocaleString("vi-VN")}

Scalar projection allowed: \`${policy.scalarProjectionAllowed}\`

## Rules

${policy.rules.map((rule) => `- \`${rule.decision}\`: ${rule.action}. ${rule.rationale}`).join("\n")}

## Rollback

${policy.rollback.method}. Direct processed mutation allowed: \`${policy.rollback.directProcessedMutationAllowed}\`.
`,
  "utf8"
);

console.log(
  `[academic:phase6:projection-policy] ${policy.status}: reviewedRows=${policy.reviewedRows.toLocaleString("vi-VN")}, scalarProjectionAllowed=false`
);
