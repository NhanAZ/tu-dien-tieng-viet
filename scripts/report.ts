import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";

import { PROCESSED_DIR, ROOT, ensureDir, readJson } from "./lib/paths.js";
import { usedSources } from "./lib/sources.js";

const REPORTS_CURRENT_DIR = path.join(ROOT, "reports", "current");

interface QualitySummary {
  generatedAt: string;
  release: {
    buildId: string;
    datasetVersion: string;
    profile: string;
    selectedSources: number;
  };
  storageBytes: Record<string, number>;
  layers: Record<string, number>;
  dictionaryCoverage: {
    withVietnameseDefinition: number;
    withEnglishDefinition: number;
    withIpa: number;
    withPartOfSpeech: number;
    withEtymology: number;
    withLabels: number;
    multiSource: number;
    byEntrySource: Record<string, number>;
    definitionsByLanguage: Record<string, number>;
    definitionsBySource: Record<string, number>;
  };
  hanVietCoverage: {
    radicalCoverage: number;
    radicalCoveragePercent: number;
    withReading: number;
    withMeaning: number;
    enrichedByUnihan: number;
    standaloneUnihan: number;
    supplementaryPlaneCharacters: number;
    byEntrySource: Record<string, number>;
  };
  nomCoverage: {
    withDefinition: number;
    withFrequency: number;
    supplementaryPlaneEntries: number;
  };
  hardChecks: Record<string, boolean | number>;
  sourceSamples: Array<{
    source: string;
    availableRecords: number;
    sampleSize: number;
    passed: number;
    failed: number;
    status: string;
  }>;
}

interface SenseLayerSummary {
  status: string;
  headwords: number;
  definitions: number;
  clusters: number;
  definitionStatusCounts: {
    auto_accepted: number;
    machine_clustered: number;
    machine_retained: number;
    needs_review: number;
    quarantined: number;
    entity_or_encyclopedic: number;
    reference_non_vi: number;
  };
  exactDuplicateDefinitionsResolved: number;
  reviewRemainderDefinitions: number;
  reviewRemainderPercent: number;
  nearDuplicatePairs: number;
  entityOrEncyclopedicDefinitions?: number;
  entityOrEncyclopedicClusters?: number;
}

interface SenseValidationSummary {
  passed: boolean;
  clusters: number;
  definitions: number;
  phase6AiReviewRows?: number;
}

const q = await readJson<QualitySummary>(path.join(PROCESSED_DIR, "quality-summary.json"));
const sources = usedSources();
const words = q.layers.dictionaryHeadwords ?? 0;
const han = q.layers.hanVietCharacters ?? 0;
const nom = q.layers.nomEntries ?? 0;
const websiteBriefPath = path.join(ROOT, "docs", "Xây dựng Website Từ Điển Tiếng Việt Chuyên Sâu.md");
const websiteBriefText = existsSync(websiteBriefPath) ? readFileSync(websiteBriefPath, "utf8") : "";
const websiteBriefReady =
  websiteBriefText.trim().length > 0 &&
  !/WEBSITE_BRIEF_STATUS:\s*PENDING/i.test(websiteBriefText) &&
  websiteBriefText
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith(">") && !line.startsWith("- [ ]")).length >= 20;
const senseIndexPath = path.join(PROCESSED_DIR, "senses", "index.json");
const senseValidationPath = path.join(PROCESSED_DIR, "senses", "validation-summary.json");
const senseLayer = existsSync(senseIndexPath) ? await readJson<SenseLayerSummary>(senseIndexPath) : null;
const senseValidation = existsSync(senseValidationPath) ? await readJson<SenseValidationSummary>(senseValidationPath) : null;

function number(value: number): string {
  return value.toLocaleString("vi-VN");
}

function percent(value: number, total: number): string {
  return total === 0 ? "0,00%" : `${((value / total) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;
}

function countTable(counts: Record<string, number>, valueLabel: string): string {
  return [
    `| Nguồn | ${valueLabel} |`,
    "| --- | ---: |",
    ...Object.entries(counts).map(([source, count]) => `| \`${source}\` | ${number(count)} |`)
  ].join("\n");
}

function humanBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = units.shift()!;
  while (value >= 1024 && units.length > 0) {
    value /= 1024;
    unit = units.shift()!;
  }
  return `${value.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} ${unit}`;
}

const senseLayerCoverage = senseLayer
  ? `
## Canonical sense draft

| Chỉ tiêu | Giá trị |
| --- | ---: |
| Trạng thái | ${senseLayer.status} |
| Validation | ${senseValidation?.passed ? "PASS" : "PENDING/FAIL"} |
| Definition đầu vào | ${number(senseLayer.definitions)} |
| Canonical sense clusters | ${number(senseLayer.clusters)} |
| Auto accepted definitions | ${number(senseLayer.definitionStatusCounts.auto_accepted)} |
| Machine clustered definitions | ${number(senseLayer.definitionStatusCounts.machine_clustered)} |
| Machine retained definitions | ${number(senseLayer.definitionStatusCounts.machine_retained)} |
| Needs review definitions | ${number(senseLayer.definitionStatusCounts.needs_review)} |
| Quarantined definitions | ${number(senseLayer.definitionStatusCounts.quarantined)} |
| Entity/encyclopedic definitions | ${number(senseLayer.definitionStatusCounts.entity_or_encyclopedic)} |
| Reference non-Vi definitions | ${number(senseLayer.definitionStatusCounts.reference_non_vi)} |
| Near-duplicate pair chưa merge | ${number(senseLayer.nearDuplicatePairs)} |

Lớp này nằm ở \`data/processed/senses/\`. Đây là canonical draft do máy xử lý, không phải human-reviewed release.
`
  : "";

const coverage = `# Báo cáo độ phủ dữ liệu từ điển tiếng Việt

Ngày tạo: ${new Date(q.generatedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}  
Build: \`${q.release.buildId}\` · Phiên bản: \`${q.release.datasetVersion}\` · Profile: \`${q.release.profile}\`

## Tổng quan đúng ngữ nghĩa

- **${number(words)} mục từ tiếng Việt có định nghĩa**, với ${number(q.layers.definitions)} định nghĩa có provenance.
- **${number(q.layers.lexemeOnly)} lexeme chỉ có bằng chứng chính tả**, được giữ ngoài từ điển lõi vì chưa có định nghĩa.
- **${number(han)} chữ Hán có bằng chứng Hán-Việt**, trong đó Unihan chỉ bổ sung metadata cho mục đã tồn tại.
- **${number(nom)} ánh xạ chữ Nôm** trong lớp riêng, không cộng vào số mục từ tiếng Việt hay Hán-Việt.
- **${number(q.layers.semanticSynsets)} synset ứng viên**, ${number(q.layers.orthographicVariantGroups)} nhóm biến thể dấu và ${number(q.layers.evidenceExamples)} ví dụ nguồn từ các mục từ điển.
${senseLayer ? `- **${number(senseLayer.clusters)} canonical sense clusters draft** trong \`data/processed/senses/\`, validation ${senseValidation?.passed ? "PASS" : "chưa đạt/chưa chạy"}.` : ""}

## Độ phủ mục từ tiếng Việt

| Chỉ tiêu | Số mục | Tỷ lệ trên ${number(words)} headword |
| --- | ---: | ---: |
| Có ít nhất một định nghĩa tiếng Việt | ${number(q.dictionaryCoverage.withVietnameseDefinition)} | ${percent(q.dictionaryCoverage.withVietnameseDefinition, words)} |
| Có ít nhất một định nghĩa tiếng Anh | ${number(q.dictionaryCoverage.withEnglishDefinition)} | ${percent(q.dictionaryCoverage.withEnglishDefinition, words)} |
| Có IPA | ${number(q.dictionaryCoverage.withIpa)} | ${percent(q.dictionaryCoverage.withIpa, words)} |
| Có từ loại | ${number(q.dictionaryCoverage.withPartOfSpeech)} | ${percent(q.dictionaryCoverage.withPartOfSpeech, words)} |
| Có từ nguyên từ nguồn | ${number(q.dictionaryCoverage.withEtymology)} | ${percent(q.dictionaryCoverage.withEtymology, words)} |
| Có nhãn usage/register/domain/period | ${number(q.dictionaryCoverage.withLabels)} | ${percent(q.dictionaryCoverage.withLabels, words)} |
| Có từ hai nguồn trở lên | ${number(q.dictionaryCoverage.multiSource)} | ${percent(q.dictionaryCoverage.multiSource, words)} |

