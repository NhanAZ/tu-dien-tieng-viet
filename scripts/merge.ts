import { existsSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";

import { inputStream, NORMALIZED_DIR, PROCESSED_DIR, resetDir, writeJson, ensureDir } from "./lib/paths.js";
import { kangxiRadicalNumber, radicalFileName } from "./lib/kangxi.js";
import {
  cleanText,
  countSyllables,
  dedupeStrings,
  normalizeHeadword,
  mapPartOfSpeech,
  shortHash,
  slugifyWord,
  stripToneMarks,
  uniqueByMeaning,
  wordBucket,
  wordMergeKey
} from "./lib/text.js";
import type {
  EvidenceEntry,
  HanCharacterEntry,
  LexemeEntry,
  NomEntry,
  SemanticEntry,
  VariantEntry,
  WordEntry,
  WordOrigin
} from "./lib/types.js";
import { usedSources } from "./lib/sources.js";

interface MergeReport {
  generatedAt: string;
  wordEntriesRead: number;
  hanEntriesRead: number;
  uniqueWords: number;
  uniqueHanCharacters: number;
  mergedWordDuplicates: number;
  mergedHanDuplicates: number;
  lexemeEntriesRead: number;
  uniqueLexemesWithoutDefinitions: number;
  uniqueNomEntries: number;
  uniqueSemanticSynsets: number;
  uniqueVariantGroups: number;
  evidenceEntries: number;
  duplicateWords: Array<{ word: string; sources: string[]; definitions: number }>;
  duplicateHanCharacters: Array<{ character: string; sources: string[]; meanings: number }>;
  files: {
    wordBuckets: Record<string, number>;
    hanRadicals: Record<string, number>;
    lexemeBuckets: Record<string, number>;
    evidenceBuckets: Record<string, number>;
  };
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  if (!existsSync(filePath)) return [];
  const rl = readline.createInterface({ input: inputStream(filePath), crlfDelay: Infinity });
  const out: T[] = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    out.push(JSON.parse(line) as T);
  }
  return out;
}

async function collectNormalized<T>(fileName: string): Promise<T[]> {
  const { readdir } = await import("node:fs/promises");
  if (!existsSync(NORMALIZED_DIR)) return [];
  const dirs = await readdir(NORMALIZED_DIR, { withFileTypes: true });
  const selected = new Set(usedSources().map((source) => source.key));
  const out: T[] = [];
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    if (!selected.has(dir.name)) continue;
    out.push(...(await readJsonl<T>(path.join(NORMALIZED_DIR, dir.name, fileName))));
  }
  return out;
}

function chooseOrigin(current: WordOrigin, incoming: WordOrigin): WordOrigin {
  const rank: Record<WordOrigin, number> = {
    "không rõ": 0,
    "thuần Việt": 1,
    "vay mượn khác": 2,
    "Hán Việt": 3
  };
  return rank[incoming] > rank[current] ? incoming : current;
}

function mergeWord(existing: WordEntry, incoming: WordEntry): WordEntry {
  existing.pronunciation_ipa = existing.pronunciation_ipa ?? incoming.pronunciation_ipa;
  existing.part_of_speech = dedupeStrings([...existing.part_of_speech, ...incoming.part_of_speech]);
  existing.origin = chooseOrigin(existing.origin, incoming.origin);
  existing.han_viet_ref = dedupeStrings([...existing.han_viet_ref, ...incoming.han_viet_ref]);
  existing.han_nom_forms = dedupeStrings([...existing.han_nom_forms, ...incoming.han_nom_forms]);
  existing.definitions = uniqueByMeaning([...existing.definitions, ...incoming.definitions]);
  const etymologyKeys = new Set(existing.etymologies.map((item) => `${item.source}:${item.text}`));
  for (const item of incoming.etymologies) {
    const key = `${item.source}:${item.text}`;
    if (!etymologyKeys.has(key)) existing.etymologies.push(item);
    etymologyKeys.add(key);
  }
  existing.synonyms = dedupeStrings([...existing.synonyms, ...incoming.synonyms]);
  existing.antonyms = dedupeStrings([...existing.antonyms, ...incoming.antonyms]);
  existing.related_words = dedupeStrings([...existing.related_words, ...incoming.related_words]);
  existing.compound_words = dedupeStrings([...existing.compound_words, ...incoming.compound_words]);
  existing.sources = dedupeStrings([...existing.sources, ...incoming.sources]);
  return existing;
}

