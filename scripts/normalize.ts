import { createGunzip } from "node:zlib";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { load } from "cheerio";

import { inputStream, NORMALIZED_DIR, RAW_DIR, resetDir, writeJson, outputStream, ensureDir } from "./lib/paths.js";
import {
  cleanText,
  codePointId,
  countSyllables,
  dedupeStrings,
  foldVietnamese,
  hanChars,
  inferOrigin,
  isSingleHanCharacter,
  mapPartOfSpeech,
  normalizeHeadword,
  shortHash,
  slugifyWord,
  splitExamples,
  stripToneMarks,
  toneSignature,
  titleCaseVietnamese
} from "./lib/text.js";
import { kangxiRadical, radicalStrokeCount } from "./lib/kangxi.js";
import { sourceTrace } from "./lib/provenance.js";
import { sourceIsSelected } from "./lib/sources.js";
import { splitCatusfNumberedDefinitions, stripCatusfLineSenseMarker } from "./normalizers/catusf.js";
import { parseDaiNamSnapshot, type DaiNamSnapshot } from "./normalizers/dai-nam.js";
import {
  ipaFromKaikki,
  isHanKaikkiEntry,
  isVietnameseKaikkiEntry,
  readingsFromKaikki,
  relationWords,
  senseExamples,
  senseGlosses,
  type KaikkiEntry
} from "./normalizers/kaikki.js";
import {
  parseRadicalStroke,
  parseTotalStrokes,
  parseUnihanData,
  variantCharacters
} from "./normalizers/unihan.js";
import { parseUvdSenses, parseUvdYaml } from "./normalizers/uvd.js";
import type {
  HanCharacterEntry,
  JsonlCounts,
  LexemeEntry,
  NomEntry,
  SemanticEntry,
  VariantEntry,
  WordEntry
} from "./lib/types.js";

interface VntkSense {
  example?: string;
  sub_pos?: string;
  definition?: string;
  pos?: string;
}

class JsonlWriter<T> {
  private stream;
  public count = 0;

  constructor(filePath: string) {
    this.stream = outputStream(filePath);
  }

  write(value: T): void {
    this.stream.write(`${JSON.stringify(value)}\n`);
    this.count += 1;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.stream.end(() => resolve());
      this.stream.on("error", reject);
    });
  }
}

function emptyWordEntry(word: string, source: string): WordEntry {
  return {
    id: "",
    word,
    headword_normalized: normalizeHeadword(word),
    headword_no_tone: stripToneMarks(word),
    syllable_count: countSyllables(word),
    language: "vi",
    pronunciation_ipa: null,
    part_of_speech: [],
    origin: "không rõ",
    han_viet_ref: [],
    han_nom_forms: [],
    definitions: [],
    etymologies: [],
    synonyms: [],
    antonyms: [],
    related_words: [],
    compound_words: [],
    sources: [source]
  };
}

function emptyHanEntry(character: string, source: string): HanCharacterEntry {
  return {
    id: codePointId(character),
    character,
    radical: null,
    radical_stroke_count: null,
    total_stroke_count: null,
    readings_han_viet: [],
    readings_nom: [],
    writing_systems: ["Hán"],
    meanings: [],
    compound_examples: [],
    variant_forms: [],
    sources: [source]
  };
}

