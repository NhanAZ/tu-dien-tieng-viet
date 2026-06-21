import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { createGunzip } from "node:zlib";

import { NORMALIZED_DIR, PROCESSED_DIR, RAW_DIR, ROOT, ensureDir, inputStream, readJson, resetDir, writeJson } from "./lib/paths.js";
import { sourceTrace } from "./lib/provenance.js";
import { sourceIsSelected } from "./lib/sources.js";
import { cleanText, normalizeHeadword, shortHash, slugifyWord } from "./lib/text.js";
import type { SourceTrace, WordEntry, WordOrigin } from "./lib/types.js";
import { isVietnameseKaikkiEntry, senseGlosses, type KaikkiEntry } from "./normalizers/kaikki.js";

interface PronunciationFact {
  pronunciation_id: string;
  word: string;
  headword_normalized: string;
  ipa: string;
  transcription_system: "IPA";
  dialect: string | null;
  source_entry_word: string | null;
  source_entry_pos: string | null;
  source_sound_index: number | null;
  source_tags: string[];
  source_note: string | null;
  source: string;
  confidence: number;
  review_status: SourceTrace["review_status"];
  provenance: SourceTrace;
}

interface OriginFact {
  origin_id: string;
  word: string;
  headword_normalized: string;
  origin: WordOrigin;
  method: "normalized-source-origin-inference";
  source: string;
  confidence: number;
  review_status: SourceTrace["review_status"];
  provenance: SourceTrace;
}

interface DialectCoverageEntry {
  source: string;
  method: string;
  facts: number;
  facts_with_dialect: number;
  facts_without_dialect: number;
  dialect_counts: Record<string, number>;
  unrecovered_reason: string | null;
}

type DialectGapReason =
  | "no_explicit_source_label"
  | "non_geographic_note_qualifier"
  | "recognized_geographic_label_with_qualifier"
  | "unrecognized_explicit_note"
  | "unrecognized_explicit_tag";

type DialectGapRoute =
  | "source_metadata_unavailable"
  | "not_a_dialect_label"
  | "manual_label_parsing_review"
  | "manual_label_review";

interface DialectGapRow {
  pronunciation_id: string;
  headword_normalized: string;
  word: string;
  source: string;
  source_entry_id: string | null;
  raw_record_hash: string;
  source_tags: string[];
  source_note: string | null;
  gap_reason: DialectGapReason;
  review_route: DialectGapRoute;
  review_status: "unreviewed";
}

const PHASE6_DIR = path.join(PROCESSED_DIR, "phase6");
const PRONUNCIATION_PATH = path.join(PHASE6_DIR, "pronunciation-facts.jsonl");
const PRONUNCIATION_SAMPLE_PATH = path.join(PHASE6_DIR, "pronunciation-facts.sample.jsonl");
const ORIGIN_PATH = path.join(PHASE6_DIR, "origin-facts.jsonl");
const ORIGIN_SAMPLE_PATH = path.join(PHASE6_DIR, "origin-facts.sample.jsonl");
const INDEX_PATH = path.join(PHASE6_DIR, "index.json");
const DIALECT_COVERAGE_PATH = path.join(PHASE6_DIR, "pronunciation-dialect-coverage.json");
const DIALECT_GAP_SUMMARY_PATH = path.join(PHASE6_DIR, "pronunciation-dialect-gaps.json");
const DIALECT_GAP_DETAILS_PATH = path.join(PHASE6_DIR, "pronunciation-dialect-gaps.jsonl");
const DIALECT_GAP_SAMPLE_PATH = path.join(PHASE6_DIR, "pronunciation-dialect-gaps.sample.jsonl");
const DIALECT_GAP_REPORT_PATH = path.join(ROOT, "reports", "academic-phase6-dialect-gaps-0.4.0.md");

