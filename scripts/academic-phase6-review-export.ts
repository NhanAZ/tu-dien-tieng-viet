import AdmZip from "adm-zip";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PROCESSED_DIR, ROOT, ensureDir } from "./lib/paths.js";

interface AiReviewDecision {
  task_id: string;
  task_type: string;
  headword_normalized: string;
  words?: unknown;
  decision: string;
  confidence: string;
  confidence_score: number;
  recommended_human_priority: string;
  rationale: string;
  evidence_summary?: {
    conflict_id?: string;
    pronunciation_id?: string;
    source?: string;
    raw_record_hash?: string;
    source_note?: string;
    reason_tags?: unknown;
    gap_reason?: unknown;
    entry_scope_reasons?: unknown;
  };
}

interface AiReviewSummary {
  totalDecisions: number;
  taskCounts: Record<string, number>;
  requiresHumanConfirmation: number;
  promotionAllowed: number;
  decisionCounts: Record<string, number>;
  academicStatus: string;
}

type CellValue = string | number;

const aiReviewDir = path.join(PROCESSED_DIR, "phase6", "ai-review");
const aiReviewPath = path.join(aiReviewDir, "ai-review-decisions.jsonl");
const summaryPath = path.join(aiReviewDir, "ai-review-summary.json");
const csvPath = path.join(aiReviewDir, "ai-review-decisions.csv");
const xlsxPath = path.join(aiReviewDir, "ai-review-decisions.xlsx");
const guidePath = path.join(ROOT, "docs", "Phase 6 pronunciation reviewer guide.md");

const headers = [
  "task_id",
  "task_type",
  "headword_normalized",
  "words",
  "ai_decision",
  "ai_confidence",
  "ai_confidence_score",
  "ai_priority",
  "ai_rationale",
  "source_evidence_key",
  "source",
  "raw_record_hash",
  "source_note",
  "reason_tags",
  "entry_scope_reasons",
  "human_decision",
  "human_selected_display_ipa",
  "human_selected_dialect",
  "human_qualifier_note",
  "human_reviewer_id",
  "human_reviewed_at",
  "human_notes"
] as const;

function readJsonl<T>(text: string): T[] {
  return text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(cellText).filter(Boolean).join("; ");
  return String(value);
}

function csvEscape(value: CellValue): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function evidenceKey(row: AiReviewDecision): string {
  return row.evidence_summary?.conflict_id ?? row.evidence_summary?.pronunciation_id ?? "";
}

function reasonTags(row: AiReviewDecision): string {
  return cellText(row.evidence_summary?.reason_tags ?? row.evidence_summary?.gap_reason ?? "");
}