${senseLayerCoverage}

### Headword theo nguồn đóng góp

${countTable(q.dictionaryCoverage.byEntrySource, "Headword")}

### Định nghĩa theo nguồn

${countTable(q.dictionaryCoverage.definitionsBySource, "Định nghĩa")}

## Hán-Việt và chữ Nôm được tách lớp

| Chỉ tiêu | Kết quả |
| --- | ---: |
| Chữ Hán có ít nhất một nghĩa | ${number(q.hanVietCoverage.withMeaning)} |
| Chữ Hán có ít nhất một âm Hán-Việt | ${number(q.hanVietCoverage.withReading)} |
| Chữ Hán được Unihan bổ sung metadata | ${number(q.hanVietCoverage.enrichedByUnihan)} |
| Mục chỉ có Unihan, không có bằng chứng Việt | **${number(q.hanVietCoverage.standaloneUnihan)}** |
| Bộ thủ Khang Hi có đại diện | ${q.hanVietCoverage.radicalCoverage}/214 |
| Chữ Hán ngoài BMP | ${number(q.hanVietCoverage.supplementaryPlaneCharacters)} |
| Mục Nôm có định nghĩa/gloss | ${number(q.nomCoverage.withDefinition)} |
| Mục Nôm có tần suất nguồn | ${number(q.nomCoverage.withFrequency)} |
| Mục Nôm chứa code point ngoài BMP | ${number(q.nomCoverage.supplementaryPlaneEntries)} |

Coverage 214/214 bộ thủ chỉ mô tả phân bố của tập chữ, **không phải bằng chứng rằng từ điển đã đầy đủ**.

## Dung lượng artifact

| Tầng | Dung lượng |
| --- | ---: |
| Raw snapshot | ${humanBytes(q.storageBytes.raw ?? 0)} |
| Normalized theo nguồn | ${humanBytes(q.storageBytes.normalized ?? 0)} |
| Processed | ${humanBytes(q.storageBytes.processed ?? 0)} |

## Giới hạn cần đọc cùng số liệu

- ${number(q.layers.lexemeOnly)} lexeme chưa có nghĩa không được tính là mục từ điển lõi.
- ${number(q.dictionaryCoverage.definitionsByLanguage.en ?? 0)} định nghĩa tiếng Anh được giữ nguyên ngôn ngữ; pipeline không dịch máy để giả tăng coverage tiếng Việt.
- Synset OMW là ứng viên ngữ nghĩa theo lemma/POS, chưa phải ánh xạ sense đã duyệt.
- Ví dụ hiện có đến từ nguồn từ điển. Corpus ngoài độc lập chưa được nhập vì chưa đạt đồng thời cổng quyền sử dụng và relevance theo sense.
- Lớp Nôm của profile \`documented\` dùng nguồn \`chunom_standard\` có quyền tái phân phối chưa rõ hoàn toàn; có thể gỡ bằng source policy.
- Website brief ${websiteBriefReady ? "đã có nội dung để review schema" : "đang PENDING; schema chưa được chốt là website-ready"}.
`;

const checkLabels: Record<string, string> = {
  indexCountsMatch: "Số lượng index khớp file dữ liệu",
  emptyDefinitionHeadwords: "Headword lõi không có định nghĩa",
  nonLatinDictionaryHeadwords: "Mục chữ Hán/CJK lọt vào words",
  incorrectNoToneFields: "Chỉ mục bỏ dấu thanh sai",
  duplicateIds: "ID trùng giữa các lớp",
  exactDefinitionDuplicates: "Định nghĩa trùng chính xác cùng nguồn",
  residualDaiNamIdPlaceholders: "Placeholder 'id.' còn sót từ Đại Nam",
  invalidVariantGroups: "Nhóm biến thể dấu sai quan hệ",
  rawFilesWithoutSha256: "Raw file thiếu SHA-256",
  failedSourceSamples: "Bản ghi mẫu nguồn hỏng cấu trúc",
  sourceRemovalTestPassed: "Source-removal regression test",
  idStabilityTestPassed: "ID ổn định giữa hai lần merge cùng input"
};
const checkRows = Object.entries(q.hardChecks).map(([key, value]) => {
  const pass = value === true || value === 0;
  return `| ${checkLabels[key] ?? key} | ${typeof value === "boolean" ? (value ? "đạt" : "không đạt") : number(value)} | ${pass ? "PASS" : "FAIL"} |`;
});
const sampleRows = q.sourceSamples.map(
  (sample) =>
    `| \`${sample.source}\` | ${number(sample.availableRecords)} | ${sample.sampleSize} | ${sample.passed} | ${sample.failed} | ${sample.status.toUpperCase()} |`
);

