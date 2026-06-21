import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

import { PROCESSED_DIR, readJson } from "./lib/paths.js";
import { usedSources } from "./lib/sources.js";
import { wordMergeKey } from "./lib/text.js";
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

async function readArrays<T>(dir: string): Promise<T[]> {
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).sort();
  const entries: T[] = [];
  for (const file of files) entries.push(...(await readJson<T[]>(path.join(dir, file))));
  return entries;
}

const selected = new Set(usedSources().map((source) => source.key));
const errors: string[] = [];
const words = await readArrays<WordEntry>(path.join(PROCESSED_DIR, "words"));
const lexemes = await readArrays<LexemeEntry>(path.join(PROCESSED_DIR, "lexemes"));
const han = await readArrays<HanCharacterEntry>(path.join(PROCESSED_DIR, "han-viet"));
const evidence = await readArrays<EvidenceEntry>(path.join(PROCESSED_DIR, "evidence"));
const nom = existsSync(path.join(PROCESSED_DIR, "nom", "entries.json"))
  ? await readJson<NomEntry[]>(path.join(PROCESSED_DIR, "nom", "entries.json"))
  : [];
const semantics = existsSync(path.join(PROCESSED_DIR, "semantics", "synsets.json"))
  ? await readJson<SemanticEntry[]>(path.join(PROCESSED_DIR, "semantics", "synsets.json"))
  : [];
const variants = existsSync(path.join(PROCESSED_DIR, "variants", "orthography.json"))
  ? await readJson<VariantEntry[]>(path.join(PROCESSED_DIR, "variants", "orthography.json"))
  : [];

function checkTrace(trace: SourceTrace, context: string, expectedSource?: string): void {
  if (!selected.has(trace.source_id)) errors.push(`${context}: inactive source ${trace.source_id}`);
  if (expectedSource && trace.source_id !== expectedSource) errors.push(`${context}: source/provenance mismatch`);
  if (!/^[a-f0-9]{64}$/.test(trace.raw_record_hash)) errors.push(`${context}: invalid raw record hash`);
}

function checkUniqueIds(entries: Array<{ id: string }>, layer: string): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) errors.push(`${layer}: duplicate id ${entry.id}`);
    seen.add(entry.id);
  }
}

checkUniqueIds(words, "word");
checkUniqueIds(lexemes, "lexeme");
checkUniqueIds(han, "Han");
checkUniqueIds(nom, "Nom");
checkUniqueIds(semantics, "semantic");
checkUniqueIds(variants, "variant");
checkUniqueIds(evidence, "evidence");

for (const entry of words) {
  if (!/\p{Script=Latin}/u.test(entry.word)) errors.push(`word ${entry.id}: no Latin character`);
  for (const source of entry.sources) {
    if (!selected.has(source)) errors.push(`word ${entry.id}: inactive entry source ${source}`);
  }
  for (const definition of entry.definitions) {
    checkTrace(definition.provenance, `word ${entry.id}`, definition.source);
  }
  for (const etymology of entry.etymologies) {
    checkTrace(etymology.provenance, `word ${entry.id} etymology`, etymology.source);
  }
}

for (const entry of han) {
  if (!entry.sources.some((source) => source !== "unicode_unihan")) {
    errors.push(`Han ${entry.id}: standalone Unihan record`);
  }
  for (const source of entry.sources) {
    if (!selected.has(source)) errors.push(`Han ${entry.id}: inactive entry source ${source}`);
  }
  for (const meaning of entry.meanings) {
    checkTrace(meaning.provenance, `Han ${entry.id}`, meaning.source);
  }
}

const wordKeys = new Set(words.map((entry) => wordMergeKey(entry.word)));
for (const entry of lexemes) {
  if (wordKeys.has(wordMergeKey(entry.headword))) errors.push(`lexeme ${entry.id}: duplicates dictionary core`);
  for (const item of entry.evidence) {
    if (!selected.has(item.source_id)) errors.push(`lexeme ${entry.id}: inactive source ${item.source_id}`);
    if (!/^[a-f0-9]{64}$/.test(item.raw_record_hash)) errors.push(`lexeme ${entry.id}: invalid raw record hash`);
  }
}

for (const entry of nom) checkTrace(entry.provenance, `Nom ${entry.id}`);
for (const entry of semantics) {
  for (const trace of entry.provenance) checkTrace(trace, `semantic ${entry.id}`);
}
for (const entry of variants) {
  for (const trace of entry.provenance) checkTrace(trace, `variant ${entry.id}`);
}
for (const entry of evidence) checkTrace(entry.provenance, `evidence ${entry.id}`);

if (errors.length > 0) {
  console.error(`[provenance] ${errors.length} errors`);
  errors.slice(0, 50).forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(
  `[provenance] OK: ${words.length} words, ${lexemes.length} lexeme-only, ${han.length} Han-Viet, ` +
    `${nom.length} Nom, ${semantics.length} synsets, ${variants.length} variants, ${evidence.length} evidence`
);