const KAIKKI_RAW_FILES = [
  {
    source: "kaikki_viwiktionary" as const,
    fileName: "raw-wiktextract-data.jsonl.gz",
    definitionLanguage: "vi" as const
  },
  {
    source: "kaikki_enwiktionary_vi" as const,
    fileName: "kaikki.org-dictionary-Vietnamese.jsonl.gz",
    definitionLanguage: "en" as const
  }
];

const KAIKKI_DIALECT_LABELS = new Set([
  "Hà-Nội",
  "Huế",
  "Saigon",
  "Vinh",
  "Thanh-Chương",
  "Hà-Tĩnh",
  "Hanoi",
  "Quảng Nam",
  "Hội An",
  "Hoài Nhơn",
  "Phong Nha",
  "Đồng Hới",
  "Wanwei, Wutou"
]);

const NON_GEOGRAPHIC_NOTE_PATTERNS = [/\bspeech\b/i, /\bphonetic spelling\b/i, /\bmerger\b/i];

async function readProcessedWords(): Promise<WordEntry[]> {
  const wordsDir = path.join(PROCESSED_DIR, "words");
  const rows: WordEntry[] = [];
  for (const file of (await readdir(wordsDir)).filter((name) => name.endsWith(".json")).sort()) {
    rows.push(...(await readJson<WordEntry[]>(path.join(wordsDir, file))));
  }
  return rows;
}

async function readNormalizedWords(): Promise<WordEntry[]> {
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

function bestTrace(entry: WordEntry): SourceTrace | null {
  return entry.etymologies[0]?.provenance ?? entry.definitions[0]?.provenance ?? null;
}

function traceFor(entry: WordEntry, source: string, factKind: "pronunciation" | "origin"): SourceTrace | null {
  const trace = bestTrace(entry);
  if (!trace) return null;
  return {
    source_id: source,
    source_entry_id: `${entry.word}:${factKind}`,
    source_revision: trace.source_revision,
    raw_record_hash: trace.raw_record_hash,
    confidence: trace.confidence,
    review_status: trace.review_status
  };
}

async function writeJsonl(filePath: string, rows: unknown[]): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function tagsFromKaikkiSound(sound: Record<string, unknown>): string[] {
  const tags = Array.isArray(sound.tags) ? sound.tags : [];
  return [...new Set(tags
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => cleanText(tag))
    .filter(Boolean))];
}

function noteFromKaikkiSound(sound: Record<string, unknown>): string | null {
  return typeof sound.note === "string" && cleanText(sound.note) ? cleanText(sound.note) : null;
}

function dialectFromKaikkiSound(sourceTags: string[], sourceNote: string | null): string | null {
  const dialectLabels = [...sourceTags, ...(sourceNote ? [sourceNote] : [])].filter((label) =>
    KAIKKI_DIALECT_LABELS.has(label)
  );
  return dialectLabels.length > 0 ? [...new Set(dialectLabels)].join("; ") : null;
}

function classifyDialectGap(fact: PronunciationFact): Pick<DialectGapRow, "gap_reason" | "review_route"> {
  if (fact.source_tags.length > 0) {
    return { gap_reason: "unrecognized_explicit_tag", review_route: "manual_label_review" };
  }
  if (fact.source_note) {
    const sourceNote = fact.source_note;
    const hasQualifiedGeographicLabel = [...KAIKKI_DIALECT_LABELS].some(
      (label) =>
        sourceNote === label ||
        sourceNote.startsWith(`${label};`) ||
        sourceNote.startsWith(`${label},`) ||
        sourceNote.startsWith(`${label} (`)
    );
    if (hasQualifiedGeographicLabel) {
      return {
        gap_reason: "recognized_geographic_label_with_qualifier",
        review_route: "manual_label_parsing_review"
      };
    }
    if (NON_GEOGRAPHIC_NOTE_PATTERNS.some((pattern) => pattern.test(fact.source_note!))) {
      return { gap_reason: "non_geographic_note_qualifier", review_route: "not_a_dialect_label" };
    }
    return { gap_reason: "unrecognized_explicit_note", review_route: "manual_label_review" };
  }
  return { gap_reason: "no_explicit_source_label", review_route: "source_metadata_unavailable" };
}