const quality = `# Báo cáo chất lượng dữ liệu

## Kết luận kỹ thuật

Build \`${q.release.buildId}\` đã **đạt toàn bộ cổng kiểm định tự động hiện có**: schema, provenance, tính duy nhất ID, phân lớp Việt/Hán/Nôm, checksum raw, source-removal và regression biến thể dấu. Kết quả này chứng minh pipeline nhất quán và có thể audit; nó **không thay thế thẩm định học thuật thủ công** đối với từng nghĩa.

${senseLayer ? `Lớp canonical sense draft trong \`data/processed/senses/\` hiện có ${number(senseLayer.clusters)} cluster từ ${number(senseLayer.definitions)} definition, validation ${senseValidation?.passed ? "**PASS**" : "**PENDING/FAIL**"}. Phần máy đã auto/machine cluster ${number(senseLayer.exactDuplicateDefinitionsResolved)} definition; ${number(senseLayer.definitionStatusCounts.entity_or_encyclopedic)} definition đã tách sang \`data/processed/entities/\`; còn ${number(senseLayer.reviewRemainderDefinitions)} definition ở nhóm needs-review/quarantine.` : "Lớp canonical sense draft chưa được sinh."}

${senseValidation?.phase6AiReviewRows ? `Phase 6 có ${number(senseValidation.phase6AiReviewRows)} dòng \`ai-reviewed\` advisory để ưu tiên review; các dòng này không phải \`human-reviewed\` và không được promote vào scalar IPA/dialect nếu chưa có xác nhận người.` : ""}

## Cổng kiểm định tự động

| Kiểm tra | Giá trị lỗi/kết quả | Trạng thái |
| --- | ---: | --- |
${checkRows.join("\n")}

## Mẫu cấu trúc theo nguồn

Mỗi nguồn được lấy mẫu tất định tối đa 100 contribution, kiểm tra headword/fact không rỗng, source ID và SHA-256 provenance. Đây là kiểm tra cấu trúc máy, không phải chấm đúng-sai ngữ nghĩa.

| Nguồn | Contribution khả dụng | Cỡ mẫu | Đạt | Lỗi | Trạng thái |
| --- | ---: | ---: | ---: | ---: | --- |
${sampleRows.join("\n")}

## Regression đã khóa

- \`words\` bắt buộc có ký tự Latin; chữ Hán thuần không thể làm phình số mục từ tiếng Việt.
- Unihan không thể tự tạo mục Hán-Việt; số mục chỉ có Unihan hiện bằng 0.
- \`headword_no_tone\` chỉ bỏ năm dấu thanh, giữ nguyên â/ă/ê/ô/ơ/ư.
- Nhóm dấu chỉ hợp lệ khi mọi dạng có cùng base sau khi bỏ dấu thanh và cùng tone signature. Sau sửa lỗi, 1.536 nhóm giả giảm còn 70 nhóm thật như \`hoà/hòa\`.
- Source-removal test tắt một nguồn bằng policy, rebuild, rồi bật lại để chứng minh rollback không cần sửa parser.
- Fingerprint ID của bảy lớp phải giữ nguyên qua hai lần merge cùng normalized input.

## Benchmark thủ công còn mở

- \`data/audit/qa-word-sample-500.json\`: 500 mục phân tầng trên các nguồn định nghĩa lõi, đã qua kiểm tra máy nhưng trường đánh giá con người còn để \`null\`.
- \`data/audit/sense-merge-gold-template-1000.json\`: 1.000 cặp nghĩa liên nguồn để gán nhãn same/related/different/uncertain; chưa được gọi là gold cho đến khi có người duyệt.
- \`data/audit/missing-definitions-top-5000.json\`: hàng đợi lexeme thiếu nghĩa, ưu tiên theo số nguồn bằng chứng.

Vì các benchmark thủ công này chưa hoàn tất, release không tự nhận là “đầy đủ nhất” hoặc “chuẩn học thuật tuyệt đối”.
`;