async function normalizeVntk(): Promise<JsonlCounts> {
  const source = "vntk_dictionary";
  const filePath = path.join(RAW_DIR, source, "dictionary.json");
  const counts: JsonlCounts = { words: 0, hanCharacters: 0, skipped: 0 };
  if (!sourceIsSelected(source)) return counts;
  if (!existsSync(filePath)) {
    console.warn(`[normalize] Missing ${filePath}; skipping ${source}.`);
    return counts;
  }

  const sourceDir = path.join(NORMALIZED_DIR, source);
  await ensureDir(sourceDir);
  const writer = new JsonlWriter<WordEntry>(path.join(sourceDir, "words.jsonl"));
  const data = JSON.parse(await BunSafeRead(filePath)) as Record<string, VntkSense[]>;

  for (const [rawWord, senses] of Object.entries(data)) {
    const word = cleanText(rawWord);
    if (!word || !Array.isArray(senses)) {
      counts.skipped += 1;
      continue;
    }

    const entry = emptyWordEntry(word, source);
    entry.part_of_speech = dedupeStrings(senses.map((sense) => mapPartOfSpeech(sense.pos ?? sense.sub_pos)));
    entry.definitions = senses
      .map((sense, index) => ({
        meaning: cleanText(sense.definition),
        examples: splitExamples(sense.example),
        source,
        language: "vi" as const,
        provenance: sourceTrace(source, `${word}#${index + 1}`, JSON.stringify({ word, sense }), {
          confidence: 0.75
        }),
        labels: []
      }))
      .filter((definition) => definition.meaning);
    entry.han_viet_ref = hanChars(word).map(codePointId);

    if (entry.definitions.length === 0) {
      counts.skipped += 1;
      continue;
    }

    writer.write(entry);
    counts.words += 1;
  }

  await writer.close();
  console.log(`[normalize] ${source}: ${counts.words} words`);
  return counts;
}

async function BunSafeRead(filePath: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(filePath, "utf8");
}

async function normalizeKaikki(
  source: "kaikki_viwiktionary" | "kaikki_enwiktionary_vi",
  fileName: string,
  definitionLanguage: "vi" | "en"
): Promise<JsonlCounts> {
  const filePath = path.join(RAW_DIR, source, fileName);
  const counts: JsonlCounts = { words: 0, hanCharacters: 0, skipped: 0 };
  if (!sourceIsSelected(source)) return counts;
  if (!existsSync(filePath)) {
    console.warn(`[normalize] Missing ${filePath}; skipping ${source}.`);
    return counts;
  }

  const sourceDir = path.join(NORMALIZED_DIR, source);
  await ensureDir(sourceDir);
  const wordWriter = new JsonlWriter<WordEntry>(path.join(sourceDir, "words.jsonl"));
  const hanWriter = new JsonlWriter<HanCharacterEntry>(path.join(sourceDir, "han-viet.jsonl"));
  const rl = readline.createInterface({
    input: inputStream(filePath).pipe(createGunzip()),
    crlfDelay: Infinity
  });

  let lineNumber = 0;
  for await (const line of rl) {
    lineNumber += 1;
    if (!line.trim()) continue;
    let entry: KaikkiEntry;
    try {
      entry = JSON.parse(line) as KaikkiEntry;
    } catch {
      counts.skipped += 1;
      continue;
    }

    const word = cleanText(entry.word);
    if (!word) {
      counts.skipped += 1;
      continue;
    }

    const senses = Array.isArray(entry.senses) ? entry.senses : [];
    if (isVietnameseKaikkiEntry(entry)) {
      const definitions = senses.flatMap((sense, senseIndex) =>
        senseGlosses(sense, source === "kaikki_viwiktionary").map((meaning, glossIndex) => ({
          meaning,
          examples: senseExamples(sense),
          source,
          language: definitionLanguage,
          provenance: sourceTrace(
            source,
            `${word}:${entry.pos ?? "unknown"}:${senseIndex + 1}:${glossIndex + 1}`,
            line,
            { confidence: 0.85 }
          ),
          labels: dedupeStrings([...(sense.tags ?? []), ...(sense.categories ?? [])])
        }))
      );

      if (definitions.length > 0) {
        const etymologies = [entry.etymology_text, ...(entry.etymology_texts ?? [])].filter(Boolean) as string[];
        const wordEntry = emptyWordEntry(word, source);
        wordEntry.pronunciation_ipa = ipaFromKaikki(entry);
        wordEntry.part_of_speech = dedupeStrings([mapPartOfSpeech(entry.pos)]);
        wordEntry.origin = inferOrigin([
          ...etymologies,
          ...(entry.categories ?? []),
          ...senses.flatMap((sense) => [...(sense.tags ?? []), ...(sense.categories ?? [])])
        ]);
        wordEntry.etymologies = etymologies.map((text, index) => ({
          text: cleanText(text),
          language: definitionLanguage,
          source,
          provenance: sourceTrace(source, `${word}:etymology:${index + 1}`, line, { confidence: 0.8 })
        }));
        wordEntry.han_viet_ref = hanChars([word, ...etymologies].join(" ")).map(codePointId);
        wordEntry.definitions = definitions;
        wordEntry.synonyms = relationWords(entry.synonyms);
        wordEntry.antonyms = relationWords(entry.antonyms);
        wordEntry.related_words = dedupeStrings([...relationWords(entry.related), ...relationWords(entry.derived)]);
        wordWriter.write(wordEntry);
        counts.words += 1;
      }
    }

    if (isHanKaikkiEntry(entry, word)) {
      const meanings = senses.flatMap((sense, senseIndex) =>
        senseGlosses(sense, source === "kaikki_viwiktionary").map((meaning, glossIndex) => ({
          meaning,
          source,
          language: definitionLanguage,
          provenance: sourceTrace(source, `${word}:han:${senseIndex + 1}:${glossIndex + 1}`, line, {
            confidence: 0.75
          })
        }))
      );
      if (meanings.length > 0 || readingsFromKaikki(entry).length > 0) {
        const hanEntry = emptyHanEntry(word, source);
        hanEntry.readings_han_viet = readingsFromKaikki(entry);
        hanEntry.meanings = meanings;
        hanWriter.write(hanEntry);
        counts.hanCharacters += 1;
      }
    }

    if (lineNumber % 100000 === 0) {
      console.log(`[normalize] ${source}: scanned ${lineNumber} lines`);
    }
  }

  await wordWriter.close();
  await hanWriter.close();
  console.log(`[normalize] ${source}: ${counts.words} words, ${counts.hanCharacters} Han chars`);
  return counts;
}