function entryScopeReasons(row: AiReviewDecision): string {
  return cellText(row.evidence_summary?.entry_scope_reasons ?? "");
}

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function columnName(index: number): string {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function cellRef(rowIndex: number, colIndex: number): string {
  return `${columnName(colIndex)}${rowIndex + 1}`;
}

function writeCell(value: CellValue, rowIndex: number, colIndex: number, style: number): string {
  const ref = cellRef(rowIndex, colIndex);
  if (value === "") return `<c r="${ref}" s="${style}"/>`;
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  const rawText = String(value);
  const text = escapeXml(rawText);
  const space = /^\s|\s$|\n|\r/.test(rawText) ? ' xml:space="preserve"' : "";
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t${space}>${text}</t></is></c>`;
}

function worksheetXml(options: {
  rows: CellValue[][];
  widths: number[];
  freeze?: { rows?: number; cols?: number; topLeftCell: string };
  autoFilter?: boolean;
  mergeRefs?: string[];
  rowStyle?: (rowIndex: number, colIndex: number) => number;
}): string {
  const maxCols = Math.max(...options.rows.map((row) => row.length));
  const lastRef = cellRef(options.rows.length - 1, maxCols - 1);
  const cols = options.widths
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join("");
  const pane = options.freeze
    ? `<pane xSplit="${options.freeze.cols ?? 0}" ySplit="${options.freeze.rows ?? 0}" topLeftCell="${options.freeze.topLeftCell}" activePane="bottomRight" state="frozen"/>`
    : "";
  const sheetData = options.rows
    .map((row, rowIndex) => {
      const cells = Array.from({ length: maxCols }, (_, colIndex) => {
        const style = options.rowStyle?.(rowIndex, colIndex) ?? 2;
        return writeCell(row[colIndex] ?? "", rowIndex, colIndex, style);
      }).join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  const autoFilter = options.autoFilter ? `<autoFilter ref="A1:${lastRef}"/>` : "";
  const mergeCells = options.mergeRefs?.length
    ? `<mergeCells count="${options.mergeRefs.length}">${options.mergeRefs.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastRef}"/>
  <sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${cols}</cols>
  <sheetData>${sheetData}</sheetData>
  ${autoFilter}
  ${mergeCells}
</worksheet>`;
}

function workbookXml(sheetNames: string[]): string {
  const sheets = sheetNames
    .map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheets}</sheets>
</workbook>`;
}

function workbookRelsXml(sheetNames: string[]): string {
  const sheetRels = sheetNames
    .map(
      (_name, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRels}
  <Relationship Id="rId${sheetNames.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function rootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function contentTypesXml(sheetCount: number): string {
  const sheets = Array.from(
    { length: sheetCount },
    (_item, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  ${sheets}
</Types>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F4E5F"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF2"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF2E3C6"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right><top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment wrapText="1" vertical="top"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

function docPropsXml(now: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Phase 6 AI-Assisted Review Export</dc:title>
  <dc:creator>tu-dien-tieng-viet-data pipeline</dc:creator>
  <cp:lastModifiedBy>tu-dien-tieng-viet-data pipeline</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

function appPropsXml(sheetNames: string[]): string {
  const sheetList = sheetNames.map((name) => `<vt:lpstr>${escapeXml(name)}</vt:lpstr>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>tu-dien-tieng-viet-data</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheetNames.length}</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="${sheetNames.length}" baseType="lpstr">${sheetList}</vt:vector></TitlesOfParts>
</Properties>`;
}

function writeXlsx(summary: AiReviewSummary, rows: CellValue[][]): void {
  const summaryRows: CellValue[][] = [
    ["Phase 6 AI-Assisted Review Export", "", "", "", ""],
    ["", "", "", "", ""],
    ["Metric", "Value", "", "Reviewer workflow", ""],
    ["Total AI decisions", summary.totalDecisions, "", "1", "Review high-priority rows first."],
    ["Pronunciation conflict tasks", summary.taskCounts.pronunciation_conflict_review ?? 0, "", "2", "Check source evidence before filling human fields."],
    ["Dialect-label tasks", summary.taskCounts.dialect_label_review ?? 0, "", "3", "AI suggestions are advisory, not human-reviewed labels."],
    ["Requires human confirmation", summary.requiresHumanConfirmation, "", "4", "Do not promote IPA/dialect/origin from AI alone."],
    ["Promotion allowed", summary.promotionAllowed, "", "5", "Return completed sheet for a reviewed-layer importer."],
    ["split_by_source_entry_or_pos", summary.decisionCounts.split_by_source_entry_or_pos ?? 0, "", "", ""],
    ["insufficient_evidence", summary.decisionCounts.insufficient_evidence ?? 0, "", "", ""],
    ["split_label_and_qualifier", summary.decisionCounts.split_label_and_qualifier ?? 0, "", "", ""],
    ["Academic status", summary.academicStatus, "", "", ""]
  ];
  const allowedRows: CellValue[][] = [
    ["Decision", "Meaning", "Reviewer caution"],
    ["split_by_source_entry_or_pos", "Keep pronunciations separated by source record, source spelling, or POS.", "Do not choose one scalar IPA."],
    ["insufficient_evidence", "Evidence is not enough to decide.", "Keep task open or request expert review."],
    ["split_label_and_qualifier", "Separate a source label from a qualifier after confirmation.", "Do not promote without reviewer confirmation."],
    ["keep_all_source_attested_variants", "Keep all source-published variants as separate facts.", "Preserve provenance."],
    ["select_one_display_ipa", "Choose display IPA only when source evidence and policy justify it.", "Requires strong human/expert confirmation."],
    ["requires_parser_followup", "Send back to parser/source-record handling.", "Do not make linguistic decision yet."],
    ["assign_recognized_dialect", "Assign dialect metadata from explicit source label.", "Do not infer from IPA."],
    ["not_a_dialect_label", "Source note/tag is not dialect metadata.", "Keep as note/evidence only."],
    ["leave_dialect_null", "Leave dialect blank/null.", "Use when evidence is absent or ambiguous."]
  ];
  const sheetNames = ["Summary", "Review Tasks", "Allowed Decisions"];
  const zip = new AdmZip();
  const now = new Date().toISOString();
  zip.addFile("[Content_Types].xml", Buffer.from(contentTypesXml(sheetNames.length), "utf8"));
  zip.addFile("_rels/.rels", Buffer.from(rootRelsXml(), "utf8"));
  zip.addFile("docProps/core.xml", Buffer.from(docPropsXml(now), "utf8"));
  zip.addFile("docProps/app.xml", Buffer.from(appPropsXml(sheetNames), "utf8"));
  zip.addFile("xl/workbook.xml", Buffer.from(workbookXml(sheetNames), "utf8"));
  zip.addFile("xl/_rels/workbook.xml.rels", Buffer.from(workbookRelsXml(sheetNames), "utf8"));
  zip.addFile("xl/styles.xml", Buffer.from(stylesXml(), "utf8"));
  zip.addFile(
    "xl/worksheets/sheet1.xml",
    Buffer.from(
      worksheetXml({
        rows: summaryRows,
        widths: [34, 28, 4, 8, 54],
        mergeRefs: ["A1:E1"],
        rowStyle: (rowIndex) => (rowIndex === 0 ? 3 : rowIndex === 2 ? 4 : 2)
      }),
      "utf8"
    )
  );
  zip.addFile(
    "xl/worksheets/sheet2.xml",
    Buffer.from(
      worksheetXml({
        rows: [headers as unknown as CellValue[], ...rows],
        widths: [34, 28, 24, 24, 26, 14, 14, 14, 70, 42, 24, 42, 38, 34, 34, 26, 26, 26, 30, 24, 24, 50],
        freeze: { rows: 1, cols: 3, topLeftCell: "D2" },
        autoFilter: true,
        rowStyle: (rowIndex) => (rowIndex === 0 ? 1 : 2)
      }),
      "utf8"
    )
  );
  zip.addFile(
    "xl/worksheets/sheet3.xml",
    Buffer.from(
      worksheetXml({
        rows: allowedRows,
        widths: [34, 66, 54],
        freeze: { rows: 1, cols: 0, topLeftCell: "A2" },
        autoFilter: true,
        rowStyle: (rowIndex) => (rowIndex === 0 ? 1 : 2)
      }),
      "utf8"
    )
  );
  zip.writeZip(xlsxPath);
}

function reviewerGuide(): string {
  return `# Hướng dẫn review phát âm Phase 6

Tài liệu này dùng cho gói review 590 tác vụ phát âm/dialect-label sinh từ lớp AI-assisted advisory.

AI chỉ đóng vai trò gợi ý. Chỉ quyết định do người/chuyên gia xác nhận mới được đưa sang reviewed layer hoặc dùng cho projection policy.

## File đầu vào

- JSONL gốc: \`data/processed/phase6/ai-review/ai-review-decisions.jsonl\`
- Bảng CSV: \`data/processed/phase6/ai-review/ai-review-decisions.csv\`
- Workbook XLSX: \`data/processed/phase6/ai-review/ai-review-decisions.xlsx\`

## Cột reviewer cần điền

- \`human_decision\`
- \`human_selected_display_ipa\` nếu có đủ căn cứ để chọn IPA hiển thị
- \`human_selected_dialect\` nếu dialect được nguồn ghi rõ
- \`human_qualifier_note\` nếu source note có phần mô tả thêm không phải dialect
- \`human_reviewer_id\`
- \`human_reviewed_at\`
- \`human_notes\`

## Ý nghĩa quyết định

- \`split_by_source_entry_or_pos\`: giữ phát âm tách theo source record, cách viết của nguồn, hoặc POS; không chọn một scalar IPA.
- \`insufficient_evidence\`: bằng chứng chưa đủ; giữ tác vụ mở hoặc chuyển chuyên gia.
- \`split_label_and_qualifier\`: source note có thể gồm nhãn dialect/place và qualifier; chỉ tách sau khi reviewer xác nhận.
- \`keep_all_source_attested_variants\`: giữ mọi biến thể được nguồn công bố, kèm provenance.
- \`select_one_display_ipa\`: chỉ chọn IPA hiển thị khi bằng chứng nguồn và policy cho phép rõ ràng.
- \`requires_parser_followup\`: trả về tầng parser/source-record, chưa đưa ra quyết định ngôn ngữ học.
- \`assign_recognized_dialect\`: gán dialect từ nhãn nguồn ghi rõ.
- \`not_a_dialect_label\`: note/tag của nguồn không phải metadata dialect.
- \`leave_dialect_null\`: để dialect trống/null khi thiếu hoặc mơ hồ.

## Quy tắc bắt buộc

- Không xem AI review là human review.
- Không suy dialect từ dạng IPA, thứ tự âm, nguồn, hoặc mục từ lân cận.
- Không promote bất kỳ AI decision nào vào \`pronunciation_ipa\`, \`dialect\`, \`origin\`, hoặc etymology.
- Không xóa fact nguồn chỉ để giảm số conflict.
- Luôn giữ source ID, raw hash, evidence key, confidence, review status và rationale.

## Quy trình đề xuất

1. Lọc \`ai_priority\`, bắt đầu từ \`high\`.
2. Kiểm \`source_evidence_key\`, \`source_note\`, \`reason_tags\`, và \`entry_scope_reasons\`.
3. Chỉ điền \`human_decision\` khi bằng chứng nguồn đủ mạnh.
4. Điền reviewer ID, ngày review, và ghi chú.
5. Trả lại CSV/XLSX đã điền để import vào reviewed layer riêng.
`;
}

const decisions = readJsonl<AiReviewDecision>(await readFile(aiReviewPath, "utf8"));
const summary = JSON.parse(await readFile(summaryPath, "utf8")) as AiReviewSummary;

const rows: CellValue[][] = decisions.map((row) => [
  row.task_id,
  row.task_type,
  row.headword_normalized,
  cellText(row.words),
  row.decision,
  row.confidence,
  row.confidence_score,
  row.recommended_human_priority,
  row.rationale,
  evidenceKey(row),
  row.evidence_summary?.source ?? "",
  row.evidence_summary?.raw_record_hash ?? "",
  row.evidence_summary?.source_note ?? "",
  reasonTags(row),
  entryScopeReasons(row),
  "",
  "",
  "",
  "",
  "",
  "",
  ""
]);

const csvText = `\uFEFF${[headers as unknown as CellValue[], ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n")}\r\n`;

await ensureDir(aiReviewDir);
await ensureDir(path.dirname(guidePath));
await writeFile(csvPath, csvText, "utf8");
writeXlsx(summary, rows);
await writeFile(guidePath, reviewerGuide(), "utf8");

console.log(`[phase6-review-export] wrote ${rows.length} review rows`);
console.log(`[phase6-review-export] ${csvPath}`);
console.log(`[phase6-review-export] ${xlsxPath}`);
console.log(`[phase6-review-export] ${guidePath}`);