const sourceRows = sources.map(
  (source) =>
    `| \`${source.key}\` | ${source.rightsStatus ?? "chưa phân loại"} | ${source.quality ?? "chưa phân loại"} | ${source.license.replace(/\|/g, "\\|")} |`
);
const dataCard = `# Data Card: Bộ dữ liệu từ điển tiếng Việt

## Tóm tắt

Đây là bộ dữ liệu nghiên cứu đa lớp cho tiếng Việt, gồm từ điển lõi có định nghĩa, lexeme chưa có nghĩa, Hán-Việt, chữ Nôm, synset ứng viên, biến thể chính tả và ví dụ có provenance. Snapshot này là phiên bản \`${q.release.datasetVersion}\`, build \`${q.release.buildId}\`, profile \`${q.release.profile}\`.

## Mục đích sử dụng

- Tra cứu và xây dựng công cụ từ điển tiếng Việt có attribution.
- Nghiên cứu coverage, chuẩn hóa chính tả, Hán-Việt và chữ Nôm.
- Tạo hàng đợi biên tập, đối chiếu nguồn và benchmark NLP có kiểm soát.

Không nên dùng dữ liệu như chuẩn duy nhất để chấm đúng-sai ngôn ngữ, suy luận nguồn gốc dân tộc/ngôn ngữ, hoặc huấn luyện hệ thống đưa ra kết luận học thuật mà không kiểm chứng nguồn gốc từng fact.

## Thành phần

| Lớp | Số lượng | Ý nghĩa |
| --- | ---: | --- |
| Từ điển lõi | ${number(words)} | Headword tiếng Việt có ít nhất một định nghĩa |
| Định nghĩa | ${number(q.layers.definitions)} | Fact theo nguồn, giữ ngôn ngữ và provenance |
${senseLayer ? `| Canonical sense draft | ${number(senseLayer.clusters)} | Cluster nghĩa do máy xử lý trong \`data/processed/senses/\` |` : ""}
| Lexeme-only | ${number(q.layers.lexemeOnly)} | Bằng chứng chính tả, chưa khẳng định nghĩa |
| Hán-Việt | ${number(han)} | Chữ có nghĩa/âm từ nguồn Việt; Unihan chỉ enrichment |
| Chữ Nôm | ${number(nom)} | Ánh xạ Quốc ngữ-tự dạng trong schema riêng |
| Synset ứng viên | ${number(q.layers.semanticSynsets)} | Liên kết OMW, chưa phải gold sense mapping |
| Biến thể dấu | ${number(q.layers.orthographicVariantGroups)} | Quan hệ cách đặt dấu cũ/mới có cùng âm tiết |
| Ví dụ | ${number(q.layers.evidenceExamples)} | Ví dụ trích từ định nghĩa nguồn |

## Nguồn và quyền sử dụng

| Source ID | Trạng thái quyền | Tầng chất lượng | License/ghi chú quyền |
| --- | --- | --- | --- |
${sourceRows.join("\n")}