function hasDefinitions(entry: KaikkiEntry, source: "kaikki_viwiktionary" | "kaikki_enwiktionary_vi"): boolean {
  const senses = Array.isArray(entry.senses) ? entry.senses : [];
  return senses.some((sense) => senseGlosses(sense, source === "kaikki_viwiktionary").length > 0);
}

async function addKaikkiPronunciationFacts(target: Map<string, PronunciationFact>): Promise<Set<string>> {
  const rawSourcesUsed = new Set<string>();
  for (const config of KAIKKI_RAW_FILES) {
    if (!sourceIsSelected(config.source)) continue;
    const filePath = path.join(RAW_DIR, config.source, config.fileName);
    if (!existsSync(filePath)) continue;
    rawSourcesUsed.add(config.source);
    const rl = readline.createInterface({
      input: inputStream(filePath).pipe(createGunzip()),
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      const entry = JSON.parse(line) as KaikkiEntry;
      if (!isVietnameseKaikkiEntry(entry) || !hasDefinitions(entry, config.source)) continue;
      const word = cleanText(entry.word);
      if (!word) continue;
      const sourceEntryPos = typeof entry.pos === "string" && cleanText(entry.pos) ? cleanText(entry.pos) : "unknown";
      const rawTrace = sourceTrace(config.source, null, line, { confidence: 0.85 });
      const sourceRecordKey = rawTrace.raw_record_hash.slice(0, 12);
      const sounds = Array.isArray(entry.sounds) ? entry.sounds : [];
      for (const [soundIndex, sound] of sounds.entries()) {
        const value = sound.ipa;
        if (typeof value !== "string" || !value.trim()) continue;
        const ipa = cleanText(value);
        const sourceTags = tagsFromKaikkiSound(sound);
        const sourceNote = noteFromKaikkiSound(sound);
        const dialect = dialectFromKaikkiSound(sourceTags, sourceNote);
        const provenance: SourceTrace = {
          ...rawTrace,
          source_entry_id: `${word}:${sourceEntryPos}:record:${sourceRecordKey}:pronunciation:${soundIndex + 1}`
        };
        const idSeed = `${normalizeHeadword(word)}:${word}:${config.source}:${ipa}:${dialect ?? ""}:${
          provenance.raw_record_hash
        }:${soundIndex + 1}`;
        const fact: PronunciationFact = {
          pronunciation_id: `pronunciation-${slugifyWord(word)}-${shortHash(idSeed)}`,
          word,
          headword_normalized: normalizeHeadword(word),
          ipa,
          transcription_system: "IPA",
          dialect,
          source_entry_word: word,
          source_entry_pos: sourceEntryPos,
          source_sound_index: soundIndex + 1,
          source_tags: sourceTags,
          source_note: sourceNote,
          source: config.source,
          confidence: provenance.confidence,
          review_status: provenance.review_status,
          provenance
        };
        target.set(fact.pronunciation_id, fact);
      }
    }
  }
  return rawSourcesUsed;
}

function dialectCoverage(facts: PronunciationFact[]): DialectCoverageEntry[] {
  const bySource = new Map<string, PronunciationFact[]>();
  for (const fact of facts) {
    const rows = bySource.get(fact.source) ?? [];
    rows.push(fact);
    bySource.set(fact.source, rows);
  }
  return [...bySource.entries()]
    .map(([source, rows]) => {
      const dialectCounts: Record<string, number> = {};
      for (const fact of rows) {
        if (fact.dialect) increment(dialectCounts, fact.dialect);
      }
      const factsWithDialect = rows.filter((fact) => fact.dialect !== null && fact.dialect !== "").length;
      return {
        source,
        method: source.startsWith("kaikki_")
          ? "raw-kaikki-sounds-tags-and-notes"
          : "normalized-scalar-no-explicit-dialect",
        facts: rows.length,
        facts_with_dialect: factsWithDialect,
        facts_without_dialect: rows.length - factsWithDialect,
        dialect_counts: dialectCounts,
        unrecovered_reason:
          rows.length === factsWithDialect
            ? null
            : "raw/normalized pronunciation fact has no recognized explicit dialect tag or note; left null by design"
      };
    })
    .sort((a, b) => a.source.localeCompare(b.source));
}

const processedWords = await readProcessedWords();
const normalizedWords = await readNormalizedWords();
const pronunciationFactsById = new Map<string, PronunciationFact>();
const originFactsById = new Map<string, OriginFact>();
const rawKaikkiSourcesUsed = await addKaikkiPronunciationFacts(pronunciationFactsById);

for (const entry of normalizedWords) {
  const source = entry.sources[0] ?? entry.definitions[0]?.source ?? entry.etymologies[0]?.source;
  if (!source) continue;
  if (entry.pronunciation_ipa && !rawKaikkiSourcesUsed.has(source)) {
    const provenance = traceFor(entry, source, "pronunciation");
    if (provenance) {
      const idSeed = `${entry.headword_normalized}:${source}:${entry.pronunciation_ipa}:${provenance.raw_record_hash}`;
      const fact: PronunciationFact = {
        pronunciation_id: `pronunciation-${slugifyWord(entry.word)}-${shortHash(idSeed)}`,
        word: entry.word,
        headword_normalized: normalizeHeadword(entry.word),
        ipa: entry.pronunciation_ipa,
        transcription_system: "IPA",
        dialect: null,
        source_entry_word: entry.word,
        source_entry_pos: null,
        source_sound_index: null,
        source_tags: [],
        source_note: null,
        source,
        confidence: provenance.confidence,
        review_status: provenance.review_status,
        provenance
      };
      pronunciationFactsById.set(fact.pronunciation_id, fact);
    }
  }
  if (entry.origin !== "không rõ") {
    const provenance = traceFor(entry, source, "origin");
    if (provenance) {
      const idSeed = `${entry.headword_normalized}:${source}:${entry.origin}:${provenance.raw_record_hash}`;
      const fact: OriginFact = {
        origin_id: `origin-${slugifyWord(entry.word)}-${shortHash(idSeed)}`,
        word: entry.word,
        headword_normalized: normalizeHeadword(entry.word),
        origin: entry.origin,
        method: "normalized-source-origin-inference",
        source,
        confidence: provenance.confidence,
        review_status: provenance.review_status,
        provenance
      };
      originFactsById.set(fact.origin_id, fact);
    }
  }
}

const pronunciationFacts = [...pronunciationFactsById.values()].sort(
  (a, b) => a.headword_normalized.localeCompare(b.headword_normalized, "vi") || a.pronunciation_id.localeCompare(b.pronunciation_id)
);
const dialectGapRows: DialectGapRow[] = pronunciationFacts
  .filter((fact) => fact.dialect === null)
  .map((fact) => ({
    pronunciation_id: fact.pronunciation_id,
    headword_normalized: fact.headword_normalized,
    word: fact.word,
    source: fact.source,
    source_entry_id: fact.provenance.source_entry_id,
    raw_record_hash: fact.provenance.raw_record_hash,
    source_tags: fact.source_tags,
    source_note: fact.source_note,
    ...classifyDialectGap(fact),
    review_status: "unreviewed" as const
  }));
const originFacts = [...originFactsById.values()].sort(
  (a, b) => a.headword_normalized.localeCompare(b.headword_normalized, "vi") || a.origin_id.localeCompare(b.origin_id)
);
const pronunciationByHeadword = new Map<string, Set<string>>();
for (const fact of pronunciationFacts) {
  const values = pronunciationByHeadword.get(fact.headword_normalized) ?? new Set<string>();
  values.add(fact.ipa);
  pronunciationByHeadword.set(fact.headword_normalized, values);
}
const originByHeadword = new Map<string, Set<WordOrigin>>();
for (const fact of originFacts) {
  const values = originByHeadword.get(fact.headword_normalized) ?? new Set<WordOrigin>();
  values.add(fact.origin);
  originByHeadword.set(fact.headword_normalized, values);
}

const processedIpaWords = processedWords.filter((word) => word.pronunciation_ipa);
const processedIpaWithMatchingFact = processedIpaWords.filter((word) =>
  pronunciationByHeadword.get(word.headword_normalized)?.has(word.pronunciation_ipa!)
).length;
const processedOriginWords = processedWords.filter((word) => word.origin !== "không rõ");
const processedOriginWithMatchingFact = processedOriginWords.filter((word) =>
  originByHeadword.get(word.headword_normalized)?.has(word.origin)
).length;
const pronunciationSourceCounts: Record<string, number> = {};
for (const fact of pronunciationFacts) increment(pronunciationSourceCounts, fact.source);
const pronunciationDialectCoverage = dialectCoverage(pronunciationFacts);
const dialectGapReasonCounts: Record<string, number> = {};
const dialectGapRouteCounts: Record<string, number> = {};
const dialectGapSourceCounts: Record<string, number> = {};
const dialectGapSourceReasonCounts: Record<string, Record<string, number>> = {};
for (const row of dialectGapRows) {
  increment(dialectGapReasonCounts, row.gap_reason);
  increment(dialectGapRouteCounts, row.review_route);
  increment(dialectGapSourceCounts, row.source);
  const sourceReasons = dialectGapSourceReasonCounts[row.source] ?? {};
  increment(sourceReasons, row.gap_reason);
  dialectGapSourceReasonCounts[row.source] = sourceReasons;
}
const originSourceCounts: Record<string, number> = {};
const originValueCounts: Record<string, number> = {};
for (const fact of originFacts) {
  increment(originSourceCounts, fact.source);
  increment(originValueCounts, fact.origin);
}

const index = {
  generatedAt: new Date().toISOString(),
  status: "PHASE6_FACT_LAYER_DRAFT",
  headwords: processedWords.length,
  pronunciationFacts: pronunciationFacts.length,
  pronunciationHeadwords: pronunciationByHeadword.size,
  originFacts: originFacts.length,
  originHeadwords: originByHeadword.size,
  pronunciationSourceCounts,
  pronunciationDialectCoverage,
  pronunciationDialectGapSummary: {
    facts: dialectGapRows.length,
    reasonCounts: dialectGapReasonCounts,
    routeCounts: dialectGapRouteCounts,
    sourceCounts: dialectGapSourceCounts
  },
  originSourceCounts,
  originValueCounts,
  projectionCompatibility: {
    processedIpaHeadwords: processedIpaWords.length,
    processedIpaWithMatchingFact,
    processedOriginHeadwords: processedOriginWords.length,
    processedOriginWithMatchingFact
  },
  caveats: [
    "Pronunciation facts use normalized snapshots plus explicit raw Kaikki sounds; no IPA values are invented.",
    "Kaikki pronunciation facts preserve raw sound indexes, tags and notes.",
    "Kaikki dialect metadata uses only recognized explicit raw sounds.tags or sounds.note labels.",
    "Dialect remains null only when raw/normalized source metadata has no recognized explicit dialect label.",
    "pronunciation_ipa and origin remain compatibility scalar projections."
  ],
  files: {
    pronunciationFacts: "data/processed/phase6/pronunciation-facts.jsonl",
    originFacts: "data/processed/phase6/origin-facts.jsonl",
    pronunciationDialectCoverage: "data/processed/phase6/pronunciation-dialect-coverage.json",
    pronunciationDialectGapSummary: "data/processed/phase6/pronunciation-dialect-gaps.json",
    pronunciationDialectGapDetails: "data/processed/phase6/pronunciation-dialect-gaps.jsonl",
    pronunciationDialectGapSample: "data/processed/phase6/pronunciation-dialect-gaps.sample.jsonl"
  }
};

await resetDir(PHASE6_DIR);
await writeJsonl(PRONUNCIATION_PATH, pronunciationFacts);
await writeJsonl(PRONUNCIATION_SAMPLE_PATH, pronunciationFacts.slice(0, 500));
await writeJsonl(ORIGIN_PATH, originFacts);
await writeJsonl(ORIGIN_SAMPLE_PATH, originFacts.slice(0, 500));
await writeJson(DIALECT_COVERAGE_PATH, {
  generatedAt: index.generatedAt,
  status: "PHASE6_PRONUNCIATION_DIALECT_COVERAGE_DRAFT",
  facts: pronunciationFacts.length,
  factsWithDialect: pronunciationDialectCoverage.reduce((sum, row) => sum + row.facts_with_dialect, 0),
  factsWithoutDialect: pronunciationDialectCoverage.reduce((sum, row) => sum + row.facts_without_dialect, 0),
  sources: pronunciationDialectCoverage,
  caveats: [
    "Only recognized explicit source tags and notes are used as dialect metadata.",
    "No dialect is inferred from IPA strings, headwords or source identity.",
    "A null dialect means no recognized explicit dialect label was recoverable for that fact."
  ]
});
await writeJson(DIALECT_GAP_SUMMARY_PATH, {
  generatedAt: index.generatedAt,
  status: "PHASE6_PRONUNCIATION_DIALECT_GAPS_DRAFT",
  factsWithoutDialect: dialectGapRows.length,
  reasonCounts: dialectGapReasonCounts,
  routeCounts: dialectGapRouteCounts,
  sourceCounts: dialectGapSourceCounts,
  sourceReasonCounts: dialectGapSourceReasonCounts,
  files: {
    details: "data/processed/phase6/pronunciation-dialect-gaps.jsonl",
    sample: "data/processed/phase6/pronunciation-dialect-gaps.sample.jsonl"
  },
  caveats: [
    "Gap reasons describe source metadata availability; they do not infer a dialect.",
    "A recognized geographic label with extra qualifiers remains null until a parsing policy is reviewed.",
    "Every gap row links to one pronunciation fact and remains unreviewed."
  ]
});
await writeJsonl(DIALECT_GAP_DETAILS_PATH, dialectGapRows);
await writeJsonl(DIALECT_GAP_SAMPLE_PATH, dialectGapRows.slice(0, 500));
await writeJson(INDEX_PATH, index);

await ensureDir(path.dirname(DIALECT_GAP_REPORT_PATH));
await writeFile(
  DIALECT_GAP_REPORT_PATH,
  `# Academic Phase 6 Dialect Metadata Gaps 0.4.0

Generated: ${index.generatedAt}

Status: **PHASE6_PRONUNCIATION_DIALECT_GAPS_DRAFT**

| Gap reason | Facts |
| --- | ---: |
${Object.entries(dialectGapReasonCounts)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([reason, count]) => `| \`${reason}\` | ${count.toLocaleString("vi-VN")} |`)
  .join("\n")}

| Review route | Facts |
| --- | ---: |
${Object.entries(dialectGapRouteCounts)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([route, count]) => `| \`${route}\` | ${count.toLocaleString("vi-VN")} |`)
  .join("\n")}

No dialect is inferred from IPA, sound order, source identity or neighboring entries. Machine-readable details are in \`data/processed/phase6/pronunciation-dialect-gaps.jsonl\`.
`,
  "utf8"
);

console.log(
  `[academic:phase6-facts] ${index.status}: pronunciation=${pronunciationFacts.length.toLocaleString("vi-VN")}, ` +
    `origin=${originFacts.length.toLocaleString("vi-VN")}, ipaProjection=${processedIpaWithMatchingFact}/${processedIpaWords.length}, ` +
    `originProjection=${processedOriginWithMatchingFact}/${processedOriginWords.length}`
);