function mergeHan(existing: HanCharacterEntry, incoming: HanCharacterEntry): HanCharacterEntry {
  existing.radical = existing.radical ?? incoming.radical;
  existing.radical_stroke_count = existing.radical_stroke_count ?? incoming.radical_stroke_count;
  existing.total_stroke_count = existing.total_stroke_count ?? incoming.total_stroke_count;
  existing.readings_han_viet = dedupeStrings([...existing.readings_han_viet, ...incoming.readings_han_viet]);
  existing.readings_nom = dedupeStrings([...existing.readings_nom, ...incoming.readings_nom]);
  existing.writing_systems = [...new Set([...existing.writing_systems, ...incoming.writing_systems])];
  existing.meanings = uniqueByMeaning([...existing.meanings, ...incoming.meanings]);
  existing.compound_examples = dedupeStrings([...existing.compound_examples, ...incoming.compound_examples]);
  existing.variant_forms = dedupeStrings([...existing.variant_forms, ...incoming.variant_forms]);
  existing.sources = dedupeStrings([...existing.sources, ...incoming.sources]);
  return existing;
}

function assignWordIds(entries: WordEntry[]): WordEntry[] {
  const used = new Map<string, string>();
  return entries.map((entry) => {
    const base = slugifyWord(entry.word);
    const existingWord = used.get(base);
    const id = existingWord && existingWord !== entry.word ? `${base}-${shortHash(entry.word)}` : base;
    used.set(base, entry.word);
    return { ...entry, id };
  });
}

function stripDefinitionMarker(meaning: string): { meaning: string; partOfSpeech: string | null } {
  const text = cleanText(meaning);
  const match = text.match(
    /^(?:\d+[\).]?\s*)?(d|dt|đt|đg|đgt|t|tt|trt|tht|lt|l|pt|pht|ph)\.\s+(.+)$/iu
  );
  if (!match) return { meaning: text, partOfSpeech: null };
  const code = match[1]!.toLocaleLowerCase("vi-VN");
  const rest = cleanText(match[2]);
  const partOfSpeech =
    {
      d: "danh từ",
      dt: "danh từ",
      đt: "đại từ",
      "đg": "động từ",
      "đgt": "động từ",
      t: "tính từ",
      tt: "tính từ",
      trt: "trạng từ",
      tht: "thán từ",
      lt: "liên từ",
      l: "liên từ",
      pt: "phụ từ",
      pht: "phó từ",
      ph: "phó từ"
    }[code] ?? null;
  return { meaning: rest || text, partOfSpeech };
}