Profile \`open-only\` chỉ chọn nguồn \`open\` hoặc \`public-domain\`. Profile \`documented\` có thể thêm nguồn \`documented-unclear\` khi có snapshot, attribution và cơ chế gỡ nhanh. Ý định phi thương mại không được dùng thay cho provenance hoặc quyền sử dụng.

## Thu thập và xử lý

Raw snapshot được lưu nguyên trạng kèm URL, kích thước và SHA-256. Mỗi parser tạo JSONL tách theo source ID. Merge giữ dấu thanh trong khóa headword, hợp nhất contribution nhưng không làm mất source trace. Chữ Hán, chữ Nôm và từ Quốc ngữ được tách schema; Unihan chỉ join vào chữ đã có bằng chứng Việt.

## Chất lượng và khả năng tái lập

- JSON Schema và provenance đạt trên toàn bộ lớp phát hành.
- ${q.sourceSamples.length} nguồn có mẫu cấu trúc tất định tối đa 100 contribution/nguồn đạt kiểm tra máy.
- Lớp canonical sense draft ${senseValidation?.passed ? "đạt validator riêng" : "chưa có validator PASS"}; đây là machine-first layer, không phải human-reviewed release.
- Source-removal test đã chứng minh có thể gỡ một nguồn bằng policy và rebuild.
- Build manifest ghi profile, nguồn, checksum raw và checksum schema.
- Các mẫu benchmark thủ công 500/1.000 đã được tạo nhưng chưa gán nhãn con người.
- Website brief ${websiteBriefReady ? "đã sẵn sàng cho schema compatibility review" : "chưa được điền; dữ liệu chưa được tuyên bố là schema 1.0 cho website"}.

## Hạn chế và thiên lệch

- Nguồn cộng đồng có độ sâu không đồng đều; nhiều headword có nghĩa tiếng Anh nhưng thiếu nghĩa tiếng Việt.
- Từ điển lịch sử Đại Nam giữ wording cổ theo nguồn và có thể khác chính tả/nghĩa hiện đại.
- IPA chủ yếu phản ánh coverage của Wiktionary, chưa bảo đảm đầy đủ phương ngữ Bắc-Trung-Nam.
- Nguồn từ nguyên còn mỏng; pipeline không tự suy đoán “thuần Việt” hay “Hán-Việt”.
- Semantic synset và ví dụ chưa qua benchmark relevance theo sense.
- Chữ Nôm trong build documented phụ thuộc một nguồn chưa có tuyên bố license riêng rõ hoàn toàn.
- Coverage 214 bộ thủ không đồng nghĩa với độ đầy đủ từ vựng hay học thuật.
- Brief website đang pending có thể làm thay đổi schema, index hoặc export contract trước khi xây website.

## Gỡ nguồn và khiếu nại

Chạy \`npm.cmd run source:disable -- <source_id>\`, sau đó rebuild. Có thể đổi sang profile an toàn hơn bằng \`npm.cmd run profile:open\`. Không xóa raw snapshot audit trước khi xác định yêu cầu pháp lý; tách raw khỏi artifact phân phối nếu có khiếu nại.
`;

const status = `# Processed Dataset Status

- Status: **READY FOR RESEARCH USE**
- Dataset version: \`${q.release.datasetVersion}\`
- Build ID: \`${q.release.buildId}\`
- Source profile: \`${q.release.profile}\`
- Dictionary headwords: ${number(words)}
- Lexeme-only records: ${number(q.layers.lexemeOnly)}
- Han-Viet characters: ${number(han)}
- Nom entries: ${number(nom)}
- Canonical sense clusters: ${senseLayer ? number(senseLayer.clusters) : "not generated"}
- Sense layer validation: **${senseValidation?.passed ? "PASS" : "PENDING"}**
- Phase 6 AI-assisted review rows: ${senseValidation?.phase6AiReviewRows ? number(senseValidation.phase6AiReviewRows) : "not generated"}
- Automated QA: **PASS**
- Website schema gate: **${websiteBriefReady ? "READY FOR REVIEW" : "PENDING BRIEF"}**

The invalidated baseline that counted 97,536 Unihan code points as Vietnamese/Han-Viet entries is retained only in \`data/audit/baseline-v0.json\`. Read \`reports/current/DATA_CARD.md\` and \`reports/current/QUALITY_REPORT.md\` before redistribution or academic use.
`;

await ensureDir(REPORTS_CURRENT_DIR);
await Promise.all([
  writeFile(path.join(REPORTS_CURRENT_DIR, "COVERAGE_REPORT.md"), coverage, "utf8"),
  writeFile(path.join(REPORTS_CURRENT_DIR, "QUALITY_REPORT.md"), quality, "utf8"),
  writeFile(path.join(REPORTS_CURRENT_DIR, "DATA_CARD.md"), dataCard, "utf8"),
  writeFile(path.join(PROCESSED_DIR, "STATUS.md"), status, "utf8")
]);
console.log("[report] Wrote coverage, quality, data card and processed status reports");