async function normalizeUnihan(): Promise<JsonlCounts> {
  const source = "unicode_unihan";
  const filePath = path.join(RAW_DIR, source, "Unihan.zip");
  const counts: JsonlCounts = { words: 0, hanCharacters: 0, skipped: 0 };
  if (!sourceIsSelected(source)) return counts;
  if (!existsSync(filePath)) {
    console.warn(`[normalize] Missing ${filePath}; skipping ${source}.`);
    return counts;
  }

  const sourceDir = path.join(NORMALIZED_DIR, source);
  await ensureDir(sourceDir);
  const writer = new JsonlWriter<HanCharacterEntry>(path.join(sourceDir, "han-metadata.jsonl"));
  const records = parseUnihanData(filePath);

  for (const [character, record] of records.entries()) {
    if (!isSingleHanCharacter(character)) continue;
    const totalStrokes = parseTotalStrokes(record.kTotalStrokes);
    const { radicalNumber, residualStrokes } = parseRadicalStroke(record.kRSUnicode, totalStrokes);
    const radical = kangxiRadical(radicalNumber);
    const derivedRadicalStrokes =
      totalStrokes && residualStrokes !== null ? Math.max(1, totalStrokes - residualStrokes) : null;
    const readings = dedupeStrings(
      (record.kVietnamese ?? "")
        .split(/\s+/g)
        .map((reading) => titleCaseVietnamese(reading))
        .filter(Boolean)
    );

    const entry = emptyHanEntry(character, source);
    entry.radical = radical;
    entry.radical_stroke_count = derivedRadicalStrokes ?? radicalStrokeCount(radicalNumber);
    entry.total_stroke_count = totalStrokes;
    entry.readings_han_viet = readings;
    entry.meanings = record.kDefinition
      ? [
          {
            meaning: cleanText(record.kDefinition),
            source,
            language: "en",
            provenance: sourceTrace(source, codePointId(character), JSON.stringify(record), {
              confidence: 0.95
            })
          }
        ]
      : [];
    entry.variant_forms = variantCharacters(record.variants);

    if (
      entry.readings_han_viet.length === 0 &&
      entry.meanings.length === 0 &&
      !entry.radical &&
      !entry.total_stroke_count
    ) {
      counts.skipped += 1;
      continue;
    }

    writer.write(entry);
    counts.hanCharacters += 1;
  }

  await writer.close();
  console.log(`[normalize] ${source}: ${counts.hanCharacters} Han chars`);
  return counts;
}