function sanitizeWord(entry: WordEntry): WordEntry {
  const normalizedDefinitions = entry.definitions
    .map((definition) => {
      const normalized = stripDefinitionMarker(definition.meaning);
      return {
        definition: {
          meaning: normalized.meaning,
          examples: dedupeStrings(definition.examples),
          source: cleanText(definition.source),
          language: definition.language,
          provenance: definition.provenance,
          labels: dedupeStrings(definition.labels)
        },
        partOfSpeech: normalized.partOfSpeech
      };
    })
    .filter(
      (item) =>
        item.definition.meaning &&
        item.definition.source &&
        !(item.definition.source === "dai_nam_quoc_am_tu_vi" && /^id\.?$/i.test(item.definition.meaning))
    );
  const inferredPartOfSpeech = normalizedDefinitions.flatMap((item) => item.partOfSpeech ?? []);
  return {
    id: entry.id,
    word: cleanText(entry.word),
    headword_normalized: normalizeHeadword(entry.word),
    headword_no_tone: stripToneMarks(entry.word),
    syllable_count: countSyllables(entry.word),
    language: "vi",
    pronunciation_ipa: entry.pronunciation_ipa ? cleanText(entry.pronunciation_ipa) : null,
    part_of_speech: dedupeStrings([...entry.part_of_speech.map(mapPartOfSpeech), ...inferredPartOfSpeech]),
    origin: entry.origin,
    han_viet_ref: dedupeStrings(entry.han_viet_ref),
    han_nom_forms: dedupeStrings(entry.han_nom_forms),
    definitions: uniqueByMeaning(normalizedDefinitions.map((item) => item.definition)),
    etymologies: entry.etymologies
      .map((item) => ({ ...item, text: cleanText(item.text), source: cleanText(item.source) }))
      .filter((item) => item.text && item.source),
    synonyms: dedupeStrings(entry.synonyms),
    antonyms: dedupeStrings(entry.antonyms),
    related_words: dedupeStrings(entry.related_words),
    compound_words: dedupeStrings(entry.compound_words),
    sources: dedupeStrings(entry.sources)
  };
}

function sanitizeHan(entry: HanCharacterEntry): HanCharacterEntry {
  return {
    id: entry.id,
    character: entry.character,
    radical: entry.radical,
    radical_stroke_count: entry.radical_stroke_count,
    total_stroke_count: entry.total_stroke_count,
    readings_han_viet: dedupeStrings(entry.readings_han_viet),
    readings_nom: dedupeStrings(entry.readings_nom),
    writing_systems: [...new Set(entry.writing_systems)],
    meanings: uniqueByMeaning(
      entry.meanings
        .map((meaning) => ({
          meaning: cleanText(meaning.meaning),
          source: cleanText(meaning.source),
          language: meaning.language,
          provenance: meaning.provenance
        }))
        .filter((meaning) => meaning.meaning && meaning.source)
    ),
    compound_examples: dedupeStrings(entry.compound_examples),
    variant_forms: dedupeStrings(entry.variant_forms),
    sources: dedupeStrings(entry.sources)
  };
}

function sanitizeLexeme(entry: LexemeEntry): LexemeEntry {
  const headword = cleanText(entry.headword);
  return {
    id: entry.id,
    headword,
    headword_normalized: normalizeHeadword(headword),
    headword_no_tone: stripToneMarks(headword),
    syllable_count: countSyllables(headword),
    language: "vi",
    evidence: entry.evidence.filter((item) => item.source_id && item.raw_record_hash)
  };
}

function mergeLexeme(existing: LexemeEntry, incoming: LexemeEntry): LexemeEntry {
  const seen = new Set(existing.evidence.map((item) => `${item.source_id}:${item.raw_record_hash}`));
  for (const item of incoming.evidence) {
    const key = `${item.source_id}:${item.raw_record_hash}`;
    if (!seen.has(key)) existing.evidence.push(item);
    seen.add(key);
  }
  return existing;
}

function mergeNom(existing: NomEntry, incoming: NomEntry): NomEntry {
  existing.variants = dedupeStrings([...existing.variants, ...incoming.variants]);
  existing.definition = existing.definition ?? incoming.definition;
  existing.definition_language = existing.definition_language ?? incoming.definition_language;
  existing.frequency = existing.frequency ?? incoming.frequency;
  return existing;
}

function mergeSemantic(existing: SemanticEntry, incoming: SemanticEntry): SemanticEntry {
  existing.lemmas = dedupeStrings([...existing.lemmas, ...incoming.lemmas]);
  const seen = new Set(existing.provenance.map((item) => `${item.source_id}:${item.raw_record_hash}`));
  for (const trace of incoming.provenance) {
    const key = `${trace.source_id}:${trace.raw_record_hash}`;
    if (!seen.has(key)) existing.provenance.push(trace);
    seen.add(key);
  }
  return existing;
}

