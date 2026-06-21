import { writeFile } from "node:fs/promises";
import path from "node:path";

import { ROOT, ensureDir, writeJson } from "./lib/paths.js";
import { COLLECTION_FROZEN, DISABLED_SOURCES, SOURCE_POLICY_PROFILE } from "./lib/source-policy.js";
import { SOURCES, usedSources, type SourceInfo } from "./lib/sources.js";

function sourceTable(sources: SourceInfo[]): string {
  const header =
    "| Key | Tên nguồn | Quyền | License | Chất lượng | Ước tính | Trạng thái |\n| --- | --- | --- | --- | --- | --- | --- |";
  const rows = sources.map(
    (source) =>
      `| \`${source.key}\` | [${source.name}](${source.url}) | ${source.rightsStatus ?? "chưa phân loại"} | ${source.license} | ${source.quality ?? source.reliability} | ${source.estimatedSize} | ${source.status} |`
  );
  return [header, ...rows].join("\n");
}

function detailList(sources: SourceInfo[]): string {
  return sources
    .map(
      (source) => `### ${source.key}

- Tên: ${source.name}
- Link: ${source.url}
- License: ${source.license}
- Năm/phiên bản: ${source.yearOrVersion}
- Cách trích dẫn: ${source.citation}
- Ghi chú: ${source.notes}`
    )
    .join("\n\n");
}

const generatedAt = new Date().toISOString();
const REPORTS_CURRENT_DIR = path.join(ROOT, "reports", "current");

const sourcesMd = `# SOURCES.md

Generated at: ${generatedAt}

Profile: \`${SOURCE_POLICY_PROFILE}\`. Collection frozen: \`${COLLECTION_FROZEN}\`.

Các nguồn dưới đây đã qua phase gate và được chọn cho build kế tiếp. Khi collection đang frozen, danh sách có thể rỗng.

${sourceTable(usedSources())}

${detailList(usedSources())}
`;

const candidatesMd = `# SOURCES_CANDIDATES.md

Generated at: ${generatedAt}

Danh sách khảo sát nguồn. Trạng thái \`candidate\` không đồng nghĩa với đã được phép ingest; nguồn phải qua dossier và phase gate trong roadmap.

${sourceTable(SOURCES)}

${detailList(SOURCES)}
`;

await ensureDir(REPORTS_CURRENT_DIR);
await writeFile(path.join(ROOT, "SOURCES.md"), sourcesMd, "utf8");
await writeFile(path.join(REPORTS_CURRENT_DIR, "SOURCES_CANDIDATES.md"), candidatesMd, "utf8");
await writeJson(path.join(ROOT, "data", "source-registry.json"), {
  generatedAt,
  profile: SOURCE_POLICY_PROFILE,
  collectionFrozen: COLLECTION_FROZEN,
  disabledSources: [...DISABLED_SOURCES].sort(),
  sources: SOURCES
});

console.log(`Wrote source registry and Markdown reports (${SOURCES.length} surveyed sources).`);
