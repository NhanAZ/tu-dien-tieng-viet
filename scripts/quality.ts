import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { kangxiRadicalNumber } from "./lib/kangxi.js";
import { NORMALIZED_DIR, PROCESSED_DIR, RAW_DIR, ROOT, readJson, writeJson } from "./lib/paths.js";
import { usedSources } from "./lib/sources.js";
import { stripToneMarks, toneSignature } from "./lib/text.js";
import type {
  EvidenceEntry,
  HanCharacterEntry,
  LexemeEntry,
  NomEntry,
  SemanticEntry,
  SourceTrace,
  VariantEntry,
  WordEntry
} from "./lib/types.js";

interface SourceSampleRecord {
  id: string;
  text: string;
  trace: Pick<SourceTrace, "source_id" | "raw_record_hash">;
}

interface SourceSampleResult {
  source: string;
  availableRecords: number;
  sampleSize: number;
  passed: number;
  failed: number;
  status: "pass" | "fail" | "metadata-only";
}

async function readArrays<T>(dir: string): Promise<T[]> {
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).sort();
  const entries: T[] = [];
  for (const file of files) entries.push(...(await readJson<T[]>(path.join(dir, file))));
  return entries;
}

async function directoryBytes(dir: string): Promise<number> {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const itemPath = path.join(dir, item.name);
    total += item.isDirectory() ? await directoryBytes(itemPath) : (await stat(itemPath)).size;
  }
  return total;
}

