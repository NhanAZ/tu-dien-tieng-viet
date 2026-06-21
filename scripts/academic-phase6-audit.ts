import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { NORMALIZED_DIR, PROCESSED_DIR, ROOT, ensureDir, readJson, writeJson } from "./lib/paths.js";
import type { VariantEntry, WordEntry } from "./lib/types.js";

interface SourceTraceLike {
  source_id: string;
  raw_record_hash: string;
  confidence: number;
  review_status: string;
}

const AUDIT_DIR = path.join(ROOT, "data", "audit", "academic");
const OUTPUT_PATH = path.join(AUDIT_DIR, "phase6-summary.json");
const REPORT_PATH = path.join(ROOT, "reports", "academic-phase6-audit-0.4.0.md");
const PHASE6_INDEX_PATH = path.join(PROCESSED_DIR, "phase6", "index.json");
const PHASE6_CONFLICTS_SUMMARY_PATH = path.join(PROCESSED_DIR, "phase6", "pronunciation-conflicts.json");

interface BucketCounts {
  formatting_only: number;
  dialect_source_variant: number;
  source_attested_variant: number;
  unresolved: number;
}

interface ConflictSummary {
  conflictHeadwords: number;
  bucketCounts: BucketCounts;
  metadataGaps: {
    factsWithoutDialect: number;
    conflictFactsWithoutDialect: number;
    conflictHeadwordsWithoutDialect: number;
    transcriptionSystemCounts: Record<string, number>;
  };
}

async function readArrays<T>(dir: string): Promise<T[]> {
  if (!existsSync(dir)) return [];
  const { readdir } = await import("node:fs/promises");
  const rows: T[] = [];
  for (const file of (await readdir(dir)).filter((name) => name.endsWith(".json")).sort()) {
    rows.push(...(await readJson<T[]>(path.join(dir, file))));
  }
  return rows;
}

async function normalizedWords(): Promise<WordEntry[]> {
  const { readdir, readFile } = await import("node:fs/promises");
  const rows: WordEntry[] = [];
  for (const source of (await readdir(NORMALIZED_DIR, { withFileTypes: true })).filter((item) => item.isDirectory())) {
    const filePath = path.join(NORMALIZED_DIR, source.name, "words.jsonl");
    if (!existsSync(filePath)) continue;
    for (const line of (await readFile(filePath, "utf8")).split(/\r?\n/g)) {
      if (line.trim()) rows.push(JSON.parse(line) as WordEntry);
    }
  }
  return rows;
}

function percent(value: number, total: number): number {
  return total === 0 ? 0 : Number(((value / total) * 100).toFixed(2));
}

function increment(target: Record<string, number>, key: string, amount = 1): void {
  target[key] = (target[key] ?? 0) + amount;
}

function validTrace(trace: SourceTraceLike): boolean {
  return (
    Boolean(trace.source_id) &&
    /^[0-9a-f]{64}$/.test(trace.raw_record_hash) &&
    trace.confidence >= 0 &&
    trace.confidence <= 1 &&
    ["unreviewed", "machine-checked", "human-reviewed"].includes(trace.review_status)
  );
}

const words = await readArrays<WordEntry>(path.join(PROCESSED_DIR, "words"));
const variants = await readJson<VariantEntry[]>(path.join(PROCESSED_DIR, "variants", "orthography.json"));
const normalized = await normalizedWords();
const phase6Index = existsSync(PHASE6_INDEX_PATH) ? await readJson<{
  pronunciationFacts: number;
  pronunciationHeadwords: number;
  originFacts: number;
  originHeadwords: number;
  projectionCompatibility: {
    processedIpaHeadwords: number;
    processedIpaWithMatchingFact: number;
    processedOriginHeadwords: number;
    processedOriginWithMatchingFact: number;
  };
  aiReview?: {
    totalDecisions: number;
    taskCounts: Record<string, number>;
    decisionCounts: Record<string, number>;
    confidenceCounts: Record<string, number>;
    requiresHumanConfirmation: number;
    promotionAllowed: number;
  };
}>(PHASE6_INDEX_PATH) : null;
const phase6ConflictSummary = existsSync(PHASE6_CONFLICTS_SUMMARY_PATH)
  ? await readJson<ConflictSummary>(PHASE6_CONFLICTS_SUMMARY_PATH)
  : null;

const ipaWords = words.filter((word) => word.pronunciation_ipa);
const ipaByNormalizedWord = new Map<string, Set<string>>();
const ipaNormalizedSourceCounts: Record<string, number> = {};
for (const word of normalized) {
  if (!word.pronunciation_ipa) continue;
  const values = ipaByNormalizedWord.get(word.headword_normalized) ?? new Set<string>();
  values.add(word.pronunciation_ipa);
  ipaByNormalizedWord.set(word.headword_normalized, values);
  for (const source of word.sources) increment(ipaNormalizedSourceCounts, source);
}
const allIpaConflictHeadwords = [...ipaByNormalizedWord.entries()]
  .filter(([, values]) => values.size > 1)
  .map(([headword, values]) => ({ headword, ipaValues: [...values].sort() }));