function mergeVariant(existing: VariantEntry, incoming: VariantEntry): VariantEntry {
  existing.forms = dedupeStrings([...existing.forms, ...incoming.forms]);
  const seen = new Set(existing.provenance.map((item) => `${item.source_id}:${item.raw_record_hash}`));
  for (const trace of incoming.provenance) {
    const key = `${trace.source_id}:${trace.raw_record_hash}`;
    if (!seen.has(key)) existing.provenance.push(trace);
    seen.add(key);
  }
  return existing;
}

await resetDir(PROCESSED_DIR);
await ensureDir(path.join(PROCESSED_DIR, "words"));
await ensureDir(path.join(PROCESSED_DIR, "han-viet"));
await ensureDir(path.join(PROCESSED_DIR, "lexemes"));
await ensureDir(path.join(PROCESSED_DIR, "nom"));
await ensureDir(path.join(PROCESSED_DIR, "semantics"));
await ensureDir(path.join(PROCESSED_DIR, "evidence"));
await ensureDir(path.join(PROCESSED_DIR, "variants"));

const wordInputs = await collectNormalized<WordEntry>("words.jsonl");
const hanInputs = await collectNormalized<HanCharacterEntry>("han-viet.jsonl");
const hanMetadataInputs = await collectNormalized<HanCharacterEntry>("han-metadata.jsonl");
const lexemeInputs = await collectNormalized<LexemeEntry>("lexemes.jsonl");
const nomInputs = await collectNormalized<NomEntry>("nom.jsonl");
const semanticInputs = await collectNormalized<SemanticEntry>("semantics.jsonl");
const variantInputs = await collectNormalized<VariantEntry>("variants.jsonl");
const words = new Map<string, WordEntry>();
const hanCharacters = new Map<string, HanCharacterEntry>();
const lexemes = new Map<string, LexemeEntry>();
const nomEntries = new Map<string, NomEntry>();
const semanticEntries = new Map<string, SemanticEntry>();
const variantEntries = new Map<string, VariantEntry>();
let mergedWordDuplicates = 0;
let mergedHanDuplicates = 0;

for (const input of wordInputs) {
  const entry = sanitizeWord(input);
  if (!entry.word || entry.sources.length === 0 || !/\p{Script=Latin}/u.test(entry.word)) continue;
  const key = wordMergeKey(entry.word);
  const existing = words.get(key);
  if (existing) {
    mergedWordDuplicates += 1;
    mergeWord(existing, entry);
  } else {
    words.set(key, entry);
  }
}

for (const input of hanInputs) {
  const entry = sanitizeHan(input);
  const existing = hanCharacters.get(entry.id);
  if (existing) {
    mergedHanDuplicates += 1;
    mergeHan(existing, entry);
  } else {
    hanCharacters.set(entry.id, entry);
  }
}

// Unihan and similar metadata sources may enrich an established Vietnamese
// Han/Nom entry, but they are not allowed to create a lexical entry.
for (const input of hanMetadataInputs) {
  const entry = sanitizeHan(input);
  const existing = hanCharacters.get(entry.id);
  if (!existing) continue;
  mergeHan(existing, entry);
}

for (const input of lexemeInputs) {
  const entry = sanitizeLexeme(input);
  if (!entry.headword || entry.evidence.length === 0) continue;
  const key = wordMergeKey(entry.headword);
  const existing = lexemes.get(key);
  if (existing) mergeLexeme(existing, entry);
  else lexemes.set(key, entry);
}

for (const input of nomInputs) {
  const key = `${wordMergeKey(input.quoc_ngu)}:${input.characters}`;
  const existing = nomEntries.get(key);
  if (existing) mergeNom(existing, input);
  else nomEntries.set(key, input);
}