function validLexeme(value: string): boolean {
  const text = cleanText(value);
  return (
    text.length > 0 &&
    text.length <= 120 &&
    /\p{L}/u.test(text) &&
    /^[\p{L}\p{N}].*[\p{L}\p{N}]$/u.test(text.length === 1 ? `${text}${text}` : text) &&
    !/[\p{C}\p{S}]/u.test(text) &&
    !isSingleHanCharacter(text)
  );
}

function lexemeEntry(headword: string, source: string, sourceEntryId: string | null, raw: string): LexemeEntry {
  return {
    id: slugifyWord(headword),
    headword,
    headword_normalized: normalizeHeadword(headword),
    headword_no_tone: stripToneMarks(headword),
    syllable_count: countSyllables(headword),
    language: "vi",
    evidence: [
      {
        source_id: source,
        source_entry_id: sourceEntryId,
        raw_record_hash: sourceTrace(source, sourceEntryId, raw).raw_record_hash
      }
    ]
  };
}

async function normalizeUndertheseaUvd(): Promise<JsonlCounts> {
  const source = "underthesea_uvd";
  const counts: JsonlCounts = { words: 0, hanCharacters: 0, skipped: 0 };
  if (!sourceIsSelected(source)) return counts;
  const filePath = path.join(RAW_DIR, source, "data.yaml");
  if (!existsSync(filePath)) return counts;

  const sourceDir = path.join(NORMALIZED_DIR, source);
  await ensureDir(sourceDir);
  const writer = new JsonlWriter<WordEntry>(path.join(sourceDir, "words.jsonl"));
  const data = parseUvdYaml(await readFile(filePath, "utf8"));

  for (const [rawWord, senses] of Object.entries(data)) {
    const word = cleanText(rawWord);
    if (!validLexeme(word) || !Array.isArray(senses)) {
      counts.skipped += 1;
      continue;
    }
    const entry = emptyWordEntry(word, source);
    const parsed = parseUvdSenses(word, senses, source);
    entry.part_of_speech = parsed.partOfSpeech;
    entry.definitions = parsed.definitions;
    if (entry.definitions.length === 0) {
      counts.skipped += 1;
      continue;
    }
    writer.write(entry);
    counts.words += 1;
  }

  await writer.close();
  console.log(`[normalize] ${source}: ${counts.words} words`);
  return counts;
}

