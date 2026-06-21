import { writeFile } from "node:fs/promises";
import path from "node:path";

import { ROOT, ensureDir, writeJson } from "./lib/paths.js";
import { SOURCE_POLICY_PROFILE } from "./lib/source-policy.js";
import { usedSources } from "./lib/sources.js";

const OUT_PATH = path.join(ROOT, "data", "audit", "source-dossier-audit.json");
const REPORT_PATH = path.join(ROOT, "reports", "source-dossier-audit-0.4.0.md");

const sources = usedSources();
const rows = sources.map((source) => {
  const rawFiles = source.rawFiles ?? [];
  const requiredRawFiles = rawFiles.filter((file) => file.required).length;
  const optionalRawFiles = rawFiles.length - requiredRawFiles;
  const hasRollback = source.notes.toLowerCase().includes("rollback") || source.notes.toLowerCase().includes("gỡ");
  const risks: string[] = [];
  if (!source.rightsStatus) risks.push("missing-rights-status");
  if (source.rightsStatus === "documented-unclear") risks.push("documented-unclear-rights");
  if (source.status !== "use") risks.push(`status-${source.status}`);
  if (rawFiles.length === 0) risks.push("no-raw-file-manifest");
  if (!hasRollback) risks.push("rollback-not-explicit-in-source-note");

  return {
    key: source.key,
    name: source.name,
    rightsStatus: source.rightsStatus ?? "missing",
    license: source.license,
    quality: source.quality ?? "missing",
    reliability: source.reliability,
    status: source.status,
    usedInProcessed: source.usedInProcessed,
    requiredRawFiles,
    optionalRawFiles,
    citationPresent: source.citation.trim().length > 0,
    rollbackNotePresent: hasRollback,
    decision: risks.length === 0 ? "ready" : risks.includes("documented-unclear-rights") ? "documented-with-rollback" : "needs-followup",
    risks
  };
});

const summary = {
  generatedAt: new Date().toISOString(),
  status: "SOURCE_DOSSIER_AUDIT_COMPLETE",
  profile: SOURCE_POLICY_PROFILE,
  selectedSources: rows.length,
  rightsCounts: rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.rightsStatus] = (acc[row.rightsStatus] ?? 0) + 1;
    return acc;
  }, {}),
  decisionCounts: rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.decision] = (acc[row.decision] ?? 0) + 1;
    return acc;
  }, {}),
  rows
};

await writeJson(OUT_PATH, summary);
await ensureDir(path.dirname(REPORT_PATH));
await writeFile(
  REPORT_PATH,
  `# Source Dossier Audit 0.4.0

Status: \`${summary.status}\`

Profile: \`${SOURCE_POLICY_PROFILE}\`

## Summary

- Selected sources: ${rows.length.toLocaleString("vi-VN")}
- Rights: ${Object.entries(summary.rightsCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `\`${key}\`=${count.toLocaleString("vi-VN")}`)
    .join(", ")}
- Decisions: ${Object.entries(summary.decisionCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `\`${key}\`=${count.toLocaleString("vi-VN")}`)
    .join(", ")}

## Active Sources

| Source | Rights | Decision | Risks |
| --- | --- | --- | --- |
${rows
  .map(
    (row) =>
      `| \`${row.key}\` | ${row.rightsStatus} | ${row.decision} | ${
        row.risks.length > 0 ? row.risks.map((risk) => `\`${risk}\``).join(", ") : "-"
      } |`
  )
  .join("\n")}

## Files

- \`data/audit/source-dossier-audit.json\`
- \`reports/source-dossier-audit-0.4.0.md\`
`,
  "utf8"
);

console.log(
  `[source:audit] ${summary.status}: selected=${rows.length.toLocaleString("vi-VN")}, ` +
    Object.entries(summary.rightsCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => `${key}=${count}`)
      .join(", ")
);