for (const input of semanticInputs) {
  const existing = semanticEntries.get(input.synset_id);
  if (existing) mergeSemantic(existing, input);
  else semanticEntries.set(input.synset_id, input);
}

for (const input of variantInputs) {
  const existing = variantEntries.get(input.key);
  if (existing) mergeVariant(existing, input);
  else variantEntries.set(input.key, input);
}

const finalWords = assignWordIds(
  [...words.values()]
    .filter((entry) => entry.definitions.length > 0)
    .sort((a, b) => a.word.localeCompare(b.word, "vi"))
);
const finalHan = [...hanCharacters.values()].sort((a, b) => a.id.localeCompare(b.id));
const finalLexemes = [...lexemes.values()]
  .filter((entry) => !words.has(wordMergeKey(entry.headword)))
  .map((entry) => ({ ...entry, id: `${slugifyWord(entry.headword)}-${shortHash(entry.headword)}` }))
  .sort((a, b) => a.headword.localeCompare(b.headword, "vi"));
const finalNom = [...nomEntries.values()]
  .map((entry) => ({
    ...entry,
    id: `${slugifyWord(entry.quoc_ngu)}-${shortHash(`${entry.quoc_ngu}:${entry.characters}`)}`
  }))
  .sort((a, b) => a.quoc_ngu.localeCompare(b.quoc_ngu, "vi"));
const finalSemantics = [...semanticEntries.values()].sort((a, b) => a.synset_id.localeCompare(b.synset_id));
const finalVariants = [...variantEntries.values()]
  .filter((entry) => entry.forms.length > 1)
  .sort((a, b) => a.key.localeCompare(b.key));

const evidenceById = new Map<string, EvidenceEntry>();
for (const entry of finalWords) {
  for (const definition of entry.definitions) {
    for (const example of definition.examples) {
      const item: EvidenceEntry = {
        id: `evidence-${shortHash(`${entry.word}:${definition.source}:${example}`)}`,
        headword: entry.word,
        text: example,
        translation: null,
        language: "vi",
        provenance: definition.provenance
      };
      evidenceById.set(item.id, item);
    }
  }
}
const evidence = [...evidenceById.values()].sort((a, b) => a.headword.localeCompare(b.headword, "vi"));

const wordBuckets = new Map<string, WordEntry[]>();
for (const entry of finalWords) {
  const bucket = wordBucket(entry.word);
  const items = wordBuckets.get(bucket) ?? [];
  items.push(entry);
  wordBuckets.set(bucket, items);
}

const lexemeBuckets = new Map<string, LexemeEntry[]>();
for (const entry of finalLexemes) {
  const bucket = wordBucket(entry.headword);
  const items = lexemeBuckets.get(bucket) ?? [];
  items.push(entry);
  lexemeBuckets.set(bucket, items);
}

const evidenceBuckets = new Map<string, EvidenceEntry[]>();
for (const entry of evidence) {
  const bucket = wordBucket(entry.headword);
  const items = evidenceBuckets.get(bucket) ?? [];
  items.push(entry);
  evidenceBuckets.set(bucket, items);
}

const hanBuckets = new Map<string, HanCharacterEntry[]>();
for (const entry of finalHan) {
  const fileName = radicalFileName(entry.radical);
  const items = hanBuckets.get(fileName) ?? [];
  items.push(entry);
  hanBuckets.set(fileName, items);
}