async function normalizeWordlist(source: string, fileName: string, jsonLines = false): Promise<JsonlCounts> {
  const counts: JsonlCounts = { words: 0, hanCharacters: 0, skipped: 0 };
  if (!sourceIsSelected(source)) return counts;
  const filePath = path.join(RAW_DIR, source, fileName);
  if (!existsSync(filePath)) return counts;
  const sourceDir = path.join(NORMALIZED_DIR, source);
  await ensureDir(sourceDir);
  const writer = new JsonlWriter<LexemeEntry>(path.join(sourceDir, "lexemes.jsonl"));
  const rl = readline.createInterface({ input: inputStream(filePath), crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const rawLine of rl) {
    lineNumber += 1;
    let headword = rawLine;
    if (jsonLines) {
      try {
        const parsed = JSON.parse(rawLine) as { text?: string };
        headword = parsed.text ?? "";
      } catch {
        counts.skipped += 1;
        continue;
      }
    }
    headword = cleanText(headword.replace(/^\uFEFF/, ""));
    if (!validLexeme(headword)) {
      counts.skipped += 1;
      continue;
    }
    writer.write(lexemeEntry(headword, source, String(lineNumber), rawLine));
    counts.words += 1;
  }
  await writer.close();
  console.log(`[normalize] ${source}: ${counts.words} lexemes`);
  return counts;
}

async function normalizeHunspell(): Promise<JsonlCounts> {
  const source = "hunspell_vi";
  const counts: JsonlCounts = { words: 0, hanCharacters: 0, skipped: 0 };
  if (!sourceIsSelected(source)) return counts;
  const sourceDir = path.join(NORMALIZED_DIR, source);
  await ensureDir(sourceDir);
  const writer = new JsonlWriter<LexemeEntry>(path.join(sourceDir, "lexemes.jsonl"));
  const variantWriter = new JsonlWriter<VariantEntry>(path.join(sourceDir, "variants.jsonl"));
  const variantGroups = new Map<string, Array<{ form: string; sourceEntryId: string; raw: string }>>();

  for (const fileName of ["vi-DauMoi.dic", "vi-DauCu.dic"]) {
    const filePath = path.join(RAW_DIR, source, fileName);
    if (!existsSync(filePath)) continue;
    const lines = (await readFile(filePath, "utf8")).split(/\r?\n/g);
    for (let index = 1; index < lines.length; index += 1) {
      const rawLine = lines[index] ?? "";
      const headword = cleanText(rawLine.split("/")[0]);
      if (!validLexeme(headword)) {
        counts.skipped += 1;
        continue;
      }
      writer.write(lexemeEntry(headword, source, `${fileName}:${index + 1}`, rawLine));
      const variantKey = `${stripToneMarks(headword)}:${toneSignature(headword)}`;
      const variants = variantGroups.get(variantKey) ?? [];
      variants.push({ form: headword, sourceEntryId: `${fileName}:${index + 1}`, raw: rawLine });
      variantGroups.set(variantKey, variants);
      counts.words += 1;
    }
  }
  await writer.close();
  for (const [key, rows] of variantGroups) {
    const forms = dedupeStrings(rows.map((row) => row.form));
    if (forms.length < 2) continue;
    variantWriter.write({
      id: `variant-${shortHash(key)}`,
      key,
      forms,
      relation: "tone-placement",
      provenance: rows.map((row) => sourceTrace(source, row.sourceEntryId, row.raw, { confidence: 0.95 }))
    });
  }
  await variantWriter.close();
  console.log(`[normalize] ${source}: ${counts.words} lexeme rows`);
  return counts;
}

function htmlToText(value: string): string {
  const $ = load(`<div>${value}</div>`);
  $("font").filter((_, element) => cleanText($(element).attr("color")).toLowerCase() === "white").remove();
  $("br").replaceWith("\n");
  return cleanText($("div").first().text());
}

function cleanCatusfHeadword(value: string): string {
  return cleanText(value)
    .replace(/^\uFEFF?@+/u, "")
    .replace(/[：:]+$/u, "")
    .trim();
}

function catusfPartOfSpeech(text: string): string[] {
  const normalized = text.toLocaleLowerCase("vi-VN");
  const pairs: Array<[RegExp, string]> = [
    [/\b(?:dt|d)\./u, "danh từ"],
    [/\b(?:đgt|đg)\./u, "động từ"],
    [/\b(?:tt|t)\./u, "tính từ"],
    [/\bđt\./u, "đại từ"],
    [/\btrt\./u, "trạng từ"],
    [/\btht\./u, "thán từ"],
    [/\b(?:lt|l)\./u, "liên từ"],
    [/\bpt\./u, "phụ từ"]
  ];
  return dedupeStrings(pairs.filter(([pattern]) => pattern.test(normalized)).map(([, pos]) => pos));
}

function catusfDefinitionLines(fragmentHtml: string): string[] {
  const $ = load(`<div>${fragmentHtml}</div>`);
  $("font").filter((_, element) => cleanText($(element).attr("color")).toLowerCase() === "white").remove();
  $("h3").remove();
  $("br").replaceWith("\n");
  const rawText = $("div").first().text().normalize("NFC").replace(/\uFEFF/g, "");
  return dedupeStrings(
    rawText
      .split(/\n+/g)
      .map((line) =>
        cleanText(line)
          .replace(/^[-–—]\s*/u, "")
          .replace(/\(\${2,}\)\s*/g, "")
          .replace(/^\|+\s*/u, "")
      )
      .flatMap(splitCatusfNumberedDefinitions)
      .map(stripCatusfLineSenseMarker)
      .filter((line) => line.length > 0)
  );
}

function catusfLabels(word: string, definitions: string[]): string[] {
  const text = definitions.join(" ");
  const labels = ["documented-unclear", "Ho Ngoc Duc/CatusF"];
  if (/^[A-ZÀ-ỸĐ]/u.test(word)) labels.push("proper-name-candidate");
  if (/[,;]/u.test(word)) labels.push("punctuation-headword-candidate");
  if (/\((?:xã|huyện|thị trấn|tỉnh|sông|núi|đảo|quận|phường)\)|\bh\.\s|\bt\.\s/iu.test(text)) {
    labels.push("place-name-candidate");
  }
  if (/\b(?:kí hiệu|ký hiệu|viết tắt|nguyên tố|đơn vị đo|bệnh|ngôn ngữ|kinh phật)\b/iu.test(text)) {
    labels.push("domain-or-encyclopedic-candidate");
  }
  return dedupeStrings(labels);
}

function catusfSections(rawHeadword: string, html: string): Array<{ word: string; html: string; definitions: string[] }> {
  return html
    .split(/<hr\s*\/?>/iu)
    .map((fragment, index) => {
      const $ = load(`<div>${fragment}</div>`);
      const h3 = $("h3").first();
      const word = cleanCatusfHeadword(index === 0 || h3.length === 0 ? rawHeadword : h3.text());
      return { word, html: fragment, definitions: catusfDefinitionLines(fragment) };
    })
    .filter((section) => section.word && section.definitions.length > 0);
}

async function normalizeCatusfVietViet(): Promise<JsonlCounts> {
  const source = "catusf_vietviet";
  const counts: JsonlCounts = { words: 0, hanCharacters: 0, skipped: 0 };
  if (!sourceIsSelected(source)) return counts;
  const filePath = path.join(RAW_DIR, source, "star_vietviet.tab");
  if (!existsSync(filePath)) return counts;
  const sourceDir = path.join(NORMALIZED_DIR, source);
  await ensureDir(sourceDir);
  const writer = new JsonlWriter<WordEntry>(path.join(sourceDir, "words.jsonl"));
  const rl = readline.createInterface({ input: inputStream(filePath), crlfDelay: Infinity });
  let lineNumber = 0;

  for await (const rawLine of rl) {
    lineNumber += 1;
    if (!rawLine.trim() || rawLine.startsWith("##")) continue;
    const tabIndex = rawLine.indexOf("\t");
    if (tabIndex < 1) {
      counts.skipped += 1;
      continue;
    }
    const rawHeadword = cleanCatusfHeadword(rawLine.slice(0, tabIndex));
    const html = rawLine.slice(tabIndex + 1);
    const sections = catusfSections(rawHeadword, html);
    if (sections.length === 0) {
      counts.skipped += 1;
      continue;
    }

    let sectionIndex = 0;
    for (const section of sections) {
      sectionIndex += 1;
      if (!validLexeme(section.word)) {
        counts.skipped += 1;
        continue;
      }
      const entry = emptyWordEntry(section.word, source);
      const labels = catusfLabels(section.word, section.definitions);
      entry.part_of_speech = catusfPartOfSpeech(section.definitions.join(" "));
      entry.origin = inferOrigin(section.definitions, /\bH\./u.test(section.definitions.join(" ")) ? "Hán Việt" : "không rõ");
      entry.han_viet_ref = hanChars(section.definitions.join(" ")).map(codePointId);
      entry.definitions = section.definitions.map((meaning, definitionIndex) => ({
        meaning,
        examples: [],
        source,
        language: "vi" as const,
        provenance: sourceTrace(
          source,
          `${lineNumber}:${sectionIndex}:${definitionIndex + 1}`,
          JSON.stringify({ headword: section.word, html: section.html, meaning }),
          { confidence: 0.65 }
        ),
        labels
      }));
      if (entry.definitions.length === 0) {
        counts.skipped += 1;
        continue;
      }
      writer.write(entry);
      counts.words += 1;
    }
  }

  await writer.close();
  console.log(`[normalize] ${source}: ${counts.words} word rows`);
  return counts;
}

async function normalizeThieuChuu(): Promise<JsonlCounts> {
  const source = "catusf_thieu_chuu_stardict";
  const counts: JsonlCounts = { words: 0, hanCharacters: 0, skipped: 0 };
  if (!sourceIsSelected(source)) return counts;
  const filePath = path.join(RAW_DIR, source, "TudienThienChuu.txt");
  if (!existsSync(filePath)) return counts;
  const sourceDir = path.join(NORMALIZED_DIR, source);
  await ensureDir(sourceDir);
  const writer = new JsonlWriter<HanCharacterEntry>(path.join(sourceDir, "han-viet.jsonl"));
  const rl = readline.createInterface({ input: inputStream(filePath), crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const rawLine of rl) {
    lineNumber += 1;
    const [characterRaw, readingsRaw, ...definitionParts] = rawLine.split("\t");
    const character = cleanText(characterRaw);
    const meaning = htmlToText(definitionParts.join("\t"));
    if (!isSingleHanCharacter(character) || !meaning) {
      counts.skipped += 1;
      continue;
    }
    const entry = emptyHanEntry(character, source);
    entry.readings_han_viet = dedupeStrings(
      (readingsRaw ?? "").split("|").map((reading) => titleCaseVietnamese(reading))
    );
    entry.meanings = [
      {
        meaning,
        source,
        language: "vi",
        provenance: sourceTrace(source, String(lineNumber), rawLine, { confidence: 0.95 })
      }
    ];
    writer.write(entry);
    counts.hanCharacters += 1;
  }
  await writer.close();
  console.log(`[normalize] ${source}: ${counts.hanCharacters} Han-Viet entries`);
  return counts;
}

async function normalizeChunom(): Promise<JsonlCounts & { nom: number }> {
  const source = "chunom_standard";
  const counts = { words: 0, hanCharacters: 0, skipped: 0, nom: 0 };
  if (!sourceIsSelected(source)) return counts;
  const filePath = path.join(RAW_DIR, source, "standard.tsv");
  if (!existsSync(filePath)) return counts;
  const sourceDir = path.join(NORMALIZED_DIR, source);
  await ensureDir(sourceDir);
  const writer = new JsonlWriter<NomEntry>(path.join(sourceDir, "nom.jsonl"));
  const lines = (await readFile(filePath, "utf8")).split(/\r?\n/g);
  for (let index = 1; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    if (!rawLine.trim()) continue;
    const fields = rawLine.split("\t");
    const frequencyRaw = Number.parseInt(fields[2] ?? "", 10);
    const characters = cleanText(fields[3]);
    const quocNgu = cleanText(fields[4]);
    const definition = cleanText(fields.slice(5).join("\t"));
    if (!quocNgu || !characters || hanChars(characters).length === 0) {
      counts.skipped += 1;
      continue;
    }
    writer.write({
      id: `${slugifyWord(quocNgu)}-${shortHash(characters)}`,
      quoc_ngu: quocNgu,
      characters,
      variants: [],
      definition: definition || null,
      definition_language: definition ? "en" : null,
      frequency: Number.isFinite(frequencyRaw) && frequencyRaw < 9999999 ? frequencyRaw : null,
      provenance: sourceTrace(source, String(index + 1), rawLine, { confidence: 0.85 })
    });
    counts.nom += 1;
  }
  await writer.close();
  console.log(`[normalize] ${source}: ${counts.nom} Nom rows`);
  return counts;
}

function wordnetPos(synset: string): SemanticEntry["part_of_speech"] {
  const code = synset.slice(-1);
  return {
    a: "adjective",
    s: "adjective satellite",
    r: "adverb",
    n: "noun",
    v: "verb"
  }[code] as SemanticEntry["part_of_speech"] ?? "unknown";
}

async function normalizeOmw(): Promise<JsonlCounts & { semantics: number }> {
  const source = "omw_wiktionary_vi";
  const counts = { words: 0, hanCharacters: 0, skipped: 0, semantics: 0 };
  if (!sourceIsSelected(source)) return counts;
  const filePath = path.join(RAW_DIR, source, "wn-wikt-vie.tab");
  if (!existsSync(filePath)) return counts;
  const sourceDir = path.join(NORMALIZED_DIR, source);
  await ensureDir(sourceDir);
  const writer = new JsonlWriter<SemanticEntry>(path.join(sourceDir, "semantics.jsonl"));
  const lines = (await readFile(filePath, "utf8")).split(/\r?\n/g);
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    if (!rawLine || rawLine.startsWith("#")) continue;
    const [synset, relation, lemmaRaw] = rawLine.split("\t");
    const lemma = cleanText(lemmaRaw);
    if (!/^[0-9]{8}-[asnvr]$/.test(synset ?? "") || relation !== "vie:lemma" || !/\p{Script=Latin}/u.test(lemma)) {
      counts.skipped += 1;
      continue;
    }
    writer.write({
      id: synset,
      synset_id: synset,
      part_of_speech: wordnetPos(synset),
      lemmas: [lemma],
      provenance: [sourceTrace(source, String(index + 1), rawLine, { confidence: 0.75 })]
    });
    counts.semantics += 1;
  }
  await writer.close();
  console.log(`[normalize] ${source}: ${counts.semantics} semantic rows`);
  return counts;
}

async function normalizeDaiNam(): Promise<JsonlCounts> {
  const source = "dai_nam_quoc_am_tu_vi";
  const counts: JsonlCounts = { words: 0, hanCharacters: 0, skipped: 0 };
  if (!sourceIsSelected(source)) return counts;
  const filePath = path.join(RAW_DIR, source, "pages.json");
  if (!existsSync(filePath)) return counts;
  const sourceDir = path.join(NORMALIZED_DIR, source);
  await ensureDir(sourceDir);
  const writer = new JsonlWriter<WordEntry>(path.join(sourceDir, "words.jsonl"));
  const snapshot = JSON.parse(await readFile(filePath, "utf8")) as DaiNamSnapshot;
  const entries = parseDaiNamSnapshot(snapshot, source, emptyWordEntry, validLexeme);
  for (const entry of entries) writer.write(entry);
  counts.words = entries.length;
  await writer.close();
  console.log(`[normalize] ${source}: ${counts.words} historical word rows`);
  return counts;
}

await resetDir(NORMALIZED_DIR);

const results = {
  generatedAt: new Date().toISOString(),
  sources: {
    vntk_dictionary: await normalizeVntk(),
    kaikki_viwiktionary: await normalizeKaikki(
      "kaikki_viwiktionary",
      "raw-wiktextract-data.jsonl.gz",
      "vi"
    ),
    kaikki_enwiktionary_vi: await normalizeKaikki(
      "kaikki_enwiktionary_vi",
      "kaikki.org-dictionary-Vietnamese.jsonl.gz",
      "en"
    ),
    underthesea_uvd: await normalizeUndertheseaUvd(),
    underthesea_dictionary: await normalizeWordlist("underthesea_dictionary", "words.txt", true),
    duyet_vietnamese_wordlist: await normalizeWordlist("duyet_vietnamese_wordlist", "Viet74K.txt"),
    hunspell_vi: await normalizeHunspell(),
    dai_nam_quoc_am_tu_vi: await normalizeDaiNam(),
    catusf_vietviet: await normalizeCatusfVietViet(),
    catusf_thieu_chuu_stardict: await normalizeThieuChuu(),
    chunom_standard: await normalizeChunom(),
    omw_wiktionary_vi: await normalizeOmw(),
    unicode_unihan: await normalizeUnihan()
  }
};

await writeJson(path.join(NORMALIZED_DIR, "normalize-manifest.json"), results);
console.log("[normalize] Complete.");