const ipaConflictSamples = allIpaConflictHeadwords.slice(0, 500);
const conflictBucketCounts: BucketCounts = phase6ConflictSummary?.bucketCounts ?? {
  formatting_only: 0,
  dialect_source_variant: 0,
  source_attested_variant: 0,
  unresolved: allIpaConflictHeadwords.length
};
const conflictMetadataGaps = phase6ConflictSummary?.metadataGaps ?? {
  factsWithoutDialect: 0,
  conflictFactsWithoutDialect: 0,
  conflictHeadwordsWithoutDialect: allIpaConflictHeadwords.length,
  transcriptionSystemCounts: {}
};
const conflictHeadwordCount = phase6ConflictSummary?.conflictHeadwords ?? allIpaConflictHeadwords.length;

let etymologyFacts = 0;
let invalidEtymologyProvenance = 0;
const etymologySourceCounts: Record<string, number> = {};
const etymologyLanguageCounts: Record<string, number> = {};
for (const word of words) {
  for (const fact of word.etymologies) {
    etymologyFacts += 1;
    increment(etymologySourceCounts, fact.source);
    increment(etymologyLanguageCounts, fact.language);
    if (!validTrace(fact.provenance)) invalidEtymologyProvenance += 1;
  }
}

const originCounts: Record<string, number> = {};
for (const word of words) increment(originCounts, word.origin);
const nonUnknownOriginWords = words.filter((word) => word.origin !== "không rõ").length;

let variantForms = 0;
let variantProvenanceTraces = 0;
let invalidVariantProvenance = 0;
const variantRelationCounts: Record<string, number> = {};
for (const variant of variants) {
  variantForms += variant.forms.length;
  increment(variantRelationCounts, variant.relation);
  variantProvenanceTraces += variant.provenance.length;
  invalidVariantProvenance += variant.provenance.filter((trace) => !validTrace(trace)).length;
}

const output = {
  generatedAt: new Date().toISOString(),
  status: "NOT_READY_FOR_PHASE6_RELEASE",
  headwords: words.length,
  pronunciation: {
    headwordsWithIpa: ipaWords.length,
    coveragePercent: percent(ipaWords.length, words.length),
    normalizedSourceCounts: ipaNormalizedSourceCounts,
    directFactProvenanceSupportedBySchema: false,
    directFactProvenanceRows: 0,
    factLayer: phase6Index
      ? {
          facts: phase6Index.pronunciationFacts,
          headwords: phase6Index.pronunciationHeadwords,
          projectionCompatibleHeadwords: phase6Index.projectionCompatibility.processedIpaWithMatchingFact,
          projectedScalarHeadwords: phase6Index.projectionCompatibility.processedIpaHeadwords
        }
      : null,
    conflictHeadwords: conflictHeadwordCount,
    conflictBucketCounts,
    conflictMetadataGaps,
    conflictSamples: ipaConflictSamples,
    aiReview: phase6Index?.aiReview ?? null
  },
  etymology: {
    headwordsWithEtymology: words.filter((word) => word.etymologies.length > 0).length,
    coveragePercent: percent(words.filter((word) => word.etymologies.length > 0).length, words.length),
    facts: etymologyFacts,
    sourceCounts: etymologySourceCounts,
    languageCounts: etymologyLanguageCounts,
    invalidProvenance: invalidEtymologyProvenance
  },
  origin: {
    counts: originCounts,
    nonUnknownHeadwords: nonUnknownOriginWords,
    directFactProvenanceSupportedBySchema: false,
    factLayer: phase6Index
      ? {
          facts: phase6Index.originFacts,
          headwords: phase6Index.originHeadwords,
          projectionCompatibleHeadwords: phase6Index.projectionCompatibility.processedOriginWithMatchingFact,
          projectedScalarHeadwords: phase6Index.projectionCompatibility.processedOriginHeadwords
        }
      : null
  },
  variants: {
    groups: variants.length,
    forms: variantForms,
    relationCounts: variantRelationCounts,
    provenanceTraces: variantProvenanceTraces,
    invalidProvenance: invalidVariantProvenance
  },
  blockers: [
    "pronunciation_ipa remains a compatibility scalar; use pronunciation_facts for provenance",
    "origin remains a compatibility scalar; use origin_facts for provenance",
    "IPA conflicts are bucketed, but dialect metadata coverage is still incomplete",
    "AI review is advisory only and does not replace human or expert benchmark labels",
    "orthographic variants currently cover only tone-placement groups",
    "no human or expert benchmark exists for pronunciation, etymology or origin"
  ],
  nextActions: [
    "Preserve pronunciation_ipa and origin as compatibility projections until website schema review",
    "Resolve unresolved pronunciation conflict buckets before any scalar IPA release decision",
    "Use the AI review layer to prioritize human review, not to promote scalar IPA or dialect fields",
    "Add source-specific dialect metadata where available; do not infer dialect from IPA strings",
    "Audit etymology language/source coverage before adding etymology sources",
    "Expand variants only from source-attributed orthographic standards"
  ]
};