const wordBucketCounts: Record<string, number> = {};
for (const [bucket, entries] of [...wordBuckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  wordBucketCounts[bucket] = entries.length;
  await writeJson(path.join(PROCESSED_DIR, "words", `${bucket}.json`), entries);
}

const hanRadicalCounts: Record<string, number> = {};
for (const [fileName, entries] of [...hanBuckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  hanRadicalCounts[fileName] = entries.length;
  await writeJson(path.join(PROCESSED_DIR, "han-viet", fileName), entries);
}

const lexemeBucketCounts: Record<string, number> = {};
for (const [bucket, entries] of [...lexemeBuckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  lexemeBucketCounts[bucket] = entries.length;
  await writeJson(path.join(PROCESSED_DIR, "lexemes", `${bucket}.json`), entries);
}

const evidenceBucketCounts: Record<string, number> = {};
for (const [bucket, entries] of [...evidenceBuckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  evidenceBucketCounts[bucket] = entries.length;
  await writeJson(path.join(PROCESSED_DIR, "evidence", `${bucket}.json`), entries);
}

await writeJson(path.join(PROCESSED_DIR, "nom", "entries.json"), finalNom);
await writeJson(path.join(PROCESSED_DIR, "semantics", "synsets.json"), finalSemantics);
await writeJson(path.join(PROCESSED_DIR, "variants", "orthography.json"), finalVariants);

const duplicateWords = finalWords
  .filter((entry) => entry.sources.length > 1)
  .map((entry) => ({ word: entry.word, sources: entry.sources, definitions: entry.definitions.length }));
const duplicateHanCharacters = finalHan
  .filter((entry) => entry.sources.length > 1)
  .map((entry) => ({ character: entry.character, sources: entry.sources, meanings: entry.meanings.length }));

const report: MergeReport = {
  generatedAt: new Date().toISOString(),
  wordEntriesRead: wordInputs.length,
  hanEntriesRead: hanInputs.length,
  uniqueWords: finalWords.length,
  uniqueHanCharacters: finalHan.length,
  lexemeEntriesRead: lexemeInputs.length,
  uniqueLexemesWithoutDefinitions: finalLexemes.length,
  uniqueNomEntries: finalNom.length,
  uniqueSemanticSynsets: finalSemantics.length,
  uniqueVariantGroups: finalVariants.length,
  evidenceEntries: evidence.length,
  mergedWordDuplicates,
  mergedHanDuplicates,
  duplicateWords,
  duplicateHanCharacters,
  files: {
    wordBuckets: wordBucketCounts,
    hanRadicals: hanRadicalCounts,
    lexemeBuckets: lexemeBucketCounts,
    evidenceBuckets: evidenceBucketCounts
  }
};

await writeJson(path.join(PROCESSED_DIR, "merge-report.json"), report);
await writeJson(path.join(PROCESSED_DIR, "index.json"), {
  generatedAt: report.generatedAt,
  wordCount: finalWords.length,
  hanCharacterCount: finalHan.length,
  lexemeOnlyCount: finalLexemes.length,
  nomEntryCount: finalNom.length,
  semanticSynsetCount: finalSemantics.length,
  orthographicVariantGroupCount: finalVariants.length,
  evidenceCount: evidence.length,
  wordFiles: Object.keys(wordBucketCounts).map((bucket) => `words/${bucket}.json`),
  hanVietFiles: Object.keys(hanRadicalCounts).map((fileName) => `han-viet/${fileName}`),
  lexemeFiles: Object.keys(lexemeBucketCounts).map((bucket) => `lexemes/${bucket}.json`),
  evidenceFiles: Object.keys(evidenceBucketCounts).map((bucket) => `evidence/${bucket}.json`),
  nomFiles: ["nom/entries.json"],
  semanticFiles: ["semantics/synsets.json"],
  variantFiles: ["variants/orthography.json"],
  radicalCoverageCount: new Set(finalHan.map((entry) => kangxiRadicalNumber(entry.radical)).filter(Boolean)).size
});

console.log(`[merge] ${finalWords.length} words, ${finalHan.length} Han characters`);
console.log(
  `[merge] ${finalLexemes.length} lexeme-only, ${finalNom.length} Nom, ${finalSemantics.length} synsets, ` +
    `${finalVariants.length} variant groups, ${evidence.length} evidence`
);
console.log(`[merge] merged duplicates: ${mergedWordDuplicates} word rows, ${mergedHanDuplicates} Han rows`);