function count(values: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function percent(value: number, total: number): number {
  return total === 0 ? 0 : Number(((value / total) * 100).toFixed(2));
}

function uniqueIdFailures(entries: Array<{ id: string }>): number {
  return entries.length - new Set(entries.map((entry) => entry.id)).size;
}

function validSample(record: SourceSampleRecord): boolean {
  return Boolean(
    record.id &&
      record.text.trim() &&
      record.trace.source_id &&
      /^[a-f0-9]{64}$/.test(record.trace.raw_record_hash)
  );
}

const words = await readArrays<WordEntry>(path.join(PROCESSED_DIR, "words"));
const lexemes = await readArrays<LexemeEntry>(path.join(PROCESSED_DIR, "lexemes"));
const han = await readArrays<HanCharacterEntry>(path.join(PROCESSED_DIR, "han-viet"));
const evidence = await readArrays<EvidenceEntry>(path.join(PROCESSED_DIR, "evidence"));
const nom = await readJson<NomEntry[]>(path.join(PROCESSED_DIR, "nom", "entries.json"));
const semantics = await readJson<SemanticEntry[]>(path.join(PROCESSED_DIR, "semantics", "synsets.json"));
const variants = await readJson<VariantEntry[]>(path.join(PROCESSED_DIR, "variants", "orthography.json"));
const index = await readJson<Record<string, number>>(path.join(PROCESSED_DIR, "index.json"));
const manifest = await readJson<{
  buildId: string;
  datasetVersion: string;
  profile: string;
  rawFiles: Array<{ source: string; file: string; bytes: number; sha256?: string }>;
}>(path.join(PROCESSED_DIR, "source-manifest.json"));
const sourceRemovalTest = existsSync(path.join(ROOT, "data", "audit", "source-removal-test.json"))
  ? await readJson<{ passed: boolean }>(path.join(ROOT, "data", "audit", "source-removal-test.json"))
  : null;
const idStabilityTest = existsSync(path.join(ROOT, "data", "audit", "id-stability-test.json"))
  ? await readJson<{ passed: boolean }>(path.join(ROOT, "data", "audit", "id-stability-test.json"))
  : null;

const definitions = words.flatMap((entry) => entry.definitions.map((definition) => ({ entry, definition })));
const etymologies = words.flatMap((entry) => entry.etymologies.map((etymology) => ({ entry, etymology })));
const hanMeanings = han.flatMap((entry) => entry.meanings.map((meaning) => ({ entry, meaning })));
const radicalCoverage = new Set(
  han.map((entry) => kangxiRadicalNumber(entry.radical)).filter((value): value is number => value !== null)
).size;

const sampleRecords = new Map<string, SourceSampleRecord[]>();
function addSample(source: string, record: SourceSampleRecord): void {
  const records = sampleRecords.get(source) ?? [];
  records.push(record);
  sampleRecords.set(source, records);
}

for (const { entry, definition } of definitions) {
  addSample(definition.source, { id: entry.id, text: definition.meaning, trace: definition.provenance });
}
for (const { entry, etymology } of etymologies) {
  addSample(etymology.source, { id: entry.id, text: etymology.text, trace: etymology.provenance });
}
for (const { entry, meaning } of hanMeanings) {
  addSample(meaning.source, { id: entry.id, text: meaning.meaning, trace: meaning.provenance });
}
for (const entry of lexemes) {
  for (const trace of entry.evidence) {
    addSample(trace.source_id, { id: entry.id, text: entry.headword, trace });
  }
}
for (const entry of nom) {
  addSample(entry.provenance.source_id, {
    id: entry.id,
    text: `${entry.quoc_ngu}:${entry.characters}`,
    trace: entry.provenance
  });
}
for (const entry of semantics) {
  for (const trace of entry.provenance) {
    addSample(trace.source_id, { id: entry.id, text: entry.lemmas.join("|"), trace });
  }
}
for (const entry of variants) {
  for (const trace of entry.provenance) {
    addSample(trace.source_id, { id: entry.id, text: entry.forms.join("|"), trace });
  }
}

const sourceSamples: SourceSampleResult[] = usedSources().map((source) => {
  const records = (sampleRecords.get(source.key) ?? []).sort((a, b) =>
    `${a.trace.raw_record_hash}:${a.id}`.localeCompare(`${b.trace.raw_record_hash}:${b.id}`)
  );
  const sample = records.slice(0, 100);
  const passed = sample.filter(validSample).length;
  return {
    source: source.key,
    availableRecords: records.length,
    sampleSize: sample.length,
    passed,
    failed: sample.length - passed,
    status: sample.length === 0 ? "metadata-only" : passed === sample.length ? "pass" : "fail"
  };
});

const invalidVariantGroups = variants.filter((entry) => {
  const bases = new Set(entry.forms.map(stripToneMarks));
  const tones = new Set(entry.forms.map(toneSignature));
  return entry.forms.length < 2 || bases.size !== 1 || tones.size !== 1;
}).length;
const exactDefinitionDuplicates = words.reduce((total, entry) => {
  const keys = entry.definitions.map((definition) => `${definition.source}:${definition.meaning.toLocaleLowerCase("vi-VN")}`);
  return total + keys.length - new Set(keys).size;
}, 0);
const summary = {
  generatedAt: new Date().toISOString(),
  release: {
    buildId: manifest.buildId,
    datasetVersion: manifest.datasetVersion,
    profile: manifest.profile,
    selectedSources: usedSources().length
  },
  storageBytes: {
    raw: await directoryBytes(RAW_DIR),
    normalized: await directoryBytes(NORMALIZED_DIR),
    processed: await directoryBytes(PROCESSED_DIR)
  },
  layers: {
    dictionaryHeadwords: words.length,
    definitions: definitions.length,
    lexemeOnly: lexemes.length,
    hanVietCharacters: han.length,
    nomEntries: nom.length,
    semanticSynsets: semantics.length,
    orthographicVariantGroups: variants.length,
    evidenceExamples: evidence.length
  },
  dictionaryCoverage: {
    withVietnameseDefinition: words.filter((entry) => entry.definitions.some((item) => item.language === "vi")).length,
    withEnglishDefinition: words.filter((entry) => entry.definitions.some((item) => item.language === "en")).length,
    withIpa: words.filter((entry) => entry.pronunciation_ipa).length,
    withPartOfSpeech: words.filter((entry) => entry.part_of_speech.length > 0).length,
    withEtymology: words.filter((entry) => entry.etymologies.length > 0).length,
    withLabels: words.filter((entry) => entry.definitions.some((item) => item.labels.length > 0)).length,
    multiSource: words.filter((entry) => entry.sources.length > 1).length,
    byEntrySource: count(words.flatMap((entry) => entry.sources)),
    definitionsByLanguage: count(definitions.map(({ definition }) => definition.language)),
    definitionsBySource: count(definitions.map(({ definition }) => definition.source))
  },
  hanVietCoverage: {
    radicalCoverage,
    radicalCoveragePercent: percent(radicalCoverage, 214),
    withReading: han.filter((entry) => entry.readings_han_viet.length > 0).length,
    withMeaning: han.filter((entry) => entry.meanings.length > 0).length,
    enrichedByUnihan: han.filter((entry) => entry.sources.includes("unicode_unihan")).length,
    standaloneUnihan: han.filter((entry) => !entry.sources.some((source) => source !== "unicode_unihan")).length,
    supplementaryPlaneCharacters: han.filter((entry) => (entry.character.codePointAt(0) ?? 0) > 0xffff).length,
    byEntrySource: count(han.flatMap((entry) => entry.sources))
  },
  nomCoverage: {
    withDefinition: nom.filter((entry) => entry.definition).length,
    withFrequency: nom.filter((entry) => entry.frequency !== null).length,
    supplementaryPlaneEntries: nom.filter((entry) => [...entry.characters].some((char) => (char.codePointAt(0) ?? 0) > 0xffff)).length
  },
  hardChecks: {
    indexCountsMatch:
      index.wordCount === words.length &&
      index.hanCharacterCount === han.length &&
      index.lexemeOnlyCount === lexemes.length &&
      index.nomEntryCount === nom.length &&
      index.semanticSynsetCount === semantics.length &&
      index.orthographicVariantGroupCount === variants.length &&
      index.evidenceCount === evidence.length,
    emptyDefinitionHeadwords: words.filter((entry) => entry.definitions.length === 0).length,
    nonLatinDictionaryHeadwords: words.filter((entry) => !/\p{Script=Latin}/u.test(entry.word)).length,
    incorrectNoToneFields:
      words.filter((entry) => entry.headword_no_tone !== stripToneMarks(entry.word)).length +
      lexemes.filter((entry) => entry.headword_no_tone !== stripToneMarks(entry.headword)).length,
    duplicateIds:
      uniqueIdFailures(words) +
      uniqueIdFailures(lexemes) +
      uniqueIdFailures(han) +
      uniqueIdFailures(nom) +
      uniqueIdFailures(semantics) +
      uniqueIdFailures(variants) +
      uniqueIdFailures(evidence),
    exactDefinitionDuplicates,
    residualDaiNamIdPlaceholders: definitions.filter(
      ({ definition }) => definition.source === "dai_nam_quoc_am_tu_vi" && /^id\.?$/i.test(definition.meaning)
    ).length,
    invalidVariantGroups,
    rawFilesWithoutSha256: manifest.rawFiles.filter((file) => !/^[a-f0-9]{64}$/.test(file.sha256 ?? "")).length,
    failedSourceSamples: sourceSamples.reduce((total, sample) => total + sample.failed, 0),
    sourceRemovalTestPassed: sourceRemovalTest?.passed === true,
    idStabilityTestPassed: idStabilityTest?.passed === true
  },
  sourceSamples
};

await writeJson(path.join(PROCESSED_DIR, "quality-summary.json"), summary);

const hardCheckValues = Object.values(summary.hardChecks);
const hardChecksPassed = hardCheckValues.every((value) => value === true || value === 0);
console.log(
  `[quality] ${hardChecksPassed ? "PASS" : "FAIL"}: ${words.length} words, ${definitions.length} definitions, ` +
    `${radicalCoverage}/214 radicals, ${sourceSamples.length} source samples`
);
if (!hardChecksPassed) {
  console.error(JSON.stringify(summary.hardChecks, null, 2));
  process.exit(1);
}