await ensureDir(AUDIT_DIR);
await writeJson(OUTPUT_PATH, output);
await ensureDir(path.dirname(REPORT_PATH));
await writeFile(
  REPORT_PATH,
  `# Academic Phase 6 Audit 0.4.0

Ngày sinh: ${output.generatedAt}

Trạng thái: **${output.status}**

| Hạng mục | Coverage / số lượng | Provenance |
| --- | ---: | --- |
| Headword có IPA | ${output.pronunciation.headwordsWithIpa.toLocaleString("vi-VN")} (${output.pronunciation.coveragePercent}%) | scalar compatibility |
| Pronunciation facts | ${(output.pronunciation.factLayer?.facts ?? 0).toLocaleString("vi-VN")} | projection ${output.pronunciation.factLayer?.projectionCompatibleHeadwords ?? 0}/${output.pronunciation.factLayer?.projectedScalarHeadwords ?? 0} |
| Headword có nhiều IPA nguồn | ${output.pronunciation.conflictHeadwords.toLocaleString("vi-VN")} | formatting=${output.pronunciation.conflictBucketCounts.formatting_only.toLocaleString("vi-VN")}, source=${output.pronunciation.conflictBucketCounts.dialect_source_variant.toLocaleString("vi-VN")}, source-entry=${output.pronunciation.conflictBucketCounts.source_attested_variant.toLocaleString("vi-VN")}, unresolved=${output.pronunciation.conflictBucketCounts.unresolved.toLocaleString("vi-VN")} |
| AI-assisted review tasks | ${(output.pronunciation.aiReview?.totalDecisions ?? 0).toLocaleString("vi-VN")} | requires human=${(output.pronunciation.aiReview?.requiresHumanConfirmation ?? 0).toLocaleString("vi-VN")}, promotion=${output.pronunciation.aiReview?.promotionAllowed ?? 0} |
| Headword có từ nguyên | ${output.etymology.headwordsWithEtymology.toLocaleString("vi-VN")} (${output.etymology.coveragePercent}%) | ${output.etymology.invalidProvenance === 0 ? "PASS" : "FAIL"} |
| Etymology facts | ${output.etymology.facts.toLocaleString("vi-VN")} | invalid=${output.etymology.invalidProvenance} |
| Origin khác không rõ | ${output.origin.nonUnknownHeadwords.toLocaleString("vi-VN")} | scalar compatibility |
| Origin facts | ${(output.origin.factLayer?.facts ?? 0).toLocaleString("vi-VN")} | projection ${output.origin.factLayer?.projectionCompatibleHeadwords ?? 0}/${output.origin.factLayer?.projectedScalarHeadwords ?? 0} |
| Nhóm biến thể | ${output.variants.groups.toLocaleString("vi-VN")} | invalid=${output.variants.invalidProvenance} |
| Form trong nhóm biến thể | ${output.variants.forms.toLocaleString("vi-VN")} | ${output.variants.provenanceTraces.toLocaleString("vi-VN")} traces |

## Kết luận

Không ingest thêm IPA hoặc origin vào scalar trực tiếp. Lớp fact draft đã có projection tương thích cho scalar hiện tại; dialect metadata đã được khôi phục khi raw source có tag hoặc note địa danh rõ ràng. Các phần tử âm thanh khác nhau trong cùng source entry được giữ như source-attested alternatives, còn ${output.pronunciation.conflictMetadataGaps.factsWithoutDialect.toLocaleString("vi-VN")} pronunciation facts chưa có dialect và review queue qua nhiều entry/form vẫn mở nên chưa sẵn sàng release Pha 6. AI-assisted review đã đưa ra khuyến nghị bảo thủ cho ${(output.pronunciation.aiReview?.totalDecisions ?? 0).toLocaleString("vi-VN")} task, nhưng không thay thế human/expert review và không cho phép promote scalar. Etymology facts và variant traces hiện có provenance hợp lệ nhưng coverage còn hẹp.

Artifact máy đọc: \`data/audit/academic/phase6-summary.json\`.
`,
  "utf8"
);

console.log(
  `[academic:phase6-audit] ${output.status}: ipa=${ipaWords.length.toLocaleString("vi-VN")}, ` +
    `etymology=${etymologyFacts.toLocaleString("vi-VN")}, variants=${variants.length.toLocaleString("vi-VN")}`
);
